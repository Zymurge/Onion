import { describe, expect, it } from 'vitest'

import { createScenarioRulesContext } from '#server/engine/scenarioDefinitions'
import { UNIT_CLASS_RULES } from '#shared/classRules'
import { createGlobalRulesContext } from '#shared/rulesContext'

describe('RulesContext', () => {
  it('exposes the immutable canonical class-rule bundle', () => {
    const globalRules = createGlobalRulesContext()
    const scenarioRules = createScenarioRulesContext('rules-context-class-bundle', {
      ScenarioPuss: { extends: 'Puss', overrides: {} },
    })

    expect(globalRules.classRules).toBe(UNIT_CLASS_RULES)
    expect(scenarioRules.classRules).toBe(UNIT_CLASS_RULES)
    expect(Object.isFrozen(globalRules.classRules)).toBe(true)
    expect(Object.isFrozen(globalRules.classRules.Onion)).toBe(true)
    expect(globalRules.getUnitClassRule('Onion')).toBe(globalRules.classRules.Onion)
  })

  it('resolves class rules for global and scenario-derived unit types', () => {
    const globalRules = createGlobalRulesContext()
    const scenarioRules = createScenarioRulesContext('rules-context-class-contract', {
      ScenarioPuss: { extends: 'Puss', overrides: {} },
    })

    expect(globalRules.getUnitClassRule('Onion')).toMatchObject({
      mobility: 'mobile',
      ram: { attacker: { canRam: true, capacity: 2, perTurn: 2 } },
    })

    const derivedUnit = scenarioRules.getRequiredUnitDefinition('rules-context-class-contract:ScenarioPuss')
    expect(scenarioRules.getUnitClassRule(derivedUnit.unitClass)).toEqual(
      globalRules.getUnitClassRule('LightArmor'),
    )
  })

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
