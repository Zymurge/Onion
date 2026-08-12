import { describe, expect, it } from 'vitest'
import { makeDefender, makeOnion, makeWeapon } from '#test/utils/gameStateUtils'
import { buildBattlefieldDefenderView, buildBattlefieldOnionView, getPhaseAdvanceLabel, getPhaseOwner } from '../../../web/lib/battlefieldViewBuilders'
import { isUnitMoveEligible } from '../../../web/lib/battlefieldView'

describe('battlefieldViewBuilders', () => {
  it('resolves phase ownership and advancement labels', () => {
    expect(getPhaseOwner('DEFENDER_COMBAT')).toBe('defender')
    expect(getPhaseAdvanceLabel('ONION_MOVE', 'onion')).toBe('Start Combat')
  })

  it('projects defenders with canonical dynamic fields and contextual movement data', () => {
    const view = buildBattlefieldDefenderView(
      makeDefender({
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 2, r: 3 },
        state: 'operational',
        weapons: [makeWeapon({ id: 'rifle-1', typeId: 'LittlePigs.rifle' })],
      }),
      { move: 2, stackSize: 3, activePhase: 'DEFENDER_MOVE', activeTurnActive: true },
    )

    expect(view).toMatchObject({
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      state: 'operational',
      position: { q: 2, r: 3 },
      movesRemaining: 2,
      stackSize: 3,
      weapons: [{ id: 'rifle-1', typeId: 'LittlePigs.rifle' }],
    })
    expect(view).not.toHaveProperty('id')
    expect(view).not.toHaveProperty('type')
    expect(view).not.toHaveProperty('status')
    expect(view).not.toHaveProperty('move')
    expect(view).not.toHaveProperty('q')
    expect(view).not.toHaveProperty('r')
    expect(isUnitMoveEligible(view, 'DEFENDER_MOVE', 'defender')).toBe(true)
  })

  it('projects onions with canonical dynamic fields and contextual movement data', () => {
    const view = buildBattlefieldOnionView(
      makeOnion({
        unitId: 'onion-1',
        position: { q: 1, r: 4 },
        state: 'operational',
        weapons: [makeWeapon({ id: 'main-1', typeId: 'TheOnion.main' })],
      }),
      { movesAllowed: 3, movesRemaining: 1 },
    )

    expect(view).toMatchObject({
      unitId: 'onion-1',
      typeId: 'TheOnion',
      state: 'operational',
      position: { q: 1, r: 4 },
      movesAllowed: 3,
      movesRemaining: 1,
      ramsRemaining: 2,
      weapons: [{ id: 'main-1', typeId: 'TheOnion.main' }],
    })
    expect(view).not.toHaveProperty('id')
    expect(view).not.toHaveProperty('type')
    expect(view).not.toHaveProperty('status')
    expect(view).not.toHaveProperty('rams')
    expect(isUnitMoveEligible(view, 'ONION_MOVE', 'onion')).toBe(true)
  })
})