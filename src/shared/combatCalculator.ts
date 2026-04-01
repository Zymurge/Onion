import type { TerrainType } from '../engine/map.js'
import type { UnitDefinition, Weapon } from '../engine/units.js'

/**
 * Shared combat rules contract.
 *
 * The calculator is instantiated from an immutable static rules bundle so it
 * has local access to the single source of truth for base combat values and
 * terrain rules. Call sites pass in attacker group ids, a target id, and the
 * caller-owned live combat state needed to resolve those ids.
 *
 * The static bundle is responsible for:
 * - base unit values from the unit definition source
 * - base weapon values from the unit definition source
 * - terrain combat rules, including known defense modifiers
 * - any other documented rules that must stay aligned between engine and UI
 *
 * The calculator instance is responsible for:
 * - resolving attacker-group attack values from static unit data
 * - resolving target defense values from static unit data
 * - applying documented terrain and stacking modifiers
 * - calculating the CRT odds band from effective strengths
 * - exposing the normalized modifier list used by both BE and UI
 *
 * Out of scope for this module:
 * - loading game state or scenario data
 * - mutating units or combat targets
 * - rendering UI
 * - persisting results
 */

export type CombatModifierKind = 'terrain' | 'stacking' | 'special' | 'combined-fire' | 'target-specific'

export type CombatModifierScope = 'attack' | 'defense'

export type CombatModifier = {
	kind: CombatModifierKind
	scope: CombatModifierScope
	label: string
	value: number
	appliesTo?: string
}

/**
 * Caller-owned live combat state.
 *
 * The calculator does not own live game-state loading. The caller supplies the
 * current combat snapshot or equivalent state object needed to resolve the
 * provided attacker group ids and target id.
 */
export type CombatCombatantState = {
	type: string
	squads?: number
	terrainType?: TerrainType
	weapons?: ReadonlyArray<Weapon>
	weaponIds?: ReadonlyArray<string>
	weaponId?: string
}

export type CombatLiveState = {
	units: Record<string, CombatCombatantState>
}

/**
 * Minimal terrain rule record held by the static rules source.
 */
export type CombatTerrainRule = {
	terrainType: TerrainType
	defenseBonus?: number
	appliesToTypes?: ReadonlyArray<string>
	[key: string]: unknown
}

/**
 * Immutable static combat data passed into the calculator factory.
 */
export type CombatStaticRules = {
	unitDefinitions: Readonly<Record<string, UnitDefinition>>
	terrainRules: Readonly<Record<TerrainType, CombatTerrainRule>>
}

/**
 * Live combat inputs supplied per calculation.
 */
export type CombatCalculatorInput = {
	attackerGroupIds: ReadonlyArray<string>
	targetId: string
	combatState: CombatLiveState
	modifiers?: ReadonlyArray<CombatModifier>
}

export type CombatCalculatorResult = {
	attackStrength: number
	defenseStrength: number
	odds: string
	modifiers: ReadonlyArray<CombatModifier>
}

export type CombatCalculator = {
	calculateOdds(input: CombatCalculatorInput): string
	calculateModifiers(input: CombatCalculatorInput): ReadonlyArray<CombatModifier>
	calculateResult(input: CombatCalculatorInput): CombatCalculatorResult
}

function getUnitDefinitionByType(staticRules: CombatStaticRules, type: string): UnitDefinition {
	const definition = Object.values(staticRules.unitDefinitions).find((candidate) => candidate.type === type)
	if (definition === undefined) {
		throw new Error(`Unit type '${type}' is not defined in the shared combat rules`)
	}

	return definition
}

function getCombatant(staticRules: CombatStaticRules, liveState: CombatLiveState, combatantId: string): CombatCombatantState {
	const combatant = liveState.units[combatantId]
	if (combatant === undefined) {
		throw new Error(`Combatant '${combatantId}' was not found in the live combat state`)
	}

	getUnitDefinitionByType(staticRules, combatant.type)
	return combatant
}

function getWeaponAttack(definition: UnitDefinition, combatant: CombatCombatantState | undefined, weaponId: string): number {
	const liveWeapon = combatant?.weapons?.find((candidate) => candidate.id === weaponId)
	if (liveWeapon !== undefined) {
		return liveWeapon.attack
	}

	const weapon = definition.weapons.find((candidate) => candidate.id === weaponId)
	if (weapon === undefined) {
		throw new Error(`Weapon '${weaponId}' was not found on unit type '${definition.type}'`)
	}

	return weapon.attack
}

function getBaseAttack(definition: UnitDefinition, combatant: CombatCombatantState, weaponIds?: ReadonlyArray<string>): number {
	if (weaponIds !== undefined && weaponIds.length > 0) {
		return weaponIds.reduce((total, weaponId) => total + getWeaponAttack(definition, combatant, weaponId), 0)
	}

	if (combatant.weapons !== undefined) {
		return combatant.weapons
			.filter((weapon) => weapon.status === 'ready')
			.reduce((total, weapon) => total + weapon.attack, 0)
	}

	return definition.weapons
		.filter((weapon) => weapon.status === 'ready')
		.reduce((total, weapon) => total + weapon.attack, 0)
}

function getTerrainRule(staticRules: CombatStaticRules, terrainType: TerrainType | undefined): CombatTerrainRule | undefined {
	if (terrainType === undefined) {
		return undefined
	}

	return staticRules.terrainRules[terrainType]
}

function canUseTerrainCover(definition: UnitDefinition, terrainType: TerrainType): boolean {
	return definition.abilities.terrainRules?.[terrainType]?.canAccessCover === true
}

function getTerrainDefenseBonus(staticRules: CombatStaticRules, combatant: CombatCombatantState): number {
	if (combatant.terrainType === undefined) {
		return 0
	}

	if (combatant.terrainType !== 'ridgeline') {
		return 0
	}

	const definition = getUnitDefinitionByType(staticRules, combatant.type)
	if (!canUseTerrainCover(definition, combatant.terrainType)) {
		return 0
	}

	const terrainRule = getTerrainRule(staticRules, combatant.terrainType)
	if (terrainRule === undefined || terrainRule.defenseBonus === undefined) {
		return 0
	}

	if (terrainRule.appliesToTypes !== undefined && !terrainRule.appliesToTypes.includes(combatant.type)) {
		return 0
	}

	return terrainRule.defenseBonus
}

function resolveAttackStrength(staticRules: CombatStaticRules, liveState: CombatLiveState, attackerGroupIds: ReadonlyArray<string>): number {
	return attackerGroupIds.reduce((total, attackerId) => {
		const attacker = getCombatant(staticRules, liveState, attackerId)
		const definition = getUnitDefinitionByType(staticRules, attacker.type)
		return total + getBaseAttack(definition, attacker, attacker.weaponIds)
	}, 0)
}

function resolveDefenseStrength(staticRules: CombatStaticRules, liveState: CombatLiveState, targetId: string): number {
	const target = getCombatant(staticRules, liveState, targetId)
	const definition = getUnitDefinitionByType(staticRules, target.type)

	if (definition.type === 'TheOnion') {
		const weaponId = target.weaponId ?? 'main'
		const weapon = target.weapons?.find((candidate) => candidate.id === weaponId) ?? definition.weapons.find((candidate) => candidate.id === weaponId)
		if (weapon === undefined) {
			throw new Error(`Unknown target weapon '${weaponId}' for unit type '${definition.type}'`)
		}

		return weapon.defense
	}

	if (definition.type === 'LittlePigs') {
		const squads = target.squads ?? 1
		return definition.defense * squads + getTerrainDefenseBonus(staticRules, target)
	}

	return definition.defense + getTerrainDefenseBonus(staticRules, target)
}

function resolveModifiers(staticRules: CombatStaticRules, liveState: CombatLiveState, targetId: string): ReadonlyArray<CombatModifier> {
	const target = getCombatant(staticRules, liveState, targetId)
	const definition = getUnitDefinitionByType(staticRules, target.type)
	if (target.terrainType === undefined || !canUseTerrainCover(definition, target.terrainType)) {
		return []
	}
	if (target.terrainType !== 'ridgeline') {
		return []
	}

	const terrainRule = getTerrainRule(staticRules, target.terrainType)
	if (terrainRule === undefined || terrainRule.defenseBonus === undefined) {
		return []
	}

	if (terrainRule.appliesToTypes !== undefined && !terrainRule.appliesToTypes.includes(target.type)) {
		return []
	}

	return [
		{
			kind: 'terrain',
			scope: 'defense',
			label: 'Ridgeline cover: +1 defense',
			value: terrainRule.defenseBonus,
			appliesTo: targetId,
		},
	]
}

function calculateResultFromRules(staticRules: CombatStaticRules, input: CombatCalculatorInput): CombatCalculatorResult {
	const attackStrength = resolveAttackStrength(staticRules, input.combatState, input.attackerGroupIds)
	const defenseStrength = resolveDefenseStrength(staticRules, input.combatState, input.targetId)
	const modifiers = resolveModifiers(staticRules, input.combatState, input.targetId)

	return {
		attackStrength,
		defenseStrength,
		odds: calculateOdds(attackStrength, defenseStrength),
		modifiers: [...modifiers, ...(input.modifiers ?? [])],
	}
}

/**
 * Calculate the CRT odds band for a combat exchange.
 */
export function calculateOdds(attackStrength: number, defenseStrength: number): string {
	if (defenseStrength <= 0) {
		return '5:1'
	}

	const ratio = attackStrength / defenseStrength

	if (ratio >= 5) return '5:1'
	if (ratio >= 4) return '4:1'
	if (ratio >= 3) return '3:1'
	if (ratio >= 2) return '2:1'
	if (ratio >= 1) return '1:1'
	if (ratio >= 0.5) return '1:2'
	return '1:3'
}

export function createCombatCalculator(staticRules: CombatStaticRules): CombatCalculator {
	return {
		calculateOdds(input) {
			return calculateResultFromRules(staticRules, input).odds
		},
		calculateModifiers(input) {
			return calculateResultFromRules(staticRules, input).modifiers
		},
		calculateResult(input) {
			return calculateResultFromRules(staticRules, input)
		},
	}
}
