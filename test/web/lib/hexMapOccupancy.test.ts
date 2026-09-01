import { describe, expect, it } from 'vitest'
import type { BattlefieldOnionView, BattlefieldUnit } from '#web/lib/battlefieldView'
import {
  buildOccupantMap,
  getStackOffset,
  hasStackedOccupants,
  resolveCanonicalOccupant,
  shouldRenderDefender,
  type OccupantRosterIndex,
} from '#web/lib/hexMapOccupancy'
import type { SessionCatalog } from '#web/lib/sessionCatalog'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '#web/lib/sessionCatalog'

const onion: BattlefieldOnionView = {
  unitId: 'onion-1',
  typeId: 'TheOnion',
  role: 'onion',
  friendlyName: 'The Onion',
  position: { q: 1, r: 1 },
  state: 'operational',
  treads: 33,
  ramsRemaining: 0,
  movesRemaining: 3,
  movesAllowed: 3,
  weapons: [],
}

const sessionCatalog: SessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

function defender(overrides: Partial<BattlefieldUnit> = {}): BattlefieldUnit {
  return {
    unitId: 'pigs-1',
    typeId: 'LittlePigs',
    role: 'defender',
    state: 'operational',
    position: { q: 1, r: 1 },
    weapons: [],
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
        defender({ unitId: 'destroyed-pigs', state: 'destroyed' }),
        defender({ unitId: 'swamp', typeId: 'Swamp', state: 'destroyed' }),
      ],
    })

    expect(occupants.get('1,1')?.map((unit) => unit.unitId)).toEqual(['onion-1', 'pigs-1', 'swamp'])
  })

  it('collapses a roster group to its first visible canonical member', () => {
    const first = defender({ unitId: 'pigs-1' })
    const second = defender({ unitId: 'pigs-2' })
    const rosterIndex: OccupantRosterIndex = {
      getUnitGroup: (unitId: string) => unitId.startsWith('pigs-')
        ? { groupId: 'stack-a', unitIds: ['pigs-2', 'pigs-1'] }
        : null,
    }

    expect(resolveCanonicalOccupant([first, second], rosterIndex)?.unitId).toBe('pigs-2')
  })

  it('recognizes stackable units sharing a position or squads', () => {
    expect(hasStackedOccupants([defender({ stackSize: 2 })], sessionCatalog)).toBe(true)
    expect(hasStackedOccupants([defender(), defender({ unitId: 'pigs-2' })], sessionCatalog)).toBe(true)
  })

  it('keeps the two-unit offset vertical and centers a singleton', () => {
    expect(getStackOffset(0, 1)).toEqual({ dx: 0, dy: 0 })
    expect(getStackOffset(0, 2)).toEqual({ dx: 0, dy: -11 })
    expect(getStackOffset(1, 2)).toEqual({ dx: 0, dy: 11 })
  })

  it('renders destroyed Swamp defenders but not other destroyed defenders', () => {
    expect(shouldRenderDefender(defender({ state: 'destroyed' }))).toBe(false)
    expect(shouldRenderDefender(defender({ typeId: 'Swamp', state: 'destroyed' }))).toBe(true)
  })
})