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

    for (const unitType of Object.values(catalog)) {
      for (const field of [
        'role',
        'side',
        'unitId',
        'id',
        'type',
        'position',
        'state',
        'status',
        'movementSpent',
        'ammo',
        'ramsRemaining',
      ]) {
        expect(unitType).not.toHaveProperty(field)
      }
    }

    for (const weaponType of Object.values(weapons)) {
      for (const field of ['id', 'unitId', 'state', 'status', 'ammo']) {
        expect(weaponType).not.toHaveProperty(field)
      }
    }
  })

  it('retains intrinsic capability data while static role metadata is removed', () => {
    const catalog = getUnitTypeCatalog()

    expect(catalog.TheOnion).toMatchObject({
      movement: 3,
      defense: 0,
      abilities: expect.objectContaining({ canRam: true, ramCapacity: 2 }),
      treads: 45,
      treadsPerMove: 15,
      ramsPerTurn: 2,
    })
    expect(catalog.LittlePigs).toMatchObject({
      movement: 1,
      defense: 1,
      stackable: true,
      abilities: expect.objectContaining({ maxStacks: 5 }),
    })
    expect(catalog.Swamp).toMatchObject({
      movement: 0,
      defense: 0,
      stackable: false,
      abilities: expect.objectContaining({ immobile: true }),
    })
  })

  it('resolves weapon references in their authored order', () => {
    const catalog = getUnitTypeCatalog()
    const weaponCatalog = getWeaponTypeCatalog()

    expect(catalog.TheOnion.weapons.map((weapon) => weapon.typeId)).toEqual([
      'TheOnion.main',
      'TheOnion.secondary_1',
      'TheOnion.secondary_2',
      'TheOnion.secondary_3',
      'TheOnion.secondary_4',
      'TheOnion.ap_1',
      'TheOnion.ap_2',
      'TheOnion.ap_3',
      'TheOnion.ap_4',
      'TheOnion.ap_5',
      'TheOnion.ap_6',
      'TheOnion.ap_7',
      'TheOnion.ap_8',
      'TheOnion.missile_1',
      'TheOnion.missile_2',
    ])
    for (const weapon of catalog.TheOnion.weapons) {
      expect(weapon).toEqual(weaponCatalog[weapon.typeId])
    }
  })

  it.todo('CAT-006 rejects malformed required unit attributes through the pure catalog parser')
  it.todo('CAT-007 rejects unknown unit fields, including legacy role, through the pure catalog parser')
  it.todo('CAT-008 rejects dynamic aliases on unit definitions through the pure catalog parser')
  it.todo('CAT-010 rejects a missing weapon reference through the pure catalog parser')
  it.todo('CAT-012 leaves frozen catalog input unchanged during normalization')

  it('generates deterministic friendly names from static templates', () => {
    const unitCatalog = getUnitTypeCatalog()
    const weaponCatalog = getWeaponTypeCatalog()

    const unitTemplate = unitCatalog.TheOnion.friendlyNameTemplate
    const weaponTemplate = weaponCatalog['TheOnion.secondary_1'].friendlyNameTemplate

    expect(buildFriendlyName(unitTemplate ?? '', 'onion-1')).toBe('The Onion 1')
    expect(buildFriendlyName(unitTemplate ?? '', 'onion-1')).toBe(buildFriendlyName(unitTemplate ?? '', 'onion-1'))
    expect(buildFriendlyName(weaponTemplate ?? '', 'secondary_1')).toBe('Secondary Weapon 1')
  })
})