import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InitialStateSchema } from '#server/engine/scenarioSchema'
import { normalizeInitialStateToGameState } from '#server/engine/scenarioNormalizer'

vi.mock('#server/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import logger from '#server/logger'

const mockedLogger = logger as unknown as {
  debug: { mockClear: () => void }
  info: { mockClear: () => void }
  warn: { mockClear: () => void }
  error: { mockClear: () => void }
}

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

beforeEach(() => {
  mockedLogger.debug.mockClear()
  mockedLogger.info.mockClear()
  mockedLogger.warn.mockClear()
  mockedLogger.error.mockClear()
})

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

  it('logs error and throws for unknown onion type', () => {
    const badState = {
      ...validInitialState,
      onion: { ...validInitialState.onion, type: 'UnknownOnion' },
    }
    const parsed = InitialStateSchema.parse(badState)
    expect(() => normalizeInitialStateToGameState(parsed)).toThrow('Unknown onion type')
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UnknownOnion' }),
      expect.stringContaining('unknown onion type')
    )
  })

  it('logs error and throws for unknown defender type', () => {
    const badState = {
      ...validInitialState,
      defenders: {
        ...validInitialState.defenders,
        bad: { type: 'UnknownDefender', position: { q: 1, r: 1 } },
      },
    }
    const parsed = InitialStateSchema.parse(badState)
    expect(() => normalizeInitialStateToGameState(parsed)).toThrow('Unknown defender type')
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UnknownDefender', key: 'bad' }),
      expect.stringContaining('unknown defender type')
    )
  })
})
