import logger from '#server/logger'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { MatchRecord } from '#server/db/adapter'
import { checkVictoryConditions } from '#server/engine/phases'
import { getUnitDefinition } from '#server/engine/units'
import type { GameStateResponse, VictoryEscapeHex, VictoryObjectiveState } from '#shared/apiProtocol'
import { hexKey } from '#shared/hex'
import { assertScenarioPositionsInMap, materializeScenarioMap, translateScenarioCoord, type AuthoredScenarioMap, type ExplicitScenarioMap } from '#shared/scenarioMap'
import { getRemainingUnitMovementAllowance } from '#shared/unitMovement'
import type { Command, EventEnvelope, GameState, SingleUnitMoveCommand, TurnPhase } from '#shared/types/index'
import { buildFriendlyName } from '#shared/unitDefinitions'
import { buildStackGroupKey, resolveStackLabel, resolveStackLabelFromSnapshot, refreshStackNamingSnapshotFromRoster } from '#shared/stackNaming'
import type { StackNamingSourceUnit } from '#shared/stackNaming'
import type { WebSocketClientMessage, WebSocketServerErrorMessage, WebSocketServerEventMessage, WebSocketServerSnapshotMessage } from '#shared/websocketProtocol'
import type { EngineGameState } from '#server/engine/units'
import { resolveScenariosDir } from '#server/api/scenarioPaths'

const SCENARIOS_DIR = resolveScenariosDir()
const GAME_ID_RE = /^\d+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertCanonicalStackGroupNames(matchState: MatchRecord['state']): void {
  const stackRoster = matchState.stackRoster
  const rosterGroups = Object.entries(stackRoster?.groupsById ?? {})
  if (rosterGroups.length === 0) {
    return
  }

  const canonicalStackNaming = refreshStackNamingSnapshotFromRoster(
    undefined,
    stackRoster,
    Object.values(matchState.defenders)
      .filter((unit) => typeof unit.id === 'string')
      .map((unit) => ({
        id: unit.id as string,
        type: unit.type,
        position: unit.position,
        status: String(unit.status),
        squads: unit.squads,
        friendlyName: unit.friendlyName,
      })),
  )
  const canonicalGroupNames = new Map(canonicalStackNaming.groupsInUse.map((group) => [group.groupKey, group.groupName]))
  const persistedGroupNames = new Map((matchState.stackNaming?.groupsInUse ?? []).map((group) => [group.groupKey, group.groupName]))

  for (const [groupKey, group] of rosterGroups) {
    const unitIds = group.unitIds ?? group.units?.map((unit) => unit.id) ?? []
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
  initialState?: unknown
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
      const state = initial.initialState as {
        onion?: { position?: { q: number; r: number } }
        defenders?: Record<string, { position?: { q: number; r: number } }>
      }

      return {
        ...state,
        onion: state.onion?.position
          ? { ...state.onion, position: translateScenarioCoord(state.onion.position, radius) }
          : state.onion,
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
      }
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
    { label: 'onion start', position: state.onion.position },
    ...Object.entries(state.defenders).map(([defenderId, defender]) => ({
      label: `defender start ${defender.id ?? defenderId}`,
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

export function buildEngineState(match: MatchRecord): EngineGameState {
  assertCanonicalStackGroupNames(match.state)
  const stackNaming = refreshStackNamingSnapshotFromRoster(
    match.state.stackNaming,
    match.state.stackRoster,
    Object.values(match.state.defenders)
      .filter((unit) => typeof unit.id === 'string')
      .map((unit) => ({
        id: unit.id as string,
        type: unit.type,
        position: unit.position,
        status: String(unit.status),
        squads: unit.squads,
        friendlyName: unit.friendlyName,
      })),
  )
  return {
    ...structuredClone(match.state),
    stackRoster: structuredClone(match.state.stackRoster) ?? { groupsById: {} },
    stackNaming,
    ramsThisTurn: match.state.ramsThisTurn ?? 0,
    currentPhase: match.phase,
    turn: match.turnNumber,
  } as EngineGameState
}

export function buildMovementRemainingByUnit(state: GameState, phase: TurnPhase): Record<string, number> {
  const movementRemainingByUnit: Record<string, number> = {}
  const onionId = state.onion.id ?? 'onion-1'

  movementRemainingByUnit[onionId] = getRemainingUnitMovementAllowance(
    state.onion.type ?? 'TheOnion',
    phase,
    state,
    onionId,
    state.onion.treads,
  )

  for (const [defenderId, defender] of Object.entries(state.defenders)) {
    const resolvedId = defender.id ?? defenderId
    movementRemainingByUnit[resolvedId] = getRemainingUnitMovementAllowance(defender.type, phase, state, resolvedId)
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

    return escapeHexes.some((hex) => hexKey(hex) === hexKey(state.onion.position))
  }

  return !scenarioMap.cells.some((cell) => hexKey(cell) === hexKey(state.onion.position))
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
      return state.defenders[objective.unitId]?.status === 'destroyed'
    }

    if (objective.unitType !== undefined) {
      return Object.values(state.defenders).some((defender) => defender.type === objective.unitType && defender.status === 'destroyed')
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
  const engineState = {
    ...structuredClone(state),
    ramsThisTurn: state.ramsThisTurn ?? 0,
    currentPhase: phase,
    turn: turnNumber,
  } as EngineGameState

  const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
  const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
  const victoryObjectives = buildVictoryObjectiveStates(scenarioSnapshot, scenarioMap, state, turnNumber)
  const requiredObjectives = victoryObjectives.filter((objective) => objective.required)

  if (requiredObjectives.length > 0) {
    if (requiredObjectives.every((objective) => objective.completed)) {
      return match.players.onion
    }

    if (engineState.onion.treads <= 0 || engineState.onion.status === 'destroyed') {
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
  const attackerFriendlyNames = command.attackers.map((attackerId) => resolveCombatParticipantFriendlyName(state, attackerId))
  const targetFriendlyName = resolveTargetFriendlyName(state, result.targetId)

  events.push({
    seq: seq++,
    type: 'FIRE_RESOLVED',
    timestamp,
    ...(phase === undefined ? {} : { phase }),
    attackers: command.attackers,
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
      amount: result.treadsLost,
      remaining: state.onion.treads,
    })
  }

  if (result.destroyedWeaponId) {
    events.push({
      seq: seq++,
      type: 'ONION_BATTERY_DESTROYED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      weaponId: result.destroyedWeaponId,
      weaponFriendlyName: resolveWeaponFriendlyName(state, result.destroyedWeaponId),
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
  const onionUnitId = state.onion.id
  const canonicalMoveUnitId = moveUnitId
  const isOnionMove = canonicalMoveUnitId === onionUnitId
  const moveUnitFriendlyName = resolveUnitFriendlyName(state, canonicalMoveUnitId)
  const events: EventEnvelope[] = [
    {
      seq: seq++,
      type: isOnionMove ? 'ONION_MOVED' : 'UNIT_MOVED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      unitFriendlyName: moveUnitFriendlyName,
      ...(isOnionMove ? { to: command.to } : { unitId: canonicalMoveUnitId, to: command.to }),
    },
  ]

  const rammedUnitIds = result.rammedUnitIds ?? []
  const destroyedUnitIds = result.destroyedUnits ?? []
  const rammedUnitResults = Array.isArray(result.rammedUnitResults) ? result.rammedUnitResults : []
  if (rammedUnitIds.length > 0 || destroyedUnitIds.length > 0 || (result.treadDamage ?? 0) > 0) {
    events.push({
      seq: seq++,
      type: 'MOVE_RESOLVED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
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
    events.push({
      seq: seq++,
      type: 'ONION_TREADS_LOST',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      amount: result.treadDamage,
      remaining: state.onion.treads,
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
  if (state.onion.id === unitId || unitId === 'onion') {
    const friendlyName = state.onion.friendlyName
    if (friendlyName !== undefined && friendlyName.trim().length > 0) {
      return friendlyName
    }

    const onionDefinition = state.onion.type ? getUnitDefinition(state.onion.type) : undefined
    if (onionDefinition?.friendlyNameTemplate !== undefined) {
      return buildFriendlyName(onionDefinition.friendlyNameTemplate, state.onion.id ?? 'onion-1')
    }

    return state.onion.id ?? state.onion.type ?? 'The Onion'
  }

  for (const defender of Object.values(state.defenders)) {
    if (defender.id === unitId) {
      if ((defender.squads ?? 1) > 1) {
        return resolveStackLabelFromSnapshot(
          state.stackNaming,
          buildStackGroupKey(defender.type, defender.position),
          defender.type,
          defender.id,
          defender.friendlyName,
          defender.squads,
        )
      }

      if (defender.friendlyName !== undefined && defender.friendlyName.trim().length > 0) {
        return defender.friendlyName
      }

      const defenderDefinition = getUnitDefinition(defender.type)

      if (defenderDefinition?.friendlyNameTemplate !== undefined) {
        return buildFriendlyName(defenderDefinition.friendlyNameTemplate, defender.id ?? unitId)
      }

      return defender.id ?? defender.type ?? unitId
    }
  }

  return unitId
}

function resolveWeaponFriendlyName(state: GameState, weaponId: string): string {
  const onionWeapon = state.onion.weapons?.find((weapon) => weapon.id === weaponId)
  if (onionWeapon) {
    if (onionWeapon.friendlyName !== undefined && onionWeapon.friendlyName.trim().length > 0) {
      return onionWeapon.friendlyName
    }

    if (onionWeapon.friendlyNameTemplate !== undefined) {
      return buildFriendlyName(onionWeapon.friendlyNameTemplate, weaponId)
    }

    const onionDefinition = state.onion.type ? getUnitDefinition(state.onion.type) : undefined
    const definitionWeapon = onionDefinition?.weapons.find((weapon) => weapon.id === weaponId)
    if (definitionWeapon?.friendlyNameTemplate !== undefined) {
      return buildFriendlyName(definitionWeapon.friendlyNameTemplate, weaponId)
    }

    return onionWeapon.name ?? weaponId
  }

  for (const defender of Object.values(state.defenders)) {
    const weapon = defender.weapons?.find((candidate) => candidate.id === weaponId)
    if (weapon) {
      if (weapon.friendlyName !== undefined && weapon.friendlyName.trim().length > 0) {
        return weapon.friendlyName
      }

      if (weapon.friendlyNameTemplate !== undefined) {
        return buildFriendlyName(weapon.friendlyNameTemplate, weaponId)
      }

      const defenderDefinition = getUnitDefinition(defender.type)
      const definitionWeapon = defenderDefinition?.weapons.find((candidate) => candidate.id === weaponId)
      if (definitionWeapon?.friendlyNameTemplate !== undefined) {
        return buildFriendlyName(definitionWeapon.friendlyNameTemplate, weaponId)
      }

      return weapon.name ?? weaponId
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

function resolveTargetFriendlyName(state: GameState, targetId: string): string {
  const unitFriendlyName = resolveUnitFriendlyName(state, targetId)
  if (unitFriendlyName !== targetId) {
    return unitFriendlyName
  }

  return resolveWeaponFriendlyName(state, targetId)
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

  const stackRosterSource = match.state.stackRoster ?? { groupsById: {} }

  const stackRosterGroupsById = Object.fromEntries(
    Object.entries(stackRosterSource.groupsById ?? {}).flatMap(([groupId, group]) => {
      const maxStacks = getUnitDefinition(group.unitType)?.abilities.maxStacks ?? 1
      if (maxStacks <= 1) {
        return []
      }

      const unitIds = group.unitIds ?? (group.units ?? []).map((unit) => unit.id)
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

  const defenders = Object.fromEntries(
    Object.entries(match.state.defenders).map(([defenderId, defender]) => {
      const { squads: _squads, ...defenderWithoutSquads } = defender
      return [defenderId, defenderWithoutSquads]
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
      stackRoster: { groupsById: stackRosterGroupsById },
    },
    movementRemainingByUnit: buildMovementRemainingByUnit(match.state, match.phase),
    victoryObjectives: buildVictoryObjectiveStates(scenarioSnapshot, scenarioMap, match.state, match.turnNumber),
    escapeHexes,
    scenarioMap,
    eventSeq: match.events.at(-1)?.seq ?? 0,
  }
}

export function serializeWsMessage(message: WebSocketClientMessage | WebSocketServerEventMessage | WebSocketServerSnapshotMessage | WebSocketServerErrorMessage): string {
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

export async function loadScenario(id: string): Promise<(ScenarioSnapshot & { id?: string; displayName?: string }) | null> {
  try {
    const files = await readdir(SCENARIOS_DIR)
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const fullPath = join(SCENARIOS_DIR, file)
      const raw = await readFile(fullPath, 'utf8')
      let scenario: any
      try {
        scenario = JSON.parse(raw)
      } catch {
        continue
      }
      if (scenario.id === id) {
        const translated = translateScenarioSnapshot(scenario)
        if (!translated) {
          return null
        }

        return {
          ...translated,
          displayName: translated.displayName ?? translated.name,
        }
      }
    }
  } catch {
    // directory unreadable — treat as not found
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
