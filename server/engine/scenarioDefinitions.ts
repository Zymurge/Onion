import type { Scenario } from '#server/engine/scenarioSchema'
import { createRulesContext, deepFreeze, type RulesContext } from '#shared/rulesContext'
import type { UnitTypeBase, UnitTypeCatalog, WeaponType, WeaponTypeCatalog } from '#shared/types/index'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'

type ScenarioUnitTypes = NonNullable<Scenario['unitTypes']>
type UnitTypeOverrides = ScenarioUnitTypes[string]['overrides']

export type ResolvedScenarioDefinitions = {
  unitTypes: UnitTypeCatalog
  weaponTypes: WeaponTypeCatalog
}

function namespaceUnitTypeId(scenarioId: string, unitTypeId: string): string {
  return `${scenarioId}:${unitTypeId}`
}

function resolveDerivedUnitType(
  scenarioId: string,
  unitTypeId: string,
  derivation: ScenarioUnitTypes[string],
  globalUnitTypes: UnitTypeCatalog,
  globalWeaponTypes: WeaponTypeCatalog,
): UnitTypeBase {
  const baseDefinition = globalUnitTypes[derivation.extends]
  if (baseDefinition === undefined) {
    throw new Error(`Unknown base unit type: ${derivation.extends}`)
  }
  const base = structuredClone(baseDefinition)

  const overrides = derivation.overrides
  if (overrides.maxStacks !== undefined && base.abilities.maxStacks <= 1 && overrides.maxStacks > 1) {
    throw new Error(`Cannot make non-stackable unit type ${derivation.extends} stackable`)
  }

  const weaponQuantities = { ...base.weaponQuantities, ...(overrides.weaponQuantities ?? {}) }
  for (const weaponTypeId of Object.keys(weaponQuantities)) {
    if (!Object.hasOwn(base.weaponQuantities, weaponTypeId)) {
      throw new Error(`Derived unit type ${unitTypeId} cannot add weapon type ${weaponTypeId}`)
    }
    if (!Object.hasOwn(globalWeaponTypes, weaponTypeId)) {
      throw new Error(`Unknown weapon type: ${weaponTypeId}`)
    }
  }

  const weaponOverrides = overrides.weaponOverrides ?? {}
  for (const weaponTypeId of Object.keys(weaponOverrides)) {
    if (!Object.hasOwn(base.weaponQuantities, weaponTypeId)) {
      throw new Error(`Derived unit type ${unitTypeId} cannot override weapon type ${weaponTypeId}`)
    }

    const baseWeapon = base.weapons.find((weapon) => weapon.typeId === weaponTypeId)
    const override = weaponOverrides[weaponTypeId]
    if (override.maxAmmo !== undefined) {
      if (baseWeapon?.maxAmmo === undefined) {
        throw new Error(`Derived unit type ${unitTypeId} cannot add maxAmmo to unlimited weapon type ${weaponTypeId}`)
      }
      if (override.maxAmmo > baseWeapon.maxAmmo) {
        throw new Error(`Derived unit type ${unitTypeId} cannot increase maxAmmo for weapon type ${weaponTypeId}`)
      }
    }
  }

  const weapons = base.weapons.map((weapon) => {
    const override = weaponOverrides[weapon.typeId]
    return override === undefined ? { ...weapon } : { ...weapon, ...override }
  })
  const abilities = {
    ...base.abilities,
    ...(overrides.maxStacks === undefined ? {} : { maxStacks: overrides.maxStacks }),
  }
  const unitOverrides: Partial<UnitTypeBase> = {}
  for (const field of ['movement', 'defense', 'maxTreads', 'treadsPerMove', 'ramsPerTurn', 'squads'] as const) {
    const value = overrides[field]
    if (value !== undefined) {
      unitOverrides[field] = value
    }
  }

  return {
    ...base,
    ...unitOverrides,
    abilities,
    weapons,
    weaponQuantities,
    typeId: namespaceUnitTypeId(scenarioId, unitTypeId),
  }
}

export function resolveScenarioDefinitions(
  scenarioId: string,
  unitTypes: ScenarioUnitTypes = {},
): ResolvedScenarioDefinitions {
  const globalUnitTypes = getUnitTypeCatalog()
  const globalWeaponTypes = getWeaponTypeCatalog()
  const resolvedUnitTypes: Record<string, UnitTypeBase> = structuredClone(globalUnitTypes)

  for (const [unitTypeId, derivation] of Object.entries(unitTypes)) {
    const resolvedTypeId = namespaceUnitTypeId(scenarioId, unitTypeId)
    if (Object.hasOwn(globalUnitTypes, unitTypeId) || Object.hasOwn(resolvedUnitTypes, resolvedTypeId)) {
      throw new Error(`Scenario unit type ID collides with an existing type: ${unitTypeId}`)
    }
    resolvedUnitTypes[resolvedTypeId] = resolveDerivedUnitType(
      scenarioId,
      unitTypeId,
      derivation,
      globalUnitTypes,
      globalWeaponTypes,
    )
  }

  const resolvedWeaponTypes: Record<string, WeaponType> = structuredClone(globalWeaponTypes)
  for (const [resolvedTypeId, definition] of Object.entries(resolvedUnitTypes)) {
    if (!resolvedTypeId.startsWith(`${scenarioId}:`)) {
      continue
    }
    for (const weapon of definition.weapons) {
      const resolvedWeaponTypeId = `${resolvedTypeId}:${weapon.typeId}`
      resolvedWeaponTypes[resolvedWeaponTypeId] = { ...weapon, typeId: resolvedWeaponTypeId }
    }
  }

  return deepFreeze({
    unitTypes: resolvedUnitTypes,
    weaponTypes: resolvedWeaponTypes,
  })
}

export function createScenarioRulesContext(
  scenarioId: string,
  unitTypes: ScenarioUnitTypes = {},
): RulesContext {
  return createRulesContext(resolveScenarioDefinitions(scenarioId, unitTypes))
}

export function getResolvedUnitTypeId(scenarioId: string | undefined, typeId: string, unitTypes: ScenarioUnitTypes | undefined): string {
  return scenarioId !== undefined && unitTypes !== undefined && Object.hasOwn(unitTypes, typeId)
    ? namespaceUnitTypeId(scenarioId, typeId)
    : typeId
}
