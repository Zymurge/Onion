import { describe, expect, it } from 'vitest'
import type { BattlefieldOnionView, BattlefieldUnit } from '#web/lib/battlefieldView'
import {
  buildOccupantMap,
  getStackOffset,
  hasStackedOccupants,
  resolveCanonicalOccupant,
  shouldRenderDefender,
} from '#web/lib/hexMapOccupancy'

const onion: BattlefieldOnionView = {
  id: 'onion-1',
  type: 'TheOnion',
  position: { q: 1, r: 1 },
  status: 'operational',
  treads: 33,
  movesAllowed: 3,
  movesRemaining: 3,
  rams: 0,
  weapons: 'main: ready',
}

function defender(overrides: Partial<BattlefieldUnit> = {}): BattlefieldUnit {
  return {
    id: 'pigs-1',
    type: 'LittlePigs',
    status: 'operational',
    role: 'defender',
    unitId: 'pigs-1',
    typeId: 'LittlePigs',
    state: 'operational',
    position: { q: 1, r: 1 },
    q: 1,
    r: 1,
    move: 3,
    weapons: [],
    attack: '1 / rng 1',
    actionableModes: ['fire'],
    ...overrides,
  }
}

describe('hexMapOccupancy', () => {
  it('builds occupants by hex and excludes destroyed non-Swamp defenders', () => {
    const occupants = buildOccupantMap({
      onions: [onion],
      defenders: [
        defender(),
        defender({ id: 'destroyed-pigs', status: 'destroyed', state: 'destroyed' }),
        defender({ id: 'swamp', type: 'Swamp', status: 'destroyed', state: 'destroyed' }),
      ],
    })

    expect(occupants.get('1,1')?.map((unit) => unit.id)).toEqual(['onion-1', 'pigs-1', 'swamp'])
  })

  it('collapses a roster group to its first visible canonical member', () => {
    const first = defender({ id: 'pigs-1' })
    const second = defender({ id: 'pigs-2' })
    const rosterIndex = {
      getUnitGroup: (unitId: string) => unitId.startsWith('pigs-')
        ? { groupId: 'stack-a', unitIds: ['pigs-2', 'pigs-1'] }
        : null,
    }

    expect(resolveCanonicalOccupant([first, second], rosterIndex as any)?.id).toBe('pigs-2')
  })

  it('recognizes stackable units sharing a position or squads', () => {
    const catalog = { unitTypes: { LittlePigs: { stackable: true } } }
    expect(hasStackedOccupants([defender({ squads: 2 })], catalog as any)).toBe(true)
    expect(hasStackedOccupants([defender(), defender({ id: 'pigs-2' })], catalog as any)).toBe(true)
  })

  it('keeps the two-unit offset vertical and centers a singleton', () => {
    expect(getStackOffset(0, 1)).toEqual({ dx: 0, dy: 0 })
    expect(getStackOffset(0, 2)).toEqual({ dx: 0, dy: -11 })
    expect(getStackOffset(1, 2)).toEqual({ dx: 0, dy: 11 })
  })

  it('renders destroyed Swamp defenders but not other destroyed defenders', () => {
    expect(shouldRenderDefender(defender({ status: 'destroyed', state: 'destroyed' }))).toBe(false)
    expect(shouldRenderDefender(defender({ type: 'Swamp', status: 'destroyed', state: 'destroyed' }))).toBe(true)
  })
})