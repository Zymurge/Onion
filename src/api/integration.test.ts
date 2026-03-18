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

type TestUser = { userId: string; token: string }

type PhaseTracking = {
  onionAttackTargetId: string | null
  defenderAttackUnitIds: string[]
}

type IntegrationContext = {
  app: ReturnType<typeof buildApp>
  gameId: string
  onionUser: TestUser
  defenderUser: TestUser
  scenarioMap: ScenarioMap
  expectedState: ReturnType<typeof buildExpectedState>
  onionId: string
  tracking: PhaseTracking
}

async function setupIntegrationGame(seed: string): Promise<IntegrationContext> {
  const app = buildApp()

  const onionUser = await registerAndLoginUser(app, `onion-${seed}`, 'onionpass')
  const defenderUser = await registerAndLoginUser(app, `defender-${seed}`, 'defenderpass')

  const createGameRes = await app.inject({
    method: 'POST',
    url: '/games',
    headers: { authorization: `Bearer ${onionUser.token}` },
    payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
  })
  expect(createGameRes.statusCode).toBe(201)
  const { gameId } = createGameRes.json<{ gameId: string }>()

  const joinRes = await app.inject({
    method: 'POST',
    url: `/games/${gameId}/join`,
    headers: { authorization: `Bearer ${defenderUser.token}` },
    payload: {},
  })
  expect(joinRes.statusCode).toBe(200)

  const scenarioRes = await app.inject({ method: 'GET', url: '/scenarios/swamp-siege-01' })
  expect(scenarioRes.statusCode).toBe(200)
  const scenario = scenarioRes.json<{ map: ScenarioMap; initialState: any }>()

  const expectedState = buildExpectedState(scenario.initialState)

  const stateRes = await app.inject({
    method: 'GET',
    url: `/games/${gameId}`,
    headers: { authorization: `Bearer ${onionUser.token}` },
  })
  expect(stateRes.statusCode).toBe(200)
  const initialState = stateRes.json()
  assertStateMatches(initialState.state, expectedState)
  expectedState.onion.id = initialState.state.onion.id

  return {
    app,
    gameId,
    onionUser,
    defenderUser,
    scenarioMap: scenario.map,
    expectedState,
    onionId: initialState.state.onion.id,
    tracking: {
      onionAttackTargetId: null,
      defenderAttackUnitIds: [],
    },
  }
}

async function fetchGame(ctx: IntegrationContext, role: 'onion' | 'defender' = 'onion') {
  const token = role === 'onion' ? ctx.onionUser.token : ctx.defenderUser.token
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/games/${ctx.gameId}`,
    headers: { authorization: `Bearer ${token}` },
  })
  expect(res.statusCode).toBe(200)
  return res.json()
}

async function runEndPhase(
  ctx: IntegrationContext,
  role: 'onion' | 'defender',
  expectedFrom: string,
  expectedTo: string,
  options?: { expectedTurnDelta?: number },
) {
  const token = role === 'onion' ? ctx.onionUser.token : ctx.defenderUser.token
  const before = await fetchGame(ctx, role)
  expect(before.phase).toBe(expectedFrom)
  assertStateMatches(before.state, ctx.expectedState)

  const endRes = await ctx.app.inject({
    method: 'POST',
    url: `/games/${ctx.gameId}/actions`,
    headers: { authorization: `Bearer ${token}` },
    payload: { type: 'END_PHASE' },
  })
  expect(endRes.statusCode).toBe(200)
  const body = endRes.json()
  expect(body.ok).toBe(true)
  expect(body.events[0].type).toBe('PHASE_CHANGED')

  const after = await fetchGame(ctx, role)
  expect(after.phase).toBe(expectedTo)
  const expectedTurnDelta = options?.expectedTurnDelta ?? 0
  expect(after.turnNumber).toBe(before.turnNumber + expectedTurnDelta)
  assertStateMatches(after.state, ctx.expectedState)
}

async function runOnionMovePhase(ctx: IntegrationContext) {
  const state = await fetchGame(ctx, 'onion')
  expect(state.phase).toBe('ONION_MOVE')

  const nearest = findNearestOperationalDefender(state.state)
  const moveTarget = nearest
    ? chooseReachableMoveToward(ctx.scenarioMap, state.state, ctx.onionId, nearest.position)
    : chooseLegalAdjacentMove(ctx.scenarioMap, state.state, ctx.onionId)

  expect(moveTarget).not.toBeNull()
  if (!moveTarget) return

  const moveCmd = { type: 'MOVE' as const, unitId: ctx.onionId, to: moveTarget }
  const moveRes = await ctx.app.inject({
    method: 'POST',
    url: `/games/${ctx.gameId}/actions`,
    headers: { authorization: `Bearer ${ctx.onionUser.token}` },
    payload: moveCmd,
  })
  expect(moveRes.statusCode).toBe(200)
  const moveBody = moveRes.json()
  expect(moveBody.ok).toBe(true)
  expect(['ONION_MOVED', 'UNIT_MOVED']).toContain(moveBody.events[0].type)
  expect(moveBody.state.onion.position).toEqual(moveTarget)

  applyActionToExpectedState(ctx.expectedState, moveCmd, moveBody)
  assertStateMatches(moveBody.state, ctx.expectedState)

  const after = await fetchGame(ctx, 'onion')
  expect(after.phase).toBe('ONION_MOVE')
  assertStateMatches(after.state, ctx.expectedState)
}

async function runOnionAttackPhase(ctx: IntegrationContext) {
  const state = await fetchGame(ctx, 'onion')
  expect(state.phase).toBe('ONION_COMBAT')

  const missileCount = Number(state.state.onion.missiles ?? 0)
  const weaponType = missileCount > 0 ? 'missile' : 'main'
  const weaponRange = weaponType === 'missile' ? 5 : 3
  const targetId = findOnionTargetInRange(state.state, weaponRange)
  if (!targetId) {
    // Not every turn guarantees a legal Onion attack target. Treat as a valid no-op.
    assertStateMatches(state.state, ctx.expectedState)
    return
  }
  ctx.tracking.onionAttackTargetId = targetId

  const fireCmd = { type: 'FIRE_WEAPON' as const, weaponType: weaponType as 'missile' | 'main', weaponIndex: 0, targetId }
  const fireRes = await ctx.app.inject({
    method: 'POST',
    url: `/games/${ctx.gameId}/actions`,
    headers: { authorization: `Bearer ${ctx.onionUser.token}` },
    payload: fireCmd,
  })
  if (fireRes.statusCode === 422) {
    const failedFireBody = fireRes.json()
    expect(failedFireBody.ok).toBe(false)
    expect(failedFireBody.code).toBe('MOVE_INVALID')
    expect(typeof failedFireBody.detailCode).toBe('string')
    const afterFailed = await fetchGame(ctx, 'onion')
    assertStateMatches(afterFailed.state, ctx.expectedState)
    return
  }

  expect(fireRes.statusCode).toBe(200)
  const fireBody = fireRes.json()
  expect(fireBody.ok).toBe(true)
  expect(fireBody.events[0].type).toBe('WEAPON_FIRED')
  expect(fireBody.events[0].weaponType).toBe(weaponType)
  expect(fireBody.events[0].targetId).toBe(targetId)

  applyActionToExpectedState(ctx.expectedState, fireCmd, fireBody)
  assertStateMatches(fireBody.state, ctx.expectedState)

  if (weaponType === 'missile') {
    const exhaustedRes = await ctx.app.inject({
      method: 'POST',
      url: `/games/${ctx.gameId}/actions`,
      headers: { authorization: `Bearer ${ctx.onionUser.token}` },
      payload: fireCmd,
    })
    expect(exhaustedRes.statusCode).toBe(422)
    const exhaustedBody = exhaustedRes.json()
    expect(exhaustedBody.code).toBe('MOVE_INVALID')
    expect(exhaustedBody.detailCode).toBe('WEAPON_EXHAUSTED')
  }
}

async function runDefenderMovePhase(ctx: IntegrationContext) {
  const before = await fetchGame(ctx, 'defender')
  expect(before.phase).toBe('DEFENDER_MOVE')

  let latestState = before.state
  for (const unitId of sortDefendersByReach(latestState)) {
    const moveTarget = chooseReachableMoveToward(ctx.scenarioMap, latestState, unitId, latestState.onion.position)
    if (!moveTarget) continue

    const moveCmd = { type: 'MOVE' as const, unitId, to: moveTarget }
    const moveRes = await ctx.app.inject({
      method: 'POST',
      url: `/games/${ctx.gameId}/actions`,
      headers: { authorization: `Bearer ${ctx.defenderUser.token}` },
      payload: moveCmd,
    })
    expect(moveRes.statusCode).toBe(200)
    const moveBody = moveRes.json()
    expect(moveBody.ok).toBe(true)
    expect(moveBody.events[0].type).toBe('UNIT_MOVED')

    applyActionToExpectedState(ctx.expectedState, moveCmd, moveBody)
    assertStateMatches(moveBody.state, ctx.expectedState)
    latestState = moveBody.state

    if (findDefendersInRangeOfOnion(latestState).length >= 2) {
      break
    }
  }

  const after = await fetchGame(ctx, 'defender')
  expect(after.phase).toBe('DEFENDER_MOVE')
  assertStateMatches(after.state, ctx.expectedState)
}

async function runDefenderAttackPhase(ctx: IntegrationContext) {
  const state = await fetchGame(ctx, 'defender')
  expect(state.phase).toBe('DEFENDER_COMBAT')

  const fireUnitId = findDefendersInRangeOfOnion(state.state)[0]
  expect(fireUnitId).toBeTruthy()
  if (!fireUnitId) return

  const fireCmd = { type: 'FIRE_UNIT' as const, unitId: fireUnitId, targetId: ctx.onionId }
  const fireRes = await ctx.app.inject({
    method: 'POST',
    url: `/games/${ctx.gameId}/actions`,
    headers: { authorization: `Bearer ${ctx.defenderUser.token}` },
    payload: fireCmd,
  })
  expect(fireRes.statusCode).toBe(200)
  const fireBody = fireRes.json()
  expect(fireBody.ok).toBe(true)
  expect(fireBody.events[0].type).toBe('UNIT_FIRED')
  expect(fireBody.events[0].unitId).toBe(fireUnitId)
  expect(fireBody.events[0].targetId).toBe(ctx.onionId)

  applyActionToExpectedState(ctx.expectedState, fireCmd, fireBody)
  assertStateMatches(fireBody.state, ctx.expectedState)

  const combinedFireIds = findDefendersInRangeOfOnion(fireBody.state).slice(0, 2)
  expect(combinedFireIds.length).toBeGreaterThanOrEqual(1)
  ctx.tracking.defenderAttackUnitIds = combinedFireIds

  if (combinedFireIds.length === 2) {
    const combinedCmd = { type: 'COMBINED_FIRE' as const, unitIds: combinedFireIds, targetId: 'main' }
    const combinedRes = await ctx.app.inject({
      method: 'POST',
      url: `/games/${ctx.gameId}/actions`,
      headers: { authorization: `Bearer ${ctx.defenderUser.token}` },
      payload: combinedCmd,
    })
    expect(combinedRes.statusCode).toBe(200)
    const combinedBody = combinedRes.json()
    expect(combinedBody.ok).toBe(true)
    expect(combinedBody.events[0].type).toBe('COMBINED_FIRE_RESOLVED')
    expect(combinedBody.events[0].unitIds).toEqual(combinedFireIds)

    applyActionToExpectedState(ctx.expectedState, combinedCmd, combinedBody)
    assertStateMatches(combinedBody.state, ctx.expectedState)
  }
}

async function runGevSecondMovePhase(ctx: IntegrationContext) {
  const state = await fetchGame(ctx, 'defender')
  expect(state.phase).toBe('GEV_SECOND_MOVE')

  const gevUnitId = Object.keys(state.state.defenders).find((unitId) => state.state.defenders[unitId].type === 'BigBadWolf')
  expect(gevUnitId).toBeTruthy()
  if (!gevUnitId) return

  const moveTarget = chooseReachableMoveToward(ctx.scenarioMap, state.state, gevUnitId, state.state.onion.position)
  expect(moveTarget).not.toBeNull()
  if (!moveTarget) return

  const moveCmd = { type: 'MOVE' as const, unitId: gevUnitId, to: moveTarget }
  const moveRes = await ctx.app.inject({
    method: 'POST',
    url: `/games/${ctx.gameId}/actions`,
    headers: { authorization: `Bearer ${ctx.defenderUser.token}` },
    payload: moveCmd,
  })
  expect(moveRes.statusCode).toBe(200)
  const moveBody = moveRes.json()
  expect(moveBody.ok).toBe(true)
  expect(moveBody.events[0].type).toBe('UNIT_MOVED')

  applyActionToExpectedState(ctx.expectedState, moveCmd, moveBody)
  assertStateMatches(moveBody.state, ctx.expectedState)
}

async function runTurnOrchestrator(ctx: IntegrationContext): Promise<boolean> {
  const start = await fetchGame(ctx, 'onion')
  if (start.winner) return false

  await runOnionMovePhase(ctx)
  await runEndPhase(ctx, 'onion', 'ONION_MOVE', 'ONION_COMBAT')
  await runOnionAttackPhase(ctx)
  await runEndPhase(ctx, 'onion', 'ONION_COMBAT', 'DEFENDER_MOVE')
  await runDefenderMovePhase(ctx)
  await runEndPhase(ctx, 'defender', 'DEFENDER_MOVE', 'DEFENDER_COMBAT')
  await runDefenderAttackPhase(ctx)
  await runEndPhase(ctx, 'defender', 'DEFENDER_COMBAT', 'GEV_SECOND_MOVE')
  await runGevSecondMovePhase(ctx)
  await runEndPhase(ctx, 'defender', 'GEV_SECOND_MOVE', 'ONION_MOVE', { expectedTurnDelta: 1 })

  const end = await fetchGame(ctx, 'onion')
  assertStateMatches(end.state, ctx.expectedState)
  return !end.winner
}

async function runGameOrchestrator(turns: number, seed: string) {
  const ctx = await setupIntegrationGame(seed)
  for (let turn = 0; turn < turns; turn++) {
    const keepGoing = await runTurnOrchestrator(ctx)
    if (!keepGoing) break
  }
  return ctx
}

describe('Integration Phases (Modular)', () => {
  it('ONION_MOVE phase test validates move events and expected state', async () => {
    const ctx = await setupIntegrationGame('phase-onion-move')
    await runOnionMovePhase(ctx)
  })

  it('END_PHASE test validates ONION_MOVE -> ONION_COMBAT transition and state model', async () => {
    const ctx = await setupIntegrationGame('phase-end-phase')
    await runOnionMovePhase(ctx)
    await runEndPhase(ctx, 'onion', 'ONION_MOVE', 'ONION_COMBAT')
  })

  it('ONION_ATTACK phase test validates combat events, errors, and expected state', async () => {
    const ctx = await setupIntegrationGame('phase-onion-attack')
    await runOnionMovePhase(ctx)
    await runEndPhase(ctx, 'onion', 'ONION_MOVE', 'ONION_COMBAT')
    await runOnionAttackPhase(ctx)
  })

  it('DEFENDER_MOVE phase test validates defender maneuvers and expected state', async () => {
    const ctx = await setupIntegrationGame('phase-defender-move')
    await runOnionMovePhase(ctx)
    await runEndPhase(ctx, 'onion', 'ONION_MOVE', 'ONION_COMBAT')
    await runOnionAttackPhase(ctx)
    await runEndPhase(ctx, 'onion', 'ONION_COMBAT', 'DEFENDER_MOVE')
    await runDefenderMovePhase(ctx)
  })

  it('DEFENDER_ATTACK phase test validates fire/combine behavior and expected state', async () => {
    const ctx = await setupIntegrationGame('phase-defender-attack')
    await runOnionMovePhase(ctx)
    await runEndPhase(ctx, 'onion', 'ONION_MOVE', 'ONION_COMBAT')
    await runOnionAttackPhase(ctx)
    await runEndPhase(ctx, 'onion', 'ONION_COMBAT', 'DEFENDER_MOVE')
    await runDefenderMovePhase(ctx)
    await runEndPhase(ctx, 'defender', 'DEFENDER_MOVE', 'DEFENDER_COMBAT')
    await runDefenderAttackPhase(ctx)
  })

  it('final END_PHASE after GEV_SECOND_MOVE increments turn and starts next turn at ONION_MOVE', async () => {
    const ctx = await setupIntegrationGame('phase-final-end-phase')
    await runOnionMovePhase(ctx)
    await runEndPhase(ctx, 'onion', 'ONION_MOVE', 'ONION_COMBAT')
    await runOnionAttackPhase(ctx)
    await runEndPhase(ctx, 'onion', 'ONION_COMBAT', 'DEFENDER_MOVE')
    await runDefenderMovePhase(ctx)
    await runEndPhase(ctx, 'defender', 'DEFENDER_MOVE', 'DEFENDER_COMBAT')
    await runDefenderAttackPhase(ctx)
    await runEndPhase(ctx, 'defender', 'DEFENDER_COMBAT', 'GEV_SECOND_MOVE')
    await runGevSecondMovePhase(ctx)
    await runEndPhase(ctx, 'defender', 'GEV_SECOND_MOVE', 'ONION_MOVE', { expectedTurnDelta: 1 })
  })
})

describe('Integration Orchestrators', () => {
  it('turn orchestrator runs phase tests in sequence for one full turn', async () => {
    const ctx = await setupIntegrationGame('orchestrator-turn')
    const keepGoing = await runTurnOrchestrator(ctx)

    expect(typeof keepGoing).toBe('boolean')
    const state = await fetchGame(ctx, 'onion')
    expect(state.phase).toBe('ONION_MOVE')
    expect(state.turnNumber).toBe(2)
    assertStateMatches(state.state, ctx.expectedState)
  })

  it('game orchestrator setup runs once and supports multiple turns', async () => {
    const ctx = await runGameOrchestrator(3, 'orchestrator-game')
    const state = await fetchGame(ctx, 'onion')

    expect(state.turnNumber).toBeGreaterThanOrEqual(2)
    expect(state.phase).toBe('ONION_MOVE')
    assertStateMatches(state.state, ctx.expectedState)
  })
})

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
