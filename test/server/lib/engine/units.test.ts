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
  getReadyWeapons,
  isDestroyed,
  canTargetWeapon,
  destroyWeapon,
} from '#server/engine/units'
import { getAllUnitDefinitions as getSharedUnitDefinitions } from '#shared/unitDefinitions'
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
import type { GameUnit, OnionUnit, DefenderUnit, Weapon, EngineGameState } from '#server/engine/units'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'main',
    name: 'Main Gun',
    attack: 4,
    range: 2,
    defense: 3,
    status: 'ready',
    individuallyTargetable: false,
    ...overrides,
  }
}

function makeUnit(overrides: Partial<GameUnit> = {}): DefenderUnit {
  return {
    id: 'u1',
    type: 'Puss',
    position: { q: 0, r: 0 },
    status: 'operational',
    weapons: [makeWeapon()],
    ...overrides,
  } as DefenderUnit
}

function makeOnion(overrides: Partial<OnionUnit> = {}): OnionUnit {
  const def = getUnitDefinition('TheOnion')
  return {
    id: 'onion',
    type: 'TheOnion',
    position: { q: 0, r: 0 },
    status: 'operational',
    treads: 45,
    weapons: def.weapons.map(w => ({ ...w })),
    ...overrides,
  }
}

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
    expect(logger.error).toHaveBeenCalledWith({ type: 'UnknownType' }, expect.stringContaining('unknown unit type'))
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
      expect(getUnitDefinition('LittlePigs').abilities.canCrossRidgelines).toBe(true)
    })

    it('has maxStacks of 3', () => {
      expect(getUnitDefinition('LittlePigs').abilities.maxStacks).toBe(3)
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
  })

  describe('Castle (Command Post)', () => {
    it('has no weapons', () => {
      expect(getUnitDefinition('Castle').weapons).toHaveLength(0)
    })

    it('has defense 0', () => {
      expect(getUnitDefinition('Castle').defense).toBe(0)
    })

    it('has movement 0', () => {
      expect(getUnitDefinition('Castle').movement).toBe(0)
    })
  })

  describe('TheOnion (Mk III)', () => {
    it('has 15 weapons total (1 main + 4 secondary + 8 AP + 2 missiles)', () => {
      expect(getUnitDefinition('TheOnion').weapons).toHaveLength(15)
    })

    it('has one main battery: attack 4, range 3, defense 4', () => {
      const mainBatteries = getUnitDefinition('TheOnion').weapons.filter(w =>
        w.id.startsWith('main')
      )
      expect(mainBatteries).toHaveLength(1)
      expect(mainBatteries[0].attack).toBe(4)
      expect(mainBatteries[0].range).toBe(3)
      expect(mainBatteries[0].defense).toBe(4)
    })

    it('has four secondary batteries: attack 3, range 2, defense 3', () => {
      const secondaries = getUnitDefinition('TheOnion').weapons.filter(w =>
        w.id.startsWith('secondary')
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
        w.id.startsWith('ap')
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
        w.id.startsWith('missile')
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
        expect(w.status).toBe('ready')
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
    expect(keys).toContain('Castle')
    expect(keys).toContain('TheOnion')
  })

  it('each entry has the correct type field', () => {
    const all = getAllUnitDefinitions()
    for (const [key, def] of Object.entries(all)) {
      expect(def.type).toBe(key)
    }
  })

  it('mirrors the canonical shared definition source', () => {
    expect(getAllUnitDefinitions()).toEqual(getSharedUnitDefinitions())
  })

  it('includes ram profiles in the shared definition source for rammed units', () => {
    const shared = getSharedUnitDefinitions()

    expect(shared.LittlePigs.abilities.ramProfile).toEqual({ treadLoss: 0, destroyOnRollAtMost: 4 })
    expect(shared.Puss.abilities.ramProfile).toEqual({ treadLoss: 1, destroyOnRollAtMost: 4 })
    expect(shared.Dragon.abilities.ramProfile).toEqual({ treadLoss: 2, destroyOnRollAtMost: 4 })
  })
})

// ─── EngineGameState ─────────────────────────────────────────────────────────

describe('EngineGameState', () => {
  it('ramsThisTurn starts at 0 in a fresh state', () => {
    const state: EngineGameState = {
      onion: makeOnion(),
      defenders: {},
      ramsThisTurn: 0,
      currentPhase: 'ONION_MOVE',
      turn: 1,
    }
    expect(state.ramsThisTurn).toBe(0)
  })

  it('ramsThisTurn can be incremented up to 2', () => {
    const state: EngineGameState = {
      onion: makeOnion(),
      defenders: {},
      ramsThisTurn: 0,
      currentPhase: 'ONION_MOVE',
      turn: 1,
    }
    state.ramsThisTurn++
    expect(state.ramsThisTurn).toBe(1)
    state.ramsThisTurn++
    expect(state.ramsThisTurn).toBe(2)
  })
})

// ─── canSecondMove ────────────────────────────────────────────────────────────

describe('canSecondMove', () => {
  it('returns true for BigBadWolf', () => {
    expect(canSecondMove(makeUnit({ type: 'BigBadWolf' }))).toBe(true)
  })

  it('returns false for Puss', () => {
    expect(canSecondMove(makeUnit({ type: 'Puss' }))).toBe(false)
  })

  it('returns false for Onion', () => {
    expect(canSecondMove(makeOnion())).toBe(false)
  })

  it('returns false for LittlePigs', () => {
    expect(canSecondMove(makeUnit({ type: 'LittlePigs' }))).toBe(false)
  })
})

// ─── isImmobile ───────────────────────────────────────────────────────────────

describe('isImmobile', () => {
  it('returns true for LordFarquaad', () => {
    expect(isImmobile(makeUnit({ type: 'LordFarquaad' }))).toBe(true)
  })

  it('returns false for Puss', () => {
    expect(isImmobile(makeUnit({ type: 'Puss' }))).toBe(false)
  })

  it('returns false for Castle', () => {
    expect(isImmobile(makeUnit({ type: 'Castle', weapons: [] }))).toBe(false)
  })
})

// ─── getUnitDefense ───────────────────────────────────────────────────────────

describe('getUnitDefense', () => {
  it('returns base defense for armored unit, no cover', () => {
    expect(getUnitDefense(makeUnit({ type: 'Puss' }), false)).toBe(3)
  })

  it('returns same defense for armored unit even in cover (no cover bonus)', () => {
    expect(getUnitDefense(makeUnit({ type: 'Puss' }), true)).toBe(3)
  })

  it('returns defense 0 for Castle', () => {
    expect(getUnitDefense(makeUnit({ type: 'Castle', weapons: [] }), false)).toBe(0)
  })

  it('returns defense 0 for LordFarquaad', () => {
    expect(getUnitDefense(makeUnit({ type: 'LordFarquaad' }), false)).toBe(0)
  })

  describe('infantry (LittlePigs)', () => {
    it('1 squad, no cover → 1', () => {
      expect(getUnitDefense(makeUnit({ type: 'LittlePigs', squads: 1, weapons: [makeWeapon({ attack: 1, range: 1 })] }), false)).toBe(1)
    })

    it('3 squads, no cover → 3', () => {
      expect(getUnitDefense(makeUnit({ type: 'LittlePigs', squads: 3, weapons: [makeWeapon({ attack: 1, range: 1 })] }), false)).toBe(3)
    })

    it('3 squads, in cover → 4', () => {
      expect(getUnitDefense(makeUnit({ type: 'LittlePigs', squads: 3, weapons: [makeWeapon({ attack: 1, range: 1 })] }), true)).toBe(4)
    })

    it('2 squads, in cover → 3', () => {
      expect(getUnitDefense(makeUnit({ type: 'LittlePigs', squads: 2, weapons: [makeWeapon({ attack: 1, range: 1 })] }), true)).toBe(3)
    })
  })
})

// ─── getWeaponDefense ─────────────────────────────────────────────────────────

describe('getWeaponDefense', () => {
  it('returns main battery defense for Onion', () => {
    const onion = makeOnion()
    const mainId = onion.weapons.find(w => w.id.startsWith('main'))!.id
    expect(getWeaponDefense(onion, mainId)).toBe(4)
  })

  it('returns AP defense for Onion', () => {
    const onion = makeOnion()
    const apId = onion.weapons.find(w => w.id.startsWith('ap'))!.id
    expect(getWeaponDefense(onion, apId)).toBe(1)
  })

  it('returns missile defense for Onion', () => {
    const onion = makeOnion()
    const missileId = onion.weapons.find(w => w.id.startsWith('missile'))!.id
    expect(getWeaponDefense(onion, missileId)).toBe(3)
  })

  it('returns unit defense for non-individually-targetable weapon', () => {
    const puss = makeUnit({ type: 'Puss' })
    expect(getWeaponDefense(puss, 'main')).toBe(3)
  })

  it('returns unit defense when weaponId not found', () => {
    const puss = makeUnit({ type: 'Puss' })
    expect(getWeaponDefense(puss, 'nosuchweapon')).toBe(3)
  })
})

// ─── getReadyWeapons ──────────────────────────────────────────────────────────

describe('getReadyWeapons', () => {
  it('returns all weapons if none are destroyed', () => {
    const unit = makeUnit({
      weapons: [makeWeapon({ id: 'w1' }), makeWeapon({ id: 'w2' })],
    })
    expect(getReadyWeapons(unit)).toHaveLength(2)
  })

  it('filters out destroyed weapons', () => {
    const unit = makeUnit({
      weapons: [
        makeWeapon({ id: 'w1', status: 'ready' }),
        makeWeapon({ id: 'w2', status: 'destroyed' }),
        makeWeapon({ id: 'w3', status: 'ready' }),
      ],
    })
    const ready = getReadyWeapons(unit)
    expect(ready).toHaveLength(2)
    expect(ready.map(w => w.id)).toEqual(['w1', 'w3'])
  })

  it('returns empty array when all weapons destroyed', () => {
    const unit = makeUnit({
      weapons: [
        makeWeapon({ id: 'w1', status: 'destroyed' }),
        makeWeapon({ id: 'w2', status: 'destroyed' }),
      ],
    })
    expect(getReadyWeapons(unit)).toHaveLength(0)
  })

  it('returns empty array for unit with no weapons', () => {
    const unit = makeUnit({ type: 'Castle', weapons: [] })
    expect(getReadyWeapons(unit)).toHaveLength(0)
  })
})

// ─── isDestroyed ─────────────────────────────────────────────────────────────

describe('isDestroyed', () => {
  it('returns true when status is destroyed', () => {
    expect(isDestroyed(makeUnit({ status: 'destroyed' }))).toBe(true)
  })

  it('returns false when status is operational', () => {
    expect(isDestroyed(makeUnit({ status: 'operational' }))).toBe(false)
  })

  it('returns false when status is disabled', () => {
    expect(isDestroyed(makeUnit({ status: 'disabled' }))).toBe(false)
  })

  it('returns false when status is recovering', () => {
    expect(isDestroyed(makeUnit({ status: 'recovering' }))).toBe(false)
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
    const puss = makeUnit({ type: 'Puss' })
    expect(canTargetWeapon(puss, 'main')).toBe(false)
  })

  it('returns false for nonexistent weaponId', () => {
    const puss = makeUnit({ type: 'Puss' })
    expect(canTargetWeapon(puss, 'nosuchweapon')).toBe(false)
  })
})

// ─── destroyWeapon ────────────────────────────────────────────────────────────

describe('destroyWeapon', () => {
  it('sets weapon status to destroyed and returns true', () => {
    const unit = makeUnit({ weapons: [makeWeapon({ id: 'main', status: 'ready' })] })
    const result = destroyWeapon(unit, 'main')
    expect(result).toBe(true)
    expect(unit.weapons[0].status).toBe('destroyed')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('is idempotent — returns true on already-destroyed weapon', () => {
    const unit = makeUnit({ weapons: [makeWeapon({ id: 'main', status: 'destroyed' })] })
    const result = destroyWeapon(unit, 'main')
    expect(result).toBe(true)
    expect(unit.weapons[0].status).toBe('destroyed')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('returns false and logs warn when weaponId not found', () => {
    const unit = makeUnit({ weapons: [makeWeapon({ id: 'main' })] })
    const result = destroyWeapon(unit, 'nosuchweapon')
    expect(result).toBe(false)
    expect(unit.weapons[0].status).toBe('ready')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: unit.id, weaponId: 'nosuchweapon' }),
      expect.stringContaining('weapon not found')
    )
  })

  it('only destroys the targeted weapon, not others', () => {
    const unit = makeUnit({
      weapons: [makeWeapon({ id: 'w1' }), makeWeapon({ id: 'w2' })],
    })
    destroyWeapon(unit, 'w1')
    expect(unit.weapons[0].status).toBe('destroyed')
    expect(unit.weapons[1].status).toBe('ready')
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
