import type { HexPos } from '../types/index.js'

export type MoveMapSnapshot = {
	width: number
	height: number
	hexes: Array<{ q: number; r: number; t: number }>
}

export type ReachableMove = {
	to: HexPos
	path: HexPos[]
	cost: number
}

type TerrainType = 'clear' | 'ridgeline' | 'crater'

function hexKey(pos: HexPos): string {
	return `${pos.q},${pos.r}`
}

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

function getNeighbors(pos: HexPos): HexPos[] {
	return [
		{ q: pos.q + 1, r: pos.r },
		{ q: pos.q - 1, r: pos.r },
		{ q: pos.q, r: pos.r + 1 },
		{ q: pos.q, r: pos.r - 1 },
		{ q: pos.q + 1, r: pos.r - 1 },
		{ q: pos.q - 1, r: pos.r + 1 },
	]
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
) {
	const terrainLookup = getTerrainLookup(map)
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
}): { found: true; path: HexPos[]; cost: number } | { found: false; path: []; cost: 0 } {
	if (!isInBounds(input.map, input.to)) {
		return { found: false, path: [], cost: 0 }
	}

	if (input.from.q === input.to.q && input.from.r === input.to.r) {
		return { found: true, path: [], cost: 0 }
	}

	const terrainLookup = getTerrainLookup(input.map)
	const dist = new Map<string, number>()
	const prev = new Map<string, HexPos | null>()
	const queue: Array<{ pos: HexPos; cost: number }> = [{ pos: input.from, cost: 0 }]

	dist.set(hexKey(input.from), 0)
	prev.set(hexKey(input.from), null)

	while (queue.length > 0) {
		queue.sort((a, b) => a.cost - b.cost)
		const { pos, cost } = queue.shift()!

		if (pos.q === input.to.q && pos.r === input.to.r) {
			return { found: true, path: reconstructPath(prev, input.from, input.to), cost }
		}

		for (const neighbor of getNeighbors(pos)) {
			if (!isInBounds(input.map, neighbor)) continue

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
}): ReachableMove[] {
	const { dist, prev } = exploreReachableMoves(input.map, input.from, input.movementAllowance, input.canCrossRidgelines)

	const moves: ReachableMove[] = []
	for (const [key, cost] of dist.entries()) {
		if (key === hexKey(input.from)) continue

		const [q, r] = key.split(',').map(Number)
		const to = { q, r }
		moves.push({
			to,
			cost,
			path: reconstructPath(prev, input.from, to),
		})
	}

	return moves.sort((a, b) => a.cost - b.cost || a.to.q - b.to.q || a.to.r - b.to.r)
}