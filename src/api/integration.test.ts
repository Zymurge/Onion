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

  it('handles valid and invalid combat actions, asserts events and errors', async () => {
    const app = buildApp()
    const onionUser = await registerAndLoginUser(app, 'onion', 'onionpass')
    const defenderUser = await registerAndLoginUser(app, 'defender', 'defenderpass')
    const createGame = await app.inject({ method: 'POST', url: '/games', headers: { authorization: `Bearer ${onionUser.token}` }, payload: { scenarioId: 'swamp-siege-01', role: 'onion' } })
    const { gameId } = createGame.json()
    await app.inject({ method: 'POST', url: `/games/${gameId}/join`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: {} })

    // Fetch scenario and initialize expected state model
    const scenarioRes = await app.inject({ method: 'GET', url: `/scenarios/swamp-siege-01` })
    const scenario = scenarioRes.json()
    const scenarioMap = scenario.map as ScenarioMap
    const initialState = scenario.initialState
    const expectedState = buildExpectedState(initialState)
    const onionId = initialState.onion.id
    const defenderIds = Object.keys(initialState.defenders)

    // Valid FIRE_UNIT (defender attacks onion)
    const fireUnitRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'FIRE_UNIT', unitId: defenderIds[0], targetId: onionId } })
    expect(fireUnitRes.statusCode).toBe(200)
    const fireUnitBody = fireUnitRes.json()
    expect(fireUnitBody.ok).toBe(true)
    expect(fireUnitBody.events[0].type).toBe('UNIT_FIRED')
    expect(fireUnitBody.events[0].unitId).toBe(defenderIds[0])
    expect(fireUnitBody.events[0].targetId).toBe(onionId)

    // Valid COMBINED_FIRE (defenders attack witch)
    const combinedFireRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'COMBINED_FIRE', unitIds: defenderIds, targetId: 'witch-1' } })
    expect(combinedFireRes.statusCode).toBe(200)
    const combinedFireBody = combinedFireRes.json()
    expect(combinedFireBody.ok).toBe(true)
    expect(combinedFireBody.events[0].type).toBe('COMBINED_FIRE_RESOLVED')
    expect(combinedFireBody.events[0].unitIds).toEqual(defenderIds)
    expect(combinedFireBody.events[0].targetId).toBe('witch-1')

    // Invalid COMBINED_FIRE on Onion treads
    const invalidCombinedFireRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'COMBINED_FIRE', unitIds: defenderIds, targetId: onionId } })
    expect(invalidCombinedFireRes.statusCode).toBe(422)
    const invalidCombinedFireBody = invalidCombinedFireRes.json()
    expect(invalidCombinedFireBody.ok).toBe(false)
    expect(invalidCombinedFireBody.code).toBe('MOVE_INVALID')
    expect(invalidCombinedFireBody.detailCode).toBe('COMBINED_FIRE_TREAD_TARGET')
    expect(invalidCombinedFireBody.error).toMatch(/Combined fire is not allowed on Onion treads/)

    // Invalid FIRE_WEAPON (exhausted weapon)
    const exhaustedWeaponRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'FIRE_WEAPON', weaponType: 'missile', weaponIndex: 0, targetId: defenderIds[0] } })
    expect(exhaustedWeaponRes.statusCode).toBe(422)
    const exhaustedWeaponBody = exhaustedWeaponRes.json()
    expect(exhaustedWeaponBody.ok).toBe(false)
    expect(exhaustedWeaponBody.code).toBe('MOVE_INVALID')
    expect(exhaustedWeaponBody.detailCode).toBe('WEAPON_EXHAUSTED')
    expect(exhaustedWeaponBody.error).toMatch(/Missile 0 is already destroyed or exhausted/)

    // Invalid FIRE_WEAPON (illegal target)
    const illegalTargetRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'FIRE_WEAPON', weaponType: 'main', weaponIndex: 0, targetId: 'not-a-unit' } })
    expect(illegalTargetRes.statusCode).toBe(422)
    const illegalTargetBody = illegalTargetRes.json()
    expect(illegalTargetBody.ok).toBe(false)
    expect(illegalTargetBody.code).toBe('MOVE_INVALID')
    expect(illegalTargetBody.detailCode).toBe('NO_TARGET')
    expect(illegalTargetBody.error).toMatch(/Target not found/)
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
