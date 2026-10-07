import type { TerrainType } from './types/index.js'
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

function getUnitDefinition(unitType: string, rules?: RulesContext): UnitTypeBase | undefined {
	return getRulesContext(rules).getUnitDefinition(unitType)
}

export function canCrossRidgelineByTerrainRule(unitType: string, rules?: RulesContext): boolean {
	const definition = getUnitDefinition(unitType, rules)
	if (definition === undefined) {
		return false
	}

	return definition.abilities.terrainRules?.ridgeline?.canCross === true
}

export function canUnitAccessTerrainCover(unitType: string, terrainType: TerrainType, rules?: RulesContext): boolean {
	const definition = getUnitDefinition(unitType, rules)
	if (definition === undefined) {
		return false
	}

	return definition.abilities.terrainRules?.[terrainType]?.canAccessCover === true
}

export function getTerrainMoveCost(unitType: string, terrainType: TerrainType, rules?: RulesContext): number | null {
	if (terrainType === 'crater') {
		return null
	}

	if (terrainType === 'ridgeline') {
			return canCrossRidgelineByTerrainRule(unitType, rules) ? 2 : null
	}

	return 1
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