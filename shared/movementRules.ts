import type { TerrainType, UnitDefinition } from './engineTypes.js'
import { getAllUnitDefinitions } from './unitDefinitions.js'

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

const UNIT_DEFINITIONS = getAllUnitDefinitions()

function getUnitDefinition(unitType: string): UnitDefinition | undefined {
	return UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]
}

export function canUnitCrossRidgeline(unitType: string): boolean {
	const definition = getUnitDefinition(unitType)
	if (definition === undefined) {
		return false
	}

	return definition.abilities.terrainRules?.ridgeline?.canCross === true
}

export function canUnitAccessTerrainCover(unitType: string, terrainType: TerrainType): boolean {
	const definition = getUnitDefinition(unitType)
	if (definition === undefined) {
		return false
	}

	return definition.abilities.terrainRules?.[terrainType]?.canAccessCover === true
}

export function getTerrainMoveCost(unitType: string, terrainType: TerrainType): number | null {
	if (terrainType === 'crater') {
		return null
	}

	if (terrainType === 'ridgeline') {
		return canUnitCrossRidgeline(unitType) ? 2 : null
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
}): StopOccupationFailure | null {
	const { movingRole, movingUnitType, occupants } = input
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

	if (movingUnitType !== 'LittlePigs') {
		return 'occupied'
	}

	if (!occupants.every((occupant) => occupant.role === 'defender' && occupant.unitType === 'LittlePigs')) {
		return 'mixed-stack'
	}

	const maxStacks = getUnitDefinition(movingUnitType)?.abilities.maxStacks ?? 1
	const destinationMembers = occupants.length
	return incomingMembers + destinationMembers <= maxStacks ? null : 'stack-limit'
}

export function canStopOnOccupiedHex(input: {
	movingRole: MoveRole
	movingUnitType: string
	occupants: MoveOccupant[]
	incomingMembers?: number
	incomingSquads?: number
}): boolean {
	return getStopOnOccupiedHexFailure(input) === null
}