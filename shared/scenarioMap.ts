import { createAxialRegion, hexDistance, hexKey, type HexPos } from './axialHex.js'
import { isSupportedEdgeVariant } from './config/edgeTerrainVariants.js'
import type { ScenarioTerrainEdge, TerrainType } from './types/index.js'

export type { ScenarioEdgeTerrain, ScenarioTerrainEdge } from './types/index.js'

export type ScenarioTerrainHex = {
	q: number
	r: number
	t: number
}

/** Decode the canonical whole-hex terrain code carried by scenario snapshots. */
export function terrainFromT(t: number): TerrainType {
	if (t === 1) return 'crater'
	if (t === 2) return 'swamp'
	return 'clear'
}

export type ExplicitScenarioMap = {
	width: number
	height: number
	cells: HexPos[]
	hexes: ScenarioTerrainHex[]
	edges: ScenarioTerrainEdge[]
}

type AuthoredExplicitScenarioMap = Omit<ExplicitScenarioMap, 'edges'> & {
	edges?: ScenarioTerrainEdge[]
}

export type CompactHexScenarioMap = {
	shape: 'hex'
	size: number
	hexes: ScenarioTerrainHex[]
	edges?: ScenarioTerrainEdge[]
}

export type CompactRectangleScenarioMap = {
	shape: 'rectangle'
	width: number
	height: number
	hexes: ScenarioTerrainHex[]
	edges?: ScenarioTerrainEdge[]
}

export type AuthoredScenarioMap = AuthoredExplicitScenarioMap | CompactHexScenarioMap | CompactRectangleScenarioMap

function buildCellLookup(cells: ReadonlyArray<HexPos>): Set<string> {
	return new Set(cells.map(hexKey))
}

function compareEdges(left: ScenarioTerrainEdge, right: ScenarioTerrainEdge): number {
	if (left.a.q !== right.a.q) return left.a.q - right.a.q
	if (left.a.r !== right.a.r) return left.a.r - right.a.r
	if (left.b.q !== right.b.q) return left.b.q - right.b.q
	return left.b.r - right.b.r
}

function isCanonicalEndpointOrder(edge: ScenarioTerrainEdge): boolean {
	return edge.a.q < edge.b.q || (edge.a.q === edge.b.q && edge.a.r < edge.b.r)
}

/** Validates canonical scenario edge geometry against the materialized cells. */
export function validateCanonicalEdges(
	edges: ReadonlyArray<ScenarioTerrainEdge>,
	cells: ReadonlyArray<HexPos>,
): void {
	const cellLookup = buildCellLookup(cells)

	for (let index = 0; index < edges.length; index += 1) {
		const edge = edges[index]
		if (!cellLookup.has(hexKey(edge.a)) || !cellLookup.has(hexKey(edge.b))) {
			throw new Error(`Scenario edge endpoint is outside the map at (${edge.a.q}, ${edge.a.r})-(${edge.b.q}, ${edge.b.r})`)
		}
		if (hexDistance(edge.a, edge.b) !== 1) {
			throw new Error(`Scenario edge endpoints must be adjacent at (${edge.a.q}, ${edge.a.r})-(${edge.b.q}, ${edge.b.r})`)
		}
		if (!isSupportedEdgeVariant(edge.type, edge.variant)) {
			throw new Error(`Scenario edge variant ${edge.variant} is not supported for ${edge.type} at index ${index}`)
		}
		if (!isCanonicalEndpointOrder(edge)) {
			throw new Error(`Scenario edge endpoints must be in canonical order at index ${index}`)
		}

		if (index > 0) {
			const comparison = compareEdges(edges[index - 1], edge)
			if (comparison === 0) {
				throw new Error(`Scenario edge endpoint pair is duplicated at index ${index}`)
			}
			if (comparison > 0) {
				throw new Error(`Scenario edges must be in canonical order at index ${index}`)
			}
		}
	}
}

/**
 * Materialize an authored scenario map into the canonical explicit runtime map.
 *
 * Compact maps are converted into runtime axial cells; explicit maps are
 * validated and passed through as-is. Authored coordinates are already in the
 * runtime coordinate space and are never translated.
 */
export function materializeScenarioMap(map: AuthoredScenarioMap): ExplicitScenarioMap {
	const materialized =
		'cells' in map
			? {
				width: map.width,
				height: map.height,
				cells: map.cells,
				hexes: map.hexes,
				edges: map.edges ?? [],
			}
			: materializeCompactMap(map)

	const cellLookup = buildCellLookup(materialized.cells)
	if (materialized.cells.length === 0) {
		throw new Error('Scenario map must contain at least one cell')
	}

	for (const hex of materialized.hexes) {
		if (!cellLookup.has(hexKey(hex))) {
			throw new Error(`Scenario terrain hex is outside the map at (${hex.q}, ${hex.r})`)
		}
	}
	validateCanonicalEdges(materialized.edges, materialized.cells)

	return {
		...materialized,
		cells: materialized.cells.map((cell) => ({ ...cell })),
		hexes: materialized.hexes.map((hex) => ({ ...hex })),
		edges: materialized.edges.map((edge) => ({
			...edge,
			a: { ...edge.a },
			b: { ...edge.b },
		})),
	}
}

function materializeCompactMap(map: CompactHexScenarioMap | CompactRectangleScenarioMap): ExplicitScenarioMap {
	if (map.shape === 'hex') {
		if (!Number.isInteger(map.size) || map.size <= 0 || map.size % 2 === 0) {
			throw new Error('Hex map size must be a positive odd integer')
		}

		const radius = (map.size - 1) / 2
		return {
			width: map.size,
			height: map.size,
			cells: createAxialRegion(radius, { q: radius, r: radius }).cells,
			hexes: map.hexes.map((hex) => ({ ...hex })),
			edges: map.edges?.map((edge) => ({ ...edge, a: { ...edge.a }, b: { ...edge.b } })) ?? [],
		}
	}

	if (!Number.isInteger(map.width) || map.width <= 0 || !Number.isInteger(map.height) || map.height <= 0) {
		throw new Error('Rectangle map dimensions must be positive integers')
	}

	const cells: HexPos[] = []
	for (let r = 0; r < map.height; r += 1) {
		for (let q = 0; q < map.width; q += 1) {
			cells.push({ q, r })
		}
	}

	return {
		width: map.width,
		height: map.height,
		cells,
		hexes: map.hexes.map((hex) => ({ ...hex })),
		edges: map.edges?.map((edge) => ({ ...edge, a: { ...edge.a }, b: { ...edge.b } })) ?? [],
	}
}

/**
 * Verify that authored positions are present in the runtime explicit cell set.
 */
export function assertScenarioPositionsInMap(
	map: ExplicitScenarioMap,
	positions: ReadonlyArray<{ label: string; position: HexPos }>,
): void {
	const cellLookup = buildCellLookup(map.cells)

	for (const { label, position } of positions) {
		if (!cellLookup.has(hexKey(position))) {
			throw new Error(`${label} is outside the scenario map at (${position.q}, ${position.r})`)
		}
	}
}