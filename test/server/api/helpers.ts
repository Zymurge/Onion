import type { FastifyInstance } from 'fastify'
import type { PlayerRole } from '#shared/types/index'

export interface RegisteredUser {
  userId: string
  token: string
}

export interface CreatedGame {
  gameId: number
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
  gameId: number,
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
  gameId: number,
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
  gameId: number,
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
  gameId: number,
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
  gameId: number,
  token: string,
) {
  return submitAction(app, gameId, token, { type: 'END_PHASE' })
}

function phaseTokenFor(
  phase: string,
  onionToken: string,
  defenderToken: string,
) {
  return phase.startsWith('ONION_') ? onionToken : defenderToken
}

export async function advanceToPhase(
  app: FastifyInstance,
  gameId: number,
  onionToken: string,
  defenderToken: string,
  targetPhase: string,
) {
  for (let index = 0; index < 8; index++) {
    const stateResponse = await getGame(app, gameId, onionToken)
    const stateBody = stateResponse.json()
    if (stateBody.phase === targetPhase) {
      return stateBody
    }

    const token = phaseTokenFor(stateBody.phase, onionToken, defenderToken)
    const endResponse = await endPhase(app, gameId, token)
    if (endResponse.statusCode !== 200) {
      throw new Error(`Failed to advance phase from ${stateBody.phase} to ${targetPhase}`)
    }
  }

  throw new Error(`Unable to reach phase ${targetPhase}`)
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
    },
    ...overrides,
  }
}