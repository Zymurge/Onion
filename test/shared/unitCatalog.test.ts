import { describe, expect, it } from 'vitest'

import { buildFriendlyName, getUnitTypeCatalog, getWeaponTypeCatalog, parseUnitCatalog } from '#shared/unitDefinitions'
import type { UnitTypeId } from '#shared/types/index'

const configuredTypeId: UnitTypeId = 'configured-unit-from-external-catalog'

const validUnitCatalogEntry = {
  name: 'Test Unit',
  friendlyNameTemplate: 'Test Unit {{ordinal}}',
  movement: 1,
  defense: 1,
  abilities: { maxStacks: 1 },
  weaponQuantities: {},
}

function makeCatalogConfig(unitOverrides: Record<string, unknown> = {}, weaponTypes: Record<string, unknown> = {}) {
  return {
    unitTypes: { TestUnit: { ...validUnitCatalogEntry, ...unitOverrides } },
    weaponTypes,
  }
}

function omitField(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const copy = { ...record }
  delete copy[field]
  return copy
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child)
    }
  }

  return value
}

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

  it('defines a sprite key and quantity-based loadout for every global unit type', () => {
    const catalog = getUnitTypeCatalog()
    const weapons = getWeaponTypeCatalog()

    for (const unitType of Object.values(catalog)) {
      expect(unitType.spriteKey).toEqual(expect.any(String))
      expect(unitType).not.toHaveProperty('weaponTypeIds')
      expect(unitType).not.toHaveProperty('treads')
      for (const [weaponTypeId, quantity] of Object.entries(unitType.weaponQuantities)) {
        expect(weapons[weaponTypeId]).toBeDefined()
        expect(quantity).toEqual(expect.any(Number))
        expect(quantity).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('keeps default quantities on weapon types and expands the Onion loadout contract', () => {
    const catalog = getUnitTypeCatalog()
    const weapons = getWeaponTypeCatalog()

    expect(weapons['TheOnion.secondary']).toMatchObject({ defaultQuantity: 4 })
    expect(weapons['TheOnion.ap']).toMatchObject({ defaultQuantity: 8 })
    expect(weapons['TheOnion.missile']).toMatchObject({ defaultQuantity: 2 })
    expect(catalog.TheOnion.weaponQuantities).toEqual({
      'TheOnion.main': 1,
      'TheOnion.secondary': 4,
      'TheOnion.ap': 8,
      'TheOnion.missile': 2,
    })
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
      maxTreads: 45,
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
      'TheOnion.secondary',
      'TheOnion.ap',
      'TheOnion.missile',
    ])
    for (const weapon of catalog.TheOnion.weapons) {
      expect(weapon).toEqual(weaponCatalog[weapon.typeId])
    }
  })

  it.each([
    ['name', omitField(validUnitCatalogEntry, 'name')],
    ['movement', { ...validUnitCatalogEntry, movement: '1' }],
    ['defense', { ...validUnitCatalogEntry, defense: '1' }],
    ['abilities', { ...validUnitCatalogEntry, abilities: undefined }],
    ['abilities.maxStacks', { ...validUnitCatalogEntry, abilities: { maxStacks: 1.5 } }],
    ['weaponQuantities', { ...omitField(validUnitCatalogEntry, 'weaponQuantities') }],
  ])('CAT-006 rejects malformed required unit attribute %s through the pure catalog parser', (_field, unit) => {
    expect(() => parseUnitCatalog({ unitTypes: { TestUnit: unit }, weaponTypes: {} })).toThrow(/TestUnit/)
  })

  it.each([
    ['legacy role', { role: 'defender' }],
    ['arbitrary field', { misspelledField: true }],
  ])('CAT-007 rejects %s through the pure catalog parser', (_field, extraFields) => {
    expect(() => parseUnitCatalog(makeCatalogConfig(extraFields))).toThrow(/TestUnit/)
  })

  it.each(['id', 'unitId', 'type', 'state', 'status', 'position', 'movementSpent', 'side', 'ramsRemaining'])('CAT-008 rejects dynamic unit alias %s through the pure catalog parser', (field) => {
    expect(() => parseUnitCatalog(makeCatalogConfig({ [field]: field === 'position' ? { q: 0, r: 0 } : 'runtime-value' }))).toThrow(/TestUnit/)
  })

  it('CAT-010 rejects a missing weapon reference through the pure catalog parser', () => {
    expect(() => parseUnitCatalog(makeCatalogConfig({ weaponQuantities: { 'TestUnit.missing': 1 } }))).toThrow(/TestUnit.*TestUnit\.missing/)
  })

  it('CAT-012 leaves frozen catalog input unchanged during normalization', () => {
    const catalogConfig = deepFreeze(makeCatalogConfig({
      weaponQuantities: { 'TestUnit.main': 1 },
    }, {
      'TestUnit.main': {
        name: 'Main Gun',
        weaponClass: 'main',
        attack: 1,
        range: 1,
        individuallyTargetable: false,
      },
    }))
    const before = structuredClone(catalogConfig)

    expect(() => parseUnitCatalog(catalogConfig)).not.toThrow()
    expect(catalogConfig).toEqual(before)
  })

  it('generates deterministic friendly names from static templates', () => {
    const unitCatalog = getUnitTypeCatalog()
    const weaponCatalog = getWeaponTypeCatalog()

    const unitTemplate = unitCatalog.TheOnion.friendlyNameTemplate
    const weaponTemplate = weaponCatalog['TheOnion.secondary'].friendlyNameTemplate

    expect(buildFriendlyName(unitTemplate ?? '', 'onion-1')).toBe('The Onion 1')
    expect(buildFriendlyName(unitTemplate ?? '', 'onion-1')).toBe(buildFriendlyName(unitTemplate ?? '', 'onion-1'))
    expect(buildFriendlyName(weaponTemplate ?? '', 'secondary-1')).toBe('Secondary Weapon 1')
  })
})