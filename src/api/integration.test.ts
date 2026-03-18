import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'
import {
  applyActionToExpectedState,
  assertStateMatches,
  buildExpectedState,
  chooseLegalAdjacentMove,
  registerAndLoginUser,
  type ScenarioMap,
} from './integration.helpers.js'

describe('Integration: Register, Login, Create Game, Join', () => {
  it('registers, logs in two users, creates a game, joins, and validates state model', async () => {
    const app = buildApp()

    const onionUser = await registerAndLoginUser(app, 'onion', 'onionpass')
    const defenderUser = await registerAndLoginUser(app, 'defender', 'defenderpass')

    // User1 creates a game as 'onion'
    const createGame = await app.inject({ method: 'POST', url: '/games', headers: { authorization: `Bearer ${onionUser.token}` }, payload: { scenarioId: 'swamp-siege-01', role: 'onion' } })
    const { gameId } = createGame.json()

    // Fetch scenario and initialize expected state model
    const scenarioRes = await app.inject({ method: 'GET', url: `/scenarios/swamp-siege-01` })
    const scenario = scenarioRes.json()
    const scenarioMap = scenario.map as ScenarioMap
    // Build expected state from scenario initialState
    const initialState = scenario.initialState
    const expectedState = buildExpectedState(initialState)

    // User2 joins the game as 'defender'
    await app.inject({ method: 'POST', url: `/games/${gameId}/join`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: {} })

    // Fetch and validate game state as user1 (onion)
    const state1 = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${onionUser.token}` } })
    const apiState1 = state1.json().state
    assertStateMatches(apiState1, expectedState)

    // Use the generated Onion id from API state
    expectedState.onion.id = apiState1.onion.id
    const onionId = apiState1.onion.id

    // User1 moves onion using correct id
    const onionMoveTarget = chooseLegalAdjacentMove(scenarioMap, apiState1, onionId)
    expect(onionMoveTarget).not.toBeNull()
    const onionMove = { type: 'MOVE', unitId: onionId, to: onionMoveTarget }
    const moveRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: onionMove })
    expect(moveRes.statusCode).toBe(200)
    applyActionToExpectedState(expectedState, onionMove, moveRes.json())
    const afterMoveState = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${onionUser.token}` } })
    assertStateMatches(afterMoveState.json().state, expectedState)

    // User1 ends phase
    await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'END_PHASE', unitId: onionId } })
    const afterPhaseState = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${onionUser.token}` } })
    assertStateMatches(afterPhaseState.json().state, expectedState)
  })

  it('simulates a full turn for both onion and defenders', async () => {
    const app = buildApp()

    const onionUser = await registerAndLoginUser(app, 'onion', 'onionpass')
    const defenderUser = await registerAndLoginUser(app, 'defender', 'defenderpass')

    // User1 creates a game as 'onion'
    const createGame = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${onionUser.token}` },
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })
    expect(createGame.statusCode).toBe(201)
    const { gameId } = createGame.json()
    expect(typeof gameId).toBe('string')

    // Ensure defender joins before any moves
    const joinRes = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/join`,
      headers: { authorization: `Bearer ${defenderUser.token}` },
      payload: {},
    })
    expect(joinRes.statusCode).toBe(200)

    // Run 3 turns
    for (let turn = 1; turn <= 3; turn++) {
      const keepGoing = await runTurn({
        app,
        gameId,
        onionToken: onionUser.token,
        defenderToken: defenderUser.token,
      })
      if (!keepGoing) {
        break
      }
    }
  })
})

// Utility: pick a random element from an array
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Simulate a full turn for both onion and defenders
async function runTurn({ app, gameId, onionToken, defenderToken }: {
  app: any,
  gameId: string,
  onionToken: string,
  defenderToken: string,
}) {
  const scenarioRes = await app.inject({ method: 'GET', url: '/scenarios/swamp-siege-01' })
  const scenarioMap = scenarioRes.json().map as ScenarioMap

  // Fetch state to determine whose turn
  let stateRes = await app.inject({
    method: 'GET', url: `/games/${gameId}`,
    headers: { authorization: `Bearer ${onionToken}` },
  })
  let state = stateRes.json()
  let phase = state.phase
  let winner = state.winner
  if (winner) {
    return false
  }

  // ONION MOVE phase
  if (phase === 'ONION_MOVE') {
    const onionUnitId = state.state.onion.id
    const moveTarget = chooseLegalAdjacentMove(scenarioMap, state.state, onionUnitId)
    if (moveTarget) {
      const moveCmd = {
        type: 'MOVE',
        unitId: onionUnitId,
        to: moveTarget,
      }
      const moveRes = await app.inject({
        method: 'POST', url: `/games/${gameId}/actions`,
        headers: { authorization: `Bearer ${onionToken}` },
        payload: moveCmd,
      })
      expect([200, 422]).toContain(moveRes.statusCode)
    }
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
          unitId: onionUnitId,
        }
        const fireRes = await app.inject({
          method: 'POST', url: `/games/${gameId}/actions`,
          headers: { authorization: `Bearer ${onionToken}` },
          payload: fireCmd,
        })
        expect(fireRes.statusCode).toBe(200)
      }
    }
    // End phase
    const endRes = await app.inject({
      method: 'POST', url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${onionToken}` },
      payload: { type: 'END_PHASE' },
    })
    expect(endRes.statusCode).toBe(200)
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
    return false
  }

  // DEFENDER_MOVE phase
  if (phase === 'DEFENDER_MOVE') {
    const onionUnitId = state.state.onion.id
    const defenders = state.state.defenders
    const defenderList = Array.isArray(defenders)
      ? defenders.filter((d: any) => d.status === 'operational')
      : Object.values(defenders).filter((d: any) => d.status === 'operational')
    for (const defender of defenderList) {
      const moveTo = chooseLegalAdjacentMove(scenarioMap, state.state, defender.id)
      if (moveTo) {
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
        expect([200, 422]).toContain(moveRes.statusCode)
      }
      // Fire at random onion weapon system
      const onionWeapons = Object.keys(state.state.onion.batteries || {})
      if (onionWeapons.length > 0) {
        const weapon = pickRandom(onionWeapons)
        const fireCmd = {
          type: 'FIRE',
          unitId: defender.id,
          target: onionUnitId,
          weapon,
        }
        const fireRes = await app.inject({
          method: 'POST', url: `/games/${gameId}/actions`,
          headers: { authorization: `Bearer ${defenderToken}` },
          payload: fireCmd,
        })
        expect(fireRes.statusCode).toBe(200)
      }
    }
    // End phase
    const endRes = await app.inject({
      method: 'POST', url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${defenderToken}` },
      payload: { type: 'END_PHASE' },
    })
    expect(endRes.statusCode).toBe(200)
  }

  const finalStateRes = await app.inject({
    method: 'GET', url: `/games/${gameId}`,
    headers: { authorization: `Bearer ${onionToken}` },
  })
  expect(finalStateRes.statusCode).toBe(200)
  return true
}
