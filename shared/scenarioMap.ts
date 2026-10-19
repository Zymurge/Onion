import { createAxialRegion, hexKey, type HexPos } from './axialHex.js'

export type ScenarioTerrainHex = {
	q: number
	r: number
	t: number
}

export type ExplicitScenarioMap = {
	width: number
	height: number
	cells: HexPos[]
	hexes: ScenarioTerrainHex[]
}

export type CompactHexScenarioMap = {
	shape: 'hex'
	size: number
	hexes: ScenarioTerrainHex[]
}

export type CompactRectangleScenarioMap = {
	shape: 'rectangle'
	width: number
	height: number
	hexes: ScenarioTerrainHex[]
}

export type AuthoredScenarioMap = ExplicitScenarioMap | CompactHexScenarioMap | CompactRectangleScenarioMap

function buildCellLookup(cells: ReadonlyArray<HexPos>): Set<string> {
	return new Set(cells.map(hexKey))
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

	return materialized
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