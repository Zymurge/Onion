import { describe, it, expect } from 'vitest'
import { renderMap } from '../../../../server/cli/render/map.js'
import type { GameState } from '../../../../shared/types/index.js'
import type { ScenarioDetail } from '../../../../server/cli/api/client.js'
import { makeGameState, makeOnion } from '../../../utils/gameStateUtils.js'

describe('renderMap', () => {
  it('renders unavailable if no state or scenario', () => {
    expect(renderMap(null, null)).toMatch(/unavailable/)
    expect(renderMap({} as GameState, null)).toMatch(/unavailable/)
    expect(renderMap(null, {} as ScenarioDetail)).toMatch(/unavailable/)
  })

  it('renders a minimal map', () => {
    const scenario: ScenarioDetail = {
      id: 's1',
      name: 'Test',
      description: '',
      map: { width: 1, height: 1, hexes: [{ q: 0, r: 0, t: 1 }] },
    }
    const state: GameState = makeGameState({
      onions: { 'onion-1': makeOnion({ position: { q: 0, r: 0 }, treads: 1 }) },
      defenders: {},
    })
    expect(renderMap(state, scenario)).toContain('Map')
  })
})
