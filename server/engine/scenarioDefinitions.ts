import type { Scenario } from '#server/engine/scenarioSchema'
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
  const base = globalUnitTypes[derivation.extends]
  if (base === undefined) {
    throw new Error(`Unknown base unit type: ${derivation.extends}`)
  }

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
  const resolvedUnitTypes: Record<string, UnitTypeBase> = { ...globalUnitTypes }

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

  return {
    unitTypes: resolvedUnitTypes,
    weaponTypes: { ...globalWeaponTypes },
  }
}

export function getResolvedUnitTypeId(scenarioId: string | undefined, typeId: string, unitTypes: ScenarioUnitTypes | undefined): string {
  return scenarioId !== undefined && unitTypes !== undefined && Object.hasOwn(unitTypes, typeId)
    ? namespaceUnitTypeId(scenarioId, typeId)
    : typeId
}
