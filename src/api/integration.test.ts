import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'
import {
  applyActionToExpectedState,
  assertStateMatches,
  buildExpectedState,
  chooseLegalAdjacentMove,
  chooseReachableMoveToward,
  registerAndLoginUser,
  type ScenarioMap,
} from './integration.helpers.js'
import { hexDistance } from '../engine/map.js'
import { getUnitDefinition } from '../engine/units.js'

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

    const initialGameStateRes = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${onionUser.token}` } })
    const initialGameState = initialGameStateRes.json().state
    expectedState.onion.id = initialGameState.onion.id
    const onionId = initialGameState.onion.id
    const defenderIds = Object.keys(initialGameState.defenders)

    // --- Simulate a full turn to reach DEFENDER_COMBAT phase ---
    // 1. Onion MOVE
    const onionMoveTarget = chooseReachableMoveToward(scenarioMap, initialGameState, onionId, initialGameState.defenders['pigs-1'].position)
    expect(onionMoveTarget).not.toBeNull()
    const onionMoveRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'MOVE', unitId: onionId, to: onionMoveTarget } })
    expect(onionMoveRes.statusCode).toBe(200)
    applyActionToExpectedState(expectedState, { type: 'MOVE', unitId: onionId, to: onionMoveTarget }, onionMoveRes.json())

    await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'END_PHASE' } })
    // 2. Onion COMBAT
    const onionCombatStateRes = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${onionUser.token}` } })
    const onionCombatState = onionCombatStateRes.json().state
    const missileTargetId = findOnionTargetInRange(onionCombatState, 5)
    expect(missileTargetId).not.toBeNull()

    const onionFireRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'FIRE_WEAPON', weaponType: 'missile', weaponIndex: 0, targetId: missileTargetId } })
    expect(onionFireRes.statusCode).toBe(200)
    const onionFireBody = onionFireRes.json()
    expect(onionFireBody.ok).toBe(true)
    expect(onionFireBody.events[0].type).toBe('WEAPON_FIRED')
    expect(onionFireBody.events[0].weaponType).toBe('missile')
    expect(onionFireBody.events[0].targetId).toBe(missileTargetId)
    applyActionToExpectedState(expectedState, { type: 'FIRE_WEAPON', weaponType: 'missile', weaponIndex: 0, targetId: missileTargetId }, onionFireBody)

    const exhaustedWeaponRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'FIRE_WEAPON', weaponType: 'missile', weaponIndex: 0, targetId: missileTargetId } })
    expect(exhaustedWeaponRes.statusCode).toBe(422)
    const exhaustedWeaponBody = exhaustedWeaponRes.json()
    expect(exhaustedWeaponBody.ok).toBe(false)
    expect(exhaustedWeaponBody.code).toBe('MOVE_INVALID')
    expect(exhaustedWeaponBody.detailCode).toBe('WEAPON_EXHAUSTED')
    expect(exhaustedWeaponBody.error).toMatch(/destroyed or exhausted/)

    const illegalTargetRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'FIRE_WEAPON', weaponType: 'main', weaponIndex: 0, targetId: 'not-a-unit' } })
    expect(illegalTargetRes.statusCode).toBe(422)
    const illegalTargetBody = illegalTargetRes.json()
    expect(illegalTargetBody.ok).toBe(false)
    expect(illegalTargetBody.code).toBe('MOVE_INVALID')
    expect(illegalTargetBody.detailCode).toBe('NO_TARGET')
    expect(illegalTargetBody.error).toMatch(/Target not found/)

    await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${onionUser.token}` }, payload: { type: 'END_PHASE' } })
    // 3. DEFENDER_RECOVERY (auto-advanced by engine)
    // 4. DEFENDER_MOVE
    const defenderMoveStateRes = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${defenderUser.token}` } })
    let defenderMoveState = defenderMoveStateRes.json().state
    for (const unitId of sortDefendersByReach(defenderMoveState)) {
      const moveTarget = chooseReachableMoveToward(scenarioMap, defenderMoveState, unitId, defenderMoveState.onion.position)
      if (!moveTarget) continue

      const defenderMoveRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'MOVE', unitId, to: moveTarget } })
      expect(defenderMoveRes.statusCode).toBe(200)
      const defenderMoveBody = defenderMoveRes.json()
      applyActionToExpectedState(expectedState, { type: 'MOVE', unitId, to: moveTarget }, defenderMoveBody)
      defenderMoveState = defenderMoveBody.state

      if (findDefendersInRangeOfOnion(defenderMoveState).length >= 2) {
        break
      }
    }

    await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'END_PHASE' } })
    // 5. DEFENDER_COMBAT (now ready for defender attacks)

    const defenderCombatStateRes = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${defenderUser.token}` } })
    const defenderCombatState = defenderCombatStateRes.json().state
    const fireUnitId = findDefendersInRangeOfOnion(defenderCombatState)[0]
    expect(fireUnitId).toBeTruthy()

    // Valid FIRE_UNIT (defender attacks onion)
    const fireUnitRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'FIRE_UNIT', unitId: fireUnitId, targetId: onionId } })
    expect(fireUnitRes.statusCode).toBe(200)
    const fireUnitBody = fireUnitRes.json()
    expect(fireUnitBody.ok).toBe(true)
    expect(fireUnitBody.events[0].type).toBe('UNIT_FIRED')
    expect(fireUnitBody.events[0].unitId).toBe(fireUnitId)
    expect(fireUnitBody.events[0].targetId).toBe(onionId)
    applyActionToExpectedState(expectedState, { type: 'FIRE_UNIT', unitId: fireUnitId, targetId: onionId }, fireUnitBody)

    const combinedFireState = fireUnitBody.state
    const combinedFireIds = findDefendersInRangeOfOnion(combinedFireState).slice(0, 2)
    expect(combinedFireIds).toHaveLength(2)

    // Valid COMBINED_FIRE (defenders attack Onion main battery)
    const combinedFireRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'COMBINED_FIRE', unitIds: combinedFireIds, targetId: 'main' } })
    expect(combinedFireRes.statusCode).toBe(200)
    const combinedFireBody = combinedFireRes.json()
    expect(combinedFireBody.ok).toBe(true)
    expect(combinedFireBody.events[0].type).toBe('COMBINED_FIRE_RESOLVED')
    expect(combinedFireBody.events[0].unitIds).toEqual(combinedFireIds)
    expect(combinedFireBody.events[0].targetId).toBe('main')
    applyActionToExpectedState(expectedState, { type: 'COMBINED_FIRE', unitIds: combinedFireIds, targetId: 'main' }, combinedFireBody)

    // Invalid COMBINED_FIRE on Onion treads
    const invalidCombinedFireRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'COMBINED_FIRE', unitIds: combinedFireIds, targetId: onionId } })
    expect(invalidCombinedFireRes.statusCode).toBe(422)
    const invalidCombinedFireBody = invalidCombinedFireRes.json()
    expect(invalidCombinedFireBody.ok).toBe(false)
    expect(invalidCombinedFireBody.code).toBe('MOVE_INVALID')
    expect(invalidCombinedFireBody.detailCode).toBe('COMBINED_FIRE_TREAD_TARGET')
    expect(invalidCombinedFireBody.error).toMatch(/Combined fire is not allowed on Onion treads/)

    const gevPhaseRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'END_PHASE' } })
    expect(gevPhaseRes.statusCode).toBe(200)

    const gevMoveStateRes = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${defenderUser.token}` } })
    const gevMoveState = gevMoveStateRes.json().state
    const gevUnitId = Object.keys(gevMoveState.defenders).find((unitId) => gevMoveState.defenders[unitId].type === 'BigBadWolf')
    expect(gevUnitId).toBeTruthy()
    if (!gevUnitId) {
      throw new Error('Expected at least one GEV-capable defender')
    }
    const gevMoveTarget = chooseReachableMoveToward(scenarioMap, gevMoveState, gevUnitId, gevMoveState.onion.position)
    expect(gevMoveTarget).not.toBeNull()
    const gevMoveRes = await app.inject({ method: 'POST', url: `/games/${gameId}/actions`, headers: { authorization: `Bearer ${defenderUser.token}` }, payload: { type: 'MOVE', unitId: gevUnitId, to: gevMoveTarget } })
    expect(gevMoveRes.statusCode).toBe(200)
    applyActionToExpectedState(expectedState, { type: 'MOVE', unitId: gevUnitId, to: gevMoveTarget }, gevMoveRes.json())

    const finalStateRes = await app.inject({ method: 'GET', url: `/games/${gameId}`, headers: { authorization: `Bearer ${onionUser.token}` } })
    assertStateMatches(finalStateRes.json().state, expectedState)
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
    const nearestDefender = findNearestOperationalDefender(state.state)
    const moveTarget = nearestDefender
      ? chooseReachableMoveToward(scenarioMap, state.state, onionUnitId, nearestDefender.position)
      : chooseLegalAdjacentMove(scenarioMap, state.state, onionUnitId)
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
    const onionCombatStateRes = await app.inject({
      method: 'GET', url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${onionToken}` },
    })
    const onionCombatState = onionCombatStateRes.json()
    const missileTargetId = findOnionTargetInRange(onionCombatState.state, 5)
    if (missileTargetId) {
      const fireRes = await app.inject({
        method: 'POST', url: `/games/${gameId}/actions`,
        headers: { authorization: `Bearer ${onionToken}` },
        payload: { type: 'FIRE_WEAPON', weaponType: 'missile', weaponIndex: 0, targetId: missileTargetId },
      })
      expect([200, 422]).toContain(fireRes.statusCode)
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
    for (const defender of defenderList.sort((left: any, right: any) => defenderMovement(right) - defenderMovement(left))) {
      const moveTo = chooseReachableMoveToward(scenarioMap, state.state, defender.id, state.state.onion.position)
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
    }

    const defenderCombatStateRes = await app.inject({
      method: 'GET', url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${defenderToken}` },
    })
    const defenderCombatState = defenderCombatStateRes.json()
    const fireUnitId = findDefendersInRangeOfOnion(defenderCombatState.state)[0]
    if (fireUnitId) {
      const fireRes = await app.inject({
        method: 'POST', url: `/games/${gameId}/actions`,
        headers: { authorization: `Bearer ${defenderToken}` },
        payload: { type: 'FIRE_UNIT', unitId: fireUnitId, targetId: onionUnitId },
      })
      expect([200, 422]).toContain(fireRes.statusCode)
    }

    const combinedFireIds = findDefendersInRangeOfOnion(defenderCombatState.state).slice(0, 2)
    if (combinedFireIds.length === 2) {
      const combinedFireRes = await app.inject({
        method: 'POST', url: `/games/${gameId}/actions`,
        headers: { authorization: `Bearer ${defenderToken}` },
        payload: { type: 'COMBINED_FIRE', unitIds: combinedFireIds, targetId: 'main' },
      })
      expect([200, 422]).toContain(combinedFireRes.statusCode)
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

function findNearestOperationalDefender(state: any): any | null {
  return (Object.values(state.defenders as Record<string, any>) as any[])
    .filter((defender: any) => defender.status === 'operational')
    .sort((left: any, right: any) => hexDistance(state.onion.position, left.position) - hexDistance(state.onion.position, right.position))[0] ?? null
}

function findOnionTargetInRange(state: any, range: number): string | null {
  const defenders = (Object.values(state.defenders as Record<string, any>) as any[])
    .filter((defender: any) => defender.status === 'operational')
    .sort((left: any, right: any) => {
      const leftDistance = hexDistance(state.onion.position, left.position)
      const rightDistance = hexDistance(state.onion.position, right.position)
      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      return String(left.id).localeCompare(String(right.id))
    })

  return defenders.find((defender: any) => hexDistance(state.onion.position, defender.position) <= range)?.id ?? null
}

function defenderMovement(defender: any): number {
  return getUnitDefinition(defender.type).movement
}

function defenderMaxRange(defender: any): number {
  return Math.max(...getUnitDefinition(defender.type).weapons.map((weapon) => weapon.range), 0)
}

function findDefendersInRangeOfOnion(state: any): string[] {
  return (Object.values(state.defenders as Record<string, any>) as any[])
    .filter((defender: any) => defender.status === 'operational')
    .filter((defender: any) => hexDistance(defender.position, state.onion.position) <= defenderMaxRange(defender))
    .map((defender: any) => defender.id)
    .sort((left, right) => left.localeCompare(right))
}

function sortDefendersByReach(state: any): string[] {
  return (Object.values(state.defenders as Record<string, any>) as any[])
    .filter((defender: any) => defender.status === 'operational')
    .sort((left: any, right: any) => {
      const movementDelta = defenderMovement(right) - defenderMovement(left)
      if (movementDelta !== 0) return movementDelta
      return String(left.id).localeCompare(String(right.id))
    })
    .map((defender: any) => defender.id)
}
