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
import type { GameState } from '#server/engine/units'
import logger from '#server/logger'
import { buildStackRosterFromUnits } from '#shared/stackRoster'
import { makeDefender, makeGameState, makeOnion, makeStackGroup, makeStackRoster } from '#test/utils/gameStateUtils'
import { createRollQueue } from '#test/utils/rollQueue'

let infoSpy: { mockRestore: () => void }, warnSpy: { mockRestore: () => void }, errorSpy: { mockRestore: () => void };

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

type MovementStateOverrides = Partial<GameState> & { ramsRemaining?: number }

function makeState({ ramsRemaining = 2, ...overrides }: MovementStateOverrides = {}): GameState {
  const defenders = overrides.defenders ?? {}
  return makeGameState({
    onions: { onion: makeOnion({ unitId: 'onion', ramsRemaining }) },
    defenders,
    currentPhase: 'ONION_MOVE',
    turn: 1,
    stackRoster: overrides.stackRoster ?? buildStackRosterFromUnits(Object.values(defenders)),
    ...overrides,
  })
}

// ─── getOccupyingUnit ────────────────────────────────────────────────────────

describe('getOccupyingUnit', () => {
  it('returns null when no units are at the position', () => {
    const state = makeState()
    expect(getOccupyingUnit(state, { q: 1, r: 1 })).toBeNull()
  })

  it('returns the Onion when it occupies the position', () => {
    const state = makeState({ onions: { onion: makeOnion({ unitId: 'onion', position: { q: 1, r: 1 } }) } })
    expect(getOccupyingUnit(state, { q: 1, r: 1 })).toBe(state.onions.onion)
  })

  it('returns the defender when it occupies the position', () => {
    const defender = makeDefender({ unitId: 'd1', position: { q: 3, r: 2 } })
    const state = makeState({ defenders: { d1: defender } })
    expect(getOccupyingUnit(state, { q: 3, r: 2 })).toBe(defender)
  })

  it('returns null when the only occupant is excluded', () => {
    const defender = makeDefender({ unitId: 'd1', position: { q: 3, r: 2 } })
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
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 1 } })
    const state = makeState({ defenders: { d1: defender } })
    expect(isMovementBlocked(CLEAR_MAP, state, { q: 1, r: 1 })).toBe(true)
  })

  it('returns false when the only occupant is excluded', () => {
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 1 } })
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
    const mover = makeDefender({ unitId: 'd1' })
    const occupier = makeDefender({ unitId: 'd2' })
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
    const pigs = makeDefender({ typeId: 'LittlePigs' })
    expect(calculateRamming(pigs, 1)).toEqual({ treadCost: 0, destroyed: true })
    expect(calculateRamming(pigs, 4)).toEqual({ treadCost: 0, destroyed: true })
  })

  it('LittlePigs: treadCost is 0 and roll 5–6 does not destroy', () => {
    const pigs = makeDefender({ typeId: 'LittlePigs' })
    expect(calculateRamming(pigs, 5)).toEqual({ treadCost: 0, destroyed: false })
    expect(calculateRamming(pigs, 6)).toEqual({ treadCost: 0, destroyed: false })
  })

  it('armor unit (Puss): treadCost is 1 and roll 1–4 destroys', () => {
    const puss = makeDefender({ typeId: 'Puss' })
    expect(calculateRamming(puss, 1)).toEqual({ treadCost: 1, destroyed: true })
    expect(calculateRamming(puss, 4)).toEqual({ treadCost: 1, destroyed: true })
  })

  it('armor unit (Puss): treadCost is 1 and roll 5–6 does not destroy', () => {
    const puss = makeDefender({ typeId: 'Puss' })
    expect(calculateRamming(puss, 5)).toEqual({ treadCost: 1, destroyed: false })
    expect(calculateRamming(puss, 6)).toEqual({ treadCost: 1, destroyed: false })
  })

  it('Dragon: treadCost is 2 and roll 1–4 destroys', () => {
    const dragon = makeDefender({ typeId: 'Dragon' })
    expect(calculateRamming(dragon, 1)).toEqual({ treadCost: 2, destroyed: true })
    expect(calculateRamming(dragon, 4)).toEqual({ treadCost: 2, destroyed: true })
  })

  it('Dragon: treadCost is 2 and roll 5–6 does not destroy', () => {
    const dragon = makeDefender({ typeId: 'Dragon' })
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
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ defenders: { d1: defender } })
    const path = [{ q: 1, r: 0 }, { q: 2, r: 0 }]
    expect(getRammedUnits(CLEAR_MAP, state, path)).toEqual(['d1'])
  })

  it('returns multiple IDs when multiple defenders lie on the path', () => {
    const d1 = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
    const d2 = makeDefender({ unitId: 'd2', position: { q: 2, r: 0 } })
    const state = makeState({ defenders: { d1, d2 } })
    const path = [{ q: 1, r: 0 }, { q: 2, r: 0 }]
    const result = getRammedUnits(CLEAR_MAP, state, path)
    expect(result).toHaveLength(2)
    expect(result).toContain('d1')
    expect(result).toContain('d2')
  })

  it('ignores destroyed defenders on the path', () => {
    const liveDefender = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
    const destroyedDefender = makeDefender({ unitId: 'd2', position: { q: 1, r: 0 }, state: 'destroyed' })
    const state = makeState({ defenders: { d1: liveDefender, d2: destroyedDefender } })
    const path = [{ q: 1, r: 0 }]

    expect(getRammedUnits(CLEAR_MAP, state, path)).toEqual(['d1'])
  })
})

// ─── validateUnitMovement ────────────────────────────────────────────────────

describe('validateUnitMovement', () => {
  it('returns a validated plan for a treaded ram-capable unit', () => {
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
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
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
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
    const defender = makeDefender({ unitId: 'd1', position: { q: 0, r: 0 } })
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
    const farquaad = makeDefender({ unitId: 'f1', typeId: 'LordFarquaad', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { f1: farquaad } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'f1', to: { q: 1, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'UNIT_IMMOBILE',
      error: expect.any(String),
    })
  })

  it('returns UNIT_NOT_OPERATIONAL when the unit is disabled', () => {
    const defender = makeDefender({ unitId: 'd1', position: { q: 0, r: 0 }, state: 'disabled' })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: defender } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'd1', to: { q: 1, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'UNIT_NOT_OPERATIONAL',
      error: expect.any(String),
    })
  })

  it('returns a validated plan using second move allowance when applicable', () => {
    const wolf = makeDefender({ unitId: 'w1', typeId: 'BigBadWolf', position: { q: 0, r: 0 } })
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
    const puss = makeDefender({ unitId: 'd1', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'GEV_SECOND_MOVE', defenders: { d1: puss } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'd1', to: { q: 1, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'SECOND_MOVE_NOT_ALLOWED',
      error: expect.any(String),
    })
  })

  it('returns RAM_LIMIT_EXCEEDED when a ram-capable unit would exceed the turn limit', () => {
    const d1 = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
    const d2 = makeDefender({ unitId: 'd2', position: { q: 2, r: 0 } })
    const d3 = makeDefender({ unitId: 'd3', position: { q: 4, r: 0 } })
    const state = makeState({ ramsRemaining: 1, defenders: { d1, d2, d3 } })
    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'onion', to: { q: 3, r: 0 } })

    expect(result).toEqual({
      ok: false,
      code: 'RAM_LIMIT_EXCEEDED',
      error: expect.any(String),
    })
  })

  it('allows an Onion move to skip ramming when attemptRam is false', () => {
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
    const state = makeState({ ramsRemaining: 1, defenders: { d1: defender } })

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
    const liveDefender = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
    const destroyedDefender = makeDefender({ unitId: 'd2', position: { q: 1, r: 0 }, state: 'destroyed' })
    const state = makeState({ ramsRemaining: 1, defenders: { d1: liveDefender, d2: destroyedDefender } })

    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'onion', to: { q: 1, r: 0 } })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error(`Expected validated plan, got ${result.code}`)
    }
    expect(result.plan.rammedUnitIds).toEqual(['d1'])
    expect(result.plan.ramCapacityUsed).toBe(1)
  })

  it('returns HEX_OCCUPIED when a defender tries to end movement in an occupied hex', () => {
    const mover = makeDefender({ unitId: 'd1', typeId: 'Puss', position: { q: 0, r: 0 } })
    const occupier = makeDefender({ unitId: 'd2', typeId: 'BigBadWolf', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: mover, d2: occupier } })

    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'd1', to: { q: 1, r: 0 } })
    expect(result).toEqual({
      ok: false,
      code: 'HEX_OCCUPIED',
      error: expect.any(String),
    })
  })

  it('allows Little Pigs to stack when member count stays within limit', () => {
    const pigsA = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const pigsB = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1: pigsA, p2: pigsB } })

    const result = validateUnitMovement(CLEAR_MAP, state, { type: 'MOVE', unitId: 'p1', to: { q: 1, r: 0 } })
    expect(result.ok).toBe(true)
  })

  it('returns HEX_OCCUPIED when Little Pigs member count would exceed stack limit', () => {
    const pigsA = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const pigsB = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
    const pigsC = makeDefender({ unitId: 'p3', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
    const pigsD = makeDefender({ unitId: 'p4', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
    const pigsE = makeDefender({ unitId: 'p5', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
    const pigsF = makeDefender({ unitId: 'p6', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
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
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 1 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { d1: defender } })
    const result = executeUnitMovement(state, makePlan())

    expect(state.defenders['d1'].position).toEqual({ q: 2, r: 1 })
    expect(result.success).toBe(true)
    expect(result.newPosition).toEqual({ q: 2, r: 1 })
  })

  it('updates ram usage for a ram-capable move plan', () => {
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
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

    expect(state.onions.onion.position).toEqual({ q: 1, r: 0 })
    expect(state.onions.onion.ramsRemaining).toBe(1)
    expect(state.onions.onion.treads).toBe(44)
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

  it('keeps a defender operational when a ram survives', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const defender = makeDefender({ unitId: 'd1', position: { q: 1, r: 0 } })
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

    expect(result.destroyedUnits).toEqual([])
    expect(result.rammedUnitResults?.[0]?.outcome.effect).toBe('survived')
    expect(state.defenders.d1.state).toBe('operational')
    randomSpy.mockRestore()
  })

  describe('deterministic ramRolls', () => {
    function makeRamPlan(rammedUnitIds: string[]): MovementPlan {
      return makePlan({
        unitId: 'onion',
        from: { q: 0, r: 0 },
        to: { q: 1, r: 0 },
        path: [{ q: 1, r: 0 }],
        rammedUnitIds,
        ramCapacityUsed: rammedUnitIds.length,
        treadCost: 1,
        capabilities: { canRam: true, hasTreads: true, canSecondMove: false },
      })
    }

    it('consumes one roll per rammed unit in order', () => {
      const d1 = makeDefender({ unitId: 'd1', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
      const d2 = makeDefender({ unitId: 'd2', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
      const state = makeState({ defenders: { d1, d2 } })
      const ramRolls = createRollQueue([1, 6])

      const result = executeUnitMovement(state, makeRamPlan(['d1', 'd2']), { ramRolls })

      expect(result.rammedUnitResults?.map((r) => r.outcome.roll)).toEqual([1, 6])
      expect(result.rammedUnitResults?.map((r) => r.outcome.effect)).toEqual(['destroyed', 'survived'])
      expect(ramRolls.remaining).toBe(0)
    })

    it('fails loudly when the queue is exhausted mid-move', () => {
      const d1 = makeDefender({ unitId: 'd1', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
      const d2 = makeDefender({ unitId: 'd2', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
      const state = makeState({ defenders: { d1, d2 } })
      const ramRolls = createRollQueue([1])

      expect(() => executeUnitMovement(state, makeRamPlan(['d1', 'd2']), { ramRolls })).toThrow(/exhausted/)
    })

    it('does not affect ramming when no queue is supplied, preserving default randomness', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
      const d1 = makeDefender({ unitId: 'd1', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
      const state = makeState({ defenders: { d1 } })

      const result = executeUnitMovement(state, makeRamPlan(['d1']))

      expect(result.rammedUnitResults?.[0]?.outcome.roll).toBe(1)
      randomSpy.mockRestore()
    })

    it('keeps independently created queues isolated from one another', () => {
      const combatRolls = createRollQueue([2, 4])
      const ramRolls = createRollQueue([6])

      expect(combatRolls.next()).toBe(2)
      expect(ramRolls.next()).toBe(6)
      expect(combatRolls.remaining).toBe(1)
      expect(ramRolls.remaining).toBe(0)
    })
  })

  it('preserves and advances stack names when a stacked Little Pigs unit moves away', () => {
    const movingPig = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const remainingPig = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1: movingPig, p2: remainingPig } }) as GameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group'],
    }
    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Little Pigs group',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2'],
        }),
      },
    })

    const result = executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }))

    expect(result.success).toBe(true)
    expect(state.defenders.p1.position).toEqual({ q: 1, r: 0 })
    expect(state.stackRoster?.groupsById['LittlePigs:0,0']).toMatchObject({
      groupName: 'Little Pigs group',
      unitIds: ['p2'],
    })
    expect(state.stackRoster?.groupsById['LittlePigs:1,0']).toMatchObject({
      groupName: 'Little Pigs group 2',
      unitIds: ['p1'],
    })
    expect((state as GameState & { stackNaming?: { groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>; usedGroupNames: string[] } }).stackNaming?.groupsInUse).toEqual([
      { groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      { groupKey: 'LittlePigs:1,0', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
    ])
    expect((state as GameState & { stackNaming?: { groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>; usedGroupNames: string[] } }).stackNaming?.usedGroupNames).toEqual([
      'Little Pigs group 1',
      'Little Pigs group 2',
    ])
  })

  it('reforms a stack as sequential movers arrive on the same destination hex', () => {
    const p1 = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const p2 = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const p3 = makeDefender({ unitId: 'p3', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1, p2, p3 } }) as GameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group'],
    }
    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Little Pigs group',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2', 'p3'],
        }),
      },
    })

    expect(executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 5, r: 4 } })).success).toBe(true)
    expect(state.stackRoster?.groupsById['LittlePigs:5,4']).toMatchObject({
      groupName: 'Little Pigs group 2',
      unitIds: ['p1'],
    })

    expect(executeUnitMovement(state, makePlan({ unitId: 'p2', from: { q: 0, r: 0 }, to: { q: 5, r: 4 } })).success).toBe(true)
    expect(state.stackRoster?.groupsById['LittlePigs:5,4']).toMatchObject({
      groupName: 'Little Pigs group 2',
      unitIds: ['p1', 'p2'],
    })

    expect(executeUnitMovement(state, makePlan({ unitId: 'p3', from: { q: 0, r: 0 }, to: { q: 5, r: 4 } })).success).toBe(true)
    expect(state.stackRoster?.groupsById['LittlePigs:5,4']).toMatchObject({
      groupName: 'Little Pigs group 2',
      unitIds: ['p1', 'p2', 'p3'],
    })
    expect(state.stackRoster?.groupsById['LittlePigs:0,0']).toBeUndefined()
  })

  it('retires a stacked group when the last unit in it is destroyed', () => {
    const doomedPig = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 1, r: 0 }, state: 'destroyed' })
    const state = makeState({ currentPhase: 'ONION_MOVE', defenders: { p1: doomedPig } }) as GameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [{ groupKey: 'LittlePigs:1,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group 1'],
    }
    state.stackRoster = makeStackRoster({ groupsById: {} })

    const result = executeUnitMovement(state, makePlan({ unitId: 'onion', from: { q: 0, r: 0 }, to: { q: 2, r: 0 } }))

    expect(result.success).toBe(true)
    expect(state.stackNaming?.groupsInUse).toEqual([])
    expect(state.stackNaming?.usedGroupNames).toEqual(['Little Pigs group 1'])
  })

  it('keeps the older group name when two Little Pigs end on the same hex', () => {
    const olderPig = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const newerPig = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 2, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1: olderPig, p2: newerPig } }) as GameState & {
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
    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Little Pigs group 1',
          position: { q: 0, r: 0 },
          unitIds: ['p1'],
        }),
        'LittlePigs:2,0': makeStackGroup({
          groupName: 'Little Pigs group 2',
          position: { q: 2, r: 0 },
          unitIds: ['p2'],
        }),
      },
    })

    const result = executeUnitMovement(state, makePlan({ unitId: 'p2', from: { q: 2, r: 0 }, to: { q: 0, r: 0 } }))

    expect(result.success).toBe(true)
    expect(state.defenders.p2.position).toEqual({ q: 0, r: 0 })
    expect(state.stackNaming?.groupsInUse).toEqual([
      { groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
    ])
    expect(state.stackNaming?.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2'])
  })

  it('allocates a fresh group name when a move reforms a stack on top of a singleton placeholder with a stale ordinal', () => {
    const p1 = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 }, friendlyName: 'Little Pigs 1' })
    const p2 = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 0, r: 0 }, friendlyName: 'Little Pigs 2' })
    const p3 = makeDefender({ unitId: 'p3', typeId: 'LittlePigs', position: { q: 2, r: 0 }, friendlyName: 'Little Pigs 3' })
    const p4 = makeDefender({ unitId: 'p4', typeId: 'LittlePigs', position: { q: 2, r: 0 }, friendlyName: 'Little Pigs 4' })
    const p5 = makeDefender({ unitId: 'p5', typeId: 'LittlePigs', position: { q: 4, r: 0 }, friendlyName: 'Little Pigs 5' })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1, p2, p3, p4, p5 } }) as GameState & {
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
    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Little Pigs group 1',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2'],
        }),
        'LittlePigs:2,0': makeStackGroup({
          groupName: 'Little Pigs group 2',
          position: { q: 2, r: 0 },
          unitIds: ['p3', 'p4'],
        }),
        'LittlePigs:4,0': makeStackGroup({
          groupName: 'Little Pigs group 2',
          position: { q: 4, r: 0 },
          unitIds: ['p5'],
        }),
      },
    })

    const result = executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 4, r: 0 } }))

    expect(result.success).toBe(true)
    expect(state.stackRoster?.groupsById['LittlePigs:4,0']).toMatchObject({
      groupName: 'Little Pigs group 3',
      unitIds: ['p5', 'p1'],
    })
    expect(state.stackNaming?.groupsInUse).toEqual(
      expect.arrayContaining([
        { groupKey: 'LittlePigs:2,0', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
        { groupKey: 'LittlePigs:4,0', groupName: 'Little Pigs group 3', unitType: 'LittlePigs' },
      ]),
    )
    expect(state.stackNaming?.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2', 'Little Pigs group 3'])
  })

  it('fails fast when a move references a grouped unit absent from defenders', () => {
    const p1 = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1 } })

    state.stackNaming = {
      groupsInUse: [{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group 1'],
    }
    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Little Pigs group 1',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2-missing'],
        }),
      },
    })

    expect(() => executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }))).toThrow(
      /missing.*p2-missing/i,
    )
  })

  it('splits a unit from a multi-member group creating a new destination group while preserving the source group', () => {
    const p1 = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const p2 = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const p3 = makeDefender({ unitId: 'p3', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1, p2, p3 } }) as GameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group A', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group A'],
    }
    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Little Pigs group A',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2', 'p3'],
        }),
      },
    })

    const result = executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 0, r: 1 } }))

    expect(result.success).toBe(true)
    expect(state.defenders.p1.position).toEqual({ q: 0, r: 1 })
    // source group should remain with the other members
    expect(state.stackRoster?.groupsById['LittlePigs:0,0']).toMatchObject({ unitIds: ['p2', 'p3'] })
    // destination group should be created for the moved unit
    expect(state.stackRoster?.groupsById['LittlePigs:0,1']).toMatchObject({ unitIds: ['p1'] })
  })

  it('moves a split-off unit onto an existing destination group merging into it and preserving both group names', () => {
    const a1 = makeDefender({ unitId: 'a1', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const a2 = makeDefender({ unitId: 'a2', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const a3 = makeDefender({ unitId: 'a3', typeId: 'LittlePigs', position: { q: 0, r: 0 } })
    const b1 = makeDefender({ unitId: 'b1', typeId: 'LittlePigs', position: { q: 1, r: 0 } })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { a1, a2, a3, b1 } }) as GameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    state.stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:0,0', groupName: 'Group A', unitType: 'LittlePigs' },
        { groupKey: 'LittlePigs:1,0', groupName: 'Group B', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Group A', 'Group B'],
    }

    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Group A',
          position: { q: 0, r: 0 },
          unitIds: ['a1', 'a2', 'a3'],
        }),
        'LittlePigs:1,0': makeStackGroup({
          groupName: 'Group B',
          position: { q: 1, r: 0 },
          unitIds: ['b1'],
        }),
      },
    })

    const result = executeUnitMovement(state, makePlan({ unitId: 'a1', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }))

    expect(result.success).toBe(true)
    expect(state.defenders.a1.position).toEqual({ q: 1, r: 0 })
    // source group should retain remaining members
    expect(state.stackRoster?.groupsById['LittlePigs:0,0']).toMatchObject({ unitIds: ['a2', 'a3'] })
    // destination group should include the moved unit, merged into existing group
    expect(state.stackRoster?.groupsById['LittlePigs:1,0']).toMatchObject({ unitIds: ['b1', 'a1'] })
    // both group names should still be present in naming snapshot
    expect(state.stackNaming?.usedGroupNames).toEqual(expect.arrayContaining(['Group A', 'Group B']))
  })

  it('selects source group name when destination has no roster or persisted naming', () => {
    const p1 = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 }, friendlyName: 'Pig 1' })
    const p2 = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 0, r: 0 }, friendlyName: 'Pig 2' })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1, p2 } }) as GameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    // No persisted naming entry for the destination
    state.stackNaming = { groupsInUse: [], usedGroupNames: [] }

    // Source group name should be used when destination has no roster entry
    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Source Group',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2'],
        }),
      },
    })

    const result = executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 4, r: 8 } }))

    expect(result.success).toBe(true)
    const destKey = 'LittlePigs:4,8'
    expect(state.stackRoster?.groupsById[destKey]).toBeDefined()
    expect(state.stackRoster?.groupsById[destKey]).toMatchObject({ groupName: 'Pig group 1', unitIds: ['p1'] })
  })

  it('honors persisted stack naming when present for the destination group', () => {
    const p1 = makeDefender({ unitId: 'p1', typeId: 'LittlePigs', position: { q: 0, r: 0 }, friendlyName: 'Pig 1' })
    const p2 = makeDefender({ unitId: 'p2', typeId: 'LittlePigs', position: { q: 0, r: 0 }, friendlyName: 'Pig 2' })
    const state = makeState({ currentPhase: 'DEFENDER_MOVE', defenders: { p1, p2 } }) as GameState & {
      stackNaming?: {
        groupsInUse: Array<{ groupKey: string; groupName: string; unitType: string }>
        usedGroupNames: string[]
      }
    }

    const destKey = 'LittlePigs:4,8'
    state.stackNaming = { groupsInUse: [{ groupKey: destKey, groupName: 'Persisted Destination', unitType: 'LittlePigs' }], usedGroupNames: ['Persisted Destination'] }

    state.stackRoster = makeStackRoster({
      groupsById: {
        'LittlePigs:0,0': makeStackGroup({
          groupName: 'Source Group',
          position: { q: 0, r: 0 },
          unitIds: ['p1', 'p2'],
        }),
      },
    })

    const result = executeUnitMovement(state, makePlan({ unitId: 'p1', from: { q: 0, r: 0 }, to: { q: 4, r: 8 } }))

    expect(result.success).toBe(true)
    expect(state.stackRoster?.groupsById[destKey]).toBeDefined()
    expect(state.stackRoster?.groupsById[destKey]).toMatchObject({ groupName: 'Persisted Destination', unitIds: ['p1'] })
    expect(state.stackNaming?.usedGroupNames).toEqual(expect.arrayContaining(['Persisted Destination']))
  })
})
