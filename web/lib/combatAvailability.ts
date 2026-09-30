import type { UnitState, Weapon } from '../../shared/types/index.js'
import type { Mode } from './battlefieldView'

export type CombatWeaponDetail = Weapon & {
	disabledReason?: string
}

export function getCombatWeaponAvailabilityReason(
	weapon: Weapon,
	ownerState: UnitState | undefined,
	activeTurnActive: boolean,
	hasLegalTarget?: boolean,
): string | undefined {
	if (ownerState === 'destroyed' || weapon.state === 'destroyed') {
		return 'Destroyed'
	}

	if (ownerState === 'disabled') {
		return 'Disabled'
	}

	if (weapon.ammo !== undefined && weapon.ammo <= 0) {
		return 'Out of ammo'
	}

	if (weapon.state === 'spent') {
		return 'Fired this turn'
	}

	if (!activeTurnActive) {
		return 'Not your turn'
	}

	if (hasLegalTarget === false) {
		return 'No targets in range'
	}

	return undefined
}

export function getCombatUnitAvailabilityReason(
	unit: { state: UnitState; actionableModes: ReadonlyArray<Mode> },
	activeTurnActive: boolean,
	hasLegalTarget?: boolean,
): string | undefined {
	if (unit.state === 'destroyed') {
		return 'Destroyed'
	}

	if (unit.state === 'disabled') {
		return 'Disabled'
	}

	if (unit.state === 'recovering') {
		return 'Recovering'
	}

	if (!activeTurnActive) {
		return 'Not your turn'
	}

	if (!unit.actionableModes.includes('fire')) {
		return 'Fired this turn'
	}

	if (hasLegalTarget === false) {
		return 'Out of range'
	}

	return undefined
}
