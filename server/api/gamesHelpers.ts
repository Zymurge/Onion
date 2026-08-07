import logger from '#server/logger'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { MatchRecord } from '#server/db/adapter'
import { checkVictoryConditions } from '#server/engine/phases'
import { ScenarioSchema, type InitialState } from '#server/engine/scenarioSchema'
import type { GameStateResponse, VictoryEscapeHex, VictoryObjectiveState } from '#shared/apiProtocol'
import { hexKey } from '#shared/hex'
import { assertScenarioPositionsInMap, materializeScenarioMap, translateScenarioCoord, type AuthoredScenarioMap, type ExplicitScenarioMap } from '#shared/scenarioMap'
import { getRemainingUnitMovementAllowance } from '#shared/unitMovement'
import type { Command, EventEnvelope, GameState, SessionInitPayload, SingleUnitMoveCommand, StackRosterState, TurnPhase } from '#shared/types/index'
import { getUnitDefinition, getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { formatCombatTargetId, parseCombatTargetId } from '#shared/combatTarget'
import { getDefender, getOnionOrDefender } from '#shared/unitState'
import type { StackNamingSourceUnit } from '#shared/stackNaming'
import { refreshStackRosterNamingSnapshot, validateStackRosterConsistency } from '#shared/stackRoster'
import type { WebSocketClientMessage, WebSocketServerErrorMessage, WebSocketServerEventMessage, WebSocketServerSessionInitMessage, WebSocketServerSnapshotMessage } from '#shared/websocketProtocol'
import { resolveScenariosDir } from '#server/api/scenarioPaths'

const SCENARIOS_DIR = resolveScenariosDir()
const GAME_ID_RE = /^\d+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function buildSessionInitPayload(): SessionInitPayload {
  return {
    unitTypes: getUnitTypeCatalog(),
    weaponTypes: getWeaponTypeCatalog(),
  }
}

function assertCanonicalStackGroupNames(matchState: MatchRecord['state']): void {
  const stackRoster = matchState.stackRoster
  const rosterGroups = Object.entries(stackRoster?.groupsById ?? {})
  if (rosterGroups.length === 0) {
    return
  }

  const canonicalStackNaming = refreshStackRosterNamingSnapshot(stackRoster, undefined, matchState.defenders)
  const canonicalGroupNames = new Map(canonicalStackNaming.groupsInUse.map((group) => [group.groupKey, group.groupName]))
  const persistedGroupNames = new Map((matchState.stackNaming?.groupsInUse ?? []).map((group) => [group.groupKey, group.groupName]))

  for (const [groupKey, group] of rosterGroups) {
		const unitIds = group.unitIds
    if (unitIds.length <= 1) {
      continue
    }

    const canonicalGroupName = canonicalGroupNames.get(groupKey)
    if (canonicalGroupName === undefined) {
      logger.debug(
        {
          groupKey,
          groupName: group.groupName,
          unitIds,
          stackNaming: matchState.stackNaming,
        },
        'Missing canonical stack group name during validation',
      )
      throw new Error(`Missing canonical stack group name for ${groupKey}`)
    }

    if (group.groupName !== canonicalGroupName) {
      logger.debug(
        {
          groupKey,
          rosterGroupName: group.groupName,
          canonicalGroupName,
          unitIds,
          canonicalStackNaming: canonicalStackNaming.groupsInUse,
          persistedStackNaming: matchState.stackNaming?.groupsInUse ?? [],
        },
        'Conflicting stack group name detected during validation',
      )
      throw new Error(`Conflicting stack group name for ${groupKey}: expected ${canonicalGroupName}, received ${group.groupName}`)
    }

    const persistedGroupName = persistedGroupNames.get(groupKey)
    if (persistedGroupName !== undefined && persistedGroupName !== canonicalGroupName) {
      logger.debug(
        {
          groupKey,
          canonicalGroupName,
          persistedGroupName,
          unitIds,
          canonicalStackNaming: canonicalStackNaming.groupsInUse,
          persistedStackNaming: matchState.stackNaming?.groupsInUse ?? [],
        },
        'Persisted stack group name conflicts with canonical validation result',
      )
      throw new Error(`Conflicting persisted stack group name for ${groupKey}: expected ${canonicalGroupName}, received ${persistedGroupName}`)
    }
  }

  for (const [groupKey, persistedGroupName] of persistedGroupNames) {
    const canonicalGroupName = canonicalGroupNames.get(groupKey)
    if (canonicalGroupName !== undefined && canonicalGroupName !== persistedGroupName) {
      logger.debug(
        {
          groupKey,
          canonicalGroupName,
          persistedGroupName,
          canonicalStackNaming: canonicalStackNaming.groupsInUse,
          persistedStackNaming: matchState.stackNaming?.groupsInUse ?? [],
        },
        'Persisted stack group name conflicts after canonical lookup',
      )
      throw new Error(`Conflicting persisted stack group name for ${groupKey}: expected ${canonicalGroupName}, received ${persistedGroupName}`)
    }
  }
}

function buildResponseStackRoster(matchState: MatchRecord['state']): StackRosterState {
  const groupsById = Object.fromEntries(
    Object.entries(matchState.stackRoster?.groupsById ?? {}).flatMap(([groupId, group]) => {
      if (!(getUnitDefinition(group.unitType)?.stackable === true)) {
        return []
      }

      const unitIds = group.unitIds
      if (unitIds.length === 0) {
        return []
      }

      return [[
        groupId,
        {
          groupName: group.groupName,
          unitType: group.unitType,
          position: group.position,
          unitIds,
        },
      ]]
    }),
  )

  return { groupsById }
}

function assertCanonicalStackRosterConsistency(matchState: MatchRecord['state']): void {
  const stackRoster: StackRosterState = buildResponseStackRoster(matchState)
  const issues = validateStackRosterConsistency(matchState.defenders, stackRoster)
  if (issues.length === 0) {
    return
  }

  logger.debug(
    {
      issues,
      stackRosterGroups: Object.keys(matchState.stackRoster?.groupsById ?? {}),
      stackableDefenders: Object.values(matchState.defenders)
        .filter((defender) => getUnitDefinition(defender.typeId)?.stackable === true)
        .map((defender) => defender.unitId),
    },
    'Invalid stack roster detected during game state response validation',
  )

  throw new Error(`Invalid stack roster for response: ${issues.map((issue) => issue.message).join('; ')}`)
}

export type VictoryObjective =
  | {
    id: string
    label: string
    required?: boolean
    kind: 'destroy-unit'
    unitId: string
    unitType?: never
  }
  | {
    id: string
    label: string
    required?: boolean
    kind: 'destroy-unit'
    unitType: string
    unitId?: never
  }
  | {
    id: string
    label: string
    required?: boolean
    kind: 'escape-map'
  }

export type ScenarioSnapshot = {
  name?: string
  displayName?: string
  victoryConditions?: {
    maxTurns?: number
    objectives?: VictoryObjective[]
    onion?: {
      escapeHexes?: Array<{ q: number; r: number }>
    }
  }
  map?: AuthoredScenarioMap
  initialState?: InitialState
}

export type ValidatedScenarioSnapshot = Omit<ScenarioSnapshot, 'map' | 'initialState'> & {
  id: string
  description: string
  map: ExplicitScenarioMap
  initialState: InitialState
}

export class ScenarioValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ScenarioValidationError'
  }
}

export function parseScenarioSnapshot(raw: unknown): ValidatedScenarioSnapshot {
  const parsed = ScenarioSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ScenarioValidationError('Scenario does not match the required schema', { cause: parsed.error })
  }

  try {
    const translated = translateScenarioSnapshot(parsed.data)
    if (translated === undefined || translated.map === undefined) {
      throw new Error('Scenario map is missing')
    }

    return translated as ValidatedScenarioSnapshot
  } catch (error) {
    throw new ScenarioValidationError('Scenario map is invalid', { cause: error })
  }
}

export function getScenarioEscapeHexes(scenarioSnapshot: ScenarioSnapshot | undefined): VictoryEscapeHex[] {
  return scenarioSnapshot?.victoryConditions?.onion?.escapeHexes ?? []
}

export type ScenarioMapSnapshot = ExplicitScenarioMap

export function getScenarioMapSnapshot(scenarioSnapshot: ScenarioSnapshot | undefined): ScenarioMapSnapshot {
  const candidate = scenarioSnapshot?.map ?? scenarioSnapshot
  if (!candidate) {
    throw new Error('Invalid scenario map snapshot')
  }

  return materializeScenarioMap(candidate as AuthoredScenarioMap)
}

export function translateScenarioSnapshot(initial: ScenarioSnapshot | undefined): ScenarioSnapshot | undefined {
  if (initial === undefined || initial.map === undefined || !('radius' in initial.map)) {
    return initial
  }

  const radius = Math.max(0, Math.floor(initial.map.radius))
  const translatedInitialState = initial.initialState && typeof initial.initialState === 'object'
    ? (() => {
      const state = initial.initialState

      return {
        ...state,
        onions: state.onions
          ? Object.fromEntries(
            Object.entries(state.onions).map(([key, onion]) => [
              key,
              onion.position
                ? { ...onion, position: translateScenarioCoord(onion.position, radius) }
                : onion,
            ]),
          )
          : state.onions,
        defenders: state.defenders
          ? Object.fromEntries(
            Object.entries(state.defenders).map(([key, defender]) => [
              key,
              defender.position
                ? { ...defender, position: translateScenarioCoord(defender.position, radius) }
                : defender,
            ]),
          )
            : state.defenders,
          } as InitialState
    })()
    : initial.initialState

  const translatedVictoryConditions = initial.victoryConditions && typeof initial.victoryConditions === 'object'
    ? (() => {
      const victoryConditions = initial.victoryConditions as {
        onion?: {
          escapeHexes?: Array<{ q: number; r: number }>
        }
      }

      return victoryConditions.onion
        ? {
          ...victoryConditions,
          onion: {
            ...victoryConditions.onion,
            escapeHexes: victoryConditions.onion.escapeHexes?.map((hex) => translateScenarioCoord(hex, radius)),
          },
        }
        : victoryConditions
    })()
    : initial.victoryConditions

  return {
    ...initial,
    map: materializeScenarioMap(initial.map),
    initialState: translatedInitialState,
    victoryConditions: translatedVictoryConditions,
  }
}

export function assertScenarioStateFitsMap(scenarioMap: ScenarioMapSnapshot, scenarioSnapshot: ScenarioSnapshot, state: GameState): void {
  const positions: Array<{ label: string; position: { q: number; r: number } }> = [
    ...Object.values(state.onions).map((onion) => ({
      label: `onion start ${onion.unitId}`,
      position: onion.position,
    })),
    ...Object.values(state.defenders).map((defender) => ({
      label: `defender start ${defender.unitId}`,
      position: defender.position,
    })),
  ]

  const escapeHexes = scenarioSnapshot.victoryConditions?.onion?.escapeHexes
  if (escapeHexes !== undefined) {
    escapeHexes.forEach((position, index) => {
      positions.push({ label: `victory escape hex ${index + 1}`, position })
    })
  }

  assertScenarioPositionsInMap(scenarioMap, positions)
}

export function buildEngineState(match: MatchRecord): GameState {
  assertCanonicalStackGroupNames(match.state)
  const stackNaming = refreshStackRosterNamingSnapshot(match.state.stackRoster, match.state.stackNaming, match.state.defenders)
  return {
    ...structuredClone(match.state),
    stackRoster: structuredClone(match.state.stackRoster) ?? { groupsById: {} },
    stackNaming,
    currentPhase: match.phase,
    turn: match.turnNumber,
  }
}

export function buildMovementRemainingByUnit(state: GameState, phase: TurnPhase): Record<string, number> {
  const movementRemainingByUnit: Record<string, number> = {}
  for (const onion of Object.values(state.onions)) {
    movementRemainingByUnit[onion.unitId] = getRemainingUnitMovementAllowance(onion, phase)
  }

  for (const defender of Object.values(state.defenders)) {
    movementRemainingByUnit[defender.unitId] = getRemainingUnitMovementAllowance(defender, phase)
  }

  return movementRemainingByUnit
}

function isOnionEscaped(
  scenarioMap: ScenarioMapSnapshot,
  state: GameState,
  turnNumber: number,
  escapeHexes?: Array<{ q: number; r: number }>,
): boolean {
  if (escapeHexes !== undefined && escapeHexes.length > 0) {
    if (turnNumber <= 1) {
      return false
    }

    return Object.values(state.onions).some((onion) => escapeHexes.some((hex) => hexKey(hex) === hexKey(onion.position)))
  }

  return Object.values(state.onions).some((onion) => !scenarioMap.cells.some((cell) => hexKey(cell) === hexKey(onion.position)))
}

function isObjectiveCompleted(
  scenarioSnapshot: ScenarioSnapshot | undefined,
  scenarioMap: ScenarioMapSnapshot,
  state: GameState,
  turnNumber: number,
  objective: VictoryObjective,
): boolean {
  if (objective.kind === 'destroy-unit') {
    if (objective.unitId !== undefined) {
      const defenderId = getDefender(objective.unitId, state)
      return defenderId !== undefined && state.defenders[defenderId]?.state === 'destroyed'
    }

    if (objective.unitType !== undefined) {
      return Object.values(state.defenders).some((defender) => defender.typeId === objective.unitType && defender.state === 'destroyed')
    }

    return false
  }

  return objective.kind === 'escape-map'
    ? isOnionEscaped(scenarioMap, state, turnNumber, scenarioSnapshot?.victoryConditions?.onion?.escapeHexes)
    : false
}

export function buildVictoryObjectiveStates(
  scenarioSnapshot: ScenarioSnapshot | undefined,
  scenarioMap: ScenarioMapSnapshot,
  state: GameState,
  turnNumber = 1,
): VictoryObjectiveState[] {
  const objectives = scenarioSnapshot?.victoryConditions?.objectives ?? []
  return objectives.map((objective) => ({
    ...objective,
    required: objective.required ?? true,
    completed: isObjectiveCompleted(scenarioSnapshot, scenarioMap, state, turnNumber, objective),
  }))
}

export function computeWinnerUserId(
  match: MatchRecord,
  state: GameState,
  phase: TurnPhase,
  turnNumber: number,
): string | null {
  const engineState: GameState = {
    ...structuredClone(state),
    currentPhase: phase,
    turn: turnNumber,
  }

  const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
  const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
  const victoryObjectives = buildVictoryObjectiveStates(scenarioSnapshot, scenarioMap, state, turnNumber)
  const requiredObjectives = victoryObjectives.filter((objective) => objective.required)

  if (requiredObjectives.length > 0) {
    if (requiredObjectives.every((objective) => objective.completed)) {
      return match.players.onion
    }

    const onions = Object.values(state.onions)
    if (onions.length > 0 && onions.every((candidate) => candidate.treads <= 0 || candidate.state === 'destroyed')) {
      return match.players.defender
    }

    return null
  }

  const winningRole = checkVictoryConditions(engineState)
  if (!winningRole) return null
  return match.players[winningRole]
}

export function getWeaponTypeFromId(weaponId: string) {
  if (weaponId === 'main') return 'main'
  if (weaponId.startsWith('secondary_')) return 'secondary'
  if (weaponId.startsWith('ap_')) return 'ap'
  if (weaponId.startsWith('missile_')) return 'missile'
  return weaponId
}

export function buildCombatEvents(
  startSeq: number,
  command: Extract<Command, { type: 'FIRE' }>,
  result: any,
  state: GameState,
  phase?: TurnPhase,
): EventEnvelope[] {
  const timestamp = new Date().toISOString()
  let seq = startSeq
  const events: EventEnvelope[] = []
  const onionId = command.onionId
  const onion = state.onions[onionId]
  if (onion === undefined) {
    throw new Error(`Onion '${onionId}' was not found while building combat events`)
  }
  const attackerFriendlyNames = command.attackers.map((attackerId) => resolveCombatParticipantFriendlyName(state, attackerId))
  const targetFriendlyName = resolveTargetFriendlyName(state, result.targetId, onionId)

  events.push({
    seq: seq++,
    type: 'FIRE_RESOLVED',
    timestamp,
    ...(phase === undefined ? {} : { phase }),
    attackers: command.attackers,
    onionId,
    attackerFriendlyNames,
    targetId: result.targetId,
    targetFriendlyName,
    roll: result.roll?.roll,
    outcome: result.roll?.result,
    odds: result.roll?.odds,
  })

  if (result.treadsLost !== undefined) {
    events.push({
      seq: seq++,
      type: 'ONION_TREADS_LOST',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      onionId,
      targetId: result.targetId,
      targetFriendlyName,
      amount: result.treadsLost,
      remaining: onion.treads,
    })
  }

  if (result.destroyedWeaponId) {
    events.push({
      seq: seq++,
      type: 'ONION_BATTERY_DESTROYED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      onionId,
      weaponId: result.destroyedWeaponId,
      weaponFriendlyName: resolveWeaponFriendlyName(state, result.destroyedWeaponId, onionId),
      weaponType: getWeaponTypeFromId(result.destroyedWeaponId),
    })
  }

  for (const statusChange of result.statusChanges ?? []) {
    events.push({
      seq: seq++,
      type: 'UNIT_STATUS_CHANGED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      unitId: statusChange.unitId,
      unitFriendlyName: resolveUnitFriendlyName(state, statusChange.unitId),
      from: statusChange.from,
      to: statusChange.to,
    })
  }

  if (result.squadsLost !== undefined) {
    events.push({
      seq: seq++,
      type: 'UNIT_SQUADS_LOST',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      unitId: result.targetId,
      unitFriendlyName: resolveUnitFriendlyName(state, result.targetId),
      amount: result.squadsLost,
    })
  }

  return events
}

export function buildMoveEvents(
  startSeq: number,
  moveUnitId: string,
  command: SingleUnitMoveCommand,
  result: any,
  state: GameState,
  phase?: TurnPhase,
): EventEnvelope[] {
  const timestamp = new Date().toISOString()
  let seq = startSeq
  const canonicalMoveUnitId = moveUnitId
  const movedUnit = getOnionOrDefender(canonicalMoveUnitId, state)
  const isOnionMove = movedUnit.kind === 'onion'
  const onion = isOnionMove ? state.onions[canonicalMoveUnitId] : undefined
  const moveUnitFriendlyName = resolveUnitFriendlyName(state, canonicalMoveUnitId)
  const events: EventEnvelope[] = [
    {
      seq: seq++,
      type: isOnionMove ? 'ONION_MOVED' : 'UNIT_MOVED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      unitFriendlyName: moveUnitFriendlyName,
      ...(isOnionMove
        ? { onionId: canonicalMoveUnitId, to: command.to }
        : { unitId: canonicalMoveUnitId, to: command.to }),
    },
  ]

  const rammedUnitIds = result.rammedUnitIds ?? []
  const rammedUnitResults = Array.isArray(result.rammedUnitResults) ? result.rammedUnitResults : []
  const destroyedUnitIds = rammedUnitResults.length > 0
    ? rammedUnitResults
      .filter((ramResult: { outcome?: { effect?: string } }) => ramResult.outcome?.effect === 'destroyed')
      .map((ramResult: { unitId: string }) => ramResult.unitId)
    : result.destroyedUnits ?? []
  if (rammedUnitIds.length > 0 || destroyedUnitIds.length > 0 || (result.treadDamage ?? 0) > 0) {
    events.push({
      seq: seq++,
      type: 'MOVE_RESOLVED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      ...(isOnionMove ? { onionId: canonicalMoveUnitId } : {}),
      unitId: canonicalMoveUnitId,
      unitFriendlyName: moveUnitFriendlyName,
      rammedUnitIds,
      rammedUnitFriendlyNames: rammedUnitIds.map((unitId: string) => resolveUnitFriendlyName(state, unitId)),
      rammedUnitResults: rammedUnitResults.map((ramResult: { unitId: string; unitType: string; outcome: { effect: string; roll: number; treadCost: number } }) => ({
        unitId: ramResult.unitId,
        unitFriendlyName: resolveUnitFriendlyName(state, ramResult.unitId),
        unitType: ramResult.unitType,
        effect: ramResult.outcome.effect,
        roll: ramResult.outcome.roll,
        treadCost: ramResult.outcome.treadCost,
      })),
      destroyedUnitIds,
      destroyedUnitFriendlyNames: destroyedUnitIds.map((unitId: string) => resolveUnitFriendlyName(state, unitId)),
      treadDamage: result.treadDamage ?? 0,
    })
  }

  if (result.treadDamage !== undefined && result.treadDamage > 0) {
    const treadTargetId = formatCombatTargetId({ onionId: canonicalMoveUnitId })
    events.push({
      seq: seq++,
      type: 'ONION_TREADS_LOST',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      onionId: canonicalMoveUnitId,
      targetId: treadTargetId,
      targetFriendlyName: resolveTargetFriendlyName(state, treadTargetId),
      amount: result.treadDamage,
      remaining: onion?.treads,
    })
  }

  for (const destroyedId of destroyedUnitIds) {
    events.push({
      seq: seq++,
      type: 'UNIT_STATUS_CHANGED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      unitId: destroyedId,
      unitFriendlyName: resolveUnitFriendlyName(state, destroyedId),
      from: 'operational',
      to: 'destroyed',
    })
  }

  return events
}

function resolveUnitFriendlyName(state: GameState, unitId: string): string {
  const lookup = getOnionOrDefender(unitId, state)
  if (lookup.kind === 'onion' && lookup.unitId !== undefined) {
    return state.onions[lookup.unitId]?.friendlyName ?? unitId
  }

  if (lookup.kind === 'defender' && lookup.unitId !== undefined) {
    const defender = state.defenders[lookup.unitId]
    if (defender === undefined) {
      return unitId
    }

    const stackGroup = Object.values(state.stackRoster.groupsById).find((group) => group.unitIds.includes(lookup.unitId!))
    if (stackGroup !== undefined) {
      return stackGroup.groupName
    }

    return defender.friendlyName
  }

  return unitId
}

function resolveWeaponFriendlyName(state: GameState, weaponId: string, ownerOnionId?: string): string {
  if (ownerOnionId !== undefined) {
    const ownerWeapon = state.onions[ownerOnionId]?.weapons.find((weapon) => weapon.id === weaponId)
    if (ownerWeapon) {
      return ownerWeapon.friendlyName
    }
  }

  for (const onion of Object.values(state.onions)) {
    const onionWeapon = onion.weapons.find((weapon) => weapon.id === weaponId)
    if (onionWeapon) {
      return onionWeapon.friendlyName
    }
  }

  for (const defender of Object.values(state.defenders)) {
    const weapon = defender.weapons.find((candidate) => candidate.id === weaponId)
    if (weapon) {
      return weapon.friendlyName
    }
  }

  return weaponId
}

function resolveCombatParticipantFriendlyName(state: GameState, attackerId: string): string {
  const unitFriendlyName = resolveUnitFriendlyName(state, attackerId)
  if (unitFriendlyName !== attackerId) {
    return unitFriendlyName
  }

  return resolveWeaponFriendlyName(state, attackerId)
}

function resolveTargetFriendlyName(state: GameState, targetId: string, ownerOnionId?: string): string {
  const parsedTarget = parseCombatTargetId(targetId)
  if (parsedTarget?.kind === 'treads') {
    return `${resolveUnitFriendlyName(state, parsedTarget.onionId)} treads`
  }

  const unitFriendlyName = resolveUnitFriendlyName(state, targetId)
  if (unitFriendlyName !== targetId) {
    return unitFriendlyName
  }

  return resolveWeaponFriendlyName(state, targetId, ownerOnionId)
}

export function logSentEvents(gameId: number, actionType: string, events: EventEnvelope[]) {
  logger.debug(
    {
      gameId,
      actionType,
      eventCount: events.length,
      eventTypes: events.map((event) => event.type),
      events,
    },
    'Events sent',
  )
}

export function logActionOutcome(
  gameId: number,
  actionType: 'MOVE' | 'FIRE',
  outcome: Record<string, unknown>,
  events: EventEnvelope[],
): void {
  logger.info(
    {
      gameId,
      actionType,
      outcome,
      events,
    },
    `${actionType} resolved`,
  )
}

export function buildGameStateResponse(match: MatchRecord, userId: string): GameStateResponse {
  assertCanonicalStackGroupNames(match.state)
  assertCanonicalStackRosterConsistency(match.state)
  const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
  const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
  const escapeHexes = getScenarioEscapeHexes(scenarioSnapshot)
  const scenarioName = scenarioSnapshot.displayName ?? scenarioSnapshot.name ?? match.scenarioId
  const role: GameStateResponse['role'] = match.players.onion === userId ? 'onion' : 'defender'
  const winner: GameStateResponse['winner'] =
    match.winner === null
      ? null
      : match.winner === match.players.onion
        ? 'onion'
        : match.winner === match.players.defender
          ? 'defender'
          : null

  const stackRoster = buildResponseStackRoster(match.state)

  const defenders = Object.fromEntries(
    Object.entries(match.state.defenders).map(([defenderId, defender]) => {
      return [defenderId, defender]
    }),
  )

  return {
    gameId: match.gameId,
    scenarioId: match.scenarioId,
    scenarioName,
    role,
    phase: match.phase,
    turnNumber: match.turnNumber,
    winner,
    players: match.players,
    state: {
      ...match.state,
      defenders,
      stackRoster,
    },
    movementRemainingByUnit: buildMovementRemainingByUnit(match.state, match.phase),
    victoryObjectives: buildVictoryObjectiveStates(scenarioSnapshot, scenarioMap, match.state, match.turnNumber),
    escapeHexes,
    scenarioMap,
    eventSeq: match.events.at(-1)?.seq ?? 0,
  }
}

/**
 * Build the canonical action response payload used by POST /games/:id/actions handlers.
 * This consolidates the fields returned after executing an action so all endpoints
 * produce an identical snapshot shape.
 */
export function buildActionResponse(
  match: MatchRecord,
  state: GameState,
  phase: TurnPhase,
  turnNumber: number,
  eventSeq: number,
  events: EventEnvelope[],
): {
  ok: true
  seq: number
  events: EventEnvelope[]
  state: GameState
  movementRemainingByUnit: Record<string, number>
  turnNumber: number
  eventSeq: number
  phase: TurnPhase
  scenarioName: string
  scenarioMap: ScenarioMapSnapshot
  victoryObjectives: VictoryObjectiveState[]
  escapeHexes: VictoryEscapeHex[]
} {
  const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
  const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
  const scenarioName = scenarioSnapshot.displayName ?? scenarioSnapshot.name ?? match.scenarioId
  const escapeHexes = getScenarioEscapeHexes(scenarioSnapshot)
  const responseStackRoster: StackRosterState | undefined = (() => {
    const roster = state.stackRoster ?? { groupsById: {} }
    const groupsById = roster.groupsById ?? {}
    return { groupsById }
  })()

  return {
    ok: true,
    seq: eventSeq,
    events,
    state,
    movementRemainingByUnit: buildMovementRemainingByUnit(state, phase),
    turnNumber,
    eventSeq,
    phase,
    scenarioName,
    scenarioMap,
    victoryObjectives: buildVictoryObjectiveStates(scenarioSnapshot, scenarioMap, state, turnNumber),
    escapeHexes,
  }
}

export function serializeWsMessage(message: WebSocketClientMessage | WebSocketServerEventMessage | WebSocketServerSessionInitMessage | WebSocketServerSnapshotMessage | WebSocketServerErrorMessage): string {
  return JSON.stringify(message)
}

export function parseWsMessage(rawMessage: string): WebSocketClientMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as Partial<WebSocketClientMessage> & { kind?: string }
    if (parsed.kind === 'COMMAND' && parsed.command !== undefined) {
      return parsed as WebSocketClientMessage
    }

    if (parsed.kind === 'RESUME' && typeof parsed.afterSeq === 'number') {
      return parsed as WebSocketClientMessage
    }
  } catch {
    return null
  }

  return null
}

export async function loadScenario(id: string): Promise<ValidatedScenarioSnapshot | null> {
  let files: string[]
  try {
    files = await readdir(SCENARIOS_DIR)
  } catch {
    // directory unreadable — treat as not found
    return null
  }

  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const fullPath = join(SCENARIOS_DIR, file)
    const raw = await readFile(fullPath, 'utf8')
    let scenario: unknown
    try {
      scenario = JSON.parse(raw)
    } catch {
      continue
    }

    if (typeof scenario === 'object' && scenario !== null && 'id' in scenario && scenario.id === id) {
      const translated = parseScenarioSnapshot(scenario)

      return {
        ...translated,
        displayName: translated.displayName ?? translated.name,
      }
    }
  }

  return null
}

export function extractUserId(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer stub.')) return null
  const userId = authHeader.slice('Bearer stub.'.length)
  return UUID_RE.test(userId) ? userId : null
}

export function extractUserIdFromAuth(authHeader: string | undefined, token: string | undefined): string | null {
  const headerUserId = extractUserId(authHeader)
  if (headerUserId !== null) {
    return headerUserId
  }

  if (!token?.startsWith('stub.')) {
    return null
  }

  const userId = token.slice('stub.'.length)
  return UUID_RE.test(userId) ? userId : null
}

export function parseGameId(rawId: string): number | null {
  if (!GAME_ID_RE.test(rawId)) return null
  const parsed = Number(rawId)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
