import { describe, expect, it } from 'vitest'

import { evaluateVictoryConditions } from '#server/engine/victory'
import { materializeScenarioMap } from '#shared/scenarioMap'
import { makeGameState, makeOnion } from '#test/utils/gameStateUtils'

const scenarioMap = materializeScenarioMap({
  width: 3,
  height: 3,
  cells: [{ q: 0, r: 0 }],
  hexes: [],
})

describe('evaluateVictoryConditions', () => {
  it('declares defender victory from an explicit immobilize-onion objective', () => {
    const state = makeGameState({ onions: { 'onion-1': makeOnion({ treads: 0 }) } })

    const evaluation = evaluateVictoryConditions({
      victoryConditions: {
        objectives: [{ id: 'immobilize-onion', label: 'Immobilize The Onion', kind: 'immobilize-onion', victor: 'defender', required: true }],
      },
      scenarioMap,
      state,
      turnNumber: 1,
    })

    expect(evaluation.winner).toBe('defender')
    expect(evaluation.objectives[0]).toMatchObject({ victor: 'defender', completed: true })
  })

  it('declares Onion victory only when its explicit required objectives are complete', () => {
    const state = makeGameState({ onions: { 'onion-1': makeOnion({ position: { q: 4, r: 4 } }) } })

    const evaluation = evaluateVictoryConditions({
      victoryConditions: {
        objectives: [{ id: 'escape-map', label: 'Escape the map', kind: 'escape-map', victor: 'onion', required: true }],
      },
      scenarioMap,
      state,
      turnNumber: 2,
    })

    expect(evaluation.winner).toBe('onion')
  })

  it('does not declare a winner when no objectives are configured', () => {
    const state = makeGameState({ onions: { 'onion-1': makeOnion({ treads: 0 }) } })

    const evaluation = evaluateVictoryConditions({
      victoryConditions: {},
      scenarioMap,
      state,
      turnNumber: 1,
    })

    expect(evaluation.winner).toBeNull()
    expect(evaluation.objectives).toEqual([])
  })
})
