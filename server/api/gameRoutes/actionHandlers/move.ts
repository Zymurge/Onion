import logger from '#server/logger'
import { createMap } from '#server/engine/map'
import { executeUnitMovement, reconcileStackStateAfterMoves, validateUnitMovement } from '#server/engine/index'
import type { EventEnvelope, SingleUnitMoveCommand } from '#shared/types/index'
import { buildEngineState } from '#server/api/gameHelpers/stateProjection'
import { buildActionResponse } from '#server/api/gameHelpers/actionResponses'
import { buildMoveEvents } from '#server/api/gameHelpers/eventBuilders'
import { computeWinnerUserId } from '#server/api/gameHelpers/victory'
import { getScenarioMapSnapshot, getScenarioRulesContext, type ScenarioSnapshot } from '#server/api/gameHelpers/scenario'
import { logActionOutcome, logSentEvents } from '#server/api/gameHelpers/logging'
import type { ActionHandlerContext, ActionHandlerResponse } from './types.js'

type MoveCommand = Extract<import('#shared/types/index').Command, { type: 'MOVE' }>

/**
 * Executes a MOVE command for one or more selected units and persists its events.
 *
 * @param context Match, sequencing, roll-source, persistence, broadcast, and response dependencies.
 * @param command Validated MOVE command from the action dispatcher.
 * @returns HTTP 200 response on success or HTTP 422 with the engine validation failure.
 * @throws Errors from engine execution or persistence for the dispatcher to classify.
 */
export async function handleMove(context: ActionHandlerContext, command: MoveCommand): Promise<ActionHandlerResponse> {
  const { db, match, causeId, expectedLastEventSeq, attachCauseId, broadcastGameEvents, ramRollsForGame } = context
  const moveUnitIds = [...new Set(command.movers)]
  if (moveUnitIds.length === 0) {
    logger.info({ gameId: match.gameId }, 'Move selection missing unit id')
    return {
      statusCode: 422,
      payload: { ok: false, error: 'Move selection did not include a unit id', code: 'MOVE_INVALID', currentPhase: match.phase },
    }
  }

  logger.info({ gameId: match.gameId, unitId: moveUnitIds[0], stackSize: moveUnitIds.length }, 'Processing MOVE command')
  const scenarioMap = getScenarioMapSnapshot(match.scenarioSnapshot as ScenarioSnapshot)
  const rules = getScenarioRulesContext(match.scenarioId, match.scenarioSnapshot as ScenarioSnapshot)
  const map = createMap(scenarioMap.width, scenarioMap.height, scenarioMap.hexes, scenarioMap.cells)
  const state = buildEngineState(match)
  const moveEvents: EventEnvelope[] = []
  let firstMovePlan: { from: { q: number; r: number }; to: { q: number; r: number }; cost: number } | null = null
  let lastMoveResult: { rammedUnitIds?: string[]; destroyedUnits?: string[]; treadDamage?: number } | null = null
  let nextSeq = (match.events.at(-1)?.seq ?? 0) + 1

  for (const moveUnitId of moveUnitIds) {
    const moveCommand: SingleUnitMoveCommand = {
      type: 'MOVE',
      unitId: moveUnitId,
      to: command.to,
      ...(command.attemptRam === undefined ? {} : { attemptRam: command.attemptRam }),
    }

    const validation = validateUnitMovement(map, state, moveCommand, rules)
    if (!validation.ok) {
      logger.info({ gameId: match.gameId, unitId: moveUnitId, error: validation.error }, 'Invalid move command')
      return {
        statusCode: 422,
        payload: {
          ok: false,
          error: validation.error,
          code: 'MOVE_INVALID',
          detailCode: validation.code,
          currentPhase: match.phase,
        },
      }
    }

    const result = executeUnitMovement(state, validation.plan, {
      reconcileStackRoster: false,
      ramRolls: ramRollsForGame(match.gameId, match.scenarioId),
      rules,
    })
    if (!result.success) {
      logger.info({ gameId: match.gameId, unitId: moveUnitId, error: result.error }, 'Invalid move command')
      return {
        statusCode: 422,
        payload: { ok: false, error: result.error, code: 'MOVE_INVALID', currentPhase: match.phase },
      }
    }

    const emittedEvents = buildMoveEvents(nextSeq, validation.plan.unitId, moveCommand, result, state, match.phase)
    moveEvents.push(...emittedEvents)
    nextSeq += emittedEvents.length
    if (firstMovePlan === null) {
      firstMovePlan = {
        from: validation.plan.from,
        to: validation.plan.to,
        cost: validation.plan.cost,
      }
    }
    lastMoveResult = {
      rammedUnitIds: result.rammedUnitIds,
      destroyedUnits: result.destroyedUnits,
      treadDamage: result.treadDamage,
    }
  }

  reconcileStackStateAfterMoves(state, moveUnitIds)

  const newEvents = attachCauseId(moveEvents, causeId)
  const winner = computeWinnerUserId(match, state, match.phase, match.turnNumber) ?? match.winner
  const status = winner !== null ? 'completed' : match.status
  await db.persistMatchProgress({
    gameId: match.gameId,
    expectedLastEventSeq,
    phase: match.phase,
    turnNumber: match.turnNumber,
    winner,
    status,
    state,
    events: newEvents,
  })

  const turnNumber = match.turnNumber
  const eventSeq = newEvents.at(-1)?.seq ?? nextSeq - 1
  logSentEvents(match.gameId, 'MOVE', newEvents)
  logActionOutcome(match.gameId, 'MOVE', {
    unitIds: moveUnitIds,
    from: firstMovePlan?.from,
    to: firstMovePlan?.to,
    cost: firstMovePlan?.cost,
    rammedUnitIds: lastMoveResult?.rammedUnitIds ?? [],
    destroyedUnitIds: lastMoveResult?.destroyedUnits ?? [],
    treadDamage: lastMoveResult?.treadDamage ?? 0,
  }, newEvents)
  broadcastGameEvents(match.gameId, newEvents)
  logger.debug({ gameId: match.gameId, unitId: moveUnitIds[0], stackSize: moveUnitIds.length }, 'Move executed')

  return {
    statusCode: 200,
    payload: buildActionResponse(match, state, match.phase, turnNumber, eventSeq, newEvents, status, winner),
  }
}
