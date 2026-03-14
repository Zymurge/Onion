import { describe, it, expect } from 'vitest'
import {
  getOccupyingUnit,
  isMovementBlocked,
  canMoveThrough,
  calculateRamming,
  getRammedUnits,
  validateOnionMovement,
  validateUnitMovement,
  executeOnionMovement,
  executeUnitMovement,
} from './movement.js'
import { createMap } from './map.js'
import type { GameMap } from './map.js'
import type { DefenderUnit, OnionUnit, EngineGameState } from './units.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** 5×5 all-clear map */
const CLEAR_MAP: GameMap = createMap(5, 5, [])
/** 5×5 map with a crater at (2,2) */
const CRATER_MAP: GameMap = createMap(5, 5, [{ q: 2, r: 2, t: 2 }])

function makeDefender(overrides: Partial<DefenderUnit> = {}): DefenderUnit {
  return {
    id: 'd1',
    type: 'Puss',
    position: { q: 2, r: 2 },
    status: 'operational',
    weapons: [],
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
    weapons: [],
    ...overrides,
  }
}

function makeState(overrides: Partial<EngineGameState> = {}): EngineGameState {
  return {
    onion: makeOnion(),
    defenders: {},
    ramsThisTurn: 0,
    currentPhase: 'ONION_MOVE',
    turn: 1,
    ...overrides,
  }
}

// ─── getOccupyingUnit ────────────────────────────────────────────────────────

describe('getOccupyingUnit', () => {
  it('returns null when no units are at the position', () => {
    const state = makeState()
    expect(getOccupyingUnit(state, { q: 1, r: 1 })).toBeNull()
  })

  it('returns the Onion when it occupies the position', () => {
    const state = makeState({ onion: makeOnion({ position: { q: 1, r: 1 } }) })
    expect(getOccupyingUnit(state, { q: 1, r: 1 })).toBe(state.onion)
  })

  it('returns the defender when it occupies the position', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 3, r: 2 } })
    const state = makeState({ defenders: { d1: defender } })
    expect(getOccupyingUnit(state, { q: 3, r: 2 })).toBe(defender)
  })

  it('returns null when the only occupant is excluded', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 3, r: 2 } })
    const state = makeState({ defenders: { d1: defender } })
    expect(getOccupyingUnit(state, { q: 3, r: 2 }, 'd1')).toBeNull()
  })
})

// ─── isMovementBlocked ───────────────────────────────────────────────────────

describe('isMovementBlocked', () => {
  it('returns false for an empty in-bounds clear hex', () => {
    const state = makeState()
    expect(isMovementBlocked(CLEAR_MAP, state, { q: 1, r: 1 })).toBe(false)
  })

  it('returns true for a crater', () => {
    const state = makeState()
    expect(isMovementBlocked(CRATER_MAP, state, { q: 2, r: 2 })).toBe(true)
  })

  it('returns true for an out-of-bounds position', () => {
    const state = makeState()
    expect(isMovementBlocked(CLEAR_MAP, state, { q: 10, r: 10 })).toBe(true)
  })

  it('returns true when hex is occupied by a unit', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 1 } })
    const state = makeState({ defenders: { d1: defender } })
    expect(isMovementBlocked(CLEAR_MAP, state, { q: 1, r: 1 })).toBe(true)
  })

  it('returns false when the only occupant is excluded', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 1 } })
    const state = makeState({ defenders: { d1: defender } })
    expect(isMovementBlocked(CLEAR_MAP, state, { q: 1, r: 1 }, 'd1')).toBe(false)
  })
})

// ─── canMoveThrough ──────────────────────────────────────────────────────────

describe('canMoveThrough', () => {
  it('returns true when the Onion moves through a defender hex (ramming)', () => {
    const onion = makeOnion()
    const defender = makeDefender()
    expect(canMoveThrough(onion, defender, 'onion')).toBe(true)
  })

  it('returns true when a defender moves through a friendly defender hex', () => {
    const mover = makeDefender({ id: 'd1' })
    const occupier = makeDefender({ id: 'd2' })
    expect(canMoveThrough(mover, occupier, 'defender')).toBe(true)
  })

  it('returns false when a defender tries to move through the Onion hex', () => {
    const mover = makeDefender()
    const onion = makeOnion()
    expect(canMoveThrough(mover, onion, 'defender')).toBe(false)
  })
})

// ─── calculateRamming ────────────────────────────────────────────────────────

describe('calculateRamming', () => {
  it('LittlePigs: treadCost is 0 and roll 1–4 destroys the unit', () => {
    const pigs = makeDefender({ type: 'LittlePigs' })
    expect(calculateRamming(pigs, 1)).toEqual({ treadCost: 0, destroyed: true })
    expect(calculateRamming(pigs, 4)).toEqual({ treadCost: 0, destroyed: true })
  })

  it('LittlePigs: treadCost is 0 and roll 5–6 does not destroy', () => {
    const pigs = makeDefender({ type: 'LittlePigs' })
    expect(calculateRamming(pigs, 5)).toEqual({ treadCost: 0, destroyed: false })
    expect(calculateRamming(pigs, 6)).toEqual({ treadCost: 0, destroyed: false })
  })

  it('armor unit (Puss): treadCost is 1 and roll 1–4 destroys', () => {
    const puss = makeDefender({ type: 'Puss' })
    expect(calculateRamming(puss, 1)).toEqual({ treadCost: 1, destroyed: true })
    expect(calculateRamming(puss, 4)).toEqual({ treadCost: 1, destroyed: true })
  })

  it('armor unit (Puss): treadCost is 1 and roll 5–6 does not destroy', () => {
    const puss = makeDefender({ type: 'Puss' })
    expect(calculateRamming(puss, 5)).toEqual({ treadCost: 1, destroyed: false })
    expect(calculateRamming(puss, 6)).toEqual({ treadCost: 1, destroyed: false })
  })

  it('Dragon: treadCost is 2 and roll 1–4 destroys', () => {
    const dragon = makeDefender({ type: 'Dragon' })
    expect(calculateRamming(dragon, 1)).toEqual({ treadCost: 2, destroyed: true })
    expect(calculateRamming(dragon, 4)).toEqual({ treadCost: 2, destroyed: true })
  })

  it('Dragon: treadCost is 2 and roll 5–6 does not destroy', () => {
    const dragon = makeDefender({ type: 'Dragon' })
    expect(calculateRamming(dragon, 5)).toEqual({ treadCost: 2, destroyed: false })
    expect(calculateRamming(dragon, 6)).toEqual({ treadCost: 2, destroyed: false })
  })
})

// ─── getRammedUnits ──────────────────────────────────────────────────────────

describe('getRammedUnits', () => {
  it('returns empty array for an empty path', () => {
    const state = makeState()
    expect(getRammedUnits(CLEAR_MAP, state, [])).toEqual([])
  })

  it('returns empty array when no defenders lie on the path', () => {
    const state = makeState()
    const path = [{ q: 1, r: 0 }, { q: 2, r: 0 }]
    expect(getRammedUnits(CLEAR_MAP, state, path)).toEqual([])
  })

  it('returns the unit ID when a defender lies on the path', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const path = [{ q: 1, r: 0 }, { q: 2, r: 0 }]
    expect(getRammedUnits(CLEAR_MAP, state, path)).toEqual(['d1'])
  })

  it('returns multiple IDs when multiple defenders lie on the path', () => {
    const d1 = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const d2 = makeDefender({ id: 'd2', position: { q: 2, r: 0 } })
    const state = makeState({ defenders: { d1, d2 } })
    const path = [{ q: 1, r: 0 }, { q: 2, r: 0 }]
    const result = getRammedUnits(CLEAR_MAP, state, path)
    expect(result).toHaveLength(2)
    expect(result).toContain('d1')
    expect(result).toContain('d2')
  })
})

// ─── validateOnionMovement ───────────────────────────────────────────────────

describe('validateOnionMovement', () => {
  it('accepts a valid move to an adjacent empty hex', () => {
    const state = makeState()
    const result = validateOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(true)
  })

  it('rejects when the current phase is not ONION_MOVE', () => {
    const state = makeState({ currentPhase: 'ONION_COMBAT' })
    const result = validateOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects when the Onion has 0 treads (MA = 0)', () => {
    const state = makeState({ onion: makeOnion({ treads: 0 }) })
    const result = validateOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(false)
  })

  it('rejects when the destination is out of bounds', () => {
    const state = makeState()
    const result = validateOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 10, r: 10 } })
    expect(result.valid).toBe(false)
  })

  it('rejects when ramsThisTurn is already 2 and a defender is on the path', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ ramsThisTurn: 2, defenders: { d1: defender } })
    const result = validateOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(false)
  })

  it('accepts a path with one ram when ramsThisTurn is 0', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const result = validateOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(true)
  })

  it('rejects when the path would require more than 2 rams total', () => {
    // Onion at (0,0), 3 defenders at (1,0) (2,0) (3,0) — all must be rammed
    const d1 = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const d2 = makeDefender({ id: 'd2', position: { q: 2, r: 0 } })
    const d3 = makeDefender({ id: 'd3', position: { q: 3, r: 0 } })
    const state = makeState({ defenders: { d1, d2, d3 } })
    const result = validateOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 3, r: 0 } })
    expect(result.valid).toBe(false)
  })
})

// ─── validateUnitMovement ────────────────────────────────────────────────────

describe('validateUnitMovement', () => {
  it('accepts a valid Puss move in DEFENDER_MOVE phase', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: defender } })
    const result = validateUnitMovement(CLEAR_MAP, state, 'd1', { type: 'MOVE_UNIT', unitId: 'd1', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(true)
  })

  it('rejects when the phase is ONION_MOVE', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'ONION_MOVE', defenders: { d1: defender } })
    const result = validateUnitMovement(CLEAR_MAP, state, 'd1', { type: 'MOVE_UNIT', unitId: 'd1', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(false)
  })

  it('rejects when the unit ID is not in state', () => {
    const state = makeState({ currentPhase: 'DEFENDER_MOVE' })
    const result = validateUnitMovement(CLEAR_MAP, state, 'missing', { type: 'MOVE_UNIT', unitId: 'missing', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(false)
  })

  it('rejects when the unit is immobile (LordFarquaad)', () => {
    const farquaad = makeDefender({ id: 'f1', type: 'LordFarquaad', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { f1: farquaad } })
    const result = validateUnitMovement(CLEAR_MAP, state, 'f1', { type: 'MOVE_UNIT', unitId: 'f1', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(false)
  })

  it('rejects when the unit is not operational', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 0, r: 0 }, status: 'disabled' })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: defender } })
    const result = validateUnitMovement(CLEAR_MAP, state, 'd1', { type: 'MOVE_UNIT', unitId: 'd1', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(false)
  })

  it('BigBadWolf uses movement allowance of 4 in DEFENDER_MOVE', () => {
    const wolf = makeDefender({ id: 'w1', type: 'BigBadWolf', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { w1: wolf } })
    // 4 hexes away — valid with MA=4, invalid with MA=3
    const result = validateUnitMovement(CLEAR_MAP, state, 'w1', { type: 'MOVE_UNIT', unitId: 'w1', to: { q: 4, r: 0 } })
    expect(result.valid).toBe(true)
  })

  it('BigBadWolf uses secondMoveAllowance of 3 in GEV_SECOND_MOVE', () => {
    const wolf = makeDefender({ id: 'w1', type: 'BigBadWolf', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'GEV_SECOND_MOVE', defenders: { w1: wolf } })
    // 3 hexes away — valid with MA=3
    const result = validateUnitMovement(CLEAR_MAP, state, 'w1', { type: 'MOVE_UNIT', unitId: 'w1', to: { q: 3, r: 0 } })
    expect(result.valid).toBe(true)
  })

  it('rejects a non-GEV unit moving in GEV_SECOND_MOVE phase', () => {
    const puss = makeDefender({ id: 'd1', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'GEV_SECOND_MOVE', defenders: { d1: puss } })
    const result = validateUnitMovement(CLEAR_MAP, state, 'd1', { type: 'MOVE_UNIT', unitId: 'd1', to: { q: 1, r: 0 } })
    expect(result.valid).toBe(false)
  })
})

// ─── executeOnionMovement ────────────────────────────────────────────────────

describe('executeOnionMovement', () => {
  it('updates the Onion position to the destination', () => {
    const state = makeState()
    executeOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(state.onion.position).toEqual({ q: 1, r: 0 })
  })

  it('returns success=true with the new position', () => {
    const state = makeState()
    const result = executeOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(result.success).toBe(true)
    expect(result.newPosition).toEqual({ q: 1, r: 0 })
  })

  it('increments ramsThisTurn when a defender is on the path', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    executeOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(state.ramsThisTurn).toBe(1)
  })

  it('deducts tread cost for each rammed armor unit', () => {
    const puss = makeDefender({ id: 'd1', type: 'Puss', position: { q: 1, r: 0 } })
    const state = makeState({ defenders: { d1: puss } })
    executeOnionMovement(CLEAR_MAP, state, { type: 'MOVE_ONION', to: { q: 1, r: 0 } })
    expect(state.onion.treads).toBe(44) // 45 - 1 for Puss
  })
})

// ─── executeUnitMovement ─────────────────────────────────────────────────────

describe('executeUnitMovement', () => {
  it('updates the defender position to the destination', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 1 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: defender } })
    executeUnitMovement(CLEAR_MAP, state, 'd1', { type: 'MOVE_UNIT', unitId: 'd1', to: { q: 2, r: 1 } })
    expect(state.defenders['d1'].position).toEqual({ q: 2, r: 1 })
  })

  it('returns success=true with the new position', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 1 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: defender } })
    const result = executeUnitMovement(CLEAR_MAP, state, 'd1', { type: 'MOVE_UNIT', unitId: 'd1', to: { q: 2, r: 1 } })
    expect(result.success).toBe(true)
    expect(result.newPosition).toEqual({ q: 2, r: 1 })
  })

  it('does not affect other units', () => {
    const d1 = makeDefender({ id: 'd1', position: { q: 1, r: 1 } })
    const d2 = makeDefender({ id: 'd2', position: { q: 3, r: 3 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1, d2 } })
    executeUnitMovement(CLEAR_MAP, state, 'd1', { type: 'MOVE_UNIT', unitId: 'd1', to: { q: 2, r: 1 } })
    expect(state.defenders['d2'].position).toEqual({ q: 3, r: 3 })
  })
})
