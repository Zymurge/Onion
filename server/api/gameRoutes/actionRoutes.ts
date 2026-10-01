import type { FastifyInstance } from 'fastify'

import logger from '#server/logger'
import { StaleMatchStateError } from '#server/db/adapter'
import { phaseActor } from '#server/engine/phases'
import { verifyUserId } from '#server/api/auth'
import { parseGameId } from '#server/api/gameHelpers/ids'
import { CommandSchema } from '#shared/protocolSchemas'
import type { Command, EventEnvelope } from '#shared/types/index'
import type { GameRouteContext } from './context.js'
import { handleEndPhase } from './actionHandlers/endPhase.js'
import { handleFire } from './actionHandlers/fire.js'
import { handleMove } from './actionHandlers/move.js'
import type { ActionHandlerResponse } from './actionHandlers/types.js'

function attachCauseId(events: EventEnvelope[], causeId: string): EventEnvelope[] {
  return events.map((event) => ({ ...event, causeId }))
}

function isStaleMatchStateError(err: unknown): boolean {
  if (err instanceof StaleMatchStateError) {
    return true
  }

  if (typeof err !== 'object' || err === null) {
    return false
  }

  const errorLike = err as {
    name?: unknown
    message?: unknown
    constructor?: { name?: unknown }
  }
  const name = typeof errorLike.name === 'string' ? errorLike.name : typeof errorLike.constructor?.name === 'string' ? errorLike.constructor.name : ''
  const message = typeof errorLike.message === 'string' ? errorLike.message : ''

  return name === 'StaleMatchStateError' || name === 'Error' && message.toLowerCase().includes('stale') || message.toLowerCase().includes('stale')
}

function describeActionError(err: unknown): Record<string, unknown> {
  return {
    errorName: err instanceof Error ? err.name : typeof err,
    errorMessage: err instanceof Error ? err.message : String(err),
  }
}

/**
 * Registers the action dispatcher and shared authorization/lifecycle guards.
 *
 * @param app Fastify instance receiving the action route.
 * @param context Shared database, roll-source, persistence, and broadcast dependencies.
 * @returns A promise that resolves after the action route is registered.
 * @remarks Command-specific execution is delegated to the END_PHASE, MOVE, and FIRE handlers.
 */
export async function registerActionRoutes(app: FastifyInstance, context: GameRouteContext): Promise<void> {
  const { db } = context

  /** Submit one validated game command for the active participant. */
  app.post<{ Params: { id: string }; Body: unknown }>('/:id/actions', async (req, reply) => {
    const actionLogContext: Record<string, unknown> = {
      requestId: String(req.id),
      requestedGameId: req.params.id,
    }

    try {
      const rawCommandType = typeof req.body === 'object' && req.body !== null && 'type' in req.body
        ? (req.body as { type?: unknown }).type
        : undefined
      logger.info({ id: req.params.id, command: rawCommandType }, 'Submitting game action')
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      actionLogContext.userId = userId
      logger.debug({ userId }, 'User ID extracted for action')

      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      const match = await db.findMatch(gameId)
      if (!match) {
        logger.warn({ id: req.params.id }, 'Game not found for action')
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      actionLogContext.gameId = match.gameId
      actionLogContext.phase = match.phase

      if (match.events.some((event) => event.type === 'GAME_ABORTED')) {
        logger.info({ gameId: match.gameId }, 'Action attempted on aborted game')
        return reply.status(409).send({ ok: false, error: 'Game is aborted', code: 'GAME_ABORTED', currentPhase: match.phase })
      }

      if (match.winner) {
        logger.info({ gameId: match.gameId }, 'Action attempted on finished game')
        return reply.status(409).send({ ok: false, error: 'Game is already over', code: 'GAME_OVER', currentPhase: match.phase })
      }

      if (!match.players.onion || !match.players.defender) {
        logger.info({ gameId: match.gameId }, 'Action attempted before both players joined')
        return reply.status(400).send({ ok: false, error: 'Waiting for second player to join', code: 'WAITING_FOR_PLAYER', currentPhase: match.phase })
      }

      const actor = phaseActor(match.phase)
      const activeUserId = actor === 'onion' ? match.players.onion : match.players.defender
      if (userId !== activeUserId) {
        logger.warn({ userId, gameId: match.gameId }, 'Not user turn')
        return reply.status(403).send({ ok: false, error: 'Not your turn', code: 'NOT_YOUR_TURN', currentPhase: match.phase })
      }

      actionLogContext.commandType = rawCommandType
      logger.debug({ command: req.body }, 'Received command')
      if (!rawCommandType) {
        logger.warn({ command: req.body }, 'Missing command type')
        return reply.status(400).send({ ok: false, error: 'Missing command type', code: 'INVALID_INPUT', currentPhase: match.phase })
      }

      const supportedCommands = new Set(['END_PHASE', 'MOVE', 'FIRE'])
      if (typeof rawCommandType !== 'string' || !supportedCommands.has(rawCommandType)) {
        logger.warn({ commandType: rawCommandType }, 'Unknown command type')
        return reply.status(400).send({
          ok: false,
          error: `Unknown command type: ${String(rawCommandType)}`,
          code: 'COMMAND_INVALID',
          detailCode: `UNKNOWN_COMMAND ${String(rawCommandType)}`,
          currentPhase: match.phase,
        })
      }

      const parsedCommand = CommandSchema.safeParse(req.body)
      if (!parsedCommand.success) {
        logger.warn({ commandType: rawCommandType }, 'Invalid command payload')
        return reply.status(400).send({
          ok: false,
          error: 'Invalid command payload',
          code: 'INVALID_INPUT',
          detailCode: 'COMMAND_SCHEMA_INVALID',
          currentPhase: match.phase,
        })
      }

      const command: Command = parsedCommand.data

      if (match.status !== 'active') {
        return reply.status(409).send({ ok: false, error: 'Game has not been started', code: 'GAME_NOT_STARTED', currentPhase: match.phase })
      }

      const handlerContext = {
        ...context,
        match,
        causeId: String(req.id),
        expectedLastEventSeq: match.events.at(-1)?.seq ?? 0,
        attachCauseId,
      }
      let result: ActionHandlerResponse
      if (command.type === 'END_PHASE') {
        result = await handleEndPhase(handlerContext)
      } else if (command.type === 'MOVE') {
        result = await handleMove(handlerContext, command)
      } else {
        result = await handleFire(handlerContext, command)
      }

      return reply.status(result.statusCode).send(result.payload)
    } catch (err) {
      if (isStaleMatchStateError(err)) {
        logger.warn({ ...actionLogContext, ...describeActionError(err), err }, 'Stale match state error')
        return reply.status(409).send({
          ok: false,
          error: 'Match state changed; retry action',
          code: 'STALE_STATE',
        })
      }
      logger.error({ ...actionLogContext, ...describeActionError(err), err }, 'Error submitting game action')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })
}
