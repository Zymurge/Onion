import type { HexPos, ScenarioTerrainEdge, TerrainType } from './types/index.js'
import type { UnitTypeBase } from './types/index.js'
import { getRulesContext, type RulesContext } from './rulesContext.js'

export type MoveRole = 'onion' | 'defender'

export type MoveOccupant = {
	q: number
	r: number
	role: MoveRole
	unitType: string
	squads?: number
}

export type StopOccupationFailure =
	| 'occupied-by-onion'
	| 'occupied'
	| 'mixed-stack'
	| 'stack-limit'

export type EdgeLookup = Map<string, ScenarioTerrainEdge>

/**
 * Returns a canonical undirected key for an edge between two hex positions.
 * Compares complete (q, r) coordinates lexicographically.
 */
export function canonicalEdgeKey(a: HexPos, b: HexPos): string {
	if (a.q < b.q || (a.q === b.q && a.r <= b.r)) {
		return `${a.q},${a.r}|${b.q},${b.r}`
	}
	return `${b.q},${b.r}|${a.q},${a.r}`
}

/**
 * Builds an O(1) lookup map of edges indexed by canonical edge key.
 */
export function buildEdgeLookup(edges?: ReadonlyArray<ScenarioTerrainEdge>): EdgeLookup {
	const lookup = new Map<string, ScenarioTerrainEdge>()
	if (!edges) {
		return lookup
	}
	for (const edge of edges) {
		lookup.set(canonicalEdgeKey(edge.a, edge.b), edge)
	}
	return lookup
}

/**
 * Evaluates the edge crossing effect for a step between adjacent hexes `from` and `to`.
 * Edge effects are bidirectional and resolve through the unit's class rules.
 */
export function getEdgeStepEffect(
	unitType: string,
	from: HexPos,
	to: HexPos,
	edgeLookup: EdgeLookup,
	rules?: RulesContext,
): { canCross: boolean; surcharge: number } {
	const edge = edgeLookup.get(canonicalEdgeKey(from, to))
	if (edge === undefined) {
		return { canCross: true, surcharge: 0 }
	}

	const classRule = getUnitClassRule(unitType, rules)
	if (classRule === undefined) {
		throw new Error(`Missing unit class rule for unit type ${unitType}`)
	}

	const terrainRule = classRule.terrain[edge.type]
	if (terrainRule === undefined) {
		throw new Error(`Missing ${edge.type} edge terrain rule for unit type ${unitType}`)
	}

	return {
		canCross: terrainRule.canCross,
		surcharge: terrainRule.movementSurcharge,
	}
}

/**
 * Returns the combined movement cost for stepping from `from` to `to`, or `null` if impassable or prohibited.
 * Combines edge surcharge with destination whole-hex terrain entry cost.
 */
export function getStepMoveCost(input: {
	unitType: string
	from: HexPos
	to: HexPos
	terrainLookup: Map<string, TerrainType>
	edgeLookup: EdgeLookup
	rules?: RulesContext
}): number | null {
	const edgeEffect = getEdgeStepEffect(input.unitType, input.from, input.to, input.edgeLookup, input.rules)
	if (!edgeEffect.canCross) {
		return null
	}

	const destinationKey = `${input.to.q},${input.to.r}`
	const destinationTerrain = input.terrainLookup.get(destinationKey) ?? 'clear'
	const destinationCost = getTerrainMoveCost(input.unitType, destinationTerrain, input.rules)
	if (destinationCost === null) {
		return null
	}

	return destinationCost + edgeEffect.surcharge
}

function getUnitDefinition(unitType: string, rules?: RulesContext): UnitTypeBase | undefined {
	return getRulesContext(rules).getUnitDefinition(unitType)
}

function getUnitClassRule(unitType: string, rules?: RulesContext) {
	const definition = getUnitDefinition(unitType, rules)
	return definition === undefined ? undefined : getRulesContext(rules).getUnitClassRule(definition.unitClass)
}

function requireTerrainRule<T>(terrainRule: T | undefined, unitType: string, terrainType: TerrainType): T {
	if (terrainRule === undefined) {
		throw new Error(`Missing ${terrainType} terrain rule for unit type ${unitType}`)
	}
	return terrainRule
}

/** Returns whether a unit class may cross ridgeline terrain. */
export function canCrossRidgelineByTerrainRule(unitType: string, rules?: RulesContext): boolean {
	const terrainRule = requireTerrainRule(getUnitClassRule(unitType, rules)?.terrain.ridge, unitType, 'ridgeline')
	return terrainRule.canCross
}

/** Returns the whole-hex movement cost for a terrain type. */
export function getTerrainMoveCost(unitType: string, terrainType: TerrainType, rules?: RulesContext): number | null {
	if (terrainType === 'ridgeline') {
		const terrainRule = requireTerrainRule(getUnitClassRule(unitType, rules)?.terrain.ridge, unitType, terrainType)
		return terrainRule.canCross ? 1 + terrainRule.movementSurcharge : null
	}

	const terrainRule = requireTerrainRule(
		getUnitClassRule(unitType, rules)?.wholeHexTerrain[terrainType],
		unitType,
		terrainType,
	)
	return terrainRule.canEnter ? 1 + terrainRule.movementSurcharge : null
}

export function canTraverseOccupiedHex(movingRole: MoveRole, occupants: MoveOccupant[]): boolean {
	if (occupants.length === 0) {
		return true
	}

	if (movingRole === 'onion') {
		return occupants.some((occupant) => occupant.role === 'defender')
	}

	return occupants.every((occupant) => occupant.role === 'defender')
}

export function getStopOnOccupiedHexFailure(input: {
	movingRole: MoveRole
	movingUnitType: string
	occupants: MoveOccupant[]
	incomingMembers?: number
	incomingSquads?: number
	rules?: RulesContext
}): StopOccupationFailure | null {
	const { movingRole, movingUnitType, occupants, rules } = input
	const incomingMembers = input.incomingMembers ?? input.incomingSquads ?? 1

	if (occupants.length === 0) {
		return null
	}

	if (movingRole === 'onion') {
		return occupants.every((occupant) => occupant.role === 'defender') ? null : 'occupied'
	}

	if (occupants.some((occupant) => occupant.role === 'onion')) {
		return 'occupied-by-onion'
	}

	if (getUnitDefinition(movingUnitType, rules)?.stackable !== true) {
		return 'occupied'
	}

	if (!occupants.every((occupant) => occupant.role === 'defender' && occupant.unitType === movingUnitType)) {
		return 'mixed-stack'
	}

	const maxStacks = getUnitDefinition(movingUnitType, rules)?.abilities.maxStacks ?? 1
	const destinationMembers = occupants.length
	return incomingMembers + destinationMembers <= maxStacks ? null : 'stack-limit'
}

export function canStopOnOccupiedHex(input: {
	movingRole: MoveRole
	movingUnitType: string
	occupants: MoveOccupant[]
	incomingMembers?: number
	incomingSquads?: number
	rules?: RulesContext
}): boolean {
	return getStopOnOccupiedHexFailure(input) === null
}