import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

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

interface UserRecord {
  userId: string
  passwordHash: string
}

// In-memory stub store — replaced with DB queries in a later phase.
// Each app instance gets its own store via plugin registration closure.
function makeStore() {
  return new Map<string, UserRecord>()
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const users = makeStore()

  app.post('/register', async (req, reply) => {
    const parsed = CredentialsSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'Invalid input', code: 'INVALID_INPUT' })
    }
    const { username, password } = parsed.data

    if (users.has(username)) {
      return reply.status(409).send({ ok: false, error: 'Username already taken', code: 'USERNAME_TAKEN' })
    }

    const userId = randomUUID()
    users.set(username, { userId, passwordHash: hashPassword(password) })

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

    const record = users.get(username)
    if (!record || !verifyPassword(password, record.passwordHash)) {
      return reply.status(401).send({ ok: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
    }

    const token = `stub.${record.userId}`
    return reply.status(200).send({ userId: record.userId, token })
  })
}
