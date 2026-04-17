import logger from '#server/logger'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { MatchRecord } from '#server/db/adapter'
import { checkVictoryConditions } from '#server/engine/phases'
import type { GameStateResponse } from '#shared/apiProtocol'
import { assertScenarioPositionsInMap, materializeScenarioMap, translateScenarioCoord, type AuthoredScenarioMap, type ExplicitScenarioMap } from '#shared/scenarioMap'
import { getRemainingUnitMovementAllowance } from '#shared/unitMovement'
import type { Command, EventEnvelope, GameState, TurnPhase } from '#shared/types/index'
import type { WebSocketClientMessage, WebSocketServerErrorMessage, WebSocketServerEventMessage, WebSocketServerSnapshotMessage } from '#shared/websocketProtocol'
import type { EngineGameState } from '#server/engine/units'
import { resolveScenariosDir } from '#server/api/scenarioPaths'

const SCENARIOS_DIR = resolveScenariosDir()
const GAME_ID_RE = /^\d+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ScenarioSnapshot = {
  name?: string
  displayName?: string
  victoryConditions?: {
    maxTurns?: number
    onion?: {
      targetHex?: { q: number; r: number }
    }
  }
  map?: AuthoredScenarioMap
  initialState?: unknown
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
        onion?: { targetHex?: { q: number; r: number } }
      }

      return victoryConditions.onion?.targetHex
        ? {
          ...victoryConditions,
          onion: {
            ...victoryConditions.onion,
            targetHex: translateScenarioCoord(victoryConditions.onion.targetHex, radius),
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

  const targetHex = scenarioSnapshot.victoryConditions?.onion?.targetHex
  if (targetHex !== undefined) {
    positions.push({ label: 'victory target', position: targetHex })
  }

  assertScenarioPositionsInMap(scenarioMap, positions)
}

export function buildEngineState(match: MatchRecord): EngineGameState {
  return {
    ...structuredClone(match.state),
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

export function getScenarioMaxTurns(scenarioSnapshot: ScenarioSnapshot | undefined): number {
  const maxTurns = scenarioSnapshot?.victoryConditions?.maxTurns
  return typeof maxTurns === 'number' && Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : 20
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
  const winningRole = checkVictoryConditions(engineState, turnNumber, getScenarioMaxTurns(scenarioSnapshot))
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
      amount: result.treadsLost,
      remaining: state.onion.treads,
    })
  }

  if (result.destroyedWeaponId) {
    events.push({
      seq: seq++,
      type: 'ONION_BATTERY_DESTROYED',
      timestamp,
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
      unitId: result.targetId,
      amount: result.squadsLost,
    })
  }

  return events
}

export function buildMoveEvents(
  startSeq: number,
  moveUnitId: string,
  command: Extract<Command, { type: 'MOVE' }>,
  result: any,
  state: GameState,
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
      unitFriendlyName: moveUnitFriendlyName,
      ...(isOnionMove ? { to: command.to } : { unitId: canonicalMoveUnitId, to: command.to }),
    },
  ]

  const rammedUnitIds = result.rammedUnitIds ?? []
  const destroyedUnitIds = result.destroyedUnits ?? []
  if (rammedUnitIds.length > 0 || destroyedUnitIds.length > 0 || (result.treadDamage ?? 0) > 0) {
    events.push({
      seq: seq++,
      type: 'MOVE_RESOLVED',
      timestamp,
      unitId: canonicalMoveUnitId,
      unitFriendlyName: moveUnitFriendlyName,
      rammedUnitIds,
      rammedUnitFriendlyNames: rammedUnitIds.map((unitId: string) => resolveUnitFriendlyName(state, unitId)),
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
      amount: result.treadDamage,
      remaining: state.onion.treads,
    })
  }

  for (const destroyedId of destroyedUnitIds) {
    events.push({
      seq: seq++,
      type: 'UNIT_STATUS_CHANGED',
      timestamp,
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
    return state.onion.friendlyName ?? state.onion.id ?? state.onion.type ?? 'The Onion'
  }

  for (const defender of Object.values(state.defenders)) {
    if (defender.id === unitId) {
      return defender.friendlyName ?? defender.id ?? defender.type ?? unitId
    }
  }

  return unitId
}

function resolveWeaponFriendlyName(state: GameState, weaponId: string): string {
  const onionWeapon = state.onion.weapons?.find((weapon) => weapon.id === weaponId)
  if (onionWeapon) {
    return onionWeapon.friendlyName ?? onionWeapon.name ?? weaponId
  }

  for (const defender of Object.values(state.defenders)) {
    const weapon = defender.weapons?.find((candidate) => candidate.id === weaponId)
    if (weapon) {
      return weapon.friendlyName ?? weapon.name ?? weaponId
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
  return resolveUnitFriendlyName(state, targetId)
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
  const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
  const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
  const role: GameStateResponse['role'] = match.players.onion === userId ? 'onion' : 'defender'
  const winner: GameStateResponse['winner'] =
    match.winner === null
      ? null
      : match.winner === match.players.onion
        ? 'onion'
        : match.winner === match.players.defender
          ? 'defender'
          : null

  return {
    gameId: match.gameId,
    scenarioId: match.scenarioId,
    scenarioName: scenarioSnapshot?.displayName ?? scenarioSnapshot?.name,
    role,
    phase: match.phase,
    turnNumber: match.turnNumber,
    winner,
    players: match.players,
    state: match.state,
    movementRemainingByUnit: buildMovementRemainingByUnit(match.state, match.phase),
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