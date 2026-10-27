import { describe, expect, it } from 'vitest'
import type { BattlefieldOnionView, BattlefieldUnit } from '#web/lib/battlefieldView'
import {
  getCombatTargetIdForOccupant,
  isCombatTargetSelectable,
  isCombatTargetSelected,
} from '#web/lib/hexMapCombatTargeting'
import type { OccupantRosterIndex } from '#web/lib/hexMapOccupancy'

const onion = { unitId: 'onion-1', typeId: 'TheOnion' } as BattlefieldOnionView
const defender = { unitId: 'puss-1', typeId: 'Puss' } as BattlefieldUnit

describe('hexMapCombatTargeting', () => {
  it('uses the canonical tread target for defender combat', () => {
    expect(getCombatTargetIdForOccupant(onion, 'defender', onion)).toBe('onion-1:treads')
    expect(getCombatTargetIdForOccupant(defender, 'defender', onion)).toBe('puss-1')
  })

  it('allows only opposing combat targets in the legal target set', () => {
    expect(isCombatTargetSelectable(defender, 'onion', onion, new Set(['puss-1']))).toBe(true)
    expect(isCombatTargetSelectable(onion, 'onion', onion, new Set(['onion-1']))).toBe(false)
    expect(isCombatTargetSelectable(onion, 'defender', onion, new Set(['onion-1:treads']))).toBe(true)
  })

  it('matches tread and weapon target aliases when highlighting the Onion', () => {
    expect(isCombatTargetSelected(onion, 'defender', onion, 'onion-1:treads')).toBe(true)
    expect(isCombatTargetSelected(onion, 'defender', onion, 'weapon:main-1')).toBe(true)
    expect(isCombatTargetSelected(defender, 'onion', onion, 'puss-1')).toBe(true)
  })

  it('uses the roster group ID for a stacked map target, including a single visible member', () => {
    const pig = { unitId: 'pigs-1', typeId: 'LittlePigs', role: 'defender' } as BattlefieldUnit
    const rosterIndex: OccupantRosterIndex = {
      getUnitGroup: (unitId) => unitId === pig.unitId
        ? { groupId: 'group-7', unitIds: ['pigs-1'] }
        : null,
    }

    expect(getCombatTargetIdForOccupant(pig, 'onion', onion, rosterIndex)).toBe('group-7')
    expect(isCombatTargetSelectable(pig, 'onion', onion, new Set(['group-7']), rosterIndex)).toBe(true)
    expect(isCombatTargetSelected(pig, 'onion', onion, 'group-7', rosterIndex)).toBe(true)
  })
})