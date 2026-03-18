import type { FastifyInstance } from 'fastify'
import type { PlayerRole } from '../types/index.js'

export interface RegisteredUser {
  userId: string
  token: string
}

export interface CreatedGame {
  gameId: string
  role: string
}

export function makeToken(userId: string) {
  return `stub.${userId}`
}

export async function register(
  app: FastifyInstance,
  username: string,
): Promise<RegisteredUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, password: 'swamp1234' },
  })
  const { userId } = res.json()
  return { userId, token: makeToken(userId) }
}

export async function createGame(
  app: FastifyInstance,
  token: string,
  role: PlayerRole,
  scenarioId = 'swamp-siege-01',
): Promise<CreatedGame> {
  const res = await app.inject({
    method: 'POST',
    url: '/games',
    headers: { authorization: `Bearer ${token}` },
    payload: { scenarioId, role },
  })
  return res.json()
}

export async function joinGame(
  app: FastifyInstance,
  gameId: string,
  token: string,
): Promise<CreatedGame> {
  const res = await app.inject({
    method: 'POST',
    url: `/games/${gameId}/join`,
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  })
  return res.json()
}

export async function getGame(
  app: FastifyInstance,
  gameId: string,
  token: string,
) {
  return app.inject({
    method: 'GET',
    url: `/games/${gameId}`,
    headers: { authorization: `Bearer ${token}` },
  })
}

export async function getEvents(
  app: FastifyInstance,
  gameId: string,
  token: string,
  after = 0,
) {
  return app.inject({
    method: 'GET',
    url: `/games/${gameId}/events?after=${after}`,
    headers: { authorization: `Bearer ${token}` },
  })
}

export async function submitAction(
  app: FastifyInstance,
  gameId: string,
  token: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: `/games/${gameId}/actions`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  })
}

export async function endPhase(
  app: FastifyInstance,
  gameId: string,
  token: string,
) {
  return submitAction(app, gameId, token, { type: 'END_PHASE' })
}

export async function setupJoinedGame(
  app: FastifyInstance,
  creatorRole: PlayerRole = 'onion',
) {
  const creator = await register(app, 'shrek')
  const joiner = await register(app, 'fiona')
  const { gameId } = await createGame(app, creator.token, creatorRole)
  await joinGame(app, gameId, joiner.token)
  return { creator, joiner, gameId }
}

export function createMovePlan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    unitId: 'onion',
    from: { q: 0, r: 10 },
    to: { q: 1, r: 10 },
    path: [{ q: 1, r: 10 }],
    cost: 1,
    movementAllowance: 3,
    rammedUnitIds: [],
    ramCapacityUsed: 0,
    treadCost: 0,
    capabilities: {
      canRam: true,
      hasTreads: true,
      canSecondMove: false,
      canCrossRidgelines: true,
    },
    ...overrides,
  }
}