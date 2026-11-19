import { describe, expect, it } from 'vitest'

import { validateMove, type MoveValidationState } from '../../shared/moveValidator'
import { makeDefenderMap, makeGameState, makeOnion } from '#test/utils/gameStateUtils'

const map = {
  width: 3,
  height: 3,
  cells: [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 2, r: 0 },
    { q: 0, r: 1 },
    { q: 1, r: 1 },
    { q: 2, r: 1 },
    { q: 0, r: 2 },
    { q: 1, r: 2 },
    { q: 2, r: 2 },
  ],
  hexes: [],
  edges: [],
}

function makeState(overrides: Partial<MoveValidationState> = {}): MoveValidationState {
  return makeGameState({
    onions: {
      'onion-1': makeOnion({ position: { q: 2, r: 2 }, weapons: [] }),
    },
    defenders: makeDefenderMap({
      'puss-1': { position: { q: 0, r: 0 }, weapons: [] },
      'pigs-1': { typeId: 'LittlePigs', position: { q: 0, r: 0 }, weapons: [] },
    }),
    currentPhase: 'DEFENDER_MOVE',
    turn: 1,
    ...overrides,
  })
}

function move(unitId: string, to: { q: number; r: number }, attemptRam?: boolean) {
  return { type: 'MOVE', unitId, to, attemptRam } as const
}

describe('moveValidator', () => {
  it('returns a full plan for a valid move', () => {
    const state = makeState()

    const result = validateMove(map, state, move('puss-1', { q: 1, r: 0 }))

    expect(result).toMatchObject({
      valid: true,
      unitId: 'puss-1',
      from: { q: 0, r: 0 },
      to: { q: 1, r: 0 },
      path: [{ q: 1, r: 0 }],
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
    })
  })

  it('reports stack-limit as an occupancy detail', () => {
    const state = makeState({
      defenders: makeDefenderMap({
        'pigs-1': { typeId: 'LittlePigs', position: { q: 0, r: 0 }, weapons: [] },
        'pigs-2': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
        'pigs-3': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
        'pigs-4': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
        'pigs-5': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
        'pigs-6': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
      }),
    })

    const result = validateMove(map, state, move('pigs-1', { q: 1, r: 0 }))

    expect(result).toMatchObject({
      valid: false,
      code: 'HEX_OCCUPIED',
      detailCode: 'stack-limit',
    })
  })

  it('counts a batch arrival against the destination stack limit', () => {
    const state = makeState({
      defenders: makeDefenderMap({
        'pigs-1': { typeId: 'LittlePigs', position: { q: 0, r: 0 }, weapons: [] },
        'pigs-2': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
        'pigs-3': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
        'pigs-4': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
        'pigs-5': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
      }),
    })

    expect(validateMove(map, state, move('pigs-1', { q: 1, r: 0 }), { incomingMembers: 1 }).valid).toBe(true)
    expect(validateMove(map, state, move('pigs-1', { q: 1, r: 0 }), { incomingMembers: 2 })).toMatchObject({
      valid: false,
      code: 'HEX_OCCUPIED',
      detailCode: 'stack-limit',
    })
  })

  it('uses movement already spent when calculating the remaining allowance', () => {
    const state = makeState({
      defenders: makeDefenderMap({
        'puss-1': {
          position: { q: 0, r: 0 },
          weapons: [],
          movementSpent: { DEFENDER_MOVE: 2 },
        },
      }),
    })

    expect(validateMove(map, state, move('puss-1', { q: 2, r: 0 }))).toMatchObject({
      valid: false,
      code: 'NO_PATH',
    })
  })

  it('reports mixed-stack as an occupancy detail', () => {
    const state = makeState({
      defenders: makeDefenderMap({
        'pigs-1': { typeId: 'LittlePigs', position: { q: 0, r: 0 }, weapons: [] },
        'wolf-1': { typeId: 'BigBadWolf', position: { q: 1, r: 0 }, weapons: [] },
      }),
    })

    const result = validateMove(map, state, move('pigs-1', { q: 1, r: 0 }))

    expect(result).toMatchObject({
      valid: false,
      code: 'HEX_OCCUPIED',
      detailCode: 'mixed-stack',
    })
  })

  it('ignores legacy squads magnitude when evaluating Little Pigs stack legality', () => {
    const state = makeState({
      defenders: makeDefenderMap({
        'pigs-1': { typeId: 'LittlePigs', position: { q: 0, r: 0 }, weapons: [] },
        'pigs-2': { typeId: 'LittlePigs', position: { q: 1, r: 0 }, weapons: [] },
      }),
    })

    const result = validateMove(map, state, move('pigs-1', { q: 1, r: 0 }))

    expect(result).toMatchObject({
      valid: true,
      unitId: 'pigs-1',
      to: { q: 1, r: 0 },
    })
  })

  it('reports occupied-by-onion as an occupancy detail', () => {
    const state = makeState({
      onions: {
        'onion-1': makeOnion({ position: { q: 1, r: 0 }, weapons: [] }),
      },
    })

    const result = validateMove(map, state, move('puss-1', { q: 1, r: 0 }))

    expect(result).toMatchObject({
      valid: false,
      code: 'HEX_OCCUPIED',
      detailCode: 'occupied-by-onion',
    })
  })

  it('reports generic occupation when stacking is not allowed', () => {
    const state = makeState({
      defenders: makeDefenderMap({
        'puss-1': { typeId: 'Puss', position: { q: 0, r: 0 }, weapons: [] },
        'wolf-1': { typeId: 'BigBadWolf', position: { q: 1, r: 0 }, weapons: [] },
      }),
    })

    const result = validateMove(map, state, move('puss-1', { q: 1, r: 0 }))

    expect(result).toMatchObject({
      valid: false,
      code: 'HEX_OCCUPIED',
      detailCode: 'occupied',
    })
  })

  it('reports crater terrain as a path failure', () => {
    const state = makeState()

    const result = validateMove(
      {
        ...map,
        hexes: [{ q: 1, r: 0, terrain: 'crater' }],
      },
      state,
      move('puss-1', { q: 1, r: 0 }),
    )

    expect(result).toMatchObject({
      valid: false,
      code: 'NO_PATH',
      detailCode: 'prohibited-terrain',
    })
  })

  it('charges swamp entry cost in the move plan', () => {
    const result = validateMove(
      {
        ...map,
        hexes: [{ q: 1, r: 0, terrain: 'swamp' }],
      },
      makeState(),
      move('puss-1', { q: 1, r: 0 }),
    )

    expect(result).toMatchObject({
      valid: true,
      path: [{ q: 1, r: 0 }],
      cost: 2,
    })
  })

  it('rejects crossing a ridge for units that cannot cross (Puss) with NO_PATH', () => {
    const ridgeMap = {
      ...map,
      edges: [{ type: 'ridge', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
    }
    const state = makeState()

    const result = validateMove(ridgeMap, state, move('puss-1', { q: 1, r: 0 }))

    // Note: in a 3x3 grid, Puss with 3 MP could go around (0,0)->(0,1)->(1,0) at cost 2.
    // If we limit Puss to 1 MP remaining:
    const state1MP = makeState({
      defenders: makeDefenderMap({
        'puss-1': {
          position: { q: 0, r: 0 },
          weapons: [],
          movementSpent: { DEFENDER_MOVE: 2 },
        },
      }),
    })
    const result1MP = validateMove(ridgeMap, state1MP, move('puss-1', { q: 1, r: 0 }))
    expect(result1MP).toMatchObject({
      valid: false,
      code: 'NO_PATH',
      error: 'No valid path to destination',
    })
  })

  it('allows crossing a ridge for Infantry (LittlePigs) with normal cost', () => {
    const ridgeMap = {
      ...map,
      edges: [{ type: 'ridge', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
    }
    const state = makeState()

    const result = validateMove(ridgeMap, state, move('pigs-1', { q: 1, r: 0 }))
    expect(result).toMatchObject({
      valid: true,
      unitId: 'pigs-1',
      cost: 1,
      path: [{ q: 1, r: 0 }],
    })
  })

  it('charges stream surcharge (+1 MP) for LightArmor (Puss)', () => {
    const streamMap = {
      ...map,
      edges: [{ type: 'stream', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
    }
    const state = makeState()

    const result = validateMove(streamMap, state, move('puss-1', { q: 1, r: 0 }))
    expect(result).toMatchObject({
      valid: true,
      unitId: 'puss-1',
      cost: 2,
      path: [{ q: 1, r: 0 }],
    })
  })

  it('rejects stream move if surcharge exceeds remaining movement allowance', () => {
    const streamMap = {
      ...map,
      edges: [{ type: 'stream', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
    }
    const state = makeState({
      defenders: makeDefenderMap({
        'puss-1': {
          position: { q: 0, r: 0 },
          weapons: [],
          movementSpent: { DEFENDER_MOVE: 2 }, // 1 MP remaining, stream move costs 2 MP
        },
      }),
    })

    const result = validateMove(streamMap, state, move('puss-1', { q: 1, r: 0 }))
    expect(result).toMatchObject({
      valid: false,
      code: 'NO_PATH',
      error: 'No valid path to destination',
    })
  })
})
