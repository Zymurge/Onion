import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { DbAdapter } from '../db/adapter.js'

const CredentialsSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
})

/**
 * Hash a password using scrypt with random salt.
 * @param password - Plain text password
 * @returns Salt:hash format string
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

/**
 * Verify a password against its hash.
 * @param password - Plain text password to check
 * @param stored - Stored hash in salt:hash format
 * @returns True if password matches
 */
function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':')
  const hash = scryptSync(password, salt, 64)
  const storedBuf = Buffer.from(storedHash, 'hex')
  return timingSafeEqual(hash, storedBuf)
}

/**
 * Authentication routes for user registration and login.
 *
 * Provides REST endpoints for creating user accounts and obtaining
 * authentication tokens. Uses scrypt for password hashing and
 * timing-safe comparison to prevent timing attacks.
 *
 * @param app - Fastify application instance
 * @param opts - Plugin options containing the database adapter
 */
export const authRoutes: FastifyPluginAsync<{ db: DbAdapter }> = async (app: FastifyInstance, opts) => {
  const { db } = opts

  /**
   * Register a new user account.
   *
   * Creates a new user with the provided credentials. Usernames must be unique.
   * Passwords are hashed with scrypt before storage.
   *
   * @route POST /auth/register
   * @body { username: string, password: string }
   * @returns { userId: string, token: string } - 201 on success
   * @returns { ok: false, error: string, code: string } - 400/409 on failure
   */
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

  /**
   * Authenticate an existing user.
   *
   * Verifies the provided credentials against stored user data.
   * Returns an authentication token on success.
   *
   * @route POST /auth/login
   * @body { username: string, password: string }
   * @returns { userId: string, token: string } - 200 on success
   * @returns { ok: false, error: string, code: string } - 400/401 on failure
   */
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
