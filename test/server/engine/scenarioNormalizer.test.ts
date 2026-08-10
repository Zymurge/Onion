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
  onions: {
    'onion-1': {
      type: 'TheOnion',
      position: { q: 0, r: 10 },
      status: 'operational',
    },
  },
  defenders: {
    'wolf-1': { type: 'BigBadWolf', position: { q: 5, r: 6 }, status: 'operational' },
    'pigs-1': { type: 'LittlePigs', position: { q: 4, r: 7 } },
  },
}

beforeEach(() => {
  mockedLogger.debug.mockClear()
  mockedLogger.info.mockClear()
  mockedLogger.warn.mockClear()
  mockedLogger.error.mockClear()
})

describe('normalizeInitialStateToGameState', () => {
  it('rejects legacy defender squads entries', () => {
    const parsed = InitialStateSchema.safeParse({
      ...validInitialState,
      defenders: {
        ...validInitialState.defenders,
        'pigs-group-1': { kind: 'stack-group', unitType: 'LittlePigs', position: { q: 4, r: 7 }, count: 3, squads: 3 },
      },
    })

    expect(parsed.success).toBe(false)
  })

  it('produces a valid canonical GameState from a valid initialState', () => {
    const parsed = InitialStateSchema.parse(validInitialState)
    const gameState = normalizeInitialStateToGameState(parsed)
    const onion1 = gameState.onions['onion-1']
    const wolf1 = gameState.defenders['wolf-1']
    const pigs1 = gameState.defenders['pigs-1']
    expect(onion1.unitId).toBe('onion-1')
    expect(onion1.friendlyName).toBe('The Onion 1')
    expect(onion1.typeId).toBe('TheOnion')
    expect(onion1.state).toBe('operational')
    expect(onion1.treads).toBe(45)
    expect(onion1.weapons.length).toBeGreaterThan(0)
    expect(onion1.weapons.find((weapon) => weapon.id === 'main')?.friendlyName).toBe('Main Weapon')
    expect(onion1.weapons.find((weapon) => weapon.id === 'secondary_1')?.friendlyName).toBe('Secondary Weapon 1')
    expect(onion1).not.toHaveProperty('id')
    expect(onion1).not.toHaveProperty('type')
    expect(onion1).not.toHaveProperty('status')
    expect(wolf1.unitId).toBe('wolf-1')
    expect(wolf1.friendlyName).toBe('Big Bad Wolf 1')
    expect(wolf1.typeId).toBe('BigBadWolf')
    expect(wolf1.state).toBe('operational')
    expect(wolf1.weapons.length).toBeGreaterThan(0)
    expect(wolf1.weapons[0].friendlyName).toBe('Cannon')
    expect(pigs1.friendlyName).toBe('Little Pigs 1')
    expect(pigs1.state).toBe('operational')
    expect(gameState.stackRoster.groupsById).toEqual({})
    expect(gameState.currentPhase).toBe('ONION_MOVE')
    expect(gameState.turn).toBe(1)
  })

  it('normalizes every authored Onion entry using its map key and global definition defaults', () => {
    const parsed = InitialStateSchema.parse({
      ...validInitialState,
      onions: {
        'onion-1': validInitialState.onions['onion-1'],
        'onion-2': {
          type: 'TheOnion',
          position: { q: 2, r: 10 },
          status: 'disabled',
        },
      },
    })

    const gameState = normalizeInitialStateToGameState(parsed)

    expect(Object.keys(gameState.onions)).toEqual(['onion-1', 'onion-2'])
    expect(gameState.onions['onion-2']).toMatchObject({
      unitId: 'onion-2',
      typeId: 'TheOnion',
      position: { q: 2, r: 10 },
      state: 'disabled',
      treads: 45,
    })
    expect(gameState.onions['onion-2'].weapons).toHaveLength(gameState.onions['onion-1'].weapons.length)
  })

  it('defaults missing status to operational', () => {
    const noStatus = {
      ...validInitialState,
      onions: { ...validInitialState.onions, 'onion-1': { ...validInitialState.onions['onion-1'], status: undefined } },
      defenders: {
        ...validInitialState.defenders,
        'wolf-1': { ...validInitialState.defenders['wolf-1'], status: undefined },
      },
    }
    const parsed = InitialStateSchema.parse(noStatus)
    const gameState = normalizeInitialStateToGameState(parsed)
    expect(gameState.onions['onion-1'].state).toBe('operational')
    expect(gameState.defenders['wolf-1'].state).toBe('operational')
  })

  it('logs error and throws for unknown onion type', () => {
    const badState = {
      ...validInitialState,
      onions: { ...validInitialState.onions, 'onion-1': { ...validInitialState.onions['onion-1'], type: 'UnknownOnion' } },
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

  it('rejects an onion type in a regular defender entry', () => {
    const badState = {
      ...validInitialState,
      defenders: {
        ...validInitialState.defenders,
        bad: { type: 'TheOnion', position: { q: 1, r: 1 } },
      },
    }
    const parsed = InitialStateSchema.parse(badState)
    expect(() => normalizeInitialStateToGameState(parsed)).toThrow('Unit type is not a defender')
  })

  it('rejects an onion type in a stack group entry', () => {
    const badState = {
      ...validInitialState,
      defenders: {
        'onion-group-1': {
          kind: 'stack-group',
          unitType: 'TheOnion',
          position: { q: 1, r: 1 },
          count: 2,
        },
      },
    }
    const parsed = InitialStateSchema.parse(badState as unknown as object)
    expect(() => normalizeInitialStateToGameState(parsed)).toThrow('Unit type is not a defender')
  })

  it('expands authored Little Pigs stack groups into individual defenders with group membership metadata', () => {
    const groupedInitialState = {
      onions: validInitialState.onions,
      defenders: {
        'pigs-group-1': {
          kind: 'stack-group',
          unitType: 'LittlePigs',
          position: { q: 4, r: 7 },
          count: 3,
          status: 'operational',
          groupName: 'Little Pigs group 1',
        },
        'wolf-1': { type: 'BigBadWolf', position: { q: 5, r: 6 }, status: 'operational' },
      },
    }

    const parsed = InitialStateSchema.parse(groupedInitialState as unknown as object)
    const gameState = normalizeInitialStateToGameState(parsed)

    const littlePigs = Object.entries(gameState.defenders).filter(([, unit]) => unit.typeId === 'LittlePigs')
    expect(littlePigs).toHaveLength(3)
    expect(littlePigs.every(([, unit]) => unit.position.q === 4 && unit.position.r === 7)).toBe(true)
    expect(littlePigs.every(([, unit]) => unit.role === 'defender')).toBe(true)

    const stackRoster = (gameState as unknown as { stackRoster?: { groupsById?: Record<string, { unitType: string; unitIds: string[] }> } }).stackRoster
    expect(stackRoster?.groupsById).toBeDefined()

    const pigGroups = Object.values(stackRoster?.groupsById ?? {}).filter((group) => group.unitType === 'LittlePigs')
    expect(pigGroups).toHaveLength(1)
    expect(pigGroups[0]?.unitIds).toHaveLength(3)
    expect((pigGroups[0]?.unitIds ?? []).every((unitId) => gameState.defenders[unitId] !== undefined)).toBe(true)
  })

  it('throws when an authored stack group name conflicts with canonical naming', () => {
    const groupedInitialState = {
      onions: validInitialState.onions,
      defenders: {
        'pigs-group-1': {
          kind: 'stack-group',
          unitType: 'LittlePigs',
          position: { q: 4, r: 7 },
          count: 3,
          status: 'operational',
          groupName: 'Little Pigs group 99',
        },
      },
    }

    const parsed = InitialStateSchema.parse(groupedInitialState as unknown as object)

    expect(() => normalizeInitialStateToGameState(parsed)).toThrow('Conflicting stack group name')
  })

  it('assigns Little Pigs ids and friendly names from a single ordinal sequence across stack groups', () => {
    const groupedInitialState = {
      onions: validInitialState.onions,
      defenders: {
        'pigs-stack-1': {
          kind: 'stack-group',
          unitType: 'LittlePigs',
          position: { q: 4, r: 7 },
          count: 2,
          status: 'operational',
        },
        'pigs-stack-2': {
          kind: 'stack-group',
          unitType: 'LittlePigs',
          position: { q: 5, r: 7 },
          count: 3,
          status: 'operational',
        },
      },
    }

    const parsed = InitialStateSchema.parse(groupedInitialState as unknown as object)
    const gameState = normalizeInitialStateToGameState(parsed)

    expect(Object.keys(gameState.defenders).filter((unitId) => unitId.startsWith('pigs-'))).toEqual([
      'pigs-1',
      'pigs-2',
      'pigs-3',
      'pigs-4',
      'pigs-5',
    ])
    expect(gameState.defenders['pigs-1'].friendlyName).toBe('Little Pigs 1')
    expect(gameState.defenders['pigs-2'].friendlyName).toBe('Little Pigs 2')
    expect(gameState.defenders['pigs-3'].friendlyName).toBe('Little Pigs 3')
    expect(gameState.defenders['pigs-4'].friendlyName).toBe('Little Pigs 4')
    expect(gameState.defenders['pigs-5'].friendlyName).toBe('Little Pigs 5')
  })
})
