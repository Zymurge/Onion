import type { WebSocket } from 'ws'

import logger from '#server/logger'
import type { DbAdapter, MatchRecord } from '#server/db/adapter'
import type { RollSource } from '#server/engine/index'
import { serializeWsMessage } from '#server/api/gamesHelpers'
import type { EventEnvelope } from '#shared/types/index'
import type { WebSocketServerEventMessage, WebSocketServerPresenceMessage } from '#shared/websocketProtocol'

/** Dependencies and configuration required by the game route plugin. */
export type GameRouteOptions = {
  db: DbAdapter
  scenariosDir: string
  presenceDisconnectGraceMs: number
  createRamRolls?: (scenarioId?: string) => RollSource
  createCombatRolls?: () => RollSource
}

type MatchPlayers = MatchRecord['players']

/** Shared mutable services used by game HTTP and WebSocket route handlers. */
export type GameRouteContext = GameRouteOptions & {
  liveConnections: Map<number, Set<WebSocket>>
  ramRollsForGame: (gameId: number, scenarioId: string) => RollSource | undefined
  combatRollsForGame: (gameId: number) => RollSource | undefined
  broadcastGameEvents: (gameId: number, events: EventEnvelope[]) => void
  addLiveConnection: (gameId: number, userId: string, socket: WebSocket, match: { players: MatchPlayers }) => Promise<ReturnType<GameRouteContext['getPlayerPresence']>>
  removeLiveConnection: (gameId: number, socket: WebSocket) => void
  getPlayerPresence: (gameId: number, match: { players: MatchPlayers }) => {
    onion: 'connected' | null
    defender: 'connected' | null
  }
}

/**
 * Creates isolated route state for live sockets, presence, and per-game roll sources.
 *
 * @param options Database, scenario, timing, and optional deterministic-roll dependencies.
 * @returns Route context with connection management, presence, broadcasting, and roll accessors.
 * @remarks The returned context owns mutable maps but does not mutate the supplied options object.
 */
export function createGameRouteContext(options: GameRouteOptions): GameRouteContext {
  const liveConnections = new Map<number, Set<WebSocket>>()
  const playerConnections = new Map<number, Map<string, Set<WebSocket>>>()
  const presenceDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const socketPlayers = new Map<WebSocket, { gameId: number; userId: string }>()
  const ramRollsByGame = new Map<number, RollSource>()
  const combatRollsByGame = new Map<number, RollSource>()

  function ramRollsForGame(gameId: number, scenarioId: string): RollSource | undefined {
    if (options.createRamRolls === undefined) {
      return undefined
    }

    const existing = ramRollsByGame.get(gameId)
    if (existing !== undefined) {
      return existing
    }

    const created = options.createRamRolls(scenarioId)
    ramRollsByGame.set(gameId, created)
    return created
  }

  function combatRollsForGame(gameId: number): RollSource | undefined {
    if (options.createCombatRolls === undefined) {
      return undefined
    }

    const existing = combatRollsByGame.get(gameId)
    if (existing !== undefined) {
      return existing
    }

    const created = options.createCombatRolls()
    combatRollsByGame.set(gameId, created)
    return created
  }

  function broadcastGameEvents(gameId: number, events: EventEnvelope[]) {
    const sockets = liveConnections.get(gameId)
    if (!sockets || sockets.size === 0) {
      return
    }

    logger.debug({ gameId, eventCount: events.length, eventTypes: events.map((event) => event.type), events }, 'Broadcasting game events')
    for (const event of events) {
      const payload: WebSocketServerEventMessage = { kind: 'EVENT', event }
      const serialized = serializeWsMessage(payload)

      for (const socket of sockets) {
        if (socket.readyState === 1) {
          try {
            socket.send(serialized)
            logger.debug({ gameId, serialized, eventSeq: event.seq }, 'WS EVENT sent')
          } catch (err) {
            logger.warn({ gameId, err, eventSeq: event.seq }, 'Failed to send WS event')
          }
        }
      }
    }
  }

  function presenceTimerKey(gameId: number, userId: string): string {
    return `${gameId}:${userId}`
  }

  function getPlayerPresence(gameId: number, match: { players: MatchPlayers }) {
    const connections = playerConnections.get(gameId)
    const isConnected = (userId: string | null) => userId !== null && (connections?.get(userId)?.size ?? 0) > 0
    return {
      onion: isConnected(match.players.onion) ? 'connected' : null,
      defender: isConnected(match.players.defender) ? 'connected' : null,
    } as const
  }

  function broadcastPlayerPresence(gameId: number, presence: ReturnType<typeof getPlayerPresence>, exclude?: WebSocket) {
    const sockets = liveConnections.get(gameId)
    if (!sockets) {
      return
    }

    const payload: WebSocketServerPresenceMessage = { kind: 'PLAYER_PRESENCE', presence }
    const serialized = serializeWsMessage(payload)
    for (const socket of sockets) {
      if (socket !== exclude && socket.readyState === 1) {
        socket.send(serialized)
      }
    }
  }

  function removeLiveConnection(gameId: number, socket: WebSocket) {
    const sockets = liveConnections.get(gameId)
    if (!sockets) {
      return
    }

    sockets.delete(socket)
    if (sockets.size === 0) {
      liveConnections.delete(gameId)
    }

    const player = socketPlayers.get(socket)
    socketPlayers.delete(socket)
    if (!player) {
      return
    }

    const connections = playerConnections.get(gameId)
    const playerSockets = connections?.get(player.userId)
    playerSockets?.delete(socket)
    if (!playerSockets || playerSockets.size > 0) {
      return
    }

    connections?.delete(player.userId)
    const timerKey = presenceTimerKey(gameId, player.userId)
    const timer = setTimeout(async () => {
      presenceDisconnectTimers.delete(timerKey)
      if ((playerConnections.get(gameId)?.get(player.userId)?.size ?? 0) > 0) {
        return
      }

      const match = await options.db.findMatch(gameId)
      if (match) {
        broadcastPlayerPresence(gameId, getPlayerPresence(gameId, match))
      }
    }, options.presenceDisconnectGraceMs)
    presenceDisconnectTimers.set(timerKey, timer)
  }

  async function addLiveConnection(gameId: number, userId: string, socket: WebSocket, match: { players: MatchPlayers }) {
    const timerKey = presenceTimerKey(gameId, userId)
    const timer = presenceDisconnectTimers.get(timerKey)
    if (timer) {
      clearTimeout(timer)
      presenceDisconnectTimers.delete(timerKey)
    }

    const sockets = liveConnections.get(gameId) ?? new Set<WebSocket>()
    sockets.add(socket)
    liveConnections.set(gameId, sockets)

    const connections = playerConnections.get(gameId) ?? new Map<string, Set<WebSocket>>()
    const playerSockets = connections.get(userId) ?? new Set<WebSocket>()
    const wasConnected = playerSockets.size > 0
    playerSockets.add(socket)
    connections.set(userId, playerSockets)
    playerConnections.set(gameId, connections)
    socketPlayers.set(socket, { gameId, userId })

    const presence = getPlayerPresence(gameId, match)
    if (!wasConnected) {
      broadcastPlayerPresence(gameId, presence, socket)
    }
    return presence
  }

  return {
    ...options,
    liveConnections,
    ramRollsForGame,
    combatRollsForGame,
    broadcastGameEvents,
    addLiveConnection,
    removeLiveConnection,
    getPlayerPresence,
  }
}