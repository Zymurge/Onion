import type { MatchRecord } from '#server/db/adapter'
import type { ActionOkResponse, EventEnvelope, GameState, TurnPhase } from '#shared/types/index'
import type { VictoryEscapeHex, VictoryObjectiveState } from '#shared/apiProtocol'
import { buildVictoryObjectiveStates } from './victory.js'
import { getScenarioEscapeHexes, getScenarioMapSnapshot, type ScenarioMapSnapshot, type ScenarioSnapshot } from './scenario.js'

/**
 * Builds the successful action response from the post-action state and events.
 *
 * @param match Persisted match metadata and historical events.
 * @param state Authoritative state after the action has executed.
 * @param phase Current phase after the action.
 * @param turnNumber Current turn number after the action.
 * @param eventSeq Sequence number of the latest persisted event.
 * @param events Events emitted by the action.
 * @param status Match lifecycle status after the action.
 * @param winnerUserId Winning user id, or null while the match continues.
 * @returns API payload containing state, scenario metadata, objectives, and events.
 */
export function buildActionResponse(
  match: MatchRecord,
  state: GameState,
  phase: TurnPhase,
  turnNumber: number,
  eventSeq: number,
  events: EventEnvelope[],
  status: MatchRecord['status'],
  winnerUserId: string | null,
  snapshotRevision = (match.snapshotRevision ?? 0) + 1,
): ActionOkResponse & {
  turnNumber: number
  eventSeq: number
  phase: TurnPhase
  scenarioName: string
  snapshotRevision: number
  scenarioMap: ScenarioMapSnapshot
  victoryObjectives: VictoryObjectiveState[]
  escapeHexes: VictoryEscapeHex[]
  status: MatchRecord['status']
  hostUserId: string
  phaseStartEventSeq: number
} {
  const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
  const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
  const scenarioName = scenarioSnapshot.displayName ?? scenarioSnapshot.name ?? match.scenarioId
  const escapeHexes = getScenarioEscapeHexes(scenarioSnapshot)
  const historicalEvents = Array.isArray(match.events) ? match.events : []
  const phaseStartEventSeq = [...historicalEvents, ...events].reverse().find((event) =>
    event.type === 'PHASE_CHANGED' && event.to === phase && event.turnNumber === turnNumber,
  )?.seq ?? 0

  return {
    ok: true,
    seq: eventSeq,
    events,
    state,
    status,
    hostUserId: match.hostUserId,
    winner: winnerUserId === null
      ? null
      : winnerUserId === match.players.onion
        ? 'onion'
        : winnerUserId === match.players.defender
          ? 'defender'
          : null,
    turnNumber,
    eventSeq,
    phase,
    snapshotRevision,
    scenarioName,
    scenarioMap,
    victoryObjectives: buildVictoryObjectiveStates(scenarioSnapshot, scenarioMap, state, turnNumber, [...historicalEvents, ...events]),
    escapeHexes,
    phaseStartEventSeq,
  }
}