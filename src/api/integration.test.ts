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
  it('registers, logs in two users, creates a game, and joins', async () => {
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
    // Validate minimal game state from creation response
    validateGameState(createGame.json(), {
      gameId,
      mode: 'minimal',
    })

    // Fetch scenario for map validation
    const scenarioRes = await app.inject({
      method: 'GET',
      url: `/scenarios/swamp-siege-01`,
    })
    logStep('Scenario (Map) Fetch', scenarioRes.json())
    expect(scenarioRes.statusCode).toBe(200)
    const scenario = scenarioRes.json()
    expect(scenario).toHaveProperty('map')
    expect(typeof scenario.map.width).toBe('number')
    expect(typeof scenario.map.height).toBe('number')
    expect(Array.isArray(scenario.map.hexes)).toBe(true)

    // User2 joins the game as 'defender'
    const joinGame = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/join`,
      headers: { authorization: `Bearer ${loginToken2}` },
      payload: {},
    })
    logStep('User 2 Joins Game', joinGame.json())
    expect(joinGame.statusCode).toBe(200)
    expect(joinGame.json().role).toBe('defender')

    // Fetch and validate game state as user1 (onion)
    const state1 = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${loginToken1}` },
    })
    logStep('Game State for User 1', state1.json())
    expect(state1.statusCode).toBe(200)
    validateGameState(state1.json(), {
      gameId,
      playerUserIds: { onion: userId1, defender: userId2 },
      phase: 'ONION_MOVE',
      turnNumber: 1,
      mode: 'full',
      expectMap: false, // skip map check in game state
    })

    // Fetch and validate game state as user2 (defender)
    const state2 = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${loginToken2}` },
    })
    logStep('Game State for User 2', state2.json())
    expect(state2.statusCode).toBe(200)
    validateGameState(state2.json(), {
      gameId,
      playerUserIds: { onion: userId1, defender: userId2 },
      phase: 'ONION_MOVE',
      turnNumber: 1,
      mode: 'full',
      expectMap: false, // skip map check in game state
    })

    // User1 ends phase (ONION_MOVE)
    const endPhase1 = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${loginToken1}` },
      payload: { type: 'END_PHASE' },
    })
    logStep('User 1 Ends Phase', endPhase1.json())
    expect(endPhase1.statusCode).toBe(200)
    // Fetch and log state after user1 ends phase
    const after1 = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${loginToken1}` },
    })
    logStep('Game State After User 1 Ends Phase', after1.json())
    expect(after1.statusCode).toBe(200)
    const after1State = after1.json()
    validateGameState(after1State, {
      gameId,
      playerUserIds: { onion: userId1, defender: userId2 },
      turnNumber: 1, // Still turn 1, but phase should advance
      mode: 'full',
      expectMap: false,
    })
    logStep('Phase After User 1 Ends Phase', { phase: after1State.phase, actor: after1State.phase === 'ONION_MOVE' ? 'onion' : (after1State.phase === 'DEFENDER_MOVE' ? 'defender' : 'unknown') })

    // Only proceed if it's defender's turn
    if (after1State.phase === 'DEFENDER_MOVE') {
      // User2 ends phase (DEFENDER_MOVE)
      const endPhase2 = await app.inject({
        method: 'POST',
        url: `/games/${gameId}/actions`,
        headers: { authorization: `Bearer ${loginToken2}` },
        payload: { type: 'END_PHASE' },
      })
      logStep('User 2 Ends Phase', endPhase2.json())
      expect(endPhase2.statusCode).toBe(200)
      // Validate state after both have ended phase
      const after2 = await app.inject({
        method: 'GET',
        url: `/games/${gameId}`,
        headers: { authorization: `Bearer ${loginToken2}` },
      })
      logStep('Game State After User 2 Ends Phase', after2.json())
      expect(after2.statusCode).toBe(200)
      validateGameState(after2.json(), {
        gameId,
        playerUserIds: { onion: userId1, defender: userId2 },
        turnNumber: 2, // Should increment after both phases
        mode: 'full',
        expectMap: false,
      })
      logStep('Phase After User 2 Ends Phase', { phase: after2.json().phase })
    } else {
      logStep('Skipping User 2 END_PHASE: Not defender phase', { phase: after1State.phase })
    }

    // Final state log
    logStep('Final State', {
      user1: { userId1, token1, loginUserId1, loginToken1 },
      user2: { userId2, token2, loginUserId2, loginToken2 },
      gameId,
    })
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
        type: 'MOVE',
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
