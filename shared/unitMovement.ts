import type { TurnPhase } from './types/index.js'
import { onionMovementAllowance } from './movementAllowance.js'
import { getAllUnitDefinitions } from './unitDefinitions.js'
import { canUnitCrossRidgeline } from './movementRules.js'

const UNIT_DEFINITIONS = getAllUnitDefinitions()

function getDefinition(unitType: string) {
	return UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]
}

function movementSpentKey(phase: TurnPhase, unitId: string): string {
	return `${phase}:${unitId}`
}

export function canUnitCrossRidgelines(unitType: string): boolean {
	return canUnitCrossRidgeline(unitType)
}

export function canUnitSecondMove(unitType: string): boolean {
	return getDefinition(unitType)?.abilities.secondMove === true
}

export function isUnitImmobile(unitType: string): boolean {
	return getDefinition(unitType)?.abilities.immobile === true
}

export function getUnitMovementAllowance(unitType: string, phase: TurnPhase, treads?: number): number {
	const definition = getDefinition(unitType)

	if (unitType === 'TheOnion') {
		if (phase !== 'ONION_MOVE') {
			return 0
		}

		return onionMovementAllowance(treads ?? 0)
	}

	if (phase === 'GEV_SECOND_MOVE') {
		return canUnitSecondMove(unitType) ? definition?.abilities.secondMoveAllowance ?? 0 : 0
	}

	if (phase !== 'DEFENDER_MOVE') {
		return 0
	}

	return definition?.movement ?? 0
}

type MovementSpentState = {
	movementSpent?: Record<string, number>
}

export function getUnitMovementSpent(state: MovementSpentState | null | undefined, phase: TurnPhase, unitId: string): number {
	return state?.movementSpent?.[movementSpentKey(phase, unitId)] ?? 0
}

export function getRemainingUnitMovementAllowance(
	unitType: string,
	phase: TurnPhase,
	state: MovementSpentState | null | undefined,
	unitId: string,
	treads?: number,
): number {
	return Math.max(getUnitMovementAllowance(unitType, phase, treads) - getUnitMovementSpent(state, phase, unitId), 0)
}

export function spendUnitMovement(state: MovementSpentState, phase: TurnPhase, unitId: string, spent: number): void {
	if (spent <= 0) {
		return
	}

	state.movementSpent ??= {}
	const key = movementSpentKey(phase, unitId)
	state.movementSpent[key] = (state.movementSpent[key] ?? 0) + spent
}

export function resetMovementSpent(state: MovementSpentState): void {
	state.movementSpent = {}
}