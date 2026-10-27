import logger from '#server/logger'
import { createMap } from '#server/engine/map'
import { executeCombatAction, validateCombatAction } from '#server/engine/index'
import { buildEngineState } from '#server/api/gameHelpers/stateProjection'
import { buildCombatEvents } from '#server/api/gameHelpers/eventBuilders'
import { computeWinnerUserId } from '#server/api/gameHelpers/victory'
import { getScenarioMapSnapshot, getScenarioRulesContext, type ScenarioSnapshot } from '#server/api/gameHelpers/scenario'
import { finalizeAction } from './common.js'
import type { ActionHandlerContext, ActionHandlerResponse } from './types.js'

type FireCommand = Extract<import('#shared/types/index').Command, { type: 'FIRE' }>

/**
 * Executes a FIRE command, applies combat results, and persists its events.
 *
 * @param context Match, sequencing, roll-source, persistence, broadcast, and response dependencies.
 * @param command Validated FIRE command from the action dispatcher.
 * @returns HTTP 200 response on success or HTTP 422 with the engine validation failure.
 * @throws Errors from engine execution or persistence for the dispatcher to classify.
 */
export async function handleFire(context: ActionHandlerContext, command: FireCommand): Promise<ActionHandlerResponse> {
  const { match, combatRollsForGame } = context
  logger.info({ gameId: match.gameId, type: command.type }, 'Processing combat command')
  if (typeof command.onionId !== 'string' || command.onionId.trim().length === 0) {
    return {
      statusCode: 422,
      payload: {
        ok: false,
        error: 'FIRE command requires an Onion ID',
        code: 'MOVE_INVALID',
        detailCode: 'ONION_NOT_FOUND',
        currentPhase: match.phase,
      },
    }
  }

  const scenarioMap = getScenarioMapSnapshot(match.scenarioSnapshot as ScenarioSnapshot)
  const rules = getScenarioRulesContext(match.scenarioId, match.scenarioSnapshot as ScenarioSnapshot)
  const map = createMap(scenarioMap.width, scenarioMap.height, scenarioMap.hexes, scenarioMap.cells)
  const state = buildEngineState(match, rules)
  const validation = validateCombatAction(map, state, command, rules)
  if (!validation.ok) {
    logger.info({ gameId: match.gameId, error: validation.error }, 'Invalid combat command')
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

  const result = executeCombatAction(state, validation.plan, combatRollsForGame(match.gameId)?.next(), rules)
  if (!result.success) {
    logger.info({ gameId: match.gameId, error: result.error }, 'Invalid combat command')
    return { statusCode: 422, payload: { ok: false, error: result.error, code: 'MOVE_INVALID', currentPhase: match.phase } }
  }

  const seq = (match.events.at(-1)?.seq ?? 0) + 1
  const events = buildCombatEvents(seq, command, result, state, match.phase)
  const winner = computeWinnerUserId(match, state, match.phase, match.turnNumber) ?? match.winner
  const status = winner !== null ? 'completed' : match.status
  const response = await finalizeAction(context, {
    actionType: 'FIRE',
    state,
    phase: match.phase,
    turnNumber: match.turnNumber,
    events,
    status,
    winner,
    outcome: {
      attackers: command.attackers,
      onionId: command.onionId,
      targetId: result.targetId,
      roll: result.roll?.roll ?? null,
      outcome: result.roll?.result ?? null,
      odds: result.roll?.odds ?? null,
      treadsLost: result.treadsLost ?? null,
      destroyedWeaponId: result.destroyedWeaponId ?? null,
      squadsLost: result.squadsLost ?? null,
      statusChanges: result.statusChanges ?? [],
    },
  })
  logger.debug({ gameId: match.gameId, type: command.type }, 'Combat executed')

  return response
}
