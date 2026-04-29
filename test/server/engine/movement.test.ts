import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getOccupyingUnit,
  isMovementBlocked,
  canMoveThrough,
  calculateRamming,
  getRammedUnits,
  validateUnitMovement,
  executeUnitMovement,
} from '#server/engine/movement'
import { createMap } from '#server/engine/map'
import type { GameMap } from '#server/engine/map'
import type { MovementPlan } from '#server/engine/movement'
import type { DefenderUnit, OnionUnit, EngineGameState } from '#server/engine/units'
import logger from '#server/logger'
import { buildStackRosterFromUnits } from '#shared/stackRoster'

let infoSpy: any, warnSpy: any, errorSpy: any;

beforeEach(() => {
  infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

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
  const defenders = overrides.defenders ?? {}
  return {
    onion: makeOnion(),
    defenders,
    ramsThisTurn: 0,
    currentPhase: 'ONION_MOVE',
    turn: 1,
    stackRoster: overrides.stackRoster ?? buildStackRosterFromUnits(Object.values(defenders)),
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

  it('ignores destroyed defenders on the path', () => {
    const liveDefender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const destroyedDefender = makeDefender({ id: 'd2', position: { q: 1, r: 0 }, status: 'destroyed' })
    const state = makeState({ defenders: { d1: liveDefender, d2: destroyedDefender } })
    const path = [{ q: 1, r: 0 }]

    expect(getRammedUnits(CLEAR_MAP, state, path)).toEqual(['d1'])
  })
})

// ─── validateUnitMovement ────────────────────────────────────────────────────

describe('validateUnitMovement', () => {
  it('returns a validated plan for a treaded ram-capable unit', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'onion', to: { q: 2, r: 0 } })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(`Expected validated plan, got ${result.code}`)
    }
    expect(result.plan.unitId).toBe('onion')
    expect(result.plan.from).toEqual({ q: 0, r: 0 })
    expect(result.plan.to).toEqual({ q: 2, r: 0 })
    expect(result.plan.rammedUnitIds).toEqual(['d1'])
    expect(result.plan.ramCapacityUsed).toBe(1)
    expect(result.plan.treadCost).toBe(1)
    expect(result.plan.capabilities.canRam).toBe(true)
    expect(result.plan.capabilities.hasTreads).toBe(true)
  })

  it('allows Onion to move into an occupied defender destination as a ram', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'onion', to: { q: 1, r: 0 } })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(`Expected validated plan, got ${result.code}`)
    }
    expect(result.plan.rammedUnitIds).toEqual(['d1'])
    expect(result.plan.ramCapacityUsed).toBe(1)
    expect(result.plan.treadCost).toBe(1)
  })

  it('returns WRONG_PHASE for a defender unit in ONION_MOVE', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'ONION_MOVE', defenders: { d1: defender } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'd1', to: { q: 1, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'WRONG_PHASE',
      error: expect.any(String),
    })
  })

  it('returns UNIT_NOT_FOUND when the unit ID does not exist', () => {
    const state = makeState({ currentPhase: 'DEFENDER_MOVE' })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'missing', to: { q: 1, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'UNIT_NOT_FOUND',
      error: expect.any(String),
    })
  })

  it('returns UNIT_IMMOBILE when the unit cannot move', () => {
    const farquaad = makeDefender({ id: 'f1', type: 'LordFarquaad', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { f1: farquaad } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'f1', to: { q: 1, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'UNIT_IMMOBILE',
      error: expect.any(String),
    })
  })

  it('returns UNIT_NOT_OPERATIONAL when the unit is disabled', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 0, r: 0 }, status: 'disabled' })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: defender } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'd1', to: { q: 1, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'UNIT_NOT_OPERATIONAL',
      error: expect.any(String),
    })
  })

  it('returns a validated plan using second move allowance when applicable', () => {
    const wolf = makeDefender({ id: 'w1', type: 'BigBadWolf', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'GEV_SECOND_MOVE', defenders: { w1: wolf } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'w1', to: { q: 3, r: 0 } })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(`Expected validated plan, got ${result.code}`)
    }
    expect(result.plan.movementAllowance).toBe(3)
    expect(result.plan.capabilities.canSecondMove).toBe(true)
  })

  it('returns SECOND_MOVE_NOT_ALLOWED for a non-GEV unit in GEV_SECOND_MOVE', () => {
    const puss = makeDefender({ id: 'd1', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'GEV_SECOND_MOVE', defenders: { d1: puss } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'd1', to: { q: 1, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'SECOND_MOVE_NOT_ALLOWED',
      error: expect.any(String),
    })
  })

  it('returns RAM_LIMIT_EXCEEDED when a ram-capable unit would exceed the turn limit', () => {
    const d1 = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const d2 = makeDefender({ id: 'd2', position: { q: 2, r: 0 } })
    const d3 = makeDefender({ id: 'd3', position: { q: 4, r: 0 } })
    const state = makeState({ ramsThisTurn: 1, defenders: { d1, d2, d3 } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'onion', to: { q: 3, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'RAM_LIMIT_EXCEEDED',
      error: expect.any(String),
    })
  })

  it('allows an Onion move to skip ramming when attemptRam is false', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ ramsThisTurn: 1, defenders: { d1: defender } })

    const result = validateUnitMovement(CLEAR_MAP, state, {
      type: 'MOVE',
      unitId: 'onion',
      to: { q: 1, r: 0 },
      attemptRam: false,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(`Expected validated plan, got ${result.code}`)
    }
    expect(result.plan.rammedUnitIds).toEqual([])
    expect(result.plan.ramCapacityUsed).toBe(0)
    expect(result.plan.treadCost).toBe(0)
  })

  it('ignores destroyed defenders when counting rams on the path', () => {
    const liveDefender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const destroyedDefender = makeDefender({ id: 'd2', position: { q: 1, r: 0 }, status: 'destroyed' })
    const state = makeState({ ramsThisTurn: 1, defenders: { d1: liveDefender, d2: destroyedDefender } })

    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'onion', to: { q: 1, r: 0 } })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(`Expected validated plan, got ${result.code}`)
    }
    expect(result.plan.rammedUnitIds).toEqual(['d1'])
    expect(result.plan.ramCapacityUsed).toBe(1)
  })

  it('returns HEX_OCCUPIED when a defender tries to end movement in an occupied hex', () => {
    const mover = makeDefender({ id: 'd1', type: 'Puss', position: { q: 0, r: 0 } })
    const occupier = makeDefender({ id: 'd2', type: 'BigBadWolf', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: mover, d2: occupier } })

    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'd1', to: { q: 1, r: 0 } })
    expect(result).toEqual({
      ok: false,
      code: 'HEX_OCCUPIED',
      error: expect.any(String),
    })
  })

  it('allows Little Pigs to stack when member count stays within limit', () => {
    const pigsA = makeDefender({ id: 'p1', type: 'LittlePigs', squads: 2, position: { q: 0, r: 0 } })
    const pigsB = makeDefender({ id: 'p2', type: 'LittlePigs', squads: 3, position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1: pigsA, p2: pigsB } })

    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'p1', to: { q: 1, r: 0 } })
    expect(result.ok).toBe(true)
  })

  it('returns HEX_OCCUPIED when Little Pigs member count would exceed stack limit', () => {
    const pigsA = makeDefender({ id: 'p1', type: 'LittlePigs', squads: 3, position: { q: 0, r: 0 } })
    const pigsB = makeDefender({ id: 'p2', type: 'LittlePigs', squads: 3, position: { q: 1, r: 0 } })
    const pigsC = makeDefender({ id: 'p3', type: 'LittlePigs', squads: 8, position: { q: 1, r: 0 } })
    const pigsD = makeDefender({ id: 'p4', type: 'LittlePigs', squads: 1, position: { q: 1, r: 0 } })
    const pigsE = makeDefender({ id: 'p5', type: 'LittlePigs', squads: 4, position: { q: 1, r: 0 } })
    const pigsF = makeDefender({ id: 'p6', type: 'LittlePigs', squads: 2, position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1: pigsA, p2: pigsB, p3: pigsC, p4: pigsD, p5: pigsE, p6: pigsF } })

    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'p1', to: { q: 1, r: 0 } })
    expect(result).toEqual({
      ok: false,
      code: 'HEX_OCCUPIED',
      error: expect.any(String),
    })
  })
})

// ─── executeUnitMovement ─────────────────────────────────────────────────────

describe('executeUnitMovement', () => {
  function makePlan(overrides: Partial<MovementPlan> = {}): MovementPlan {
    return {
      unitId: 'd1',
      from: { q: 1, r: 1 },
      to: { q: 2, r: 1 },
      path: [{ q: 2, r: 1 }],
      cost: 1,
      movementAllowance: 3,
      rammedUnitIds: [],
      ramCapacityUsed: 0,
      treadCost: 0,
      capabilities: {
        canRam: false,
        hasTreads: false,
        canSecondMove: false,
      },
      ...overrides,
    }
  }

  it('moves a defender using a validated plan', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 1 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: defender } })
    const result = executeUnitMovement(state, makePlan())

    expect(state.defenders['d1'].position).toEqual({ q: 2, r: 1 })
    expect(result.success).toBe(true)
    expect(result.newPosition).toEqual({ q: 2, r: 1 })
  })

  it('updates ram usage for a ram-capable move plan', () => {
    const defender = makeDefender({ id: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const plan = makePlan({
      unitId: 'onion',
      from: { q: 0, r: 0 },
      to: { q: 1, r: 0 },
      path: [{ q: 1, r: 0 }],
      rammedUnitIds: ['d1'],
      ramCapacityUsed: 1,
      treadCost: 1,
      capabilities: {
        canRam: true,
        hasTreads: true,
        canSecondMove: false,
      },
    })

    const result = executeUnitMovement(state, plan)

    expect(state.onion.position).toEqual({ q: 1, r: 0 })
    expect(state.ramsThisTurn).toBe(1)
    expect(state.onion.treads).toBe(44)
    expect(result.success).toBe(true)
    expect(result.rammedUnitIds).toEqual(['d1'])
    expect(result.ramCapacityUsed).toBe(1)
    expect(result.treadDamage).toBe(1)
    expect(result.rammedUnitResults).toHaveLength(1)
    expect(result.rammedUnitResults?.[0]).toEqual(
      expect.objectContaining({
        unitId: 'd1',
        unitType: 'Puss',
        outcome: expect.objectContaining({
          treadCost: 1,
          roll: expect.any(Number),
          effect: expect.stringMatching(/^(destroyed|survived)$/),
        }),
      }),
    )
  })

  it('preserves and advances stack names when a stacked Little Pigs unit moves away', () => {
    const movingPig = makeDefender({ id: 'p1', type: 'LittlePigs', squads: 2, position: { q: 0, r: 0 } })
    const remainingPig = makeDefender({ id: 'p2', type: 'LittlePigs', squads: 3, position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1: movingPig, p2: remainingPig } }) as EngineGameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group'],
    }
    state.stackRoster = {
      groupsById: {
        'LittlePigs:0,0': {
          groupName: 'Little Pigs group',
          unitType: 'LittlePigs',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2'],
        },
      },
    }

    const result = executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }))

    expect(result.success).toBe(true)
    expect(state.defenders.p1.position).toEqual({ q: 1, r: 0 })
    expect(state.stackRoster?.groupsById['LittlePigs:0,0']).toBeUndefined()
    expect((state as EngineGameState & { stackNaming?: { groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>; usedGroupNames: string[] } }).stackNaming?.groupsInUse).toEqual([])
    expect((state as EngineGameState & { stackNaming?: { groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>; usedGroupNames: string[] } }).stackNaming?.usedGroupNames).toEqual([
      'Little Pigs group 1',
    ])
  })

  it('reforms a stack as sequential movers arrive on the same destination hex', () => {
    const p1 = makeDefender({ id: 'p1', type: 'LittlePigs', squads: 2, position: { q: 0, r: 0 } })
    const p2 = makeDefender({ id: 'p2', type: 'LittlePigs', squads: 3, position: { q: 0, r: 0 } })
    const p3 = makeDefender({ id: 'p3', type: 'LittlePigs', squads: 1, position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1, p2, p3 } }) as EngineGameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group'],
    }
    state.stackRoster = {
      groupsById: {
        'LittlePigs:0,0': {
          groupName: 'Little Pigs group',
          unitType: 'LittlePigs',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2', 'p3'],
        },
      },
    }

    expect(executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 5, r: 4 } })).success).toBe(true)
    expect(state.stackRoster?.groupsById['LittlePigs:5,4']).toMatchObject({
      groupName: 'Little Pigs group',
      unitIds: ['p1'],
    })

    expect(executeUnitMovement(state, makePlan({ unitId: 'p2', from: { q: 0, r: 0 }, to: { q: 5, r: 4 } })).success).toBe(true)
    expect(state.stackRoster?.groupsById['LittlePigs:5,4']).toMatchObject({
      groupName: 'Little Pigs group',
      unitIds: ['p1', 'p2'],
    })

    expect(executeUnitMovement(state, makePlan({ unitId: 'p3', from: { q: 0, r: 0 }, to: { q: 5, r: 4 } })).success).toBe(true)
    expect(state.stackRoster?.groupsById['LittlePigs:5,4']).toMatchObject({
      groupName: 'Little Pigs group',
      unitIds: ['p1', 'p2', 'p3'],
    })
    expect(state.stackRoster?.groupsById['LittlePigs:0,0']).toBeUndefined()
  })

  it('retires a stacked group when the last unit in it is destroyed', () => {
    const doomedPig = makeDefender({ id: 'p1', type: 'LittlePigs', squads: 1, position: { q: 1, r: 0 }, status: 'destroyed' })
    const state = makeState({ currentPhase: 'ONION_MOVE', defenders: { p1: doomedPig } }) as EngineGameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [{ groupKey: 'LittlePigs:1,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group 1'],
    }
    state.stackRoster = { groupsById: {} }

    const result = executeUnitMovement(state, makePlan({ unitId: 'onion', from: { q: 0, r: 0 }, to: { q: 2, r: 0 } }))

    expect(result.success).toBe(true)
    expect(state.stackNaming?.groupsInUse).toEqual([])
    expect(state.stackNaming?.usedGroupNames).toEqual(['Little Pigs group 1'])
  })

  it('keeps the older group name when two Little Pigs end on the same hex', () => {
    const olderPig = makeDefender({ id: 'p1', type: 'LittlePigs', squads: 2, position: { q: 0, r: 0 } })
    const newerPig = makeDefender({ id: 'p2', type: 'LittlePigs', squads: 3, position: { q: 2, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1: olderPig, p2: newerPig } }) as EngineGameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
        { groupKey: 'LittlePigs:2,0', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1', 'Little Pigs group 2'],
    }
    state.stackRoster = {
      groupsById: {
        'merged-group': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2'],
        },
      },
    }

    const result = executeUnitMovement(state, makePlan({ unitId: 'p2', from: { q: 2, r: 0 }, to: { q: 0, r: 0 } }))

    expect(result.success).toBe(true)
    expect(state.defenders.p2.position).toEqual({ q: 0, r: 0 })
    expect(state.stackNaming?.groupsInUse).toEqual([
      { groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
    ])
    expect(state.stackNaming?.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2'])
  })
})
