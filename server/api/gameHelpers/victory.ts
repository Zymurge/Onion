import type { MatchRecord } from '#server/db/adapter'
import { evaluateVictoryConditions, type VictoryConditions } from '#server/engine/victory'
import type { VictoryObjectiveState } from '#shared/apiProtocol'
import type { EventEnvelope, GameState, TurnPhase } from '#shared/types/index'
import { getScenarioMapSnapshot, type ScenarioMapSnapshot, type ScenarioSnapshot } from './scenario.js'

/** Scenario objective contract evaluated by the authoritative engine module. */
export type { VictoryObjective } from '#server/engine/victory'

/**
 * Evaluates scenario objectives for API response presentation.
 *
 * @param scenarioSnapshot Scenario victory conditions, if configured.
 * @param scenarioMap Materialized scenario map.
 * @param state Current authoritative state.
 * @param turnNumber Current turn used by escape objectives.
 * @param events Historical events used by objective evaluation.
 * @returns Objective states with completion and victor metadata.
 */
export function buildVictoryObjectiveStates(
  scenarioSnapshot: ScenarioSnapshot | undefined,
  scenarioMap: ScenarioMapSnapshot,
  state: GameState,
  turnNumber = 1,
  events: ReadonlyArray<EventEnvelope> = [],
): VictoryObjectiveState[] {
  return evaluateVictoryConditions({
    victoryConditions: scenarioSnapshot?.victoryConditions,
    scenarioMap,
    state,
    turnNumber,
    events,
  }).objectives
}

/**
 * Evaluates the authoritative victory rules and resolves the winning role to a user id.
 *
 * @param match Persisted match containing players, scenario snapshot, and event history.
 * @param state Current authoritative game state.
 * @param phase Current phase to place on the evaluation state copy.
 * @param turnNumber Current turn number.
 * @returns Winning user id, or null while no winner exists.
 */
export function computeWinnerUserId(
  match: MatchRecord,
  state: GameState,
  phase: TurnPhase,
  turnNumber: number,
): string | null {
  const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
  const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
  const evaluation = evaluateVictoryConditions({
    victoryConditions: scenarioSnapshot.victoryConditions,
    scenarioMap,
    state: {
      ...structuredClone(state),
      currentPhase: phase,
      turn: turnNumber,
    },
    turnNumber,
    events: match.events,
  })
  return evaluation.winner === null ? null : match.players[evaluation.winner]
}

/** Victory-condition configuration adapted from the engine evaluator. */
export type { VictoryConditions }