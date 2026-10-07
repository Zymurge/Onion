import type { CombatStaticRules } from './combatCalculator.js'
import { ONION_STATIC_RULES } from './staticRules.js'
import type { UnitType, UnitTypeBase, UnitTypeCatalog, WeaponType, WeaponTypeCatalog } from './types/index.js'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from './unitDefinitions.js'

export type RulesContext = {
  unitTypes: UnitTypeCatalog
  weaponTypes: WeaponTypeCatalog
  combatRules: CombatStaticRules
  getUnitDefinition(typeId: UnitType): UnitTypeBase | undefined
  getRequiredUnitDefinition(typeId: UnitType): UnitTypeBase
  getWeaponType(typeId: string): WeaponType
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue)
  }

  return Object.freeze(value)
}

export function createRulesContext(
  definitions: { unitTypes: UnitTypeCatalog; weaponTypes: WeaponTypeCatalog },
): RulesContext {
  const sourceUnitTypes = structuredClone(definitions.unitTypes)
  const unitTypes = Object.fromEntries(Object.entries(sourceUnitTypes).map(([unitTypeId, definition]) => {
    if (!unitTypeId.includes(':')) {
      return [unitTypeId, definition]
    }
    const weapons = definition.weapons.map((weapon) => ({
      ...weapon,
      typeId: `${unitTypeId}:${weapon.typeId}`,
    }))
    const weaponQuantities = Object.fromEntries(Object.entries(definition.weaponQuantities).map(([weaponTypeId, quantity]) => [
      `${unitTypeId}:${weaponTypeId}`,
      quantity,
    ]))
    return [unitTypeId, { ...definition, weapons, weaponQuantities }]
  })) as UnitTypeCatalog
  const weaponTypes = structuredClone(definitions.weaponTypes)
  const context: RulesContext = {
    unitTypes,
    weaponTypes,
    combatRules: { ...ONION_STATIC_RULES, unitTypes },
    getUnitDefinition(typeId) {
      return unitTypes[typeId]
    },
    getRequiredUnitDefinition(typeId) {
      const definition = unitTypes[typeId]
      if (definition === undefined) {
        throw new Error(`Unknown unit type: ${typeId}`)
      }
      return definition
    },
    getWeaponType(typeId) {
      const weaponType = weaponTypes[typeId]
      if (weaponType === undefined) {
        throw new Error(`Unknown weapon type: ${typeId}`)
      }
      return weaponType
    },
  }

  return deepFreeze(context)
}

export function createGlobalRulesContext(): RulesContext {
  return createRulesContext({
    unitTypes: getUnitTypeCatalog(),
    weaponTypes: getWeaponTypeCatalog(),
  })
}

export const GLOBAL_RULES_CONTEXT = createGlobalRulesContext()

export function getRulesContext(context?: RulesContext): RulesContext {
  return context ?? GLOBAL_RULES_CONTEXT
}
