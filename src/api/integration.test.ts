/**
 * Integration Test: Expected State Model
 *
 * High-Level Design:
 * 1. Maintain an independent expected state model (positions, statuses, damage) for onion and defenders.
 * 2. Initialize this model from the scenario at game start.
 * 3. For each move or combat action, update the expected state model based on the action issued and combat results returned by the API.
 * 4. After each phase, fetch the API state and compare it to the expected model, asserting equality for all tracked fields.
 * 5. Repeat for each turn, simulating both onion and defender actions, until the game ends.
 *
 * This ensures the backend logic and API state are validated against a client-side simulation of the game rules.
 */

// Utility: Deep compare two objects (shallow for now, can be extended)
function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// Utility: Clone state (to avoid mutation bugs)
function clone(obj: any) {
  return JSON.parse(JSON.stringify(obj))
}

// Update expected state after a move or combat action
function applyActionToExpectedState(expected: any, action: any, result: any) {
  // Movement
  if (action.type === 'MOVE') {
    expected.onion.position = clone(action.to)
  } else if (action.type === 'MOVE_UNIT') {
    if (expected.defenders[action.unitId]) {
      expected.defenders[action.unitId].position = clone(action.to)
    }
  }
  // Combat (simplified: update status if result indicates damage/disable)
  if (result && result.events) {
    for (const event of result.events) {
      if (event.type === 'UNIT_STATUS_CHANGED' && expected.defenders[event.unitId]) {
        expected.defenders[event.unitId].status = event.to
      }
      if (event.type === 'ONION_TREADS_LOST') {
        expected.onion.treads = event.remaining
      }
      if (event.type === 'ONION_BATTERY_DESTROYED') {
        // Remove battery if destroyed
        if (expected.onion.batteries && event.weaponType) {
          expected.onion.batteries[event.weaponType] = Math.max(0, (expected.onion.batteries[event.weaponType] || 0) - 1)
        }
      }
    }
  }
}

// Compare expected state to API state (positions, statuses, treads, batteries)
function assertStateMatches(apiState: any, expected: any) {
  expect(apiState.onion.position).toEqual(expected.onion.position)
  expect(apiState.onion.treads).toBe(expected.onion.treads)
  expect(apiState.onion.batteries).toEqual(expected.onion.batteries)
  for (const unitId of Object.keys(expected.defenders)) {
    expect(apiState.defenders[unitId].position).toEqual(expected.defenders[unitId].position)
    expect(apiState.defenders[unitId].status).toBe(expected.defenders[unitId].status)
  }
}
import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'
import { randomUUID } from 'node:crypto'

// Utility to log and return
function logStep(label: string, data: any) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${label} ===`)
  // eslint-disable-next-line no-console
  console.dir(data, { depth: 5 })
  return data
}

// Validate game state with expected values and allow for mutations
function validateGameState(game: any, {
  gameId,
  scenarioId = 'swamp-siege-01',
  phase,
  turnNumber,
  winner = null,
  playerUserIds,
  minEventSeq = 0,
  expectState = true,
  expectMap = true,
  mode = 'full', // 'full' for GET /games/:id, 'minimal' for POST /games
}: {
  gameId: string
  scenarioId?: string
  phase?: string
  turnNumber?: number
  winner?: string | null
  playerUserIds?: { onion: string, defender: string }
  minEventSeq?: number
  expectState?: boolean
  expectMap?: boolean
  mode?: 'full' | 'minimal'
}) {
  expect(game).toHaveProperty('gameId', gameId)
  if (mode === 'minimal') {
    // Only check minimal fields for POST /games
    expect(game).toHaveProperty('role')
    return
  }
  // Full validation for GET /games/:id
  expect(game).toHaveProperty('scenarioId', scenarioId)
  if (phase) expect(game).toHaveProperty('phase', phase)
  if (turnNumber) expect(game).toHaveProperty('turnNumber', turnNumber)
  expect(game).toHaveProperty('winner', winner)
  expect(typeof game.eventSeq).toBe('number')
  expect(game.eventSeq).toBeGreaterThanOrEqual(minEventSeq)
  if (expectState) {
    expect(game).toHaveProperty('state')
    expect(game.state).toHaveProperty('onion')
    expect(game.state).toHaveProperty('defenders')
  }
  if (playerUserIds && game.players) {
    expect(game.players).toHaveProperty('onion', playerUserIds.onion)
    expect(game.players).toHaveProperty('defender', playerUserIds.defender)
  }
  if (expectMap) {
    expect(game).toHaveProperty('map')
    expect(typeof game.map.width).toBe('number')
    expect(typeof game.map.height).toBe('number')
    expect(Array.isArray(game.map.hexes)).toBe(true)
  }
}

describe('Integration: Register, Login, Create Game, Join', () => {
  it('registers, logs in two users, creates a game, joins, and validates state model', async () => {
    const app = buildApp()

    // Register and login users
    const reg1 = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'onion', password: 'onionpass' } })
    const { userId: userId1, token: token1 } = reg1.json()
    const reg2 = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'defender', password: 'defenderpass' } })
    const { userId: userId2, token: token2 } = reg2.json()
    const login1 = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'onion', password: 'onionpass' } })
    const { token: loginToken1 } = login1.json()
    const login2 = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'defender', password: 'defenderpass' } })
    const { token: loginToken2 } = login2.json()

    // User1 creates a game as 'onion'
    const createGame = await app.inject({ method: 'POST', url: '/games', headers: { authorization: `Bearer ${loginToken1}` }, payload: { scenarioId: 'swamp-siege-01', role: 'onion' } })
    const { gameId } = createGame.json()

    // Fetch scenario and initialize expected state model
    const scenarioRes = await app.inject({ method: 'GET', url: `/scenarios/swamp-siege-01` })
    const scenario = scenarioRes.json()
    // Build expected state from scenario initialState
    const initialState = scenario.initialState
    const expectedState = {
      onion: clone(initialState.onion),
      defenders: clone(initialState.defenders)
    }

    // User2 joins the game as 'defender'
    await app.inject({ method: 'POST', url: `/games/${gameId}/join`, headers: { authorization: `Bearer ${loginToken2}` }, payload: {} })

    // Fetch and validate game state as user1 (onion)
    const state1 = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${loginToken1}` } })
    logStep('Initial API state (before move)', state1.json().state)
    logStep('Initial expected state (before move)', expectedState)
    assertStateMatches(state1.json().state, expectedState)

    // User1 moves onion
    const onionMove = { type: 'MOVE', to: { q: expectedState.onion.position.q + 1, r: expectedState.onion.position.r } }
    logStep('MOVE action sent', onionMove)
    const moveRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${loginToken1}` }, payload: onionMove })
    logStep('API response to MOVE', moveRes.json())
    applyActionToExpectedState(expectedState, onionMove, moveRes.json())
    logStep('Expected state after move', expectedState)
    // Validate after move
    const afterMoveState = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${loginToken1}` } })
    logStep('API state after move', afterMoveState.json().state)
    assertStateMatches(afterMoveState.json().state, expectedState)

    // User1 ends phase
    await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${loginToken1}` }, payload: { type: 'END_PHASE' } })
    // Fetch and validate state after phase
    const afterPhaseState = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${loginToken1}` } })
    logStep('API state after END_PHASE', afterPhaseState.json().state)
    logStep('Expected state after END_PHASE', expectedState)
    assertStateMatches(afterPhaseState.json().state, expectedState)
  })

  it('simulates a full turn for both onion and defenders', async () => {
    const app = buildApp()

    // Register user1
    const reg1 = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'onion', password: 'onionpass' },
    })
    logStep('Register User 1', reg1.json())
    expect(reg1.statusCode).toBe(201)
    const { userId: userId1, token: token1 } = reg1.json()

    // Register user2
    const reg2 = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'defender', password: 'defenderpass' },
    })
    logStep('Register User 2', reg2.json())
    expect(reg2.statusCode).toBe(201)
    const { userId: userId2, token: token2 } = reg2.json()

    // Login user1
    const login1 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'onion', password: 'onionpass' },
    })
    logStep('Login User 1', login1.json())
    expect(login1.statusCode).toBe(200)
    const { userId: loginUserId1, token: loginToken1 } = login1.json()
    expect(loginUserId1).toBe(userId1)

    // Login user2
    const login2 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'defender', password: 'defenderpass' },
    })
    logStep('Login User 2', login2.json())
    expect(login2.statusCode).toBe(200)
    const { userId: loginUserId2, token: loginToken2 } = login2.json()
    expect(loginUserId2).toBe(userId2)

    // User1 creates a game as 'onion'
    const createGame = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${loginToken1}` },
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })
    logStep('User 1 Creates Game', createGame.json())
    expect(createGame.statusCode).toBe(201)
    const { gameId } = createGame.json()
    expect(typeof gameId).toBe('string')

    // Run 3 turns
    for (let turn = 1; turn <= 3; turn++) {
      logStep(`=== TURN ${turn} START ===`, {})
      const keepGoing = await runTurn({
        app,
        gameId,
        onionToken: loginToken1,
        defenderToken: loginToken2,
        onionId: userId1,
        defenderId: userId2,
      })
      if (!keepGoing) {
        logStep(`Game ended during turn ${turn}`, {})
        break
      }
      logStep(`=== TURN ${turn} END ===`, {})
    }
  })
})

// Utility: pick a random element from an array
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Utility: Manhattan distance for hexes (simplified for demo)
function hexDistance(a: any, b: any) {
  return Math.abs(a.q - b.q) + Math.abs(a.r - b.r)
}

// Simulate a full turn for both onion and defenders
async function runTurn({ app, gameId, onionToken, defenderToken, onionId, defenderId }: {
  app: any,
  gameId: string,
  onionToken: string,
  defenderToken: string,
  onionId: string,
  defenderId: string,
}) {
  // Fetch state to determine whose turn
  let stateRes = await app.inject({
    method: 'GET', url: `/games/${gameId}`,
    headers: { authorization: `Bearer ${onionToken}` },
  })
  let state = stateRes.json()
  logStep('runTurn: Start State', state)
  let phase = state.phase
  let winner = state.winner
  if (winner) {
    logStep('runTurn: Game Over', { winner })
    return false
  }

  // ONION MOVE phase
  if (phase === 'ONION_MOVE') {
    // Move onion straight toward castle (e.g., +q)
    const onionPos = state.state.onion.position
    const moveCmd = {
      type: 'MOVE',
      to: { q: onionPos.q + 1, r: onionPos.r },
    }
    const moveRes = await app.inject({
      method: 'POST', url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${onionToken}` },
      payload: moveCmd,
    })
    logStep('ONION_MOVE: Onion Moves', moveRes.json())
    // Fire all weapons at random defender in range (if any)
    const defenders = state.state.defenders
    const defenderList = Array.isArray(defenders)
      ? defenders.filter((d: any) => d.status === 'operational')
      : Object.values(defenders).filter((d: any) => d.status === 'operational')
    for (const weapon of Object.keys(state.state.onion.batteries || {})) {
      if (defenderList.length > 0) {
        const target = pickRandom(defenderList)
        const fireCmd = {
          type: 'FIRE',
          weapon,
          targetId: target.id,
        }
        const fireRes = await app.inject({
          method: 'POST', url: `/games/${gameId}/actions`,
          headers: { authorization: `Bearer ${onionToken}` },
          payload: fireCmd,
        })
        logStep(`ONION_MOVE: Onion Fires ${weapon} at ${target.id}`, fireRes.json())
      }
    }
    // End phase
    const endRes = await app.inject({
      method: 'POST', url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${onionToken}` },
      payload: { type: 'END_PHASE' },
    })
    logStep('ONION_MOVE: Onion Ends Phase', endRes.json())
  }

  // Fetch state again for defender phase
  stateRes = await app.inject({
    method: 'GET', url: `/games/${gameId}`,
    headers: { authorization: `Bearer ${defenderToken}` },
  })
  state = stateRes.json()
  phase = state.phase
  winner = state.winner
  if (winner) {
    logStep('runTurn: Game Over', { winner })
    return false
  }

  // DEFENDER_MOVE phase
  if (phase === 'DEFENDER_MOVE') {
    const onionPos = state.state.onion.position
    const defenders = state.state.defenders
    const defenderList = Array.isArray(defenders)
      ? defenders.filter((d: any) => d.status === 'operational')
      : Object.values(defenders).filter((d: any) => d.status === 'operational')
    for (const defender of defenderList) {
      // Move max distance toward onion (e.g., +1 q or r)
      const dq = onionPos.q - defender.position.q
      const dr = onionPos.r - defender.position.r
      const moveTo = {
        q: defender.position.q + Math.sign(dq),
        r: defender.position.r + Math.sign(dr),
      }
      const moveCmd = {
        type: 'MOVE_UNIT',
        unitId: defender.id,
        to: moveTo,
      }
      const moveRes = await app.inject({
        method: 'POST', url: `/games/${gameId}/actions`,
        headers: { authorization: `Bearer ${defenderToken}` },
        payload: moveCmd,
      })
      logStep(`DEFENDER_MOVE: ${defender.id} Moves`, moveRes.json())
      // Fire at random onion weapon system
      const onionWeapons = Object.keys(state.state.onion.batteries || {})
      if (onionWeapons.length > 0) {
        const weapon = pickRandom(onionWeapons)
        const fireCmd = {
          type: 'FIRE',
          unitId: defender.id,
          target: 'onion',
          weapon,
        }
        const fireRes = await app.inject({
          method: 'POST', url: `/games/${gameId}/actions`,
          headers: { authorization: `Bearer ${defenderToken}` },
          payload: fireCmd,
        })
        logStep(`DEFENDER_MOVE: ${defender.id} Fires ${weapon} at onion`, fireRes.json())
      }
    }
    // End phase
    const endRes = await app.inject({
      method: 'POST', url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${defenderToken}` },
      payload: { type: 'END_PHASE' },
    })
    logStep('DEFENDER_MOVE: Defenders End Phase', endRes.json())
  }

  // Fetch and log state at end of turn
  const finalStateRes = await app.inject({
    method: 'GET', url: `/games/${gameId}`,
    headers: { authorization: `Bearer ${onionToken}` },
  })
  logStep('runTurn: End State', finalStateRes.json())
  return true
}
