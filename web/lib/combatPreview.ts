import type { TerrainType } from '../../shared/engineTypes.js'
import {
	createCombatCalculator,
	type CombatCalculatorInput,
	} from '../../shared/combatCalculator.js'
import { ONION_STATIC_RULES } from '../../shared/staticRules.js'
import {
	isTargetAllowedByRules,
	resolveUnitTargetRules,
	resolveWeaponTargetRules,
	} from '../../shared/targetRules.js'

import type { BattlefieldOnionView, BattlefieldUnit, TerrainHex, UnitStatus } from './battlefieldView'
import type { Weapon } from '../../shared/types/index'
import { getDisplayDefense, getTerrainValueAt, isWeaponSelectionId, resolveBattlefieldUnitName, resolveBattlefieldWeaponName, resolveSelectionOwnerUnitId, stripWeaponSelectionId } from './appViewHelpers'

type CombatRole = 'onion' | 'defender'

export type CombatTargetOption = {
	id: string
	kind: CombatRole
	q: number
	r: number
	status: UnitStatus
	label: string
	detail: string
	defense: number
	modifiers: string[]
	isDisabled?: boolean
	disabledTitle?: string
}

type CombatPreviewInput = {
	activeCombatRole: CombatRole | null
	combatRangeHexKeys: ReadonlySet<string>
	displayedDefenders: ReadonlyArray<BattlefieldUnit>
	displayedOnion: BattlefieldOnionView | null
	selectedUnitIds: ReadonlyArray<string>
	selectedAttackStrength: number
	selectedAttackGroupCount: number
	displayedScenarioMap: { width: number; height: number; cells?: Array<{ q: number; r: number }>; hexes: TerrainHex[] } | null
}

const combatRules = ONION_STATIC_RULES

const combatCalculator = createCombatCalculator(combatRules)

function terrainTypeFromHex(value: number | undefined): TerrainType {
	if (value === 1) {
		return 'ridgeline'
	}

	if (value === 2) {
		return 'crater'
	}

	return 'clear'
}

function terrainTypeAt(scenarioMap: CombatPreviewInput['displayedScenarioMap'], q: number, r: number): TerrainType {
	return terrainTypeFromHex(scenarioMap?.hexes.find((hex) => hex.q === q && hex.r === r)?.t)
}

function getSelectedAttackerIds(activeCombatRole: CombatRole, selectedUnitIds: ReadonlyArray<string>): ReadonlyArray<string> {
	if (activeCombatRole === 'onion') {
		return selectedUnitIds.filter(isWeaponSelectionId).map(stripWeaponSelectionId)
	}

	return [...selectedUnitIds]
}

function getWeaponDetails(displayedOnion: BattlefieldOnionView): ReadonlyArray<Weapon> {
	return displayedOnion.weaponDetails ?? []
}

function getSelectedWeapons(displayedOnion: BattlefieldOnionView, selectedAttackerIds: ReadonlyArray<string>): ReadonlyArray<Weapon> {
	const selectedWeaponIds = new Set(selectedAttackerIds)
	return getWeaponDetails(displayedOnion).filter((weapon) => selectedWeaponIds.has(weapon.id))
}

function buildCombatCalculatorInputForDefenderTarget(
	selectedAttackerIds: ReadonlyArray<string>,
	displayedOnion: BattlefieldOnionView,
	target: BattlefieldUnit,
	displayedScenarioMap: CombatPreviewInput['displayedScenarioMap'],
): CombatCalculatorInput {
	const units: CombatCalculatorInput['combatState']['units'] = {}

	for (const attackerId of selectedAttackerIds) {
		units[attackerId] = {
			type: 'TheOnion',
			weaponIds: [attackerId],
			weapons: getWeaponDetails(displayedOnion),
		}
	}

	units[target.id] = {
		type: target.type,
		squads: target.squads,
		terrainType: terrainTypeAt(displayedScenarioMap, target.q, target.r),
	}

	return {
		attackerGroupIds: [...selectedAttackerIds],
		targetId: target.id,
		combatState: { units },
	}
}

function buildCombatCalculatorInputForWeaponTarget(
	selectedAttackerIds: ReadonlyArray<string>,
	displayedDefenders: ReadonlyArray<BattlefieldUnit>,
	displayedOnion: BattlefieldOnionView,
	weapon: Weapon,
	displayedScenarioMap: CombatPreviewInput['displayedScenarioMap'],
): CombatCalculatorInput {
	const units: CombatCalculatorInput['combatState']['units'] = {}

	for (const attackerId of selectedAttackerIds) {
		const attacker = displayedDefenders.find((unit) => unit.id === resolveSelectionOwnerUnitId(attackerId))
		if (attacker !== undefined) {
			units[attackerId] = { type: attacker.type }
		}
	}

	units[displayedOnion.id] = {
		type: 'TheOnion',
		weaponId: weapon.id,
		weapons: getWeaponDetails(displayedOnion),
		terrainType: terrainTypeAt(displayedScenarioMap, displayedOnion.q, displayedOnion.r),
	}

	return {
		attackerGroupIds: [...selectedAttackerIds],
		targetId: displayedOnion.id,
		combatState: { units },
	}
}

function buildTargetModifiers(modifiers: ReadonlyArray<{ label: string }>, extraLabels: ReadonlyArray<string>): string[] {
	return [...extraLabels, ...modifiers.map((modifier) => modifier.label)]
}

export function buildCombatTargetOptions({
	activeCombatRole,
	combatRangeHexKeys,
	displayedDefenders,
	displayedOnion,
	selectedUnitIds,
	selectedAttackStrength,
	selectedAttackGroupCount,
	displayedScenarioMap,
}: CombatPreviewInput): CombatTargetOption[] {
	if (activeCombatRole === null) {
		return []
	}

	const selectedAttackerIds = getSelectedAttackerIds(activeCombatRole, selectedUnitIds)

	if (selectedAttackerIds.length === 0) {
		return []
	}

	if (activeCombatRole === 'onion') {
		const selectedWeapons = getSelectedWeapons(displayedOnion!, selectedAttackerIds)
		return displayedDefenders
			.filter((unit) => unit.status !== 'destroyed')
			.filter((unit) => combatRangeHexKeys.has(`${unit.q},${unit.r}`))
			.filter((unit) =>
				selectedWeapons.every((weapon) =>
					isTargetAllowedByRules(
						{
							unitType: 'TheOnion',
							weaponId: weapon.id,
							targetRules: resolveWeaponTargetRules(combatRules.unitDefinitions.TheOnion, weapon.id, weapon.targetRules),
						},
						{
							unitType: unit.type,
							targetRules: resolveUnitTargetRules(combatRules.unitDefinitions[unit.type], unit.targetRules),
						},
					),
				),
			)
			.map((unit) => {
				const result = combatCalculator.calculateResult(
					buildCombatCalculatorInputForDefenderTarget(selectedAttackerIds, displayedOnion!, unit, displayedScenarioMap),
				)
				const terrainType = getTerrainValueAt(displayedScenarioMap, unit.q, unit.r)
				const defense = getDisplayDefense(unit.type, unit.squads, terrainType)

				return {
					id: unit.id,
					kind: 'defender' as const,
					q: unit.q,
					r: unit.r,
					status: unit.status,
					label: resolveBattlefieldUnitName(unit.type, unit.id, unit.friendlyName),
					defense,
					modifiers: buildTargetModifiers(
						result.modifiers,
						selectedAttackerIds.length > 1 ? [`Attackers: ${selectedAttackerIds.length}`] : [],
					),
					detail: `Defense: ${defense}`,
				}
			})
	}

	if (displayedOnion === null || !combatRangeHexKeys.has(`${displayedOnion.q},${displayedOnion.r}`)) {
		return []
	}

	const readyWeaponTargets = getWeaponDetails(displayedOnion)
		.filter((weapon) => weapon.individuallyTargetable && weapon.status === 'ready')
		.map((weapon) => {
			const result = combatCalculator.calculateResult(
				buildCombatCalculatorInputForWeaponTarget(selectedAttackerIds, displayedDefenders, displayedOnion, weapon, displayedScenarioMap),
			)

			return {
				id: `weapon:${weapon.id}`,
				kind: 'onion' as const,
				q: displayedOnion.q,
				r: displayedOnion.r,
				status: weapon.status as UnitStatus,
				label: resolveBattlefieldWeaponName(weapon),
				defense: weapon.defense,
				modifiers: buildTargetModifiers(result.modifiers, [
					...(selectedAttackerIds.length > 1 ? [`Attackers: ${selectedAttackerIds.length}`] : []),
					`Subsystem target: ${resolveBattlefieldWeaponName(weapon)}`,
				]),
				detail: `Defense: ${weapon.defense}`,
			}
		})

	return [
		{
			id: `${displayedOnion.id}:treads`,
			kind: 'onion' as const,
			q: displayedOnion.q,
			r: displayedOnion.r,
			status: displayedOnion.status as UnitStatus,
			label: 'Treads',
			defense: selectedAttackStrength,
			modifiers: selectedAttackerIds.length > 1 ? [`Attackers: ${selectedAttackerIds.length}`] : [],
			detail: `Treads: ${displayedOnion.treads}`,
			isDisabled: activeCombatRole === 'defender' && selectedAttackGroupCount > 1,
			disabledTitle:
				activeCombatRole === 'defender' && selectedAttackGroupCount > 1
					? 'Select attackers from one defender stack to target treads.'
					: undefined,
		},
		...readyWeaponTargets,
	]
}