import { describe, expect, it } from 'vitest'

import { resolveScenarioDefinitions } from '#server/engine/scenarioDefinitions'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'

const scenarioId = 'override-contract'

const derivedUnitTypes = {
  ScenarioPuss: {
    extends: 'Puss',
    overrides: {
      movement: 5,
      defense: 4,
      weaponQuantities: { 'Puss.main': 1 },
      weaponOverrides: { 'Puss.main': { attack: 5, range: 4 } },
    },
  },
} as const

describe('scenario-local unit definition resolution', () => {
  it('resolves a derived type into a namespaced immutable catalog entry', () => {
    const resolved = resolveScenarioDefinitions(scenarioId, derivedUnitTypes)

    expect(resolved.unitTypes['override-contract:ScenarioPuss']).toMatchObject({
      typeId: 'override-contract:ScenarioPuss',
      movement: 5,
      defense: 4,
      spriteKey: getUnitTypeCatalog().Puss.spriteKey,
      weaponQuantities: { 'Puss.main': 1 },
    })
    expect(resolved.unitTypes['override-contract:ScenarioPuss'].weapons).toHaveLength(1)
    expect(resolved.unitTypes['override-contract:ScenarioPuss'].weapons[0]).toMatchObject({
      typeId: 'Puss.main',
      attack: 5,
      range: 4,
    })
    expect(resolved.unitTypes.Puss).toEqual(getUnitTypeCatalog().Puss)
  })

  it('does not mutate the global catalog while resolving weapon overrides', () => {
    const before = getUnitTypeCatalog().Puss.weapons[0]

    const resolved = resolveScenarioDefinitions(scenarioId, derivedUnitTypes)

    expect(resolved.unitTypes['override-contract:ScenarioPuss'].weapons[0]).not.toBe(before)
    expect(getUnitTypeCatalog().Puss.weapons[0]).toEqual(before)
    expect(getUnitTypeCatalog().Puss.weapons[0]).not.toMatchObject({ attack: 5, range: 4 })
  })

  it('does not share nested resolved definition data with the global catalog', () => {
    const resolved = resolveScenarioDefinitions(scenarioId, derivedUnitTypes)
    const derived = resolved.unitTypes['override-contract:ScenarioPuss']

    expect(derived).not.toBe(getUnitTypeCatalog().Puss)
    expect(derived.abilities).not.toBe(getUnitTypeCatalog().Puss.abilities)
    expect(derived.abilities.ramProfile).not.toBe(getUnitTypeCatalog().Puss.abilities.ramProfile)
    expect(Object.isFrozen(derived.abilities.ramProfile)).toBe(true)
  })

  it('does not expose mutable global entries through a resolved catalog', () => {
    const resolved = resolveScenarioDefinitions(scenarioId, derivedUnitTypes)

    expect(resolved.unitTypes.Puss).not.toBe(getUnitTypeCatalog().Puss)
    expect(resolved.unitTypes.Puss.abilities).not.toBe(getUnitTypeCatalog().Puss.abilities)
    expect(resolved.weaponTypes['Puss.main']).not.toBe(getWeaponTypeCatalog()['Puss.main'])
    expect(Object.isFrozen(resolved)).toBe(true)
    expect(Object.isFrozen(resolved.unitTypes)).toBe(true)
    expect(Object.isFrozen(resolved.weaponTypes)).toBe(true)
    expect(Object.isFrozen(resolved.unitTypes.Puss.abilities)).toBe(true)
    expect(Object.isFrozen(resolved.weaponTypes['Puss.main'])).toBe(true)
  })

  it.each([
    ['unknown base type', { Missing: { extends: 'MissingBase', overrides: {} } }],
    ['unknown weapon quantity reference', { BadWeapon: { extends: 'Puss', overrides: { weaponQuantities: { 'Puss.missing': 1 } } } }],
    ['new weapon type through override', { AddedWeapon: { extends: 'Puss', overrides: { weaponQuantities: { 'TheOnion.missile': 1 } } } }],
    ['maxAmmo override on unlimited weapon', { InvalidAmmo: { extends: 'Puss', overrides: { weaponOverrides: { 'Puss.main': { maxAmmo: 1 } } } } }],
    ['maxAmmo override above base maximum', { ExcessAmmo: { extends: 'TheOnion', overrides: { weaponOverrides: { 'TheOnion.missile': { maxAmmo: 2 } } } } }],
  ])('rejects %s', (_label, unitTypes) => {
    expect(() => resolveScenarioDefinitions(scenarioId, unitTypes)).toThrow()
  })

  it('rejects making a non-stackable base type stackable', () => {
    expect(() => resolveScenarioDefinitions(scenarioId, {
      ScenarioPuss: {
        extends: 'Puss',
        overrides: { maxStacks: 2 },
      },
    })).toThrow()
  })
})
