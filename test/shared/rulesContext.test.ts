import { describe, expect, it } from 'vitest'

import { createScenarioRulesContext } from '#server/engine/scenarioDefinitions'

describe('RulesContext', () => {
  it('exposes namespaced derived unit and overridden weapon definitions', () => {
    const rules = createScenarioRulesContext('rules-context-contract', {
      ScenarioPuss: {
        extends: 'Puss',
        overrides: {
          weaponOverrides: { 'Puss.main': { attack: 5, range: 4 } },
        },
      },
    })

    const unitTypeId = 'rules-context-contract:ScenarioPuss'
    const weaponTypeId = `${unitTypeId}:Puss.main`

    expect(rules.getRequiredUnitDefinition(unitTypeId).weapons[0]).toMatchObject({
      typeId: weaponTypeId,
      attack: 5,
      range: 4,
    })
    expect(rules.getWeaponType(weaponTypeId)).toMatchObject({
      typeId: weaponTypeId,
      attack: 5,
      range: 4,
    })
    expect(Object.isFrozen(rules)).toBe(true)
    expect(Object.isFrozen(rules.unitTypes)).toBe(true)
    expect(Object.isFrozen(rules.weaponTypes)).toBe(true)
    expect(Object.isFrozen(rules.getRequiredUnitDefinition(unitTypeId).abilities)).toBe(true)
  })
})
