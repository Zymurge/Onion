import { isWeaponReady } from './unitWeapons.js'
import type { TerrainType, UnitTypeBase, Weapon, WeaponType } from './types/index.js'

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

/** Identifies the rule source for a combat modifier. */
export type CombatModifierKind = 'terrain' | 'stacking' | 'special' | 'combined-fire' | 'target-specific'

/** Identifies whether a combat modifier changes attack or defense. */
export type CombatModifierScope = 'attack' | 'defense'

/** A normalized modifier surfaced to both the engine and the web preview. */
export type CombatModifier = {
	/** Rule category that produced the modifier. */
	kind: CombatModifierKind
	/** Combat strength that the modifier changes. */
	scope: CombatModifierScope
	/** Human-readable explanation of the modifier. */
	label: string
	/** Signed strength adjustment. */
	value: number
	/** Optional combatant or target id to which the modifier applies. */
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
	/** Static unit type id used to resolve unit and weapon rules. */
	typeId: string
	/** Optional display name retained for callers that build combat views. */
	friendlyName?: string
	/** Number of units represented by this combatant when it targets as a stack. */
	stackSize?: number
	/** Terrain occupied by this combatant when it is a unit or stack target. */
	terrainType?: TerrainType
	/** Live weapon instances used to derive ready attacker weapons or resolve a selected target weapon. */
	weapons?: ReadonlyArray<Weapon>
	/** Optional weapon identifiers used directly as attack weapon type ids. */
	weaponIds?: ReadonlyArray<string>
	/** Optional selected weapon instance id when targeting an Onion subsystem. */
	weaponId?: string
}

/** Live combatants indexed by the caller-owned ids used in a calculation. */
export type CombatLiveState = {
	/** Live combatants keyed by the ids used in a calculator input. */
	units: Record<string, CombatCombatantState>
}

/**
 * Minimal terrain rule record held by the static rules source.
 */
export type CombatTerrainRule = {
	/** Terrain represented by this rule. */
	terrainType: TerrainType
	/** Flat defense added to an eligible target's base defense. */
	defenseBonus?: number
	/** Multiplier applied to an eligible target's base defense. */
	defenseMultiplier?: number
	/** Optional allowlist of unit type ids that receive this terrain rule. */
	appliesToTypes?: ReadonlyArray<string>
	/** Additional terrain metadata not interpreted by the combat calculator. */
	[key: string]: unknown
}

/**
 * Immutable static combat data passed into the calculator factory.
 */
export type CombatStaticRules = {
	/** Unit and weapon definitions indexed by their catalog keys. */
	unitTypes: Readonly<Record<string, UnitTypeBase>>
	/** Combat terrain rules indexed by terrain type. */
	terrainRules: Readonly<Record<TerrainType, CombatTerrainRule>>
}

/**
 * Live combat inputs supplied per calculation.
 */
export type CombatCalculatorInput = {
	/** Attacker or weapon ids resolved from the caller-owned live state. */
	attackerGroupIds: ReadonlyArray<string>
	/** Target id resolved from the caller-owned live state. */
	targetId: string
	/** Live state used only to resolve ids and current weapon/stack data. */
	combatState: CombatLiveState
	/** Additional caller-supplied modifiers appended to calculated modifiers. */
	modifiers?: ReadonlyArray<CombatModifier>
}

/** Explicit contribution from one attacker in a combat exchange. */
export type CombatAttackerContribution = {
	/** Caller-owned attacker or firing weapon id. */
	id: string
	/** Unit type that owns the contributing weapons. */
	typeId: string
	/** Weapon type ids whose attack values are included for this contribution. */
	weaponTypeIds: ReadonlyArray<string>
}

/** Explicit target branches supported by the pure combat calculator. */
export type CombatExchangeTarget =
	| {
			/** A single defender unit target. */
			kind: 'unit'
			/** Caller-owned id used to identify the target in the exchange. */
			id: string
			/** Static unit type id used to resolve defense. */
			typeId: string
			/** Terrain occupied by the target, if terrain defense can apply. */
			terrainType?: TerrainType
		}
	| {
			/** A grouped defender target whose size contributes to defense. */
			kind: 'stack'
			/** Caller-owned id for the target stack. */
			id: string
			/** Static unit type id shared by the stack members. */
			typeId: string
			/** Number of units represented by the target stack. */
			size: number
			/** Terrain occupied by the target, if terrain defense can apply. */
			terrainType?: TerrainType
		}
	| {
			/** The Onion tread subsystem; its defense equals the attack strength. */
			kind: 'onion-treads'
			/** Caller-owned id for the targeted Onion tread subsystem. */
			id: string
			/** Static unit type id of the Onion. */
			typeId: string
		}
	| {
			/** An individually targetable Onion weapon subsystem. */
			kind: 'onion-weapon'
			/** Caller-owned id for the targeted Onion weapon. */
			id: string
			/** Static unit type id of the Onion. */
			typeId: string
			/** Static weapon type id used to resolve subsystem defense. */
			weaponTypeId: string
		}

/** Fully explicit, state-free description of one combat exchange. */
export type CombatExchangeInput = {
	/** Attacker contributions to sum for this exchange. */
	attackers: ReadonlyArray<CombatAttackerContribution>
	/** Target branch and values used to resolve defense. */
	target: CombatExchangeTarget
	/** Additional caller-supplied modifiers appended to calculated modifiers. */
	modifiers?: ReadonlyArray<CombatModifier>
}

/** Caller-owned source data normalized into one attacker contribution. */
export type CombatExchangeAttackerSource =
	| {
			/** A unit contributes each of its ready weapons. */
			kind: 'unit'
			/** Caller-owned unit instance id. */
			id: string
			/** Static unit type that owns the weapons. */
			typeId: string
			/** Live weapon instances used to select ready weapon types. */
			weapons: ReadonlyArray<Weapon>
		}
	| {
			/** A single selected weapon contributes to the exchange. */
			kind: 'weapon'
			/** Caller-owned weapon instance id. */
			id: string
			/** Static unit type that owns the selected weapon. */
			ownerTypeId: string
			/** Static type id of the selected weapon. */
			weaponTypeId: string
		}

/** Caller-owned attacker sources and explicit target for one exchange. */
export type BuildCombatExchangeInput = {
	/** Attacker contributions in the order they should appear in the exchange. */
	attackers: ReadonlyArray<CombatExchangeAttackerSource>
	/** Target branch and values to preserve in the normalized exchange. */
	target: CombatExchangeTarget
}

/**
 * Build a normalized, state-free combat exchange from caller-owned sources.
 * Unit sources contribute their ready weapons; weapon sources contribute only
 * the selected weapon. The target branch is preserved unchanged. This helper
 * does not load game state or decide action legality.
 *
 * @param input Ordered attacker sources and the explicit target.
 * @returns The normalized combat-exchange contract.
 */
export function buildCombatExchangeInput(input: BuildCombatExchangeInput): CombatExchangeInput {
	const attackers = input.attackers.map((source) => {
		if (source.kind === 'weapon') {
			return {
				id: source.id,
				typeId: source.ownerTypeId,
				weaponTypeIds: [source.weaponTypeId],
			}
		}

		return {
			id: source.id,
			typeId: source.typeId,
			weaponTypeIds: source.weapons.filter(isWeaponReady).map((weapon) => weapon.typeId),
		}
	})

	return { attackers, target: input.target }
}

/** Effective strengths, CRT odds, and modifiers calculated for an exchange. */
export type CombatCalculatorResult = {
	/** Sum of the selected weapon attack values. */
	attackStrength: number
	/** Effective target defense after target-specific and terrain rules. */
	defenseStrength: number
	/** CRT odds band derived from effective attack and defense. */
	odds: string
	/** Normalized modifiers included in the exchange. */
	modifiers: ReadonlyArray<CombatModifier>
}

/** Shared calculator API used by the server and web preview. */
export type CombatCalculator = {
	/**
	 * Calculate one exchange from an explicit attacker/target contract.
	 * @param input Explicit attacker contributions and target data.
	 * @returns Effective strengths, CRT odds, and normalized modifiers.
	 */
	calculate(input: CombatExchangeInput): CombatCalculatorResult
	/**
	 * Calculate only the CRT odds for a compatibility input.
	 * @param input Caller-owned live combat state and attacker/target ids.
	 * @returns The normalized CRT odds band.
	 */
	calculateCrtOddsBand(input: CombatCalculatorInput): string
	/**
	 * Calculate only the normalized modifiers for a compatibility input.
	 * @param input Caller-owned live combat state and attacker/target ids.
	 * @returns The modifiers applied to the exchange.
	 */
	calculateModifiers(input: CombatCalculatorInput): ReadonlyArray<CombatModifier>
	/**
	 * Calculate the complete result for a compatibility input.
	 * @param input Caller-owned live combat state and attacker/target ids.
	 * @returns Effective strengths, CRT odds, and normalized modifiers.
	 */
	calculateResult(input: CombatCalculatorInput): CombatCalculatorResult
}

function getUnitDefinitionByType(staticRules: CombatStaticRules, typeId: string): UnitTypeBase {
	const definition = Object.values(staticRules.unitTypes).find((candidate) => candidate.typeId === typeId)
	if (definition === undefined) {
		throw new Error(`Unit type '${typeId}' is not defined in the shared combat rules`)
	}

	return definition
}

function getCombatant(staticRules: CombatStaticRules, liveState: CombatLiveState, combatantId: string): CombatCombatantState {
	const combatant = liveState.units[combatantId]
	if (combatant === undefined) {
		throw new Error(`Combatant '${combatantId}' was not found in the live combat state`)
	}

	getUnitDefinitionByType(staticRules, combatant.typeId)
	return combatant
}

function findWeaponType(definition: UnitTypeBase, weaponTypeId: string): WeaponType | undefined {
	const canonicalWeaponId = weaponTypeId.replace(/[-_]\d+$/, '')
	return definition.weapons.find((candidate) => candidate.typeId === weaponTypeId
		|| candidate.typeId === canonicalWeaponId
		|| candidate.typeId.endsWith(`.${weaponTypeId}`)
		|| candidate.typeId.endsWith(`.${canonicalWeaponId}`))
}

function getTerrainRule(staticRules: CombatStaticRules, terrainType: TerrainType | undefined): CombatTerrainRule | undefined {
	if (terrainType === undefined) {
		return undefined
	}

	return staticRules.terrainRules[terrainType]
}

function canUseTerrainCover(definition: UnitTypeBase, terrainType: TerrainType): boolean {
	return definition.abilities.terrainRules?.[terrainType]?.canAccessCover === true
}

function resolveExplicitAttackStrength(
	staticRules: CombatStaticRules,
	attackers: ReadonlyArray<CombatAttackerContribution>,
): number {
	return attackers.reduce((total, attacker) => {
		const definition = getUnitDefinitionByType(staticRules, attacker.typeId)
		return total + attacker.weaponTypeIds.reduce((attack, weaponTypeId) => {
			const weapon = findWeaponType(definition, weaponTypeId)
			if (weapon === undefined) {
				throw new Error(`Weapon '${weaponTypeId}' was not found on unit type '${definition.typeId}'`)
			}

			return attack + weapon.attack
		}, 0)
	}, 0)
}

function resolveExplicitTerrainModifier(
	staticRules: CombatStaticRules,
	target: Extract<CombatExchangeTarget, { kind: 'unit' | 'stack' }>,
): CombatModifier | undefined {
	if (target.terrainType === undefined) return undefined

	const definition = getUnitDefinitionByType(staticRules, target.typeId)
	if (!canUseTerrainCover(definition, target.terrainType)) return undefined

	const terrainRule = getTerrainRule(staticRules, target.terrainType)
	if (terrainRule?.defenseBonus === undefined && terrainRule?.defenseMultiplier === undefined) return undefined
	if (terrainRule.appliesToTypes !== undefined && !terrainRule.appliesToTypes.includes(target.typeId)) return undefined
	const baseDefense = target.kind === 'stack' ? target.size * definition.defense : definition.defense
	const value = (terrainRule.defenseBonus ?? 0)
		+ baseDefense * ((terrainRule.defenseMultiplier ?? 1) - 1)

	return {
		kind: 'terrain',
		scope: 'defense',
		label: `Ridgeline cover: ${value > 0 ? '+' : ''}${value} defense`,
		value,
		appliesTo: target.id,
	}
}

function resolveExplicitDefenseStrength(
	staticRules: CombatStaticRules,
	target: CombatExchangeTarget,
	attackStrength: number,
): number {
	const definition = getUnitDefinitionByType(staticRules, target.typeId)

	switch (target.kind) {
		case 'onion-treads':
			return attackStrength
		case 'onion-weapon': {
			const weapon = findWeaponType(definition, target.weaponTypeId)
			if (weapon === undefined) {
				throw new Error(`Unknown target weapon '${target.weaponTypeId}' for unit type '${definition.typeId}'`)
			}

			return weapon.defense ?? definition.defense
		}
		case 'stack':
			return target.size * definition.defense + (resolveExplicitTerrainModifier(staticRules, target)?.value ?? 0)
		case 'unit':
			return definition.defense + (resolveExplicitTerrainModifier(staticRules, target)?.value ?? 0)
	}
}

/**
 * Calculate a combat exchange from explicit attacker contributions and a
 * discriminated target branch.
 *
 * This is the single pure calculation path used by the calculator factory.
 * It reads only static rules and the supplied input, and does not load or
 * mutate game state.
 *
 * @param staticRules Immutable unit, weapon, and terrain rules.
 * @param input Explicit attacker and target data for one exchange.
 * @returns Effective strengths, CRT odds, and normalized modifiers.
 */
export function calculateCombatExchange(
	staticRules: CombatStaticRules,
	input: CombatExchangeInput,
): CombatCalculatorResult {
	const attackStrength = resolveExplicitAttackStrength(staticRules, input.attackers)
	const terrainModifier = input.target.kind === 'unit' || input.target.kind === 'stack'
		? resolveExplicitTerrainModifier(staticRules, input.target)
		: undefined

	return {
		attackStrength,
		defenseStrength: resolveExplicitDefenseStrength(staticRules, input.target, attackStrength),
		odds: calculateCrtOddsBand(attackStrength, resolveExplicitDefenseStrength(staticRules, input.target, attackStrength)),
		modifiers: [
			...(terrainModifier === undefined ? [] : [terrainModifier]),
			...(input.modifiers ?? []),
		],
	}
}

function toExplicitInput(staticRules: CombatStaticRules, input: CombatCalculatorInput): CombatExchangeInput {
	const attackers = input.attackerGroupIds.map((attackerId) => {
		const combatant = getCombatant(staticRules, input.combatState, attackerId)
		const definition = getUnitDefinitionByType(staticRules, combatant.typeId)
		const weaponTypeIds = combatant.weaponIds
			?? combatant.weapons?.filter((weapon) => weapon.state === 'ready').map((weapon) => weapon.typeId)
			?? definition.weapons.flatMap((weapon) => Array.from({
				length: definition.weaponQuantities[weapon.typeId] ?? weapon.defaultQuantity ?? 1,
			}, () => weapon.typeId))

		return { id: attackerId, typeId: combatant.typeId, weaponTypeIds }
	})

	const target = getCombatant(staticRules, input.combatState, input.targetId)
	const definition = getUnitDefinitionByType(staticRules, target.typeId)
	let exchangeTarget: CombatExchangeTarget

	if (definition.maxTreads !== undefined) {
		if (target.weaponId === undefined) {
			exchangeTarget = { kind: 'onion-treads', id: input.targetId, typeId: target.typeId }
		} else {
			const liveWeapon = target.weapons?.find((weapon) => weapon.id === target.weaponId)
			exchangeTarget = {
				kind: 'onion-weapon',
				id: input.targetId,
				typeId: target.typeId,
				weaponTypeId: liveWeapon?.typeId ?? target.weaponId,
			}
		}
	} else if ((definition.abilities.maxStacks ?? 1) > 1) {
		if (typeof target.stackSize !== 'number') {
			throw new Error(`Stack target '${input.targetId}' of type '${definition.typeId}' is missing stackSize in the live combat state`)
		}
		exchangeTarget = {
			kind: 'stack',
			id: input.targetId,
			typeId: target.typeId,
			size: target.stackSize,
			terrainType: target.terrainType,
		}
	} else {
		exchangeTarget = {
			kind: 'unit',
			id: input.targetId,
			typeId: target.typeId,
			terrainType: target.terrainType,
		}
	}

	return { attackers, target: exchangeTarget, modifiers: input.modifiers }
}

/**
 * Run the complete pure calculation pipeline: effective attack, effective
 * defense, terrain/stack modifiers, and the resulting CRT odds band.
 */
function calculateResultFromRules(staticRules: CombatStaticRules, input: CombatCalculatorInput): CombatCalculatorResult {
	return calculateCombatExchange(staticRules, toExplicitInput(staticRules, input))
}

/**
 * Calculate the CRT odds band for a combat exchange.
 *
 * @param attackStrength Effective attack strength.
 * @param defenseStrength Effective defense strength.
 * @returns The normalized CRT odds band.
 */
export function calculateCrtOddsBand(attackStrength: number, defenseStrength: number): string {
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

/**
 * Create a calculator bound to an immutable static rules bundle.
 *
 * The compatibility methods adapt the legacy live-state input into the
 * explicit exchange contract before using the same pure calculation path as
 * {@link CombatCalculator.calculate}.
 *
 * @param staticRules Immutable unit, weapon, and terrain rules.
 * @returns A calculator implementation for server and web consumers.
 */
export function createCombatCalculator(staticRules: CombatStaticRules): CombatCalculator {
	return {
		calculate(input) {
			return calculateCombatExchange(staticRules, input)
		},
		calculateCrtOddsBand(input) {
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
