import type { GameState, TurnPhase } from '../types/index.js'
import { onionMovementAllowance } from './movementAllowance.js'

type MovementProfile = {
	movement: number
	canCrossRidgelines?: boolean
	secondMoveAllowance?: number
	secondMove?: boolean
	immobile?: boolean
}

const MOVEMENT_PROFILES: Record<string, MovementProfile> = {
	TheOnion: { movement: 3, canCrossRidgelines: true },
	BigBadWolf: { movement: 4, secondMoveAllowance: 3, secondMove: true },
	Puss: { movement: 3 },
	Witch: { movement: 2 },
	LordFarquaad: { movement: 0, immobile: true },
	Pinocchio: { movement: 2 },
	Dragon: { movement: 5 },
	LittlePigs: { movement: 1, canCrossRidgelines: true },
	Castle: { movement: 0, immobile: true },
}

function getProfile(unitType: string): MovementProfile {
	return MOVEMENT_PROFILES[unitType] ?? { movement: 0 }
}

function movementSpentKey(phase: TurnPhase, unitId: string): string {
	return `${phase}:${unitId}`
}

export function canUnitCrossRidgelines(unitType: string): boolean {
	return getProfile(unitType).canCrossRidgelines === true
}

export function canUnitSecondMove(unitType: string): boolean {
	return getProfile(unitType).secondMove === true
}

export function isUnitImmobile(unitType: string): boolean {
	return getProfile(unitType).immobile === true
}

export function getUnitMovementAllowance(unitType: string, phase: TurnPhase, treads?: number): number {
	const profile = getProfile(unitType)

	if (unitType === 'TheOnion') {
		if (phase !== 'ONION_MOVE') {
			return 0
		}

		return onionMovementAllowance(treads ?? 0)
	}

	if (phase === 'GEV_SECOND_MOVE') {
		return canUnitSecondMove(unitType) ? profile.secondMoveAllowance ?? 0 : 0
	}

	if (phase !== 'DEFENDER_MOVE') {
		return 0
	}

	return profile.movement
}

export function getUnitMovementSpent(state: Pick<GameState, 'movementSpent'> | null | undefined, phase: TurnPhase, unitId: string): number {
	return state?.movementSpent?.[movementSpentKey(phase, unitId)] ?? 0
}

export function getRemainingUnitMovementAllowance(
	unitType: string,
	phase: TurnPhase,
	state: Pick<GameState, 'movementSpent'> | null | undefined,
	unitId: string,
	treads?: number,
): number {
	return Math.max(getUnitMovementAllowance(unitType, phase, treads) - getUnitMovementSpent(state, phase, unitId), 0)
}

export function spendUnitMovement(state: Pick<GameState, 'movementSpent'>, phase: TurnPhase, unitId: string, spent: number): void {
	if (spent <= 0) {
		return
	}

	state.movementSpent ??= {}
	const key = movementSpentKey(phase, unitId)
	state.movementSpent[key] = (state.movementSpent[key] ?? 0) + spent
}

export function resetMovementSpent(state: Pick<GameState, 'movementSpent'>): void {
	state.movementSpent = {}
}