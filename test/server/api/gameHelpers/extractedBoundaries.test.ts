import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildEngineState } from '#server/api/gameHelpers/stateProjection'
import {
  assertScenarioStateFitsMap,
  getScenarioEscapeHexes,
  getScenarioMapSnapshot,
  loadScenario,
  translateScenarioSnapshot,
} from '#server/api/gameHelpers/scenario'
import { parseGameId } from '#server/api/gameHelpers/ids'
import { logActionOutcome, logSentEvents } from '#server/api/gameHelpers/logging'
import { parseWsMessage, serializeWsMessage } from '#server/api/gameHelpers/protocol'
import logger from '#server/logger'
import type { MatchRecord } from '#server/db/adapter'
import { materializeScenarioMap } from '#shared/scenarioMap'
import { makeGameState } from '#test/utils/gameStateUtils'
import type { GameState } from '#shared/types/index'

const oneCellMap = materializeScenarioMap({
  width: 1,
  height: 1,
  cells: [{ q: 0, r: 0 }],
  hexes: [],
})

const makeMatch = (state: GameState): MatchRecord => ({
  gameId: 1,
  scenarioId: 'scenario-1',
  scenarioSnapshot: { map: oneCellMap },
  players: { onion: 'onion-user', defender: 'defender-user' },
  hostUserId: 'onion-user',
  status: 'active',
  phase: 'DEFENDER_MOVE',
  turnNumber: 3,
  winner: null,
  state,
  events: [],
})

describe('parseGameId', () => {
  it.each(['', '0', '-1', '+1', '1.5', 'abc', '9007199254740992'])('returns null for invalid route id %s', (rawId) => {
    expect(parseGameId(rawId)).toBeNull()
  })

  it('returns a safe positive integer for decimal route ids', () => {
    expect(parseGameId('00042')).toBe(42)
    expect(parseGameId('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('WebSocket protocol helpers', () => {
  it('round-trips supported client envelopes', () => {
    const message = { kind: 'COMMAND' as const, command: { type: 'END_PHASE' as const }, requestId: 'request-1' }

    expect(parseWsMessage(serializeWsMessage(message))).toEqual(message)
    expect(parseWsMessage(JSON.stringify({ kind: 'RESUME', afterSeq: 7 }))).toEqual({ kind: 'RESUME', afterSeq: 7 })
  })

  it.each([
    'not-json',
    JSON.stringify({ kind: 'COMMAND' }),
    JSON.stringify({ kind: 'RESUME', afterSeq: '7' }),
    JSON.stringify({ kind: 'EVENT', event: {} }),
  ])('returns null for unsupported or malformed client input %s', (rawMessage) => {
    expect(parseWsMessage(rawMessage)).toBeNull()
  })
})

describe('logging helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards event metadata to debug logging', () => {
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => undefined)
    const events = [{ seq: 4, type: 'UNIT_MOVED', timestamp: 'test' }]

    logSentEvents(9, 'MOVE', events)

    expect(debug).toHaveBeenCalledWith({
      gameId: 9,
      actionType: 'MOVE',
      eventCount: 1,
      eventTypes: ['UNIT_MOVED'],
      events,
    }, 'Events sent')
  })

  it('forwards action outcomes to info logging', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined)
    const events = [{ seq: 5, type: 'FIRE_RESOLVED', timestamp: 'test' }]
    const outcome = { success: true }

    logActionOutcome(9, 'FIRE', outcome, events)

    expect(info).toHaveBeenCalledWith({ gameId: 9, actionType: 'FIRE', outcome, events }, 'FIRE resolved')
  })
})

describe('scenario helpers', () => {
  it('returns safe defaults and materializes authored maps', () => {
    expect(getScenarioEscapeHexes(undefined)).toEqual([])
    expect(getScenarioMapSnapshot({ map: { radius: 0, hexes: [] } })).toMatchObject({ width: 1, height: 1 })
    expect(() => getScenarioMapSnapshot(undefined)).toThrow('Invalid scenario map snapshot')
  })

  it('translates authored radius coordinates without mutating the input', () => {
    const initial = {
      map: { radius: 2, hexes: [] },
      initialState: {
        deployments: {
          'onion-1': { type: 'TheOnion', side: 'onion' as const, position: { q: 1, r: 1 } },
        },
      },
      victoryConditions: { onion: { escapeHexes: [{ q: 2, r: 1 }] } },
    }

    const translated = translateScenarioSnapshot(initial)

    expect(translated?.initialState?.deployments['onion-1']?.position).toEqual({ q: 2, r: 1 })
    expect(translated?.victoryConditions?.onion?.escapeHexes).toEqual([{ q: 3, r: 1 }])
    expect(initial.initialState.deployments['onion-1'].position).toEqual({ q: 1, r: 1 })
  })

  it('rejects unit and escape positions outside the map', () => {
    const state = makeGameState({
      onions: {},
      defenders: {},
    })

    expect(() => assertScenarioStateFitsMap(oneCellMap, { victoryConditions: { onion: { escapeHexes: [{ q: 1, r: 0 }] } } }, state)).toThrow()
  })

  it('loads a matching scenario and returns null for a missing id or directory', async () => {
    const scenariosDir = join(process.cwd(), 'scenarios')
    const scenario = await loadScenario('swamp-siege-01', scenariosDir)

    expect(scenario?.id).toBe('swamp-siege-01')
    expect(await loadScenario('does-not-exist', scenariosDir)).toBeNull()
    expect(await loadScenario('swamp-siege-01', join(scenariosDir, 'missing'))).toBeNull()
  })

  it('skips malformed files while loading other scenarios', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'onion-scenarios-'))
    try {
      await writeFile(join(directory, 'broken.json'), '{', 'utf8')
      await writeFile(join(directory, 'other.txt'), 'ignored', 'utf8')
      expect(await loadScenario('missing', directory)).toBeNull()
      expect(await readFile(join(directory, 'broken.json'), 'utf8')).toBe('{')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('buildEngineState', () => {
  it('returns an independent canonical engine state with match cursors', () => {
    const state = makeGameState()
    const engineState = buildEngineState(makeMatch(state))

    expect(engineState).toMatchObject({ currentPhase: 'DEFENDER_MOVE', turn: 3 })
    expect(engineState).not.toBe(state)
    engineState.onions['onion-1'].position.q = 99
    expect(state.onions['onion-1'].position.q).not.toBe(99)
  })
})
