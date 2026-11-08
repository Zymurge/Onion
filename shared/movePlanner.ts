import { getNeighbors, hexKey, type HexPos } from './axialHex.js'
import {
	buildEdgeLookup,
	canStopOnOccupiedHex,
	canTraverseOccupiedHex,
	getStepMoveCost,
	type MoveOccupant,
	type MoveRole,
} from './movementRules.js'
import type { RulesContext } from './rulesContext.js'
import type { ScenarioTerrainEdge, TerrainType } from './types/index.js'

export type MoveMapSnapshot = {
	width: number
	height: number
	cells: ReadonlyArray<{ q: number; r: number }>
	hexes: ReadonlyArray<{ q: number; r: number; terrain: TerrainType }>
	edges: ReadonlyArray<ScenarioTerrainEdge>
	occupiedHexes?: ReadonlyArray<{
		q: number
		r: number
		role: 'onion' | 'defender'
		unitType: string
		squads?: number
	}>
}

export type ReachableMove = {
	to: HexPos
	path: HexPos[]
	cost: number
}

type Occupant = MoveOccupant

function getCellLookup(map: MoveMapSnapshot): Set<string> {
	return new Set(map.cells.map(hexKey))
}

function getTerrainLookup(map: MoveMapSnapshot): Map<string, TerrainType> {
	return new Map(map.hexes.map((hex) => [hexKey(hex), hex.terrain]))
}

function getOccupiedLookup(map: MoveMapSnapshot): Map<string, Occupant[]> {
	const lookup = new Map<string, Occupant[]>()
	for (const occupant of map.occupiedHexes ?? []) {
		const key = hexKey(occupant)
		const occupants = lookup.get(key) ?? []
		occupants.push(occupant)
		lookup.set(key, occupants)
	}
	return lookup
}

function reconstructPath(prev: Map<string, HexPos | null>, from: HexPos, to: HexPos): HexPos[] {
	const path: HexPos[] = []
	let cursor: HexPos | null = to

	while (cursor && !(cursor.q === from.q && cursor.r === from.r)) {
		path.unshift(cursor)
		cursor = prev.get(hexKey(cursor)) ?? null
	}

	return path
}

function runDijkstraSearch(input: {
	map: MoveMapSnapshot
	from: HexPos
	movementAllowance: number
	movingRole: MoveRole
	movingUnitType: string
	target?: HexPos
	incomingMembers?: number
	incomingSquads?: number
	rules?: RulesContext
}): {
	dist: Map<string, number>
	prev: Map<string, HexPos | null>
	targetReached: boolean
} {
	const cellLookup = getCellLookup(input.map)
	const terrainLookup = getTerrainLookup(input.map)
	const edgeLookup = buildEdgeLookup(input.map.edges)
	const occupiedLookup = getOccupiedLookup(input.map)

	const dist = new Map<string, number>()
	const prev = new Map<string, HexPos | null>()
	const queue: Array<{ pos: HexPos; cost: number }> = [{ pos: input.from, cost: 0 }]

	dist.set(hexKey(input.from), 0)
	prev.set(hexKey(input.from), null)

	let targetReached = false

	while (queue.length > 0) {
		queue.sort((a, b) => a.cost - b.cost)
		const { pos, cost } = queue.shift()!

		if (input.target !== undefined && pos.q === input.target.q && pos.r === input.target.r) {
			const currentOccupants = occupiedLookup.get(hexKey(pos)) ?? []
			if (
				canStopOnOccupiedHex({
					movingRole: input.movingRole,
					movingUnitType: input.movingUnitType,
					occupants: currentOccupants,
					incomingMembers: input.incomingMembers ?? input.incomingSquads ?? 1,
					rules: input.rules,
				})
			) {
				targetReached = true
				break
			}
		}

		for (const neighbor of getNeighbors(pos)) {
			if (!cellLookup.has(hexKey(neighbor))) continue
			const neighborOccupants = occupiedLookup.get(hexKey(neighbor)) ?? []
			if (!canTraverseOccupiedHex(input.movingRole, neighborOccupants)) continue

			const stepCost = getStepMoveCost({
				unitType: input.movingUnitType,
				from: pos,
				to: neighbor,
				terrainLookup,
				edgeLookup,
				rules: input.rules,
			})
			if (stepCost === null) continue

			const newCost = cost + stepCost
			if (newCost > input.movementAllowance) continue

			const key = hexKey(neighbor)
			if (dist.has(key) && dist.get(key)! <= newCost) continue

			dist.set(key, newCost)
			prev.set(key, pos)
			queue.push({ pos: neighbor, cost: newCost })
		}
	}

	return { dist, prev, targetReached }
}

export function findMovePath(input: {
	map: MoveMapSnapshot
	from: HexPos
	to: HexPos
	movementAllowance: number
	movingRole: MoveRole
	movingUnitType: string
	incomingMembers?: number
	incomingSquads?: number
	rules?: RulesContext
}): { found: true; path: HexPos[]; cost: number } | { found: false; path: []; cost: 0 } {
	const cellLookup = getCellLookup(input.map)

	if (!cellLookup.has(hexKey(input.to))) {
		return { found: false, path: [], cost: 0 }
	}

	if (input.from.q === input.to.q && input.from.r === input.to.r) {
		return { found: true, path: [], cost: 0 }
	}

	const search = runDijkstraSearch({
		map: input.map,
		from: input.from,
		movementAllowance: input.movementAllowance,
		movingRole: input.movingRole,
		movingUnitType: input.movingUnitType,
		target: input.to,
		incomingMembers: input.incomingMembers,
		incomingSquads: input.incomingSquads,
		rules: input.rules,
	})

	if (!search.targetReached) {
		return { found: false, path: [], cost: 0 }
	}

	const cost = search.dist.get(hexKey(input.to)) ?? 0
	return { found: true, path: reconstructPath(search.prev, input.from, input.to), cost }
}

export function listReachableMoves(input: {
	map: MoveMapSnapshot
	from: HexPos
	movementAllowance: number
	movingRole: MoveRole
	movingUnitType: string
	incomingMembers?: number
	incomingSquads?: number
	rules?: RulesContext
}): ReachableMove[] {
	const search = runDijkstraSearch({
		map: input.map,
		from: input.from,
		movementAllowance: input.movementAllowance,
		movingRole: input.movingRole,
		movingUnitType: input.movingUnitType,
		incomingMembers: input.incomingMembers,
		incomingSquads: input.incomingSquads,
		rules: input.rules,
	})
	const occupiedLookup = getOccupiedLookup(input.map)

	const moves: ReachableMove[] = []
	for (const [key, cost] of search.dist.entries()) {
		if (key === hexKey(input.from)) continue

		const [q, r] = key.split(',').map(Number)
		const to = { q, r }
		const occupants = occupiedLookup.get(key) ?? []
		if (!canStopOnOccupiedHex({
			movingRole: input.movingRole,
			movingUnitType: input.movingUnitType,
			occupants,
			incomingMembers: input.incomingMembers ?? input.incomingSquads ?? 1,
			rules: input.rules,
		})) {
			continue
		}
		moves.push({
			to,
			cost,
			path: reconstructPath(search.prev, input.from, to),
		})
	}

	return moves.sort((a, b) => a.cost - b.cost || a.to.q - b.to.q || a.to.r - b.to.r)
}