import { describe, expect, it } from 'vitest'

import { normalizeInitialStateToGameState } from '#server/engine/scenarioNormalizer'

type Deployment = {
  type?: string
  unitType?: string
  side: 'onion' | 'defender'
  position: { q: number; r: number }
  status?: 'operational' | 'disabled' | 'recovering' | 'destroyed'
  count?: number
  groupName?: string
  kind?: 'stack-group'
  startingAmmoByWeaponType?: Record<string, number>
}

type TargetInitialState = {
  deployments: Record<string, Deployment>
}

type TargetRuntimeUnit = {
  unitId: string
  typeId: string
  side: 'onion' | 'defender'
  position: { q: number; r: number }
  state: string
  friendlyName: string
  weapons: Array<{ typeId: string; ammo?: number; state: string }>
  treads?: number
  ramsRemaining?: number
}

type TargetRuntimeState = {
  onions: Record<string, TargetRuntimeUnit>
  defenders: Record<string, TargetRuntimeUnit>
  stackRoster: { groupsById: Record<string, { unitIds: string[] }> }
}

function normalizeTargetState(initial: TargetInitialState): TargetRuntimeState {
  return normalizeInitialStateToGameState(initial as unknown as Parameters<typeof normalizeInitialStateToGameState>[0]) as unknown as TargetRuntimeState
}

function makeInitialState(deployments: Record<string, Deployment>): TargetInitialState {
  return { deployments }
}

describe('scenario deployment normalization contract', () => {
  it('NORM-001 normalizes regular deployments from catalog and scenario data', () => {
    const state = normalizeTargetState(makeInitialState({
      'puss-1': {
        type: 'Puss',
        side: 'onion',
        position: { q: 2, r: 1 },
        status: 'disabled',
      },
    }))

    expect(state.onions['puss-1']).toMatchObject({
      unitId: 'puss-1',
      typeId: 'Puss',
      side: 'onion',
      position: { q: 2, r: 1 },
      state: 'disabled',
    })
    expect(state.onions['puss-1'].friendlyName).toBe('Puss 1')
  })

  it('NORM-002 defaults omitted deployment status to operational', () => {
    const state = normalizeTargetState(makeInitialState({
      'puss-1': { type: 'Puss', side: 'onion', position: { q: 1, r: 1 } },
      'wolf-1': { type: 'BigBadWolf', side: 'defender', position: { q: 1, r: 2 } },
    }))

    expect(state.onions['puss-1'].state).toBe('operational')
    expect(state.defenders['wolf-1'].state).toBe('operational')
  })

  it('NORM-003 assigns a defender-oriented chassis to the Onion side without adding Onion capabilities', () => {
    const state = normalizeTargetState(makeInitialState({
      'puss-1': { type: 'Puss', side: 'onion', position: { q: 1, r: 1 } },
    }))
    const unit = state.onions['puss-1']

    expect(unit.side).toBe('onion')
    expect(unit.typeId).toBe('Puss')
    expect(unit.treads).toBeUndefined()
    expect(unit.ramsRemaining).toBeUndefined()
  })

  it('NORM-004 assigns a treaded chassis to the Defender side without losing chassis capabilities', () => {
    const state = normalizeTargetState(makeInitialState({
      'onion-1': { type: 'TheOnion', side: 'defender', position: { q: 1, r: 1 } },
    }))
    const unit = state.defenders['onion-1']

    expect(unit.side).toBe('defender')
    expect(unit.typeId).toBe('TheOnion')
    expect(unit.treads).toBe(45)
    expect(unit.ramsRemaining).toBe(2)
  })

  it('NORM-005 rejects unknown unit types independently of deployment side', () => {
    expect(() => normalizeTargetState(makeInitialState({
      'unknown-1': { type: 'UnknownUnit', side: 'onion', position: { q: 1, r: 1 } },
    }))).toThrow(/Unknown unit type: UnknownUnit/)
  })

  it('NORM-006 defaults finite weapon ammo from catalog metadata', () => {
    const state = normalizeTargetState(makeInitialState({
      'onion-1': { type: 'TheOnion', side: 'onion', position: { q: 1, r: 1 } },
    }))
    const missile = state.onions['onion-1'].weapons.find((weapon) => weapon.typeId === 'TheOnion.missile_1')

    expect(missile).toMatchObject({ typeId: 'TheOnion.missile_1', ammo: 1, state: 'ready' })
  })

  it('NORM-007 applies a starting ammo override without copying static weapon data', () => {
    const state = normalizeTargetState(makeInitialState({
      'onion-1': {
        type: 'TheOnion',
        side: 'onion',
        position: { q: 1, r: 1 },
        startingAmmoByWeaponType: { 'TheOnion.missile_1': 0 },
      },
    }))
    const missile = state.onions['onion-1'].weapons.find((weapon) => weapon.typeId === 'TheOnion.missile_1')

    expect(missile).toMatchObject({ ammo: 0, state: 'ready' })
    expect(missile).not.toHaveProperty('attack')
    expect(missile).not.toHaveProperty('maxAmmo')
  })

  it('NORM-008 keeps a zero-ammo starting weapon ready but unavailable', () => {
    const state = normalizeTargetState(makeInitialState({
      'onion-1': {
        type: 'TheOnion',
        side: 'onion',
        position: { q: 1, r: 1 },
        startingAmmoByWeaponType: { 'TheOnion.missile_1': 0 },
      },
    }))
    const missile = state.onions['onion-1'].weapons.find((weapon) => weapon.typeId === 'TheOnion.missile_1')

    expect(missile?.state).toBe('ready')
    expect(missile?.ammo).toBe(0)
  })

  it('NORM-010 rejects an ammo override for an unowned weapon type', () => {
    expect(() => normalizeTargetState(makeInitialState({
      'puss-1': {
        type: 'Puss',
        side: 'onion',
        position: { q: 1, r: 1 },
        startingAmmoByWeaponType: { 'TheOnion.missile_1': 0 },
      },
    }))).toThrow(/TheOnion\.missile_1/)
  })

  it('NORM-012 applies stack side and deployment policy to every generated member', () => {
    const state = normalizeTargetState(makeInitialState({
      'pigs-stack-1': {
        kind: 'stack-group',
        unitType: 'LittlePigs',
        side: 'onion',
        position: { q: 2, r: 2 },
        count: 2,
        status: 'disabled',
      },
    }))

    const members = Object.values(state.onions).filter((unit) => unit.typeId === 'LittlePigs')
    expect(members).toHaveLength(2)
    expect(members.every((unit) => unit.side === 'onion')).toBe(true)
    expect(members.every((unit) => unit.position.q === 2 && unit.position.r === 2)).toBe(true)
    expect(members.every((unit) => unit.state === 'disabled')).toBe(true)
    expect(Object.values(state.stackRoster.groupsById)[0]?.unitIds).toHaveLength(2)
  })

  it('NORM-014 rejects a generated stack member ID collision', () => {
    expect(() => normalizeTargetState(makeInitialState({
      'pigs-1': { type: 'Puss', side: 'onion', position: { q: 1, r: 1 } },
      'pigs-stack-1': {
        kind: 'stack-group',
        unitType: 'LittlePigs',
        side: 'defender',
        position: { q: 1, r: 2 },
        count: 1,
      },
    }))).toThrow(/pigs-1/)
  })

  it('NORM-015 does not mutate deployment input during normalization', () => {
    const initial = makeInitialState({
      'onion-1': {
        type: 'TheOnion',
        side: 'onion',
        position: { q: 1, r: 1 },
        startingAmmoByWeaponType: { 'TheOnion.missile_1': 0 },
      },
    })
    const before = structuredClone(initial)

    expect(() => normalizeTargetState(initial)).not.toThrow()
    expect(initial).toEqual(before)
  })

  it.todo('NORM-009 rejects a starting ammo override above catalog maxAmmo')
  it.todo('NORM-011 rejects an override for an unlimited weapon')
  it.todo('NORM-013 preserves deterministic stack IDs and friendly names across groups')
  it.todo('NORM-016 keeps static combat data out of runtime units and weapons')
  it.todo('NORM-017 resolves every runtime type reference through the supplied catalog')
})