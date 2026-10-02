import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

const defaults = {
  PORT: '3000',
  HOST: '127.0.0.1',
  DATABASE_URL: 'postgres://onion:onionpass@127.0.0.1:5432/onion-test',
  JWT_SECRET: 'test-jwt-secret-that-is-long-enough',
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  SCENARIOS_DIR: `${process.cwd()}/scenarios`,
} as const

Object.assign(process.env, Object.fromEntries(
  Object.entries(defaults).filter(([key]) => process.env[key] === undefined),
))

const { buildActionResponse } = await import('#server/api/gameHelpers/actionResponses')
const { buildGameStateResponse } = await import('#server/api/gameHelpers/stateProjection')
const { makeDefender, makeGameState } = await import('#test/utils/gameStateUtils')

const scenarioSnapshot = JSON.parse(readFileSync('scenarios/swamp-siege-01.json', 'utf8'))
const state = makeGameState()
const defenders: Record<string, ReturnType<typeof makeDefender>> = { ...state.defenders }

for (let index = 0; index < 200; index += 1) {
  const unitId = `puss-${index}`
  defenders[unitId] = makeDefender({
    unitId,
    typeId: 'Puss',
    position: { q: index % 15, r: Math.floor(index / 15) },
    friendlyName: `Puss ${index}`,
  })
}

const benchmarkState = { ...state, defenders }

const match = {
  gameId: 1,
  scenarioId: 'swamp-siege-01',
  scenarioSnapshot,
  players: { onion: 'onion-user', defender: 'defender-user' },
  hostUserId: 'onion-user',
  status: 'active' as const,
  phase: 'DEFENDER_COMBAT' as const,
  turnNumber: 4,
  winner: null,
  state: benchmarkState,
  events: [],
  snapshotRevision: 1,
}

const iterations = Number(process.env.PROJECTION_BENCHMARK_ITERATIONS ?? 100)
for (let index = 0; index < 10; index += 1) {
  buildGameStateResponse(match, 'defender-user')
  buildActionResponse(match, benchmarkState, 'DEFENDER_COMBAT', 4, 12, [], 'active', null)
}

const stateStart = performance.now()
for (let index = 0; index < iterations; index += 1) {
  buildGameStateResponse(match, 'defender-user')
}
const stateMs = performance.now() - stateStart

const actionStart = performance.now()
for (let index = 0; index < iterations; index += 1) {
  buildActionResponse(match, benchmarkState, 'DEFENDER_COMBAT', 4, 12, [], 'active', null)
}
const actionMs = performance.now() - actionStart

console.log(JSON.stringify({
  units: Object.keys(benchmarkState.defenders).length,
  iterations,
  stateTotalMs: Number(stateMs.toFixed(2)),
  stateAvgMs: Number((stateMs / iterations).toFixed(3)),
  actionTotalMs: Number(actionMs.toFixed(2)),
  actionAvgMs: Number((actionMs / iterations).toFixed(3)),
}, null, 2))
