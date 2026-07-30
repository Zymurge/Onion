/**
 * Tests for the units module — unit definitions, weapon system, and capabilities.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getUnitDefinition,
  getAllUnitDefinitions,
  onionMovementAllowance,
  canSecondMove,
  isImmobile,
  getUnitDefense,
  getWeaponDefense,
  isWeaponAvailable,
  getAvailableWeapons,
  isDestroyed,
  canTargetWeapon,
  destroyWeapon,
} from '#server/engine/units'
import { getAllUnitDefinitions as getSharedUnitDefinitions } from '#shared/unitDefinitions'
import { makeDefender as makeUnit, makeOnion, makeWeapon } from '#test/utils/gameStateUtils'
// ─── Logger Mocking ─────────────────────────────────────────────────────────
vi.mock('#server/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import logger from '#server/logger'

const mockedLogger = logger as unknown as {
  debug: { mockClear: () => void }
  info: { mockClear: () => void }
  warn: { mockClear: () => void }
  error: { mockClear: () => void }
}

beforeEach(() => {
  mockedLogger.debug.mockClear()
  mockedLogger.info.mockClear()
  mockedLogger.warn.mockClear()
  mockedLogger.error.mockClear()
})
import type { GameState } from '#server/engine/units'

// ─── onionMovementAllowance ──────────────────────────────────────────────────

describe('onionMovementAllowance', () => {
  it('returns 0 when treads are 0', () => {
    expect(onionMovementAllowance(0)).toBe(0)
  })

  it('returns 1 at the lower bound (1 tread)', () => {
    expect(onionMovementAllowance(1)).toBe(1)
  })

  it('returns 1 at the upper bound (15 treads)', () => {
    expect(onionMovementAllowance(15)).toBe(1)
  })

  it('returns 2 at the lower bound (16 treads)', () => {
    expect(onionMovementAllowance(16)).toBe(2)
  })

  it('returns 2 at the upper bound (30 treads)', () => {
    expect(onionMovementAllowance(30)).toBe(2)
  })

  it('returns 3 at the lower bound (31 treads)', () => {
    expect(onionMovementAllowance(31)).toBe(3)
  })

  it('returns 3 at max treads (45)', () => {
    expect(onionMovementAllowance(45)).toBe(3)
  })

  it('returns 3 in the middle of the top band', () => {
    expect(onionMovementAllowance(38)).toBe(3)
  })
})

// ─── getUnitDefinition ───────────────────────────────────────────────────────

describe('getUnitDefinition', () => {
  it('logs error for unknown unit type', () => {
    const def = getUnitDefinition('UnknownType')
    expect(def).toBeUndefined()
    expect(logger.error).not.toHaveBeenCalled()
  })

  describe('Puss (Heavy Tank)', () => {
    it('has correct movement', () => {
      expect(getUnitDefinition('Puss').movement).toBe(3)
    })

    it('has correct defense', () => {
      expect(getUnitDefinition('Puss').defense).toBe(3)
    })

    it('is marked as armor', () => {
      expect(getUnitDefinition('Puss').abilities.isArmor).toBe(true)
    })

    it('has one weapon: attack 4, range 2', () => {
      const { weapons } = getUnitDefinition('Puss')
      expect(weapons).toHaveLength(1)
      expect(weapons[0].attack).toBe(4)
      expect(weapons[0].range).toBe(2)
    })

    it('has correct unit cost', () => {
      expect(getUnitDefinition('Puss').cost).toBe(1)
    })
  })

  describe('BigBadWolf (GEV)', () => {
    it('has secondMove ability', () => {
      expect(getUnitDefinition('BigBadWolf').abilities.secondMove).toBe(true)
    })

    it('has primary movement allowance of 4', () => {
      expect(getUnitDefinition('BigBadWolf').movement).toBe(4)
    })

    it('has secondMoveAllowance of 3', () => {
      expect(getUnitDefinition('BigBadWolf').abilities.secondMoveAllowance).toBe(3)
    })

    it('is marked as armor (cannot cross ridgelines)', () => {
      expect(getUnitDefinition('BigBadWolf').abilities.isArmor).toBe(true)
    })

    it('has attack 2, range 2', () => {
      const { weapons } = getUnitDefinition('BigBadWolf')
      expect(weapons[0].attack).toBe(2)
      expect(weapons[0].range).toBe(2)
    })
  })

  describe('Witch (Missile Tank)', () => {
    it('has attack 3, range 4', () => {
      const { weapons } = getUnitDefinition('Witch')
      expect(weapons[0].attack).toBe(3)
      expect(weapons[0].range).toBe(4)
    })

    it('has defense 2', () => {
      expect(getUnitDefinition('Witch').defense).toBe(2)
    })

    it('is marked as armor', () => {
      expect(getUnitDefinition('Witch').abilities.isArmor).toBe(true)
    })
  })

  describe('LordFarquaad (Howitzer)', () => {
    it('has attack 6, range 8', () => {
      const { weapons } = getUnitDefinition('LordFarquaad')
      expect(weapons[0].attack).toBe(6)
      expect(weapons[0].range).toBe(8)
    })

    it('has defense 0', () => {
      expect(getUnitDefinition('LordFarquaad').defense).toBe(0)
    })

    it('is immobile', () => {
      expect(getUnitDefinition('LordFarquaad').abilities.immobile).toBe(true)
    })

    it('has movement 0', () => {
      expect(getUnitDefinition('LordFarquaad').movement).toBe(0)
    })

    it('has cost 2', () => {
      expect(getUnitDefinition('LordFarquaad').cost).toBe(2)
    })
  })

  describe('Pinocchio (Light Tank)', () => {
    it('has attack 2, range 2, defense 3', () => {
      const def = getUnitDefinition('Pinocchio')
      expect(def.weapons[0].attack).toBe(2)
      expect(def.weapons[0].range).toBe(2)
      expect(def.defense).toBe(3)
    })

    it('is marked as armor', () => {
      expect(getUnitDefinition('Pinocchio').abilities.isArmor).toBe(true)
    })
  })

  describe('Dragon (Superheavy Tank)', () => {
    it('has two weapons each attack 6, range 3', () => {
      const { weapons } = getUnitDefinition('Dragon')
      expect(weapons).toHaveLength(2)
      expect(weapons[0].attack).toBe(6)
      expect(weapons[0].range).toBe(3)
      expect(weapons[1].attack).toBe(6)
      expect(weapons[1].range).toBe(3)
    })

    it('has movement 5', () => {
      expect(getUnitDefinition('Dragon').movement).toBe(5)
    })

    it('has defense 3', () => {
      expect(getUnitDefinition('Dragon').defense).toBe(3)
    })

    it('is marked as armor', () => {
      expect(getUnitDefinition('Dragon').abilities.isArmor).toBe(true)
    })
  })

  describe('LittlePigs (Infantry)', () => {
    it('can cross ridgelines', () => {
	  expect(getUnitDefinition('LittlePigs').abilities.terrainRules?.ridgeline?.canCross).toBe(true)
    })

      it('has maxStacks of 5', () => {
        expect(getUnitDefinition('LittlePigs').abilities.maxStacks).toBe(5)
    })

    it('has movement 1', () => {
      expect(getUnitDefinition('LittlePigs').movement).toBe(1)
    })

    it('has one weapon: attack 1, range 1', () => {
      const { weapons } = getUnitDefinition('LittlePigs')
      expect(weapons).toHaveLength(1)
      expect(weapons[0].attack).toBe(1)
      expect(weapons[0].range).toBe(1)
    })

    it('is marked stackable', () => {
      expect(getUnitDefinition('LittlePigs').stackable).toBe(true)
    })
  })

  describe('Swamp (HQ)', () => {
    it('has no weapons', () => {
      expect((getUnitDefinition('Swamp') as any).weapons).toHaveLength(0)
    })

    it('has defense 0', () => {
      expect(getUnitDefinition('Swamp').defense).toBe(0)
    })

    it('has movement 0', () => {
      expect(getUnitDefinition('Swamp').movement).toBe(0)
    })

    it('is immobile', () => {
      expect(getUnitDefinition('Swamp').abilities.immobile).toBe(true)
    })

    it('has a ramming profile', () => {
      expect(getUnitDefinition('Swamp').abilities.ramProfile).toEqual({ treadLoss: 1, destroyOnRollAtMost: 4 })
    })

    it('is not marked stackable', () => {
      expect(getUnitDefinition('Swamp').stackable).toBe(false)
    })
  })

  describe('TheOnion (Mk III)', () => {
    it('has 15 weapons total (1 main + 4 secondary + 8 AP + 2 missiles)', () => {
      expect(getUnitDefinition('TheOnion').weapons).toHaveLength(15)
    })

    it('has one main battery: attack 4, range 3, defense 4', () => {
      const mainBatteries = getUnitDefinition('TheOnion').weapons.filter(w =>
        w.typeId.endsWith('.main')
      )
      expect(mainBatteries).toHaveLength(1)
      expect(mainBatteries[0].attack).toBe(4)
      expect(mainBatteries[0].range).toBe(3)
      expect(mainBatteries[0].defense).toBe(4)
    })

    it('has four secondary batteries: attack 3, range 2, defense 3', () => {
      const secondaries = getUnitDefinition('TheOnion').weapons.filter(w =>
        w.typeId.includes('.secondary_')
      )
      expect(secondaries).toHaveLength(4)
      secondaries.forEach(w => {
        expect(w.attack).toBe(3)
        expect(w.range).toBe(2)
        expect(w.defense).toBe(3)
      })
    })

    it('has eight AP weapons: attack 1, range 1, defense 1', () => {
      const apWeapons = getUnitDefinition('TheOnion').weapons.filter(w =>
        w.typeId.includes('.ap_')
      )
      expect(apWeapons).toHaveLength(8)
      apWeapons.forEach(w => {
        expect(w.attack).toBe(1)
        expect(w.range).toBe(1)
        expect(w.defense).toBe(1)
      })
    })

    it('has two missiles: attack 6, range 5, defense 3', () => {
      const missiles = getUnitDefinition('TheOnion').weapons.filter(w =>
        w.typeId.includes('.missile_')
      )
      expect(missiles).toHaveLength(2)
      missiles.forEach(w => {
        expect(w.attack).toBe(6)
        expect(w.range).toBe(5)
        expect(w.defense).toBe(3)
      })
    })

    it('all weapons are individually targetable', () => {
      getUnitDefinition('TheOnion').weapons.forEach(w => {
        expect(w.individuallyTargetable).toBe(true)
      })
    })

    it('all weapons start ready', () => {
      getUnitDefinition('TheOnion').weapons.forEach(w => {
        expect('state' in w).toBe(false)
      })
    })
  })
})

// ─── getAllUnitDefinitions ────────────────────────────────────────────────────

describe('getAllUnitDefinitions', () => {
  it('contains all 9 unit types', () => {
    const all = getAllUnitDefinitions()
    const keys = Object.keys(all)
    expect(keys).toHaveLength(9)
    expect(keys).toContain('Puss')
    expect(keys).toContain('BigBadWolf')
    expect(keys).toContain('Witch')
    expect(keys).toContain('LordFarquaad')
    expect(keys).toContain('Pinocchio')
    expect(keys).toContain('Dragon')
    expect(keys).toContain('LittlePigs')
    expect(keys).toContain('Swamp')
    expect(keys).toContain('TheOnion')
  })

    it('each entry has the correct typeId field', () => {
    const all = getAllUnitDefinitions()
    for (const [key, def] of Object.entries(all)) {
      expect(def.typeId).toBe(key)
    }
  })

  it('mirrors the canonical shared definition source', () => {
    expect(getAllUnitDefinitions()).toEqual(getSharedUnitDefinitions())
  })

  it('exposes a friendly-name template for Swamp', () => {
    const shared = getSharedUnitDefinitions() as any

    expect(shared.Swamp.friendlyNameTemplate).toBe('The Swamp')
  })

  it('exposes friendly-name templates for units and The Onion weapons', () => {
    const shared = getSharedUnitDefinitions()

    expect(shared.LittlePigs.friendlyNameTemplate).toBe('Little Pigs {{ordinal}}')
    expect(shared.BigBadWolf.friendlyNameTemplate).toBe('Big Bad Wolf {{ordinal}}')
    expect(shared.TheOnion.friendlyNameTemplate).toBe('The Onion {{ordinal}}')
    expect((shared.TheOnion.weapons.find((weapon) => weapon.typeId === 'TheOnion.secondary_1') as any).friendlyNameTemplate).toBe('Secondary Battery {{ordinal}}')
    expect((shared.TheOnion.weapons.find((weapon) => weapon.typeId === 'TheOnion.ap_1') as any).friendlyNameTemplate).toBe('AP Gun {{ordinal}}')
  })

  it('includes ram profiles in the shared definition source for rammed units', () => {
    const shared = getSharedUnitDefinitions()

    expect(shared.LittlePigs.abilities.ramProfile).toEqual({ treadLoss: 0, destroyOnRollAtMost: 4 })
    expect(shared.Puss.abilities.ramProfile).toEqual({ treadLoss: 1, destroyOnRollAtMost: 4 })
    expect(shared.Dragon.abilities.ramProfile).toEqual({ treadLoss: 2, destroyOnRollAtMost: 4 })
    expect((shared as any).Swamp.abilities.ramProfile).toEqual({ treadLoss: 1, destroyOnRollAtMost: 4 })
  })
})

// ─── GameState ────────────────────────────────────────────────────────────────

describe('GameState', () => {
  it('ramsRemaining starts at 2 for a fresh Onion', () => {
    const state: GameState = {
      onions: { onion: makeOnion() },
      defenders: {},
      stackNaming: { groupsInUse: [], usedGroupNames: [] },
      stackRoster: { groupsById: {} },
      currentPhase: 'ONION_MOVE',
      turn: 1,
    }
    expect(state.onions.onion.ramsRemaining).toBe(2)
  })

  it('ramsRemaining can be spent down to 0', () => {
    const state: GameState = {
      onions: { onion: makeOnion() },
      defenders: {},
      stackNaming: { groupsInUse: [], usedGroupNames: [] },
      stackRoster: { groupsById: {} },
      currentPhase: 'ONION_MOVE',
      turn: 1,
    }
    state.onions.onion.ramsRemaining--
    state.onions.onion.ramsRemaining--
    expect(state.onions.onion.ramsRemaining).toBe(0)
  })
})

// ─── canSecondMove ────────────────────────────────────────────────────────────

describe('canSecondMove', () => {
  it('returns true for BigBadWolf', () => {
    expect(canSecondMove(makeUnit({ typeId: 'BigBadWolf' }))).toBe(true)
  })

  it('returns false for Puss', () => {
    expect(canSecondMove(makeUnit({ typeId: 'Puss' }))).toBe(false)
  })

  it('returns false for Onion', () => {
    expect(canSecondMove(makeOnion())).toBe(false)
  })

  it('returns false for LittlePigs', () => {
    expect(canSecondMove(makeUnit({ typeId: 'LittlePigs' }))).toBe(false)
  })
})

// ─── isImmobile ───────────────────────────────────────────────────────────────

describe('isImmobile', () => {
  it('returns true for LordFarquaad', () => {
    expect(isImmobile(makeUnit({ typeId: 'LordFarquaad' }))).toBe(true)
  })

  it('returns false for Puss', () => {
    expect(isImmobile(makeUnit({ typeId: 'Puss' }))).toBe(false)
  })

  it('returns false for BigBadWolf', () => {
    expect(isImmobile(makeUnit({ typeId: 'BigBadWolf' }))).toBe(false)
  })
})

// ─── getUnitDefense ───────────────────────────────────────────────────────────

describe('getUnitDefense', () => {
  it('returns base defense for armored unit, no cover', () => {
    expect(getUnitDefense(makeUnit({ typeId: 'Puss' }), false)).toBe(3)
  })

  it('adds one point of cover defense for an armored unit', () => {
    expect(getUnitDefense(makeUnit({ typeId: 'Puss' }), true)).toBe(4)
  })

  it('returns defense 0 for Swamp', () => {
    expect(getUnitDefense(makeUnit({ typeId: 'Swamp' }), false)).toBe(0)
  })

  it('returns defense 0 for LordFarquaad', () => {
    expect(getUnitDefense(makeUnit({ typeId: 'LordFarquaad' }), false)).toBe(0)
  })

  describe('infantry (LittlePigs)', () => {
    it('has base defense 1 with no cover', () => {
      expect(getUnitDefense(makeUnit({ typeId: 'LittlePigs' }), false)).toBe(1)
    })

    it('has base defense 1 regardless of stack size', () => {
      expect(getUnitDefense(makeUnit({ typeId: 'LittlePigs' }), false)).toBe(1)
    })

    it('gets one point of cover defense', () => {
      expect(getUnitDefense(makeUnit({ typeId: 'LittlePigs' }), true)).toBe(2)
    })

    it('does not derive defense from removed squad state', () => {
      expect(getUnitDefense(makeUnit({ typeId: 'LittlePigs' }), true)).toBe(2)
    })
  })
})

// ─── getWeaponDefense ─────────────────────────────────────────────────────────

describe('getWeaponDefense', () => {
  it('returns main battery defense for Onion', () => {
    expect(getWeaponDefense('TheOnion.main')).toBe(4)
  })

  it('returns AP defense for Onion', () => {
    expect(getWeaponDefense('TheOnion.ap_1')).toBe(1)
  })

  it('returns missile defense for Onion', () => {
    expect(getWeaponDefense('TheOnion.missile_1')).toBe(3)
  })

  it('returns configured defense for a non-individually-targetable weapon type', () => {
    expect(getWeaponDefense('Puss.main')).toBe(3)
  })

  it('throws when weapon type is not found', () => {
    expect(() => getWeaponDefense('nosuchweapon')).toThrow('Unknown weapon type: nosuchweapon')
  })
})

// ─── isWeaponAvailable / getAvailableWeapons ──────────────────────────────────

describe('isWeaponAvailable', () => {
  it('returns true only for ready weapons', () => {
    expect(isWeaponAvailable(makeWeapon({ state: 'ready' }))).toBe(true)
    expect(isWeaponAvailable(makeWeapon({ state: 'spent' }))).toBe(false)
    expect(isWeaponAvailable(makeWeapon({ state: 'destroyed' }))).toBe(false)
  })
})

describe('getAvailableWeapons', () => {
  it('returns all weapons if none are destroyed', () => {
    const unit = makeUnit({
      weapons: [makeWeapon({ id: 'w1' }), makeWeapon({ id: 'w2' })],
    })
    expect(getAvailableWeapons(unit)).toHaveLength(2)
  })

  it('filters out destroyed weapons', () => {
    const unit = makeUnit({
      weapons: [
        makeWeapon({ id: 'w1', state: 'ready' }),
        makeWeapon({ id: 'w2', state: 'destroyed' }),
        makeWeapon({ id: 'w3', state: 'ready' }),
      ],
    })
    const ready = getAvailableWeapons(unit)
    expect(ready).toHaveLength(2)
    expect(ready.map(w => w.id)).toEqual(['w1', 'w3'])
  })

  it('returns empty array when all weapons destroyed', () => {
    const unit = makeUnit({
      weapons: [
        makeWeapon({ id: 'w1', state: 'destroyed' }),
        makeWeapon({ id: 'w2', state: 'destroyed' }),
      ],
    })
    expect(getAvailableWeapons(unit)).toHaveLength(0)
  })

  it('returns empty array for unit with no weapons', () => {
    const unit = makeUnit({ typeId: 'Swamp', weapons: [] })
    expect(getAvailableWeapons(unit)).toHaveLength(0)
  })
})

// ─── isDestroyed ─────────────────────────────────────────────────────────────

describe('isDestroyed', () => {
  it('returns true when status is destroyed', () => {
    expect(isDestroyed(makeUnit({ state: 'destroyed' }))).toBe(true)
  })

  it('returns false when status is operational', () => {
    expect(isDestroyed(makeUnit({ state: 'operational' }))).toBe(false)
  })

  it('returns false when status is disabled', () => {
    expect(isDestroyed(makeUnit({ state: 'disabled' }))).toBe(false)
  })

  it('returns false when status is recovering', () => {
    expect(isDestroyed(makeUnit({ state: 'recovering' }))).toBe(false)
  })
})

// ─── canTargetWeapon ─────────────────────────────────────────────────────────

describe('canTargetWeapon', () => {
  it('returns true for individually targetable Onion weapon', () => {
    const onion = makeOnion()
    const mainId = onion.weapons[0].id
    expect(canTargetWeapon(onion, mainId)).toBe(true)
  })

  it('returns false for non-individually-targetable weapon', () => {
    const puss = makeUnit({ typeId: 'Puss' })
    expect(canTargetWeapon(puss, 'main')).toBe(false)
  })

  it('returns false for nonexistent weaponId', () => {
    const puss = makeUnit({ typeId: 'Puss' })
    expect(canTargetWeapon(puss, 'nosuchweapon')).toBe(false)
  })
})

// ─── destroyWeapon ────────────────────────────────────────────────────────────

describe('destroyWeapon', () => {
  it('sets weapon status to destroyed and returns true', () => {
    const unit = makeUnit({ weapons: [makeWeapon({ id: 'main', state: 'ready' })] })
    const result = destroyWeapon(unit, 'main')
    expect(result).toBe(true)
    expect(unit.weapons[0].state).toBe('destroyed')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('is idempotent — returns true on already-destroyed weapon', () => {
    const unit = makeUnit({ weapons: [makeWeapon({ id: 'main', state: 'destroyed' })] })
    const result = destroyWeapon(unit, 'main')
    expect(result).toBe(true)
    expect(unit.weapons[0].state).toBe('destroyed')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('returns false and logs warn when weaponId not found', () => {
    const unit = makeUnit({ weapons: [makeWeapon({ id: 'main' })] })
    const result = destroyWeapon(unit, 'nosuchweapon')
    expect(result).toBe(false)
    expect(unit.weapons[0].state).toBe('ready')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('only destroys the targeted weapon, not others', () => {
    const unit = makeUnit({
      weapons: [makeWeapon({ id: 'w1' }), makeWeapon({ id: 'w2' })],
    })
    destroyWeapon(unit, 'w1')
    expect(unit.weapons[0].state).toBe('destroyed')
    expect(unit.weapons[1].state).toBe('ready')
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
