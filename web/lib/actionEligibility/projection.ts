import type { PlayerRole, TurnPhase, UnitState, Weapon } from '../../../shared/types/index.js'
import { evaluateDefenderCombatEligibility, evaluateOnionWeaponCombatEligibility, type CombatEligibility } from './combat.js'
import { evaluateMovementEligibility, type MovementEligibility } from './movement.js'

export type ActionEligibilityTargetOption = Readonly<{
	id: string
	q: number
	r: number
	isUnavailable?: boolean
	status?: UnitState
}>

export type ActionEligibilityUnit = Readonly<{
	unitId: string
	role: PlayerRole
	state: UnitState
	movesRemaining: number
	immobile?: boolean
	weapons: ReadonlyArray<Weapon>
}>

type DefenderEligibilityUnit = ActionEligibilityUnit & Readonly<{
	role: 'defender'
}>

type OnionEligibilityUnit = ActionEligibilityUnit & Readonly<{
	role: 'onion'
}>

export type BattlefieldActionEligibilityInput = Readonly<{
	phase: TurnPhase | null
	viewerRole: PlayerRole | null
	defenders: ReadonlyArray<DefenderEligibilityUnit>
	onion: OnionEligibilityUnit | null
	targetOptionsByDefenderId: Readonly<Record<string, ReadonlyArray<ActionEligibilityTargetOption>>>
	targetOptionsByWeaponId: Readonly<Record<string, ReadonlyArray<ActionEligibilityTargetOption>>>
}>

export type CombatActionEligibility = Readonly<{
	eligibility: CombatEligibility
	targetIds: ReadonlyArray<string>
	targetHexKeys: ReadonlyArray<string>
}>

export type BattlefieldActionEligibility = Readonly<{
	movementByUnitId: Readonly<Record<string, MovementEligibility>>
	defenderCombatByUnitId: Readonly<Record<string, CombatActionEligibility>>
	onionCombatByWeaponId: Readonly<Record<string, CombatActionEligibility>>
}>

function projectAvailableTargets(targetOptions: ReadonlyArray<ActionEligibilityTargetOption>): Pick<CombatActionEligibility, 'targetIds' | 'targetHexKeys'> {
	const availableTargets = targetOptions.filter((target) => target.isUnavailable !== true)

	return {
		targetIds: [...new Set(availableTargets.map((target) => target.id))],
		targetHexKeys: [...new Set(availableTargets.map((target) => `${target.q},${target.r}`))],
	}
}

function projectCombatEligibility(
	eligibility: CombatEligibility,
	targetOptions: ReadonlyArray<ActionEligibilityTargetOption>,
): CombatActionEligibility {
	return {
		eligibility,
		...projectAvailableTargets(targetOptions),
	}
}

export function buildBattlefieldActionEligibility({
	phase,
	viewerRole,
	defenders,
	onion,
	targetOptionsByDefenderId,
	targetOptionsByWeaponId,
}: BattlefieldActionEligibilityInput): BattlefieldActionEligibility {
	const units = onion === null ? defenders : [...defenders, onion]
	const movementByUnitId = Object.fromEntries(
		units.map((unit) => [
			unit.unitId,
			evaluateMovementEligibility({ unit, phase, viewerRole }),
		]),
	)
	const defenderCombatByUnitId = Object.fromEntries(
		defenders.map((unit) => {
			const targetOptions = targetOptionsByDefenderId[unit.unitId] ?? []
			return [
				unit.unitId,
				projectCombatEligibility(
					evaluateDefenderCombatEligibility({ unit, phase, viewerRole, targetOptions }),
					targetOptions,
				),
			]
		}),
	)
	const onionCombatByWeaponId = onion === null
		? {}
		: Object.fromEntries(onion.weapons.map((weapon) => {
			const targetOptions = targetOptionsByWeaponId[weapon.id] ?? []
			return [
				weapon.id,
				projectCombatEligibility(
					evaluateOnionWeaponCombatEligibility({ owner: onion, weapon, phase, viewerRole, targetOptions }),
					targetOptions,
				),
			]
		}))

	return {
		movementByUnitId,
		defenderCombatByUnitId,
		onionCombatByWeaponId,
	}
}