import type { FastifyInstance } from 'fastify'

export function makeToken(userId: string) {
  return `stub.${userId}`
}

export async function register(
  app: FastifyInstance,
  username: string,
): Promise<{ userId: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, password: 'swamp1234' },
  })
  const { userId } = res.json()
  return { userId, token: makeToken(userId) }
}