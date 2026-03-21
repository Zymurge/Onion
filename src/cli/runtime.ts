import {
  getLoggerLevel,
  isDebugLoggingEnabled,
  setLoggerLevel,
} from '../logger.js'
import {
  createGame,
  formatApiError,
  getEvents,
  getGame,
  getScenario,
  joinGame,
  listScenarios,
  loginUser,
  registerUser,
  submitAction,
} from './api/client.js'
import logger from '../logger.js'
import { renderEvents } from './render/events.js'
import { renderMap } from './render/map.js'
import { renderDefenders, renderGameSummary, renderLatestEvents, renderOnion } from './render/summary.js'
import type { SessionStore } from './session/store.js'
import type { CliCommand } from './types.js'
import type { EventEnvelope } from '../types/index.js'

export type CommandExecutionResult = {
  message: string
  exitRequested?: boolean
}

export function isErrorLevelEvent(event: EventEnvelope): boolean {
  const record = event as Record<string, unknown>
  const level = typeof record.level === 'string' ? record.level.toLowerCase() : undefined
  const severity = typeof record.severity === 'string' ? record.severity.toLowerCase() : undefined

  return event.type === 'ERROR' || event.type.endsWith('_ERROR') || level === 'error' || severity === 'error'
}

export function logCapturedEvents(source: string, events: EventEnvelope[]): void {
  if (events.length === 0) {
    return
  }

  logger.debug(
    {
      source,
      count: events.length,
      events: events.map((event) => ({ seq: event.seq, type: event.type })),
    },
    'CLI captured backend events',
  )

  for (const event of events) {
    if (isErrorLevelEvent(event)) {
      logger.error({ source, event }, 'CLI captured error-level backend event')
    }
  }
}

function applyAuth(session: SessionStore, username: string, userId: string, token: string): void {
  session.username = username
  session.userId = userId
  session.token = token
  logger.debug({ username, userId }, 'CLI session authenticated')
}

function applyGameSnapshot(
  session: SessionStore,
  gameId: string,
  scenarioId: string,
  phase: string,
  turnNumber: number,
  winner: 'onion' | 'defender' | null,
  eventSeq: number,
  state?: import('../types/index.js').GameState,
): void {
  session.gameId = gameId
  session.scenarioId = scenarioId
  session.phase = phase
  session.turnNumber = turnNumber
  session.winner = winner
  session.lastEventSeq = eventSeq
  if (state) {
    session.gameState = state
  }

  logger.debug(
    { gameId, scenarioId, phase, turnNumber, winner, eventSeq },
    'CLI updated session from game snapshot',
  )
}

async function ensureScenarioLoaded(session: SessionStore): Promise<string | null> {
  if (!session.scenarioId) {
    return null
  }
  if (session.scenario?.id === session.scenarioId) {
    return null
  }
  const scenarioResult = await getScenario(session, session.scenarioId)
  if (!scenarioResult.ok) {
    return formatApiError(scenarioResult)
  }
  session.scenario = scenarioResult.data
  logger.debug(
    {
      scenarioId: scenarioResult.data.id,
      name: scenarioResult.data.name,
      map: {
        width: scenarioResult.data.map.width,
        height: scenarioResult.data.map.height,
        hexCount: scenarioResult.data.map.hexes.length,
      },
    },
    'CLI loaded scenario details',
  )
  return null
}

function renderActionAccepted(result: { seq?: number; eventSeq?: number; events?: import('../types/index.js').EventEnvelope[] }): string {
  const seq = result.eventSeq ?? result.seq
  const lines = ['Action accepted']
  if (seq !== undefined) {
    lines.push(`seq: ${seq}`)
  }
  if (result.events) {
    lines.push(renderEvents(result.events))
  }
  return lines.join('\n')
}

export function renderHelpText(topic?: string): string {
  if (topic) {
    switch (topic.toLowerCase()) {
      case 'register':
        return ['register', '  usage: register <username> <password>', '  creates a new backend user and stores the token in session'].join('\n')
      case 'login':
        return ['login', '  usage: login <username> <password>', '  logs in and stores the token in session'].join('\n')
      case 'scenarios':
        return ['scenarios', '  usage: scenarios', '  lists available scenarios'].join('\n')
      case 'scenario':
      case 'scenario-show':
        return ['scenario show', '  usage: scenario show <scenarioId>', '  fetches full scenario details'].join('\n')
      case 'game':
        return [
          'game',
          '  usage: game create <scenarioId> <onion|defender>',
          '  usage: game join <gameId>',
          '  usage: game load <gameId>',
        ].join('\n')
      case 'refresh':
        return ['refresh', '  usage: refresh', '  reloads the current game state for the active session gameId'].join('\n')
      case 'show':
        return ['show', '  usage: show [map|state|units|onion|defenders|events]', '  prints the current loaded game view'].join('\n')
      case 'events':
        return ['events', '  usage: events [after <seq>]', '  fetches event history from the current game'].join('\n')
      case 'move':
        return ['move', '  usage: move <unitId> <q,r>', '  submits a MOVE action'].join('\n')
      case 'fire-weapon':
        return ['fire-weapon', '  usage: fire-weapon <main|secondary|ap|missile> <index> <targetId>', '  submits a FIRE_WEAPON action'].join('\n')
      case 'fire-unit':
        return ['fire-unit', '  usage: fire-unit <unitId> <targetId>', '  submits a FIRE_UNIT action'].join('\n')
      case 'combined-fire':
        return ['combined-fire', '  usage: combined-fire <unitId...> -> <targetId>', '  submits a COMBINED_FIRE action'].join('\n')
      case 'end-phase':
        return ['end-phase', '  usage: end-phase', '  submits an END_PHASE action'].join('\n')
      case 'config':
        return [
          'config',
          '  usage: config show',
          '  usage: config set url <url>',
        ].join('\n')
      case 'debug':
        return [
          'debug',
          '  usage: debug [on|off|status]',
          '  toggles verbose JSON logging for backend requests and internal CLI traces',
        ].join('\n')
      case 'status':
        return [
          'status',
          '  usage: status',
          '  shows the in-memory CLI session context',
        ].join('\n')
      default:
        return [`No topic help available for '${topic}'.`, 'Try: help'].join('\n')
    }
  }

  return [
    'Available commands:',
    '  help [topic]',
    '  status',
    '  debug [on|off|status]',
    '  config show',
    '  config set url <url>',
    '  register <username> <password>',
    '  login <username> <password>',
    '  scenarios',
    '  scenario show <scenarioId>',
    '  game create <scenarioId> <onion|defender>',
    '  game join <gameId>',
    '  game load <gameId>',
    '  refresh',
    '  show [map|state|units|onion|defenders|events]',
    '  events [after <seq>]',
    '  move <unitId> <q,r>',
    '  fire-weapon <main|secondary|ap|missile> <index> <targetId>',
    '  fire-unit <unitId> <targetId>',
    '  combined-fire <unitId...> -> <targetId>',
    '  end-phase',
    '  exit',
  ].join('\n')
}

export function renderStatusText(session: SessionStore): string {
  return [
    'CLI session',
    `  debugLogging: ${isDebugLoggingEnabled() ? 'on' : 'off'} (${getLoggerLevel()})`,
    `  baseUrl: ${session.baseUrl ?? '(unset)'}`,
    `  userId: ${session.userId ?? '(unset)'}`,
    `  username: ${session.username ?? '(unset)'}`,
    `  gameId: ${session.gameId ?? '(unset)'}`,
    `  role: ${session.role ?? '(unset)'}`,
    `  token: ${session.token ? '(set)' : '(unset)'}`,
    `  scenarioId: ${session.scenarioId ?? '(unset)'}`,
    `  phase: ${session.phase ?? '(unset)'}`,
    `  turn: ${session.turnNumber ?? '(unset)'}`,
    `  winner: ${session.winner ?? '(unset)'}`,
    `  lastEventSeq: ${session.lastEventSeq ?? '(unset)'}`,
  ].join('\n')
}

export async function executeCommand(session: SessionStore, command: CliCommand): Promise<CommandExecutionResult> {
  switch (command.kind) {
    case 'exit':
      return { message: 'Exiting CLI.', exitRequested: true }
    case 'debug': {
      if (command.enabled !== undefined) {
        setLoggerLevel(command.enabled ? 'debug' : 'info')
      }

      return {
        message: `Debug logging: ${isDebugLoggingEnabled() ? 'on' : 'off'} (${getLoggerLevel()})`,
      }
    }
    case 'config-show':
      return { message: renderStatusText(session) }
    case 'config-set-url':
      session.baseUrl = command.url
      return { message: `Configured backend URL: ${command.url}` }
    case 'register': {
      const result = await registerUser(session, command.username, command.password)
      if (!result.ok) return { message: formatApiError(result) }
      applyAuth(session, command.username, result.data.userId, result.data.token)
      return {
        message: ['Registered user', `userId: ${result.data.userId}`, `username: ${command.username}`, 'token: stored in session'].join('\n'),
      }
    }
    case 'login': {
      const result = await loginUser(session, command.username, command.password)
      if (!result.ok) return { message: formatApiError(result) }
      applyAuth(session, command.username, result.data.userId, result.data.token)
      return {
        message: ['Logged in', `userId: ${result.data.userId}`, `username: ${command.username}`, 'token: stored in session'].join('\n'),
      }
    }
    case 'scenarios': {
      const result = await listScenarios(session)
      if (!result.ok) return { message: formatApiError(result) }
      logger.debug(
        {
          count: result.data.length,
          scenarioIds: result.data.map((scenario) => scenario.id),
        },
        'CLI received scenario list',
      )
      const lines = ['Scenarios']
      for (const scenario of result.data) {
        lines.push(`  ${scenario.id}: ${scenario.name}`)
        lines.push(`    ${scenario.description}`)
      }
      return { message: lines.join('\n') }
    }
    case 'scenario-show': {
      const result = await getScenario(session, command.scenarioId)
      if (!result.ok) return { message: formatApiError(result) }
      logger.debug(
        {
          scenarioId: result.data.id,
          name: result.data.name,
          map: {
            width: result.data.map.width,
            height: result.data.map.height,
            hexCount: result.data.map.hexes.length,
          },
        },
        'CLI received scenario details',
      )
      return {
        message: ['Scenario details', JSON.stringify(result.data, null, 2)].join('\n'),
      }
    }
    case 'game-create': {
      const result = await createGame(session, command.scenarioId, command.role)
      if (!result.ok) return { message: formatApiError(result) }
      session.gameId = result.data.gameId
      session.role = result.data.role
      session.scenarioId = command.scenarioId
      return {
        message: ['Game created', `gameId: ${result.data.gameId}`, `role: ${result.data.role}`].join('\n'),
      }
    }
    case 'game-join': {
      const result = await joinGame(session, command.gameId)
      if (!result.ok) return { message: formatApiError(result) }
      session.gameId = result.data.gameId
      session.role = result.data.role
      // Auto-refresh: fetch and apply game state after join
      const gameResult = await getGame(session, command.gameId)
      if (gameResult.ok) {
        applyGameSnapshot(
          session,
          gameResult.data.gameId,
          gameResult.data.scenarioId,
          gameResult.data.phase,
          gameResult.data.turnNumber,
          gameResult.data.winner,
          gameResult.data.eventSeq,
          gameResult.data.state,
        )
      }
      return {
        message: [
          'Joined game',
          `gameId: ${result.data.gameId}`,
          `role: ${result.data.role}`,
          gameResult.ok ? renderGameSummary(session, session.gameState) : '',
        ].filter(Boolean).join('\n'),
      }
    }
    case 'game-load': {
      const result = await getGame(session, command.gameId)
      if (!result.ok) return { message: formatApiError(result) }
      applyGameSnapshot(
        session,
        result.data.gameId,
        result.data.scenarioId,
        result.data.phase,
        result.data.turnNumber,
        result.data.winner,
        result.data.eventSeq,
        result.data.state,
      )
      const scenarioError = await ensureScenarioLoaded(session)
      if (scenarioError) return { message: scenarioError }
      return {
        message: ['Game loaded', renderGameSummary(session, session.gameState)].join('\n'),
      }
    }
    case 'refresh': {
      if (!session.gameId) {
        return { message: 'No game is loaded. Use: game load <gameId>' }
      }
      const result = await getGame(session, session.gameId)
      if (!result.ok) return { message: formatApiError(result) }
      applyGameSnapshot(
        session,
        result.data.gameId,
        result.data.scenarioId,
        result.data.phase,
        result.data.turnNumber,
        result.data.winner,
        result.data.eventSeq,
        result.data.state,
      )
      const scenarioError = await ensureScenarioLoaded(session)
      if (scenarioError) return { message: scenarioError }
      return {
        message: ['Game refreshed', renderGameSummary(session, session.gameState)].join('\n'),
      }
    }
    case 'show': {
      switch (command.target) {
        case 'map':
          return { message: renderMap(session.gameState, session.scenario) }
        case 'onion':
          return { message: renderOnion(session.gameState) }
        case 'defenders':
        case 'units':
          return { message: renderDefenders(session.gameState) }
        case 'events':
          return { message: renderEvents(session.events) }
        case 'state':
        case undefined:
          return {
            message: [
              renderGameSummary(session, session.gameState),
              renderOnion(session.gameState),
              renderDefenders(session.gameState),
              renderLatestEvents(session.events),
            ].join('\n\n'),
          }
      }
      return { message: 'Unsupported show target' }
    }
    case 'events': {
      if (!session.gameId) {
        return { message: 'No game is loaded. Use: game load <gameId>' }
      }
      const result = await getEvents(session, session.gameId, command.after ?? session.lastEventSeq ?? 0)
      if (!result.ok) return { message: formatApiError(result) }
      session.events = result.data.events
      if (result.data.events.length > 0) {
        session.lastEventSeq = result.data.events[result.data.events.length - 1].seq
      }
      logCapturedEvents('events', result.data.events)
      return { message: renderEvents(result.data.events) }
    }
    case 'move': {
      if (!session.gameId) {
        return { message: 'No game is loaded. Use: game load <gameId>' }
      }
      const result = await submitAction(session, session.gameId, { type: 'MOVE', unitId: command.unitId, to: command.to })
      if (!result.ok) return { message: formatApiError(result) }
      session.gameState = result.data.state
      session.events = result.data.events
      if (result.data.eventSeq !== undefined) session.lastEventSeq = result.data.eventSeq
      logCapturedEvents('move', result.data.events)
      return { message: renderActionAccepted(result.data) }
    }
    case 'fire-weapon': {
      if (!session.gameId) {
        return { message: 'No game is loaded. Use: game load <gameId>' }
      }
      const result = await submitAction(session, session.gameId, {
        type: 'FIRE_WEAPON',
        weaponType: command.weaponType,
        weaponIndex: command.weaponIndex,
        targetId: command.targetId,
      })
      if (!result.ok) return { message: formatApiError(result) }
      session.gameState = result.data.state
      session.events = result.data.events
      if (result.data.eventSeq !== undefined) session.lastEventSeq = result.data.eventSeq
      logCapturedEvents('fire-weapon', result.data.events)
      return { message: renderActionAccepted(result.data) }
    }
    case 'fire-unit': {
      if (!session.gameId) {
        return { message: 'No game is loaded. Use: game load <gameId>' }
      }
      const result = await submitAction(session, session.gameId, { type: 'FIRE_UNIT', unitId: command.unitId, targetId: command.targetId })
      if (!result.ok) return { message: formatApiError(result) }
      session.gameState = result.data.state
      session.events = result.data.events
      if (result.data.eventSeq !== undefined) session.lastEventSeq = result.data.eventSeq
      logCapturedEvents('fire-unit', result.data.events)
      return { message: renderActionAccepted(result.data) }
    }
    case 'combined-fire': {
      if (!session.gameId) {
        return { message: 'No game is loaded. Use: game load <gameId>' }
      }
      const result = await submitAction(session, session.gameId, { type: 'COMBINED_FIRE', unitIds: command.unitIds, targetId: command.targetId })
      if (!result.ok) return { message: formatApiError(result) }
      session.gameState = result.data.state
      session.events = result.data.events
      if (result.data.eventSeq !== undefined) session.lastEventSeq = result.data.eventSeq
      logCapturedEvents('combined-fire', result.data.events)
      return { message: renderActionAccepted(result.data) }
    }
    case 'end-phase': {
      if (!session.gameId) {
        return { message: 'No game is loaded. Use: game load <gameId>' }
      }
      const result = await submitAction(session, session.gameId, { type: 'END_PHASE' })
      if (!result.ok) return { message: formatApiError(result) }
      session.gameState = result.data.state
      session.events = result.data.events
      if (result.data.turnNumber !== undefined) session.turnNumber = result.data.turnNumber
      if (result.data.eventSeq !== undefined) session.lastEventSeq = result.data.eventSeq
      logCapturedEvents('end-phase', result.data.events)
      // Auto-refresh: fetch and apply latest game state after phase change
      const refreshResult = await getGame(session, session.gameId)
      if (refreshResult.ok) {
        applyGameSnapshot(
          session,
          refreshResult.data.gameId,
          refreshResult.data.scenarioId,
          refreshResult.data.phase,
          refreshResult.data.turnNumber,
          refreshResult.data.winner,
          refreshResult.data.eventSeq,
          refreshResult.data.state,
        )
      }
      return { message: [renderActionAccepted(result.data), refreshResult.ok ? renderGameSummary(session, session.gameState) : ''].filter(Boolean).join('\n') }
    }
    default:
      return { message: `Command scaffolded but not implemented yet: ${command.kind}` }
  }
}