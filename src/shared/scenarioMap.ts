import { createAxialRegion, hexKey, type HexPos } from './hex.js'

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

export type RadiusScenarioMap = {
	radius: number
	shape?: 'hex'
	hexes?: ScenarioTerrainHex[]
}

export type AuthoredScenarioMap = ExplicitScenarioMap | RadiusScenarioMap

function buildCellLookup(cells: ReadonlyArray<HexPos>): Set<string> {
	return new Set(cells.map(hexKey))
}

export function translateScenarioCoord(coord: HexPos, radius: number): HexPos {
	return {
		q: coord.q + radius - coord.r,
		r: coord.r,
	}
}

export function materializeScenarioMap(map: AuthoredScenarioMap): ExplicitScenarioMap {
	const materialized =
		'cells' in map
			? {
				width: map.width,
				height: map.height,
				cells: map.cells,
				hexes: map.hexes,
			}
			: (() => {
				if (map.shape !== undefined && map.shape !== 'hex') {
					throw new Error(`Unsupported scenario map shape: ${map.shape}`)
				}

				const radius = Math.max(0, Math.floor(map.radius))
				const cells = createAxialRegion(radius, { q: radius, r: radius }).cells
				return {
					width: radius * 2 + 1,
					height: radius * 2 + 1,
					cells,
					hexes: (map.hexes ?? []).map((hex) => ({ ...translateScenarioCoord(hex, radius), t: hex.t })),
				}
			})()

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