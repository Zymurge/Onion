import { createMap, type TerrainType } from '../../../src/engine/map.js'
import { getAllUnitDefinitions } from '../../../src/engine/units.js'
import {
	createCombatCalculator,
	type CombatCalculatorInput,
	type CombatStaticRules,
} from '../../../src/shared/combatCalculator.js'
import {
	isTargetAllowedByRules,
	resolveUnitTargetRules,
	resolveWeaponTargetRules,
} from '../../../src/shared/targetRules.js'

import type { BattlefieldOnionView, BattlefieldUnit, TerrainHex, UnitStatus, Weapon } from './battlefieldView'

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
}

type CombatPreviewInput = {
	activeCombatRole: CombatRole | null
	combatRangeHexKeys: ReadonlySet<string>
	displayedDefenders: ReadonlyArray<BattlefieldUnit>
	displayedOnion: BattlefieldOnionView | null
	selectedUnitIds: ReadonlyArray<string>
	selectedAttackStrength: number
	displayedScenarioMap: { width: number; height: number; hexes: TerrainHex[] } | null
}

const combatRules: CombatStaticRules = {
	unitDefinitions: getAllUnitDefinitions(),
	terrainRules: {
		clear: { terrainType: 'clear' },
		ridgeline: { terrainType: 'ridgeline', defenseBonus: 1 },
		crater: { terrainType: 'crater' },
	},
}

const combatCalculator = createCombatCalculator(combatRules)

function isWeaponSelectionId(selectionId: string) {
	return selectionId.startsWith('weapon:')
}

function stripWeaponSelectionId(selectionId: string) {
	return selectionId.replace(/^weapon:/, '')
}

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

function getStaticWeaponTargetRules(weaponId: string) {
	return combatRules.unitDefinitions.TheOnion.weapons.find((weapon) => weapon.id === weaponId)?.targetRules
}

function getStaticUnitTargetRules(unitType: string) {
	return combatRules.unitDefinitions[unitType]?.targetRules
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
		const attacker = displayedDefenders.find((unit) => unit.id === attackerId)
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
							targetRules: resolveWeaponTargetRules(combatRules.unitDefinitions.TheOnion, weapon.id, weapon.targetRules ?? getStaticWeaponTargetRules(weapon.id)),
						},
						{
							unitType: unit.type,
							targetRules: resolveUnitTargetRules(combatRules.unitDefinitions[unit.type], unit.targetRules ?? getStaticUnitTargetRules(unit.type)),
						},
					),
				),
			)
			.map((unit) => {
				const result = combatCalculator.calculateResult(
					buildCombatCalculatorInputForDefenderTarget(selectedAttackerIds, displayedOnion!, unit, displayedScenarioMap),
				)

				return {
					id: unit.id,
					kind: 'defender' as const,
					q: unit.q,
					r: unit.r,
					status: unit.status,
					label: unit.type,
					defense: result.defenseStrength,
					modifiers: buildTargetModifiers(
						result.modifiers,
						selectedAttackerIds.length > 1 ? [`Combined fire: ${selectedAttackerIds.length} attackers`] : [],
					),
					detail: `Defense: ${result.defenseStrength}`,
				}
			})
	}

	if (displayedOnion === null || !combatRangeHexKeys.has(`${displayedOnion.q},${displayedOnion.r}`)) {
		return []
	}

	const readyWeaponTargets = getWeaponDetails(displayedOnion)
		.filter((weapon) => weapon.individuallyTargetable && weapon.status === 'ready')
		.filter((weapon) =>
			isTargetAllowedByRules(
				{
					unitType: 'TheOnion',
					weaponId: weapon.id,
					targetRules: resolveWeaponTargetRules(combatRules.unitDefinitions.TheOnion, weapon.id, weapon.targetRules ?? getStaticWeaponTargetRules(weapon.id)),
				},
				{
					unitType: displayedOnion.type,
					targetRules: resolveUnitTargetRules(combatRules.unitDefinitions[displayedOnion.type], displayedOnion.targetRules ?? getStaticUnitTargetRules(displayedOnion.type)),
				},
			),
		)
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
				label: weapon.name,
				defense: weapon.defense,
				modifiers: buildTargetModifiers(result.modifiers, [
					...(selectedAttackerIds.length > 1 ? [`Combined fire: ${selectedAttackerIds.length} attackers`] : []),
					`Subsystem target: ${weapon.name}`,
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
			modifiers: selectedAttackerIds.length > 1 ? [`Combined fire: ${selectedAttackerIds.length} attackers`] : [],
			detail: `Treads: ${displayedOnion.treads}`,
		},
		...readyWeaponTargets,
	]
}