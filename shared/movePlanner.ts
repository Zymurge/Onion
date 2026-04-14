import { getNeighbors, hexKey, type HexPos } from './hex.js'
import {
	canStopOnOccupiedHex,
	canTraverseOccupiedHex,
	getTerrainMoveCost,
	type MoveOccupant,
	type MoveRole,
} from './movementRules.js'

export type MoveMapSnapshot = {
	width: number
	height: number
	cells: Array<{ q: number; r: number }>
	hexes: Array<{ q: number; r: number; t: number }>
	occupiedHexes?: Array<{
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

type TerrainType = 'clear' | 'ridgeline' | 'crater'

type Occupant = MoveOccupant

function terrainFromT(t: number): TerrainType {
	if (t === 1) return 'ridgeline'
	if (t === 2) return 'crater'
	return 'clear'
}

function terrainCost(terrain: TerrainType, canCrossRidgelines: boolean): number | null {
	if (terrain === 'crater') return null
	if (terrain === 'ridgeline') return canCrossRidgelines ? 2 : null
	return 1
}

function getCellLookup(map: MoveMapSnapshot): Set<string> {
	return new Set(map.cells.map(hexKey))
}

function getTerrainLookup(map: MoveMapSnapshot): Map<string, TerrainType> {
	return new Map(map.hexes.map((hex) => [hexKey(hex), terrainFromT(hex.t)]))
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

function exploreReachableMoves(
	map: MoveMapSnapshot,
	from: HexPos,
	movementAllowance: number,
	movingUnitType: string,
	movingRole: MoveRole,
) {
	const terrainLookup = getTerrainLookup(map)
	const occupiedLookup = getOccupiedLookup(map)
	const cellLookup = getCellLookup(map)
	const dist = new Map<string, number>()
	const prev = new Map<string, HexPos | null>()
	const queue: Array<{ pos: HexPos; cost: number }> = [{ pos: from, cost: 0 }]

	dist.set(hexKey(from), 0)
	prev.set(hexKey(from), null)

	while (queue.length > 0) {
		queue.sort((a, b) => a.cost - b.cost)
		const { pos, cost } = queue.shift()!

		for (const neighbor of getNeighbors(pos)) {
			if (!cellLookup.has(hexKey(neighbor))) continue
			const neighborOccupants = occupiedLookup.get(hexKey(neighbor)) ?? []
			if (!canTraverseOccupiedHex(movingRole, neighborOccupants)) continue

			const terrain = terrainLookup.get(hexKey(neighbor)) ?? 'clear'
			const stepCost = getTerrainMoveCost(movingUnitType, terrain)
			if (stepCost === null) continue

			const newCost = cost + stepCost
			if (newCost > movementAllowance) continue

			const key = hexKey(neighbor)
			if (dist.has(key) && dist.get(key)! <= newCost) continue

			dist.set(key, newCost)
			prev.set(key, pos)
			queue.push({ pos: neighbor, cost: newCost })
		}
	}

	return { dist, prev }
}

export function findMovePath(input: {
	map: MoveMapSnapshot
	from: HexPos
	to: HexPos
	movementAllowance: number
	canCrossRidgelines: boolean
	movingRole: MoveRole
	movingUnitType: string
	incomingSquads?: number
}): { found: true; path: HexPos[]; cost: number } | { found: false; path: []; cost: 0 } {
	const cellLookup = getCellLookup(input.map)

	if (!cellLookup.has(hexKey(input.to))) {
		return { found: false, path: [], cost: 0 }
	}

	if (input.from.q === input.to.q && input.from.r === input.to.r) {
		return { found: true, path: [], cost: 0 }
	}

	const terrainLookup = getTerrainLookup(input.map)
	const occupiedLookup = getOccupiedLookup(input.map)
	const dist = new Map<string, number>()
	const prev = new Map<string, HexPos | null>()
	const queue: Array<{ pos: HexPos; cost: number }> = [{ pos: input.from, cost: 0 }]

	dist.set(hexKey(input.from), 0)
	prev.set(hexKey(input.from), null)

	while (queue.length > 0) {
		queue.sort((a, b) => a.cost - b.cost)
		const { pos, cost } = queue.shift()!
		const currentOccupants = occupiedLookup.get(hexKey(pos)) ?? []

		if (
			pos.q === input.to.q &&
			pos.r === input.to.r &&
			canStopOnOccupiedHex({
				movingRole: input.movingRole,
				movingUnitType: input.movingUnitType,
				occupants: currentOccupants,
				incomingSquads: input.incomingSquads ?? 1,
			})
		) {
			return { found: true, path: reconstructPath(prev, input.from, input.to), cost }
		}

		for (const neighbor of getNeighbors(pos)) {
			if (!cellLookup.has(hexKey(neighbor))) continue
			const neighborOccupants = occupiedLookup.get(hexKey(neighbor)) ?? []
			if (!canTraverseOccupiedHex(input.movingRole, neighborOccupants)) continue

			const terrain = terrainLookup.get(hexKey(neighbor)) ?? 'clear'
			const stepCost = getTerrainMoveCost(input.movingUnitType, terrain)
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

	return { found: false, path: [], cost: 0 }
}

export function listReachableMoves(input: {
	map: MoveMapSnapshot
	from: HexPos
	movementAllowance: number
	canCrossRidgelines: boolean
	movingRole: MoveRole
	movingUnitType: string
	incomingSquads?: number
}): ReachableMove[] {
	const { dist, prev } = exploreReachableMoves(input.map, input.from, input.movementAllowance, input.movingUnitType, input.movingRole)
	const occupiedLookup = getOccupiedLookup(input.map)

	const moves: ReachableMove[] = []
	for (const [key, cost] of dist.entries()) {
		if (key === hexKey(input.from)) continue

		const [q, r] = key.split(',').map(Number)
		const to = { q, r }
		const occupants = occupiedLookup.get(key) ?? []
		if (!canStopOnOccupiedHex({
			movingRole: input.movingRole,
			movingUnitType: input.movingUnitType,
			occupants,
			incomingSquads: input.incomingSquads ?? 1,
		})) {
			continue
		}
		moves.push({
			to,
			cost,
			path: reconstructPath(prev, input.from, to),
		})
	}

	return moves.sort((a, b) => a.cost - b.cost || a.to.q - b.to.q || a.to.r - b.to.r)
}