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
