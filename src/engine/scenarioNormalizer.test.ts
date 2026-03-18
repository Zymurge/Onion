import { describe, it, expect } from 'vitest'
import { InitialStateSchema } from './scenarioSchema.js'
import { normalizeInitialStateToGameState } from './scenarioNormalizer.js'

const validInitialState = {
  onion: {
    type: 'TheOnion',
    position: { q: 0, r: 10 },
    treads: 45,
    missiles: 2,
    batteries: { main: 1, secondary: 4, ap: 8 },
    status: 'operational',
  },
  defenders: {
    'wolf-1': { type: 'BigBadWolf', position: { q: 5, r: 6 }, status: 'operational' },
    'pigs-1': { type: 'LittlePigs', position: { q: 4, r: 7 }, squads: 3 },
  },
}

describe('normalizeInitialStateToGameState', () => {
  it('produces a valid EngineGameState from a valid initialState', () => {
    const parsed = InitialStateSchema.parse(validInitialState)
    const gameState = normalizeInitialStateToGameState(parsed)
    expect(gameState.onion.id).toBe('onion-1')
    expect(gameState.onion.type).toBe('TheOnion')
    expect(gameState.onion.status).toBe('operational')
    expect(gameState.onion.weapons.length).toBeGreaterThan(0)
    expect(gameState.defenders['wolf-1'].id).toBe('wolf-1')
    expect(gameState.defenders['wolf-1'].type).toBe('BigBadWolf')
    expect(gameState.defenders['wolf-1'].status).toBe('operational')
    expect(gameState.defenders['wolf-1'].weapons.length).toBeGreaterThan(0)
    expect(gameState.defenders['pigs-1'].squads).toBe(3)
    expect(gameState.ramsThisTurn).toBe(0)
    expect(gameState.currentPhase).toBe('ONION_MOVE')
    expect(gameState.turn).toBe(1)
  })

  it('defaults missing status to operational', () => {
    const noStatus = {
      ...validInitialState,
      onion: { ...validInitialState.onion, status: undefined },
      defenders: {
        ...validInitialState.defenders,
        'wolf-1': { ...validInitialState.defenders['wolf-1'], status: undefined },
      },
    }
    const parsed = InitialStateSchema.parse(noStatus)
    const gameState = normalizeInitialStateToGameState(parsed)
    expect(gameState.onion.status).toBe('operational')
    expect(gameState.defenders['wolf-1'].status).toBe('operational')
  })
})
