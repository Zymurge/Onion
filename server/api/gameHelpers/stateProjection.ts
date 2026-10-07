import logger from '#server/logger'
import type { MatchRecord } from '#server/db/adapter'
import type { GameStateResponse } from '#shared/apiProtocol'
import type { GameState, StackRosterState } from '#shared/types/index'
import type { RulesContext } from '#shared/rulesContext'
import { canonicalizeStackRoster, refreshStackRosterNamingSnapshot, validateStackRosterConsistency } from '#shared/stackRoster/index'
import { buildVictoryObjectiveStates } from './victory.js'
import { getScenarioEscapeHexes, getScenarioMapSnapshot, getScenarioRulesContext, type ScenarioSnapshot } from './scenario.js'

function assertCanonicalStackGroupNames(matchState: MatchRecord['state']): void {
  const stackRoster = matchState.stackRoster
  const canonicalStackState = canonicalizeStackRoster(stackRoster ?? { groupsById: {} }, undefined, matchState.defenders)
  const rosterGroups = Object.entries(canonicalStackState.stackRoster.groupsById)
  if (rosterGroups.length === 0) {
    return
  }

  const canonicalStackNaming = canonicalStackState.stackNaming
  const canonicalGroupNames = new Map(canonicalStackNaming.groupsInUse.map((group) => [group.groupKey, group.groupName]))
  const persistedGroupNames = new Map((matchState.stackNaming?.groupsInUse ?? []).map((group) => [group.groupKey, group.groupName]))

  for (const [groupKey, group] of rosterGroups) {
    const unitIds = group.unitIds
    if (unitIds.length <= 1) {
      continue
    }

    const canonicalGroupName = canonicalGroupNames.get(groupKey)
    if (canonicalGroupName === undefined) {
      logger.debug({ groupKey, groupName: group.groupName, unitIds, stackNaming: matchState.stackNaming }, 'Missing canonical stack group name during validation')
      throw new Error(`Missing canonical stack group name for ${groupKey}`)
    }

    if (group.groupName !== canonicalGroupName) {
      logger.debug({ groupKey, rosterGroupName: group.groupName, canonicalGroupName, unitIds, canonicalStackNaming: canonicalStackNaming.groupsInUse, persistedStackNaming: matchState.stackNaming?.groupsInUse ?? [] }, 'Conflicting stack group name detected during validation')
      throw new Error(`Conflicting stack group name for ${groupKey}: expected ${canonicalGroupName}, received ${group.groupName}`)
    }

    const persistedGroupName = persistedGroupNames.get(groupKey)
    if (persistedGroupName !== undefined && persistedGroupName !== canonicalGroupName) {
      logger.debug({ groupKey, canonicalGroupName, persistedGroupName, unitIds, canonicalStackNaming: canonicalStackNaming.groupsInUse, persistedStackNaming: matchState.stackNaming?.groupsInUse ?? [] }, 'Persisted stack group name conflicts with canonical validation result')
      throw new Error(`Conflicting persisted stack group name for ${groupKey}: expected ${canonicalGroupName}, received ${persistedGroupName}`)
    }
  }

  for (const [groupKey, persistedGroupName] of persistedGroupNames) {
    const canonicalGroupName = canonicalGroupNames.get(groupKey)
    if (canonicalGroupName !== undefined && canonicalGroupName !== persistedGroupName) {
      logger.debug({ groupKey, canonicalGroupName, persistedGroupName, canonicalStackNaming: canonicalStackNaming.groupsInUse, persistedStackNaming: matchState.stackNaming?.groupsInUse ?? [] }, 'Persisted stack group name conflicts after canonical lookup')
      throw new Error(`Conflicting persisted stack group name for ${groupKey}: expected ${canonicalGroupName}, received ${persistedGroupName}`)
    }
  }
}

function buildResponseStackRoster(matchState: MatchRecord['state'], rules: RulesContext): StackRosterState {
  const canonicalStackRoster = canonicalizeStackRoster(matchState.stackRoster ?? { groupsById: {} }, matchState.stackNaming, matchState.defenders).stackRoster
  const groupsById = Object.fromEntries(
    Object.entries(canonicalStackRoster.groupsById).flatMap(([groupId, group]) => {
      if (rules.unitTypes[group.unitType]?.stackable !== true) {
        return []
      }

      const unitIds = group.unitIds
      if (unitIds.length === 0) {
        return []
      }

      return [[groupId, {
        groupName: group.groupName,
        unitType: group.unitType,
        position: group.position,
        unitIds,
      }]]
    }),
  )

  return { groupsById }
}

function assertCanonicalStackRosterConsistency(matchState: MatchRecord['state'], rules: RulesContext): void {
	const stackRoster: StackRosterState = buildResponseStackRoster(matchState, rules)
  const issues = validateStackRosterConsistency(matchState.defenders, stackRoster, (unitType) => rules.unitTypes[unitType]?.stackable === true)
  if (issues.length === 0) {
    return
  }

  logger.debug({
    issues,
    stackRosterGroups: Object.keys(matchState.stackRoster?.groupsById ?? {}),
    stackableDefenders: Object.values(matchState.defenders)
      .filter((defender) => rules.unitTypes[defender.typeId]?.stackable === true)
      .map((defender) => defender.unitId),
  }, 'Invalid stack roster detected during game state response validation')

  throw new Error(`Invalid stack roster for response: ${issues.map((issue) => issue.message).join('; ')}`)
}

/**
 * Clones a persisted match state and restores canonical phase, turn, roster, and naming data.
 *
 * @param match Persisted match record to adapt for engine execution.
 * @returns Independent engine state with canonical stack metadata.
 * @throws Error when persisted stack naming conflicts with canonical roster naming.
 */
export function buildEngineState(match: MatchRecord): GameState {
  assertCanonicalStackGroupNames(match.state)
  const canonicalStackState = canonicalizeStackRoster(match.state.stackRoster ?? { groupsById: {} }, match.state.stackNaming, match.state.defenders)
  return {
    ...structuredClone(match.state),
    stackRoster: canonicalStackState.stackRoster,
    stackNaming: canonicalStackState.stackNaming,
    currentPhase: match.phase,
    turn: match.turnNumber,
  }
}

/**
 * Projects a persisted match into the client-facing game state response.
 *
 * @param match Persisted match record containing authoritative state and events.
 * @param userId Authenticated participant receiving the response.
 * @returns API snapshot with role, scenario metadata, canonical roster, objectives, and event cursors.
 * @throws Error when persisted stack roster or naming data is invalid.
 */
export function buildGameStateResponse(match: MatchRecord, userId: string): GameStateResponse {
  assertCanonicalStackGroupNames(match.state)
  const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
  const rules = getScenarioRulesContext(match.scenarioId, scenarioSnapshot)
  assertCanonicalStackRosterConsistency(match.state, rules)
  const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
  const escapeHexes = getScenarioEscapeHexes(scenarioSnapshot)
  const scenarioName = scenarioSnapshot.displayName ?? scenarioSnapshot.name ?? match.scenarioId
  const aborted = match.events.some((event) => event.type === 'GAME_ABORTED')
  const role: GameStateResponse['role'] = match.players.onion === userId ? 'onion' : 'defender'
  const winner: GameStateResponse['winner'] =
    match.winner === null
      ? null
      : match.winner === match.players.onion
        ? 'onion'
        : match.winner === match.players.defender
          ? 'defender'
          : null

  const stackRoster = buildResponseStackRoster(match.state, rules)
  const phaseStartEventSeq = [...match.events].reverse().find((event) =>
    event.type === 'PHASE_CHANGED' && event.to === match.phase && event.turnNumber === match.turnNumber,
  )?.seq ?? 0

  const defenders = Object.fromEntries(
    Object.entries(match.state.defenders).map(([defenderId, defender]) => [defenderId, defender]),
  )

  return {
    gameId: match.gameId,
    scenarioId: match.scenarioId,
    scenarioName,
    hostUserId: match.hostUserId,
    status: match.status,
    role,
    phase: match.phase,
    turnNumber: match.turnNumber,
    snapshotRevision: match.snapshotRevision ?? 0,
    winner,
    aborted,
    players: match.players,
    state: {
      ...match.state,
      defenders,
      stackRoster,
      stackNaming: refreshStackRosterNamingSnapshot(stackRoster, match.state.stackNaming, match.state.defenders),
    },
    victoryObjectives: buildVictoryObjectiveStates(scenarioSnapshot, scenarioMap, match.state, match.turnNumber, match.events, rules, match.scenarioId),
    escapeHexes,
    scenarioMap,
    eventSeq: match.events.at(-1)?.seq ?? 0,
    phaseStartEventSeq,
  }
}