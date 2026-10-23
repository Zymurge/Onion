import type { PlayerRole, TurnPhase, UnitState } from '../../../shared/types/index.js'

export type MovementEligibilityReason =
	| 'destroyed'
	| 'disabled'
	| 'recovering'
	| 'wrong-phase'
	| 'not-your-turn'
	| 'no-movement-remaining'

export type MovementEligibility = Readonly<
	| { eligible: true }
	| { eligible: false; reason: MovementEligibilityReason }
>

export type MovementEligibilityUnit = Readonly<{
	role: PlayerRole
	state: UnitState
	movesRemaining: number
	immobile?: boolean
}>

export type MovementEligibilityInput = Readonly<{
	unit: MovementEligibilityUnit
	phase: TurnPhase | null
	viewerRole: PlayerRole | null
}>

const movementPhaseRoles: Partial<Record<TurnPhase, PlayerRole>> = {
	ONION_MOVE: 'onion',
	DEFENDER_MOVE: 'defender',
	GEV_SECOND_MOVE: 'defender',
}

export function evaluateMovementEligibility({ unit, phase, viewerRole }: MovementEligibilityInput): MovementEligibility {
	if (unit.state === 'destroyed') {
		return { eligible: false, reason: 'destroyed' }
	}

	if (unit.state === 'disabled') {
		return { eligible: false, reason: 'disabled' }
	}

	if (unit.state === 'recovering') {
		return { eligible: false, reason: 'recovering' }
	}

	const activeRole = phase === null ? undefined : movementPhaseRoles[phase]
	if (activeRole === undefined) {
		return { eligible: false, reason: 'wrong-phase' }
	}

	if (viewerRole !== activeRole || unit.role !== activeRole) {
		return { eligible: false, reason: 'not-your-turn' }
	}

	if (unit.immobile === true || unit.movesRemaining <= 0) {
		return { eligible: false, reason: 'no-movement-remaining' }
	}

	return { eligible: true }
}