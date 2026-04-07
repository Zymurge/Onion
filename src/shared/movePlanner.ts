import { getNeighbors, hexKey, type HexPos } from './hex.js'

export type MoveMapSnapshot = {
	width: number
	height: number
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

type MoveRole = 'onion' | 'defender'

type Occupant = NonNullable<MoveMapSnapshot['occupiedHexes']>[number]

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

function isInBounds(map: MoveMapSnapshot, pos: HexPos): boolean {
	return pos.q >= 0 && pos.q < map.width && pos.r >= 0 && pos.r < map.height
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

function canTraverseOccupiedHex(movingRole: MoveRole, occupants: Occupant[]): boolean {
	if (occupants.length === 0) {
		return true
	}

	if (movingRole === 'onion') {
		return occupants.some((occupant) => occupant.role === 'defender')
	}

	return occupants.every((occupant) => occupant.role === 'defender')
}

function canStopOnOccupiedHex(
	movingRole: MoveRole,
	movingUnitType: string,
	occupants: Occupant[],
	incomingSquads: number = 1
): boolean {
	if (occupants.length === 0) {
		return true
	}

	if (movingRole === 'onion') {
		return occupants.every((occupant) => occupant.role === 'defender')
	}

	const isLittlePigs = movingUnitType === 'LittlePigs'
	if (!isLittlePigs) {
		return false
	}

	if (!occupants.every((occupant) => occupant.role === 'defender' && occupant.unitType === 'LittlePigs')) {
		return false
	}

	const destinationSquads = occupants.reduce((total, occupant) => total + (occupant.squads ?? 1), 0)
	return incomingSquads + destinationSquads <= 3
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
	canCrossRidgelines: boolean,
	movingRole: MoveRole,
) {
	const terrainLookup = getTerrainLookup(map)
	const occupiedLookup = getOccupiedLookup(map)
	const dist = new Map<string, number>()
	const prev = new Map<string, HexPos | null>()
	const queue: Array<{ pos: HexPos; cost: number }> = [{ pos: from, cost: 0 }]

	dist.set(hexKey(from), 0)
	prev.set(hexKey(from), null)

	while (queue.length > 0) {
		queue.sort((a, b) => a.cost - b.cost)
		const { pos, cost } = queue.shift()!

		for (const neighbor of getNeighbors(pos)) {
			if (!isInBounds(map, neighbor)) continue
			const neighborOccupants = occupiedLookup.get(hexKey(neighbor)) ?? []
			if (!canTraverseOccupiedHex(movingRole, neighborOccupants)) continue

			const terrain = terrainLookup.get(hexKey(neighbor)) ?? 'clear'
			const stepCost = terrainCost(terrain, canCrossRidgelines)
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
	if (!isInBounds(input.map, input.to)) {
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
			canStopOnOccupiedHex(
				input.movingRole,
				input.movingUnitType,
				currentOccupants,
				input.incomingSquads ?? 1
			)
		) {
			return { found: true, path: reconstructPath(prev, input.from, input.to), cost }
		}

		for (const neighbor of getNeighbors(pos)) {
			if (!isInBounds(input.map, neighbor)) continue
			const neighborOccupants = occupiedLookup.get(hexKey(neighbor)) ?? []
			if (!canTraverseOccupiedHex(input.movingRole, neighborOccupants)) continue

			const terrain = terrainLookup.get(hexKey(neighbor)) ?? 'clear'
			const stepCost = terrainCost(terrain, input.canCrossRidgelines)
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
	const { dist, prev } = exploreReachableMoves(input.map, input.from, input.movementAllowance, input.canCrossRidgelines, input.movingRole)
	const occupiedLookup = getOccupiedLookup(input.map)

	const moves: ReachableMove[] = []
	for (const [key, cost] of dist.entries()) {
		if (key === hexKey(input.from)) continue

		const [q, r] = key.split(',').map(Number)
		const to = { q, r }
		const occupants = occupiedLookup.get(key) ?? []
		if (!canStopOnOccupiedHex(input.movingRole, input.movingUnitType, occupants, input.incomingSquads ?? 1)) {
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