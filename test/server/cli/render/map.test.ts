import { describe, it, expect } from 'vitest'
import { renderMap } from '../../../../server/cli/render/map.js'
import type { GameState } from '../../../../shared/types/index.js'
import type { ScenarioDetail } from '../../../../server/cli/api/client.js'

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
      map: { width: 1, height: 1, terrain: { '0,0': 1 } },
    } as any
    const state: GameState = {
      onion: { position: { q: 0, r: 0 }, treads: 1 },
      defenders: {},
    } as any
    expect(renderMap(state, scenario)).toContain('Map')
  })
})
