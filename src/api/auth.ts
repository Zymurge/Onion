import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { DbAdapter } from '../db/adapter.js'

const CredentialsSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
})

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':')
  const hash = scryptSync(password, salt, 64)
  const storedBuf = Buffer.from(storedHash, 'hex')
  return timingSafeEqual(hash, storedBuf)
}

export const authRoutes: FastifyPluginAsync<{ db: DbAdapter }> = async (app: FastifyInstance, opts) => {
  const { db } = opts

  app.post('/register', async (req, reply) => {
    const parsed = CredentialsSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'Invalid input', code: 'INVALID_INPUT' })
    }
    const { username, password } = parsed.data

    if ((await db.findUserByUsername(username)) !== null) {
      return reply.status(409).send({ ok: false, error: 'Username already taken', code: 'USERNAME_TAKEN' })
    }

    const { userId } = await db.createUser(username, hashPassword(password))
    // TODO: replace with @fastify/jwt in next phase
    const token = `stub.${userId}`
    return reply.status(201).send({ userId, token })
  })

  app.post('/login', async (req, reply) => {
    const parsed = CredentialsSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'Invalid input', code: 'INVALID_INPUT' })
    }
    const { username, password } = parsed.data

    const record = await db.findUserByUsername(username)
    if (!record || !verifyPassword(password, record.passwordHash)) {
      return reply.status(401).send({ ok: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
    }

    const token = `stub.${record.userId}`
    return reply.status(200).send({ userId: record.userId, token })
  })
}
