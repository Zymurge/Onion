import {
	createCombatCalculator,
	type CombatExchangeInput,
	} from '../../shared/combatCalculator.js'
import { ONION_STATIC_RULES } from '../../shared/staticRules.js'
import {
	isTargetAllowedByRules,
	} from '../../shared/targetRules.js'

import { getBattlefieldPosition, type BattlefieldOnionView, type BattlefieldUnit, type TerrainHex, type UnitStatus } from './battlefieldView'
import type { Weapon } from '../../shared/types/index'
import { resolveBattlefieldFriendlyName } from './battlefieldNaming'
import { resolveBattlefieldWeaponName } from './weaponStats'
import { getDisplayDefense, getTerrainValueAt } from './battlefieldViewBuilders'
import { isWeaponSelectionId, resolveSelectionOwnerUnitId, stripWeaponSelectionId } from './selectionIds'
import { formatCombatTargetId } from '../../shared/combatTarget'
import { buildStackRosterIndex } from '../../shared/stackRoster'
import type { StackRosterState, TerrainType } from '../../shared/types/index'
import type { StackNamingSnapshot } from '../../shared/stackNaming'
import { getSessionUnitType, getSessionWeaponDefense, getSessionWeaponType, isSessionUnitTypeStackable, type SessionCatalog } from './sessionCatalog'

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
	modifiers: ReadonlyArray<string>
	isDisabled?: boolean
	disabledTitle?: string
}

type CombatPreviewInput = {
	activeCombatRole: CombatRole | null
	combatRangeHexKeys: ReadonlySet<string>
	displayedDefenders: ReadonlyArray<BattlefieldUnit>
	displayedOnion: BattlefieldOnionView | null
	stackRoster?: StackRosterState | null
	stackNaming?: StackNamingSnapshot | null
	selectedUnitIds: ReadonlyArray<string>
	selectedAttackStrength: number
	selectedAttackGroupCount: number
	displayedScenarioMap: { width: number; height: number; cells?: ReadonlyArray<{ q: number; r: number }>; hexes: ReadonlyArray<TerrainHex> } | null
	catalog?: SessionCatalog
}

const combatRules = ONION_STATIC_RULES

const combatCalculator = createCombatCalculator(combatRules)
function isStackableUnitType(unitType: string, catalog?: SessionCatalog): boolean {
	return catalog !== undefined && isSessionUnitTypeStackable(catalog, unitType)
}

function getStackedDefenderKeys(displayedDefenders: ReadonlyArray<BattlefieldUnit>, catalog?: SessionCatalog): Set<string> {
	const stackedCountsByPosition = new Map<string, number>()
	const stackedKeys = new Set<string>()

	for (const unit of displayedDefenders) {
		if (!isStackableUnitType(unit.typeId, catalog)) {
			continue
		}

		const position = getBattlefieldPosition(unit)
		const key = `${unit.typeId}:${position.q},${position.r}`
		if ((unit.stackSize ?? 1) > 1) {
			stackedKeys.add(key)
			continue
		}

		const nextCount = (stackedCountsByPosition.get(key) ?? 0) + 1
		stackedCountsByPosition.set(key, nextCount)
		if (nextCount > 1) {
			stackedKeys.add(key)
		}
	}

	return stackedKeys
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

function getSelectedWeapons(displayedOnion: BattlefieldOnionView, selectedAttackerIds: ReadonlyArray<string>): ReadonlyArray<Weapon> {
	const selectedWeaponIds = new Set(selectedAttackerIds)
	return displayedOnion.weapons.filter((weapon) => selectedWeaponIds.has(weapon.id))
}

function buildCombatCalculatorInputForDefenderTarget(
	selectedAttackerIds: ReadonlyArray<string>,
	displayedOnion: BattlefieldOnionView,
	target: BattlefieldUnit,
	stackSize: number,
	displayedScenarioMap: CombatPreviewInput['displayedScenarioMap'],
): CombatExchangeInput {
	const attackers: CombatExchangeInput['attackers'] = selectedAttackerIds.map((attackerId) => {
		const weapon = displayedOnion.weapons.find((candidate) => candidate.id === attackerId)
		if (weapon === undefined) {
			throw new Error(`Selected Onion weapon '${attackerId}' was not found`)
		}

		return { id: attackerId, typeId: displayedOnion.typeId, weaponTypeIds: [weapon.typeId] }
	})

	return {
		attackers,
		target: stackSize > 1
			? {
					kind: 'stack',
					id: target.unitId,
					typeId: target.typeId,
					size: stackSize,
					terrainType: terrainTypeAt(displayedScenarioMap, target.position.q, target.position.r),
				}
			: {
					kind: 'unit',
					id: target.unitId,
					typeId: target.typeId,
					terrainType: terrainTypeAt(displayedScenarioMap, target.position.q, target.position.r),
				},
	}
}

function buildCombatCalculatorInputForWeaponTarget(
	selectedAttackerIds: ReadonlyArray<string>,
	displayedDefenders: ReadonlyArray<BattlefieldUnit>,
	displayedOnion: BattlefieldOnionView,
	weapon: Weapon,
): CombatExchangeInput {
	const attackers: CombatExchangeInput['attackers'] = []

	for (const attackerId of selectedAttackerIds) {
		const attacker = displayedDefenders.find((unit) => unit.unitId === resolveSelectionOwnerUnitId(attackerId))
		if (attacker !== undefined) {
			const readyWeapons = attacker.weapons.filter((candidate) => candidate.state === 'ready')
			attackers.push({
				id: attackerId,
				typeId: attacker.typeId,
				weaponTypeIds: readyWeapons.length > 0
					? readyWeapons.map((weapon) => weapon.typeId)
					: attacker.weapons.map((weapon) => weapon.typeId),
			})
		}
	}

	return {
		attackers,
		target: {
			kind: 'onion-weapon',
			id: displayedOnion.unitId,
			typeId: displayedOnion.typeId,
			weaponTypeId: weapon.typeId,
		},
	}
}

function buildTargetModifiers(modifiers: ReadonlyArray<{ label: string }>, extraLabels: ReadonlyArray<string>): string[] {
	return [...extraLabels, ...modifiers.map((modifier) => modifier.label)]
}

function resolveGroupedDefenderStackSize(groupUnitIds: ReadonlyArray<string>, displayedDefenders: ReadonlyArray<BattlefieldUnit>): number {
	return groupUnitIds.filter((groupUnitId) => displayedDefenders.some((unit) => unit.unitId === groupUnitId)).length
}

export function buildCombatTargetOptions({
	activeCombatRole,
	combatRangeHexKeys,
	displayedDefenders,
	displayedOnion,
	stackRoster,
	stackNaming,
	selectedUnitIds,
	selectedAttackStrength,
	selectedAttackGroupCount,
	displayedScenarioMap,
	catalog,
}: CombatPreviewInput): CombatTargetOption[] {
	if (activeCombatRole === null) {
		return []
	}

	const selectedAttackerIds = getSelectedAttackerIds(activeCombatRole, selectedUnitIds)
	const stackRosterIndex = stackRoster === undefined || stackRoster === null
		? null
		: buildStackRosterIndex(
			stackRoster,
			Object.fromEntries(
				displayedDefenders.map((unit) => [unit.unitId, {
					role: unit.role,
					unitId: unit.unitId,
					typeId: unit.typeId,
					position: getBattlefieldPosition(unit),
					state: unit.state,
					weapons: unit.weapons,
					friendlyName: unit.friendlyName,
				}]),
			),
		)
	const stackedDefenderKeys = getStackedDefenderKeys(displayedDefenders, catalog)

	if (stackRosterIndex === null && stackedDefenderKeys.size > 0) {
		throw new Error('Missing stackRoster for grouped defenders')
	}

	if (selectedAttackerIds.length === 0) {
		return []
	}

	if (activeCombatRole === 'onion') {
		const selectedWeapons = getSelectedWeapons(displayedOnion!, selectedAttackerIds)
		const validDefenders = displayedDefenders
			.filter((unit) => unit.state !== 'destroyed')
			.filter((unit) => combatRangeHexKeys.has(`${getBattlefieldPosition(unit).q},${getBattlefieldPosition(unit).r}`))
			.filter((unit) =>
				selectedWeapons.every((weapon) =>
					isTargetAllowedByRules(
						{
							unitType: 'TheOnion',
							weaponId: weapon.id,
							targetRules: catalog === undefined ? undefined : getSessionWeaponType(catalog, weapon.typeId).targetRules,
						},
						{
							unitType: unit.typeId,
							targetRules: catalog === undefined ? undefined : getSessionUnitType(catalog, unit.typeId)?.targetRules,
						},
					),
				),
			)

		const groupedTargets = new Map<string, BattlefieldUnit>()
		for (const unit of validDefenders) {
			const rosterGroup = stackRosterIndex?.getUnitGroup(unit.unitId) ?? null
			const unitPosition = getBattlefieldPosition(unit)
			if (rosterGroup === null && stackedDefenderKeys.has(`${unit.typeId}:${unitPosition.q},${unitPosition.r}`)) {
				throw new Error(`Missing stackRoster entry for grouped unit ${unit.unitId}`)
			}
			const groupId = rosterGroup !== null && rosterGroup.unitIds.length > 1 ? rosterGroup.groupId : unit.unitId
			if (!groupedTargets.has(groupId)) {
				groupedTargets.set(groupId, unit)
			}
		}

		return [...groupedTargets.values()].map((unit) => {
			const rosterGroup = stackRosterIndex?.getUnitGroup(unit.unitId) ?? null
			const stackSize = rosterGroup !== null && rosterGroup.unitIds.length > 1
				? resolveGroupedDefenderStackSize(rosterGroup.unitIds, validDefenders)
				: 1
			const unitPosition = getBattlefieldPosition(unit)
			const terrainType = getTerrainValueAt(displayedScenarioMap, unitPosition.q, unitPosition.r)
			const defense = getDisplayDefense(unit.typeId, stackSize, terrainType)
			const targetId = rosterGroup !== null && rosterGroup.unitIds.length > 1
				? rosterGroup.groupId
				: unit.unitId
			const result = combatCalculator.calculate(
				buildCombatCalculatorInputForDefenderTarget(selectedAttackerIds, displayedOnion!, { ...unit }, stackSize, displayedScenarioMap),
			)

			return {
				id: targetId,
				kind: 'defender' as const,
				q: unitPosition.q,
				r: unitPosition.r,
				status: unit.state,
				label: resolveBattlefieldFriendlyName({
					unitId: unit.unitId,
					typeId: unit.typeId,
					position: unitPosition,
					friendlyName: unit.friendlyName,
				}, stackNaming ?? undefined, stackRoster ?? undefined, catalog),
				defense,
				modifiers: buildTargetModifiers(
					result.modifiers,
					selectedAttackerIds.length > 1 ? [`Attackers: ${selectedAttackerIds.length}`] : [],
				),
				detail: `Defense: ${defense}`,
			}
		})
	}

	if (displayedOnion === null) {
		return []
	}
	const onionPosition = getBattlefieldPosition(displayedOnion)
	if (!combatRangeHexKeys.has(`${onionPosition.q},${onionPosition.r}`)) {
		return []
	}

	const readyWeaponTargets = displayedOnion.weapons
		.filter((weapon) => catalog !== undefined && getSessionWeaponType(catalog, weapon.typeId).individuallyTargetable && weapon.state !== 'destroyed')
		.map((weapon) => {
			const result = combatCalculator.calculate(
				buildCombatCalculatorInputForWeaponTarget(selectedAttackerIds, displayedDefenders, displayedOnion, weapon),
			)

			const defense = catalog === undefined ? 0 : getSessionWeaponDefense(catalog, weapon.typeId)

			return {
				id: `weapon:${weapon.id}`,
				kind: 'onion' as const,
				q: onionPosition.q,
				r: onionPosition.r,
				status: 'operational' as const,
				label: resolveBattlefieldWeaponName(weapon, catalog),
				defense: defense,
				modifiers: buildTargetModifiers(result.modifiers, [
					...(selectedAttackerIds.length > 1 ? [`Attackers: ${selectedAttackerIds.length}`] : []),
					`Subsystem target: ${resolveBattlefieldWeaponName(weapon, catalog)}`,
				]),
				detail: `Defense: ${defense}`,
			}
		})

	return [
		{
			id: formatCombatTargetId({ kind: 'treads', onionId: displayedOnion.unitId }),
			kind: 'onion' as const,
			q: onionPosition.q,
			r: onionPosition.r,
			status: displayedOnion.state as UnitStatus,
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