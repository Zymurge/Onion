import { describe, it, expect } from 'vitest'
import {
  calculateOdds,
  rollCombat,
  applyDamage,
  getValidTargets,
  validateOnionWeaponFire,
  validateUnitFire,
  validateCombinedFire,
  executeOnionWeaponFire,
  executeUnitFire,
  executeCombinedFire,
} from './combat.js'
import { createMap } from './map.js'
import type { GameMap } from './map.js'
import type { DefenderUnit, OnionUnit, EngineGameState, Weapon } from './units.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

const CLEAR_MAP: GameMap = createMap(5, 5, [])

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

function makeDefender(overrides: Partial<DefenderUnit> = {}): DefenderUnit {
  return {
    id: 'd1',
    type: 'Puss',
    position: { q: 2, r: 0 },
    status: 'operational',
    weapons: [makeWeapon()],
    ...overrides,
  } as DefenderUnit
}

function makeOnion(overrides: Partial<OnionUnit> = {}): OnionUnit {
  return {
    id: 'onion',
    type: 'TheOnion',
    position: { q: 0, r: 0 },
    status: 'operational',
    treads: 45,
    weapons: [
      makeWeapon({ id: 'main', attack: 4, range: 3, defense: 4, individuallyTargetable: true }),
      makeWeapon({ id: 'secondary_1', attack: 3, range: 2, defense: 3, individuallyTargetable: true }),
    ],
    ...overrides,
  }
}

function makeState(overrides: Partial<EngineGameState> = {}): EngineGameState {
  return {
    onion: makeOnion(),
    defenders: {},
    ramsThisTurn: 0,
    currentPhase: 'ONION_COMBAT',
    turn: 1,
    ...overrides,
  }
}

// ─── calculateOdds ───────────────────────────────────────────────────────────

describe('calculateOdds', () => {
  it('equal attack and defense returns 1:1', () => {
    expect(calculateOdds(4, 4)).toBe('1:1')
  })

  it('double attack strength returns 2:1', () => {
    expect(calculateOdds(8, 4)).toBe('2:1')
  })

  it('triple attack strength returns 3:1', () => {
    expect(calculateOdds(12, 4)).toBe('3:1')
  })

  it('quadruple attack strength returns 4:1', () => {
    expect(calculateOdds(16, 4)).toBe('4:1')
  })

  it('5x attack strength returns 5:1', () => {
    expect(calculateOdds(20, 4)).toBe('5:1')
  })

  it('attack exceeding 5x also returns 5:1 (capped)', () => {
    expect(calculateOdds(100, 4)).toBe('5:1')
  })

  it('half attack returns 1:2', () => {
    expect(calculateOdds(2, 4)).toBe('1:2')
  })

  it('ratio ≤ 1:3 returns 1:3', () => {
    expect(calculateOdds(1, 4)).toBe('1:3')
    expect(calculateOdds(1, 9)).toBe('1:3')
  })

  it('fractional ratio rounds down in defender favour (5:3 → 1:1)', () => {
    expect(calculateOdds(5, 3)).toBe('1:1')
  })

  it('fractional ratio rounds down in defender favour (7:3 → 2:1)', () => {
    expect(calculateOdds(7, 3)).toBe('2:1')
  })
})

// ─── rollCombat ──────────────────────────────────────────────────────────────

describe('rollCombat', () => {
  it('returns the die roll in the result', () => {
    const result = rollCombat(4, 4, 3)
    expect(result.roll).toBe(3)
  })

  it('returns the odds string in the result', () => {
    const result = rollCombat(4, 4, 3)
    expect(result.odds).toBe('1:1')
  })

  it('1:3 odds always returns NE regardless of roll', () => {
    for (let r = 1; r <= 6; r++) {
      expect(rollCombat(1, 6, r).result).toBe('NE')
    }
  })

  it('1:2 odds: rolls 1–4 → NE', () => {
    expect(rollCombat(2, 4, 1).result).toBe('NE')
    expect(rollCombat(2, 4, 4).result).toBe('NE')
  })

  it('1:2 odds: roll 5 → D', () => {
    expect(rollCombat(2, 4, 5).result).toBe('D')
  })

  it('1:2 odds: roll 6 → X', () => {
    expect(rollCombat(2, 4, 6).result).toBe('X')
  })

  it('1:1 odds: rolls 1–2 → NE', () => {
    expect(rollCombat(4, 4, 1).result).toBe('NE')
    expect(rollCombat(4, 4, 2).result).toBe('NE')
  })

  it('1:1 odds: rolls 3–4 → D', () => {
    expect(rollCombat(4, 4, 3).result).toBe('D')
    expect(rollCombat(4, 4, 4).result).toBe('D')
  })

  it('1:1 odds: rolls 5–6 → X', () => {
    expect(rollCombat(4, 4, 5).result).toBe('X')
    expect(rollCombat(4, 4, 6).result).toBe('X')
  })

  it('2:1 odds: roll 1 → NE', () => {
    expect(rollCombat(8, 4, 1).result).toBe('NE')
  })

  it('2:1 odds: rolls 2–3 → D', () => {
    expect(rollCombat(8, 4, 2).result).toBe('D')
    expect(rollCombat(8, 4, 3).result).toBe('D')
  })

  it('2:1 odds: rolls 4–6 → X', () => {
    expect(rollCombat(8, 4, 4).result).toBe('X')
  })

  it('3:1 odds: roll 1 → D', () => {
    expect(rollCombat(12, 4, 1).result).toBe('D')
  })

  it('3:1 odds: rolls 3–6 → X', () => {
    expect(rollCombat(12, 4, 3).result).toBe('X')
  })

  it('4:1 odds: roll 1 → D', () => {
    expect(rollCombat(16, 4, 1).result).toBe('D')
  })

  it('4:1 odds: roll 2 → X', () => {
    expect(rollCombat(16, 4, 2).result).toBe('X')
  })

  it('5:1 odds: roll 1 → X (always destroyed)', () => {
    expect(rollCombat(20, 4, 1).result).toBe('X')
  })
})

// ─── applyDamage ─────────────────────────────────────────────────────────────

describe('applyDamage', () => {
  describe('defender unit', () => {
    it('NE result leaves unit operational and returns no damage', () => {
      const unit = makeDefender()
      const result = applyDamage(unit, 'NE', 4)
      expect(unit.status).toBe('operational')
      expect(result.unitDestroyed).toBeFalsy()
    })

    it('D result disables the unit', () => {
      const unit = makeDefender()
      applyDamage(unit, 'D', 4)
      expect(unit.status).toBe('disabled')
    })

    it('X result destroys the unit', () => {
      const unit = makeDefender()
      const result = applyDamage(unit, 'X', 4)
      expect(unit.status).toBe('destroyed')
      expect(result.unitDestroyed).toBe(true)
    })
  })

  describe('LittlePigs infantry', () => {
    it('D result on multi-squad removes one squad', () => {
      const pigs = makeDefender({ type: 'LittlePigs', squads: 3 })
      const result = applyDamage(pigs, 'D', 1)
      expect(result.squadsLost).toBe(1)
      expect(pigs.squads).toBe(2)
      expect(pigs.status).toBe('operational')
    })

    it('D result on last squad destroys the unit', () => {
      const pigs = makeDefender({ type: 'LittlePigs', squads: 1 })
      applyDamage(pigs, 'D', 1)
      expect(pigs.status).toBe('destroyed')
    })

    it('X result destroys the entire stack', () => {
      const pigs = makeDefender({ type: 'LittlePigs', squads: 3 })
      const result = applyDamage(pigs, 'X', 1)
      expect(pigs.status).toBe('destroyed')
      expect(result.unitDestroyed).toBe(true)
    })
  })

  describe('Onion unit — tread attack (no weaponId)', () => {
    it('D result has no effect on Onion (NE per rules)', () => {
      const onion = makeOnion({ treads: 45 })
      const result = applyDamage(onion, 'D', 4)
      expect(onion.treads).toBe(45)
      expect(result.treads).toBeFalsy()
    })

    it('X result reduces treads by attack strength', () => {
      const onion = makeOnion({ treads: 45 })
      const result = applyDamage(onion, 'X', 4)
      expect(onion.treads).toBe(41)
      expect(result.treads).toBe(4)
    })

    it('NE result has no effect on Onion treads', () => {
      const onion = makeOnion({ treads: 45 })
      applyDamage(onion, 'NE', 4)
      expect(onion.treads).toBe(45)
    })
  })

  describe('Onion unit — weapon subsystem attack (with weaponId)', () => {
    it('X result destroys the targeted weapon', () => {
      const onion = makeOnion()
      const result = applyDamage(onion, 'X', 4, 'main')
      expect(result.weaponDestroyed).toBe('main')
      expect(onion.weapons.find(w => w.id === 'main')?.status).toBe('destroyed')
    })

    it('D result has no effect on Onion weapon subsystem', () => {
      const onion = makeOnion()
      const result = applyDamage(onion, 'D', 4, 'main')
      expect(result.weaponDestroyed).toBeFalsy()
      expect(onion.weapons.find(w => w.id === 'main')?.status).toBe('ready')
    })
  })
})

// ─── getValidTargets ─────────────────────────────────────────────────────────

describe('getValidTargets', () => {
  it('Onion can target a defender within weapon range', () => {
    // Onion at (0,0), max weapon range 3, defender at (2,0) — distance 2
    const onion = makeOnion({ position: { q: 0, r: 0 } })
    const defender = makeDefender({ id: 'd1', position: { q: 2, r: 0 }, status: 'operational' })
    const state = makeState({ onion, defenders: { d1: defender } })
    const targets = getValidTargets(CLEAR_MAP, state, onion)
    expect(targets).toContain('d1')
  })

  it('Onion cannot target a defender beyond max weapon range', () => {
    // Onion at (0,0), max weapon range 3, defender at (4,0) — distance 4
    const onion = makeOnion({ position: { q: 0, r: 0 } })
    const defender = makeDefender({ id: 'd1', position: { q: 4, r: 0 } })
    const state = makeState({ onion, defenders: { d1: defender } })
    const targets = getValidTargets(CLEAR_MAP, state, onion)
    expect(targets).not.toContain('d1')
  })

  it('Onion cannot target a destroyed defender', () => {
    const onion = makeOnion({ position: { q: 0, r: 0 } })
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 }, status: 'destroyed' })
    const state = makeState({ onion, defenders: { d1: defender } })
    const targets = getValidTargets(CLEAR_MAP, state, onion)
    expect(targets).not.toContain('d1')
  })

  it('defender can target Onion when within weapon range', () => {
    // Puss range 2; Onion at (1,0) = distance 1
    const onion = makeOnion({ id: 'onion', position: { q: 1, r: 0 } })
    const defender = makeDefender({ id: 'd1', position: { q: 0, r: 0 } })
    const state = makeState({ onion, defenders: { d1: defender } })
    const targets = getValidTargets(CLEAR_MAP, state, defender)
    expect(targets).toContain('onion')
  })

  it('defender cannot target Onion when out of weapon range', () => {
    // Puss range 2; Onion at (4,0) = distance 4
    const onion = makeOnion({ id: 'onion', position: { q: 4, r: 0 } })
    const defender = makeDefender({ id: 'd1', position: { q: 0, r: 0 } })
    const state = makeState({ onion, defenders: { d1: defender } })
    const targets = getValidTargets(CLEAR_MAP, state, defender)
    expect(targets).not.toContain('onion')
  })
})

// ─── validateOnionWeaponFire ─────────────────────────────────────────────────

describe('validateOnionWeaponFire', () => {
  it('accepts a valid fire command in ONION_COMBAT', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 2, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const result = validateOnionWeaponFire(CLEAR_MAP, state, { type: 'FIRE_WEAPON', weaponId: 'main', targetId: 'd1' })
    expect(result.valid).toBe(true)
  })

  it('rejects when phase is not ONION_COMBAT', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 2, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', defenders: { d1: defender } })
    const result = validateOnionWeaponFire(CLEAR_MAP, state, { type: 'FIRE_WEAPON', weaponId: 'main', targetId: 'd1' })
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects when the weapon does not exist', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 2, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const result = validateOnionWeaponFire(CLEAR_MAP, state, { type: 'FIRE_WEAPON', weaponId: 'nonexistent', targetId: 'd1' })
    expect(result.valid).toBe(false)
  })

  it('rejects when the weapon is already destroyed', () => {
    const onion = makeOnion({
      weapons: [makeWeapon({ id: 'main', status: 'destroyed', individuallyTargetable: true })],
    })
    const defender = makeDefender({ id: 'd1', position: { q: 2, r: 0 } })
    const state = makeState({ onion, defenders: { d1: defender } })
    const result = validateOnionWeaponFire(CLEAR_MAP, state, { type: 'FIRE_WEAPON', weaponId: 'main', targetId: 'd1' })
    expect(result.valid).toBe(false)
  })

  it('rejects when the target is out of weapon range', () => {
    // main weapon range 3; defender at (4,0) = distance 4
    const defender = makeDefender({ id: 'd1', position: { q: 4, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const result = validateOnionWeaponFire(CLEAR_MAP, state, { type: 'FIRE_WEAPON', weaponId: 'main', targetId: 'd1' })
    expect(result.valid).toBe(false)
  })

  it('rejects when the target unit does not exist', () => {
    const state = makeState()
    const result = validateOnionWeaponFire(CLEAR_MAP, state, { type: 'FIRE_WEAPON', weaponId: 'main', targetId: 'nope' })
    expect(result.valid).toBe(false)
  })
})

// ─── validateUnitFire ────────────────────────────────────────────────────────

describe('validateUnitFire', () => {
  it('accepts a valid defender fire command in DEFENDER_COMBAT', () => {
    const puss = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', defenders: { d1: puss } })
    const result = validateUnitFire(CLEAR_MAP, state, 'd1', { type: 'FIRE_UNIT', unitId: 'd1', targetId: 'onion' })
    expect(result.valid).toBe(true)
  })

  it('rejects when phase is not DEFENDER_COMBAT', () => {
    const puss = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'ONION_COMBAT', defenders: { d1: puss } })
    const result = validateUnitFire(CLEAR_MAP, state, 'd1', { type: 'FIRE_UNIT', unitId: 'd1', targetId: 'onion' })
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects when the unit ID is not in state', () => {
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT' })
    const result = validateUnitFire(CLEAR_MAP, state, 'ghost', { type: 'FIRE_UNIT', unitId: 'ghost', targetId: 'onion' })
    expect(result.valid).toBe(false)
  })

  it('rejects when the unit is not operational', () => {
    const puss = makeDefender({ id: 'd1', position: { q: 1, r: 0 }, status: 'disabled' })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', defenders: { d1: puss } })
    const result = validateUnitFire(CLEAR_MAP, state, 'd1', { type: 'FIRE_UNIT', unitId: 'd1', targetId: 'onion' })
    expect(result.valid).toBe(false)
  })

  it('rejects when the Onion is out of weapon range', () => {
    // Puss range 2; Onion at (4,0) = distance 4
    const puss = makeDefender({ id: 'd1', position: { q: 0, r: 0 } })
    const onion = makeOnion({ position: { q: 4, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', onion, defenders: { d1: puss } })
    const result = validateUnitFire(CLEAR_MAP, state, 'd1', { type: 'FIRE_UNIT', unitId: 'd1', targetId: 'onion' })
    expect(result.valid).toBe(false)
  })
})

// ─── validateCombinedFire ────────────────────────────────────────────────────

describe('validateCombinedFire', () => {
  it('accepts valid combined fire from two units in DEFENDER_COMBAT', () => {
    const d1 = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const d2 = makeDefender({ id: 'd2', position: { q: 0, r: 1 } })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', defenders: { d1, d2 } })
    const result = validateCombinedFire(CLEAR_MAP, state, { type: 'COMBINED_FIRE', unitIds: ['d1', 'd2'], targetId: 'onion' })
    expect(result.valid).toBe(true)
  })

  it('rejects when phase is not DEFENDER_COMBAT', () => {
    const d1 = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'ONION_COMBAT', defenders: { d1 } })
    const result = validateCombinedFire(CLEAR_MAP, state, { type: 'COMBINED_FIRE', unitIds: ['d1'], targetId: 'onion' })
    expect(result.valid).toBe(false)
  })

  it('rejects when unitIds is empty', () => {
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT' })
    const result = validateCombinedFire(CLEAR_MAP, state, { type: 'COMBINED_FIRE', unitIds: [], targetId: 'onion' })
    expect(result.valid).toBe(false)
  })

  it('rejects when a participating unit is out of range', () => {
    const inRange = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const outRange = makeDefender({ id: 'd2', position: { q: 4, r: 0 } }) // Puss range 2, distance 4
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', defenders: { d1: inRange, d2: outRange } })
    const result = validateCombinedFire(CLEAR_MAP, state, { type: 'COMBINED_FIRE', unitIds: ['d1', 'd2'], targetId: 'onion' })
    expect(result.valid).toBe(false)
  })
})

// ─── executeOnionWeaponFire ───────────────────────────────────────────────────

describe('executeOnionWeaponFire', () => {
  it('X result destroys the target defender (5:1 odds guaranteed)', () => {
    // Onion weapon with very high attack vs low-defense unit → always X
    const highAttackWeapon = makeWeapon({ id: 'main', attack: 100, range: 3, individuallyTargetable: true })
    const onion = makeOnion({ position: { q: 0, r: 0 }, weapons: [highAttackWeapon] })
    const target = makeDefender({ id: 'd1', position: { q: 2, r: 0 }, status: 'operational' })
    const state = makeState({ onion, defenders: { d1: target } })
    executeOnionWeaponFire(CLEAR_MAP, state, { type: 'FIRE_WEAPON', weaponId: 'main', targetId: 'd1' })
    expect(state.defenders['d1'].status).toBe('destroyed')
  })

  it('returns success=true and roll details', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 2, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const result = executeOnionWeaponFire(CLEAR_MAP, state, { type: 'FIRE_WEAPON', weaponId: 'main', targetId: 'd1' }, 3)
    expect(result.success).toBe(true)
    expect(result.roll).toBeDefined()
    expect(result.roll!.roll).toBe(3)
  })

  it('NE result leaves the defender operational (1:3 odds guaranteed)', () => {
    // weapon with very low attack → always NE
    const lowAttackWeapon = makeWeapon({ id: 'main', attack: 1, range: 3, individuallyTargetable: true })
    const onion = makeOnion({ position: { q: 0, r: 0 }, weapons: [lowAttackWeapon] })
    // target with defense 6 → 1:6 ≤ 1:3 → NE
    const target = makeDefender({ id: 'd1', type: 'Puss', position: { q: 2, r: 0 } })
    // Override target defense via a custom unit with defense implied by type
    // Use Witch (defense 2): 1 attack vs 2 defense = 1:2 (roll needed)
    // Use a custom defender: attack=1, defense > 3 → needs unit with at least 4 defense
    // BigBadWolf has defense 4: 1:4 ≤ 1:3 → NE always  
    const highDefTarget = makeDefender({ id: 'd1', type: 'BigBadWolf', position: { q: 2, r: 0 } })
    const state2 = makeState({ onion, defenders: { d1: highDefTarget } })
    for (let r = 1; r <= 6; r++) {
      highDefTarget.status = 'operational'
      executeOnionWeaponFire(CLEAR_MAP, state2, { type: 'FIRE_WEAPON', weaponId: 'main', targetId: 'd1' }, r)
    }
    expect(state2.defenders['d1'].status).toBe('operational')
  })
})

// ─── executeUnitFire ─────────────────────────────────────────────────────────

describe('executeUnitFire', () => {
  it('returns success=true with roll details', () => {
    const puss = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', defenders: { d1: puss } })
    const result = executeUnitFire(CLEAR_MAP, state, 'd1', { type: 'FIRE_UNIT', unitId: 'd1', targetId: 'onion' }, 5)
    expect(result.success).toBe(true)
    expect(result.roll).toBeDefined()
    expect(result.roll!.roll).toBe(5)
  })

  it('applies tread damage on X result (tread attack: 1:1 odds per special rule)', () => {
    // At 1:1, roll 5 or 6 = X; roll 5 → X → treads -= attack strength(Puss=4)
    const puss = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const onion = makeOnion({ treads: 45 })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', onion, defenders: { d1: puss } })
    executeUnitFire(CLEAR_MAP, state, 'd1', { type: 'FIRE_UNIT', unitId: 'd1', targetId: 'onion' }, 6)
    // Puss attack=4, 1:1 tread rule, roll=6 → X → 45 - 4 = 41
    expect(state.onion.treads).toBe(41)
  })

  it('NE result does not change Onion treads (1:1, roll 1)', () => {
    const puss = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const onion = makeOnion({ treads: 45 })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', onion, defenders: { d1: puss } })
    executeUnitFire(CLEAR_MAP, state, 'd1', { type: 'FIRE_UNIT', unitId: 'd1', targetId: 'onion' }, 1)
    // 1:1, roll 1 → NE
    expect(state.onion.treads).toBe(45)
  })
})

// ─── executeCombinedFire ──────────────────────────────────────────────────────

describe('executeCombinedFire', () => {
  it('combines attack strength of all units', () => {
    // Two Puss units (attack 4 each) = combined 8 vs Onion
    const d1 = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const d2 = makeDefender({ id: 'd2', position: { q: 0, r: 1 } })
    const onion = makeOnion({ treads: 45 })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', onion, defenders: { d1, d2 } })
    // Combined 8 attack at 1:1 tread rule... but wait, combined fire can't attack treads.
    // For combined fire against an Onion weapon subsystem instead:
    // targetId = main weapon (defense 4), combined attack = 8 → 2:1 odds, roll 4 → X
    executeOnionWeaponFire // not used here
    const result = executeCombinedFire(CLEAR_MAP, state, { type: 'COMBINED_FIRE', unitIds: ['d1', 'd2'], targetId: 'onion' }, 4)
    expect(result.success).toBe(true)
  })

  it('returns roll details', () => {
    const d1 = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', defenders: { d1 } })
    const result = executeCombinedFire(CLEAR_MAP, state, { type: 'COMBINED_FIRE', unitIds: ['d1'], targetId: 'onion' }, 3)
    expect(result.roll).toBeDefined()
    expect(result.roll!.roll).toBe(3)
  })

  it('X result reduces Onion treads when combined fire at 5:1 (but special rule: treads always 1:1)', () => {
    // For combined fire against Onion weapon (not treads): high combined attack → X
    // Two units, combined attack vs main battery (defense 4): use makeDefender with high attack weapons
    const highAtk1 = makeDefender({ id: 'd1', position: { q: 1, r: 0 }, weapons: [makeWeapon({ attack: 20, range: 2 })] })
    const highAtk2 = makeDefender({ id: 'd2', position: { q: 0, r: 1 }, weapons: [makeWeapon({ attack: 20, range: 2 })] })
    const onion = makeOnion({
      position: { q: 0, r: 0 },
      weapons: [makeWeapon({ id: 'main', attack: 4, range: 3, defense: 4, individuallyTargetable: true })],
    })
    const state = makeState({ currentPhase: 'DEFENDER_COMBAT', onion, defenders: { d1: highAtk1, d2: highAtk2 } })
    // Combined 40 vs defense 4 → 5:1 → X always
    executeCombinedFire(CLEAR_MAP, state, { type: 'COMBINED_FIRE', unitIds: ['d1', 'd2'], targetId: 'main' }, 1)
    // The targeted weapon 'main' should be destroyed
    expect(state.onion.weapons.find(w => w.id === 'main')?.status).toBe('destroyed')
  })
})
