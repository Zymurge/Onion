import type { PlayerRole, TurnPhase, UnitState, Weapon } from '../../../shared/types/index.js'
import { isBattlefieldWeaponReady } from '../weaponStats.js'

export type CombatEligibilityReason =
	| 'destroyed'
	| 'disabled'
	| 'recovering'
	| 'wrong-phase'
	| 'not-your-turn'
	| 'no-attack-capabilities'
	| 'out-of-ammo'
	| 'attacks-spent'
	| 'no-target-in-range'

export type CombatEligibility = Readonly<
	| { eligible: true }
	| { eligible: false; reason: CombatEligibilityReason }
>

type CombatEligibilityContext = Readonly<{
	phase: TurnPhase | null
	viewerRole: PlayerRole | null
	targetOptions: ReadonlyArray<Readonly<{
		id?: string
		isUnavailable?: boolean
		status?: UnitState
	}>>
}>

type DefenderCombatUnit = Readonly<{
	role: 'defender'
	state: UnitState
	weapons: ReadonlyArray<Weapon>
}>

type OnionCombatOwner = Readonly<{
	role: 'onion'
	state: UnitState
}>

export type DefenderCombatEligibilityInput = CombatEligibilityContext & Readonly<{
	unit: DefenderCombatUnit
}>

export type OnionWeaponCombatEligibilityInput = CombatEligibilityContext & Readonly<{
	owner: OnionCombatOwner
	weapon: Weapon
}>

const combatPhaseRoles: Partial<Record<TurnPhase, PlayerRole>> = {
	ONION_COMBAT: 'onion',
	DEFENDER_COMBAT: 'defender',
}

function getCombatPhaseRole(phase: TurnPhase | null): PlayerRole | undefined {
	return phase === null ? undefined : combatPhaseRoles[phase]
}

function evaluateActorState(state: UnitState): CombatEligibility | null {
	if (state === 'destroyed') {
		return { eligible: false, reason: 'destroyed' }
	}

	if (state === 'disabled') {
		return { eligible: false, reason: 'disabled' }
	}

	if (state === 'recovering') {
		return { eligible: false, reason: 'recovering' }
	}

	return null
}

function evaluateCombatContext({ phase, viewerRole, expectedRole }: {
	phase: TurnPhase | null
	viewerRole: PlayerRole | null
	expectedRole: PlayerRole
}): CombatEligibility | null {
	if (getCombatPhaseRole(phase) !== expectedRole) {
		return { eligible: false, reason: 'wrong-phase' }
	}

	if (viewerRole !== expectedRole) {
		return { eligible: false, reason: 'not-your-turn' }
	}

	return null
}

function hasLegalTarget(targetOptions: CombatEligibilityContext['targetOptions']): boolean {
	return targetOptions.some((target) => target.isUnavailable !== true)
}

export function evaluateDefenderCombatEligibility({ unit, phase, viewerRole, targetOptions }: DefenderCombatEligibilityInput): CombatEligibility {
	const stateResult = evaluateActorState(unit.state)
	if (stateResult !== null) {
		return stateResult
	}

	const contextResult = evaluateCombatContext({ phase, viewerRole, expectedRole: 'defender' })
	if (contextResult !== null) {
		return contextResult
	}

	if (unit.weapons.length === 0) {
		return { eligible: false, reason: 'no-attack-capabilities' }
	}

	if (!unit.weapons.some(isBattlefieldWeaponReady)) {
		if (unit.weapons.every((weapon) => weapon.state === 'destroyed')) {
			return { eligible: false, reason: 'destroyed' }
		}

		if (unit.weapons.every((weapon) => weapon.ammo !== undefined && weapon.ammo <= 0)) {
			return { eligible: false, reason: 'out-of-ammo' }
		}

		return { eligible: false, reason: 'attacks-spent' }
	}

	if (!hasLegalTarget(targetOptions)) {
		return { eligible: false, reason: 'no-target-in-range' }
	}

	return { eligible: true }
}

export function evaluateOnionWeaponCombatEligibility({ owner, weapon, phase, viewerRole, targetOptions }: OnionWeaponCombatEligibilityInput): CombatEligibility {
	const stateResult = evaluateActorState(owner.state)
	if (stateResult !== null) {
		return stateResult
	}

	const contextResult = evaluateCombatContext({ phase, viewerRole, expectedRole: 'onion' })
	if (contextResult !== null) {
		return contextResult
	}

	if (weapon.state === 'destroyed') {
		return { eligible: false, reason: 'destroyed' }
	}

	if (weapon.ammo !== undefined && weapon.ammo <= 0) {
		return { eligible: false, reason: 'out-of-ammo' }
	}

	if (weapon.state === 'spent') {
		return { eligible: false, reason: 'attacks-spent' }
	}

	if (!hasLegalTarget(targetOptions)) {
		return { eligible: false, reason: 'no-target-in-range' }
	}

	return { eligible: true }
}