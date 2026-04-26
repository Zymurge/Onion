import { describe, expect, it } from 'vitest'

import { validateMove, type MoveValidationState } from '../../shared/moveValidator'

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
}

function makeState(overrides: Partial<MoveValidationState> = {}): MoveValidationState {
  return {
    onion: {
      id: 'onion-1',
      type: 'TheOnion',
      position: { q: 2, r: 2 },
      status: 'operational',
      weapons: [],
      treads: 45,
      batteries: { main: 1, secondary: 4, ap: 8 },
    },
    defenders: {
      'puss-1': {
        id: 'puss-1',
        type: 'Puss',
        position: { q: 0, r: 0 },
        status: 'operational',
        weapons: [],
        squads: 1,
      },
      'pigs-1': {
        id: 'pigs-1',
        type: 'LittlePigs',
        position: { q: 0, r: 0 },
        status: 'operational',
        weapons: [],
        squads: 2,
      },
    },
    ramsThisTurn: 0,
    currentPhase: 'DEFENDER_MOVE',
    turn: 1,
    ...overrides,
  }
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
      defenders: {
        'pigs-1': {
          id: 'pigs-1',
          type: 'LittlePigs',
          position: { q: 0, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 1,
        },
        'pigs-2': {
          id: 'pigs-2',
          type: 'LittlePigs',
          position: { q: 1, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 1,
        },
        'pigs-3': {
          id: 'pigs-3',
          type: 'LittlePigs',
          position: { q: 1, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 5,
        },
        'pigs-4': {
          id: 'pigs-4',
          type: 'LittlePigs',
          position: { q: 1, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 7,
        },
        'pigs-5': {
          id: 'pigs-5',
          type: 'LittlePigs',
          position: { q: 1, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 1,
        },
        'pigs-6': {
          id: 'pigs-6',
          type: 'LittlePigs',
          position: { q: 1, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 2,
        },
      },
    })

    const result = validateMove(map, state, move('pigs-1', { q: 1, r: 0 }))

    expect(result).toMatchObject({
      valid: false,
      code: 'HEX_OCCUPIED',
      detailCode: 'stack-limit',
    })
  })

  it('reports mixed-stack as an occupancy detail', () => {
    const state = makeState({
      defenders: {
        'pigs-1': {
          id: 'pigs-1',
          type: 'LittlePigs',
          position: { q: 0, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 2,
        },
        'wolf-1': {
          id: 'wolf-1',
          type: 'BigBadWolf',
          position: { q: 1, r: 0 },
          status: 'operational',
          weapons: [],
        },
      },
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
      defenders: {
        'pigs-1': {
          id: 'pigs-1',
          type: 'LittlePigs',
          position: { q: 0, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 1,
        },
        'pigs-2': {
          id: 'pigs-2',
          type: 'LittlePigs',
          position: { q: 1, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 99,
        },
      },
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
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 1, r: 0 },
        status: 'operational',
        weapons: [],
        treads: 45,
        batteries: { main: 1, secondary: 4, ap: 8 },
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
      defenders: {
        'puss-1': {
          id: 'puss-1',
          type: 'Puss',
          position: { q: 0, r: 0 },
          status: 'operational',
          weapons: [],
          squads: 1,
        },
        'wolf-1': {
          id: 'wolf-1',
          type: 'BigBadWolf',
          position: { q: 1, r: 0 },
          status: 'operational',
          weapons: [],
        },
      },
    })

    const result = validateMove(map, state, move('puss-1', { q: 1, r: 0 }))

    expect(result).toMatchObject({
      valid: false,
      code: 'HEX_OCCUPIED',
      detailCode: 'occupied',
    })
  })

  it('reports prohibited terrain as a path failure', () => {
    const state = makeState()

    const result = validateMove(
      {
        ...map,
        hexes: [{ q: 1, r: 0, t: 2 }],
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
})
