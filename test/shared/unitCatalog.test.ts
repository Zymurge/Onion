import { describe, expect, it } from 'vitest'

import { buildFriendlyName, getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import type { UnitTypeId } from '#shared/types/index'

const configuredTypeId: UnitTypeId = 'configured-unit-from-external-catalog'

describe('static unit and weapon catalogs', () => {
  it('treats unit type IDs as open configuration identifiers', () => {
    expect(configuredTypeId).toBe('configured-unit-from-external-catalog')
  })

  it('contains every unit type under its typeId', () => {
    const catalog = getUnitTypeCatalog()

    expect(Object.keys(catalog).length).toBeGreaterThan(0)
    expect(Object.keys(catalog)).toEqual(expect.arrayContaining(['TheOnion', 'Puss', 'Swamp']))
    for (const [key, unitType] of Object.entries(catalog)) {
      expect(unitType.typeId).toBe(key)
      expect(unitType.role).toMatch(/^(onion|defender)$/)
      expect(unitType.weapons.length).toBeGreaterThanOrEqual(0)
    }
  })

  it('contains unique weapon type IDs referenced by unit types', () => {
    const unitCatalog = getUnitTypeCatalog()
    const weaponCatalog = getWeaponTypeCatalog()

    expect(Object.keys(weaponCatalog).length).toBeGreaterThan(0)
    for (const unitType of Object.values(unitCatalog)) {
      for (const weaponType of unitType.weapons) {
        expect(weaponType.typeId).toBeTruthy()
        expect(weaponCatalog[weaponType.typeId]).toEqual(weaponType)
      }
    }

    expect(new Set(Object.keys(weaponCatalog)).size).toBe(Object.keys(weaponCatalog).length)
  })

  it('keeps static catalog entries free of runtime instance state', () => {
    const catalog = getUnitTypeCatalog()
    const weapons = getWeaponTypeCatalog()

    expect(catalog.TheOnion).not.toHaveProperty('type')
    expect(catalog.TheOnion).not.toHaveProperty('id')
    expect(catalog.TheOnion).not.toHaveProperty('weaponTypeIds')
    expect(weapons[Object.keys(weapons)[0]]).not.toHaveProperty('state')
    expect(weapons[Object.keys(weapons)[0]]).not.toHaveProperty('status')
  })

  it('generates deterministic friendly names from static templates', () => {
    const unitCatalog = getUnitTypeCatalog()
    const weaponCatalog = getWeaponTypeCatalog()

    const unitTemplate = unitCatalog.TheOnion.friendlyNameTemplate
    const weaponTemplate = weaponCatalog['TheOnion.secondary_1'].friendlyNameTemplate

    expect(buildFriendlyName(unitTemplate ?? '', 'onion-1')).toBe('The Onion 1')
    expect(buildFriendlyName(unitTemplate ?? '', 'onion-1')).toBe(buildFriendlyName(unitTemplate ?? '', 'onion-1'))
    expect(buildFriendlyName(weaponTemplate ?? '', 'secondary_1')).toBe('Secondary Battery 1')
  })
})