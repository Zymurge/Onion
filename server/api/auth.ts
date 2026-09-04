import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import type { DbAdapter } from '#server/db/adapter'

const PRINTABLE_ASCII_RE = /^[\x20-\x7E]+$/

const UsernameSchema = z.string()
  .min(4)
  .max(20)
  .regex(PRINTABLE_ASCII_RE)
  .refine((value) => value === value.trim())

const PasswordSchema = z.string()
  .min(8)
  .max(20)
  .regex(PRINTABLE_ASCII_RE)

const EmailSchema = z.string()
  .max(254)
  .email()
  .refine((value) => !/[\s\p{Cc}]/u.test(value))

const RegisterSchema = z.object({
  username: UsernameSchema,
  email: EmailSchema,
  password: PasswordSchema,
})

const CredentialsSchema = z.object({
  username: z.string().min(3).max(50),
  password: PasswordSchema,
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export async function verifyUserId(
  app: FastifyInstance,
  authHeader: string | undefined,
  queryToken?: string,
): Promise<string | null> {
  const token = authHeader !== undefined
    ? authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined
    : queryToken
  if (!token) {
    return null
  }

  try {
    const payload = await app.jwt.verify<{ sub?: unknown }>(token)
    return typeof payload.sub === 'string' && UUID_RE.test(payload.sub) ? payload.sub : null
  } catch {
    return null
  }
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
  * Creates a new user with the provided credentials. Usernames and emails must be unique.
   * Passwords are hashed with scrypt before storage.
   *
   * @route POST /auth/register
  * @body { username: string, email: string, password: string }
  * @returns { username: string, userId: string, token: string } - 201 on success
   * @returns { ok: false, error: string, code: string } - 400 INVALID_INPUT for schema validation errors
  *                                            409 USERNAME_TAKEN if username already exists
  *                                            409 EMAIL_TAKEN if email already exists
   *                                            413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
  app.post('/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'Invalid input', code: 'INVALID_INPUT' })
    }
    const { username, email, password } = parsed.data
    const normalizedUsername = username.toLowerCase()
    const normalizedEmail = email.toLowerCase()

    if ((await db.findUserByUsername(normalizedUsername)) !== null) {
      return reply.status(409).send({ ok: false, error: 'Username already taken', code: 'USERNAME_TAKEN' })
    }
    if ((await db.findUserByEmail(normalizedEmail)) !== null) {
      return reply.status(409).send({ ok: false, error: 'Email already taken', code: 'EMAIL_TAKEN' })
    }

    let userId: string
    try {
      userId = (await db.createUser(username, normalizedEmail, hashPassword(password))).userId
    } catch (error) {
      const constraint = typeof error === 'object' && error !== null && 'constraint' in error
        ? String((error as { constraint?: unknown }).constraint)
        : ''
      if (constraint.includes('username')) {
        return reply.status(409).send({ ok: false, error: 'Username already taken', code: 'USERNAME_TAKEN' })
      }
      if (constraint.includes('email')) {
        return reply.status(409).send({ ok: false, error: 'Email already taken', code: 'EMAIL_TAKEN' })
      }
      throw error
    }
    const token = app.jwt.sign({ sub: userId })
    return reply.status(201).send({ username, userId, token })
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
   * @returns { ok: false, error: string, code: string } - 400 INVALID_INPUT for schema validation errors
  *                                            401 INVALID_CREDENTIALS for bad username or password
   *                                            413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
  app.post('/login', async (req, reply) => {
    const parsed = CredentialsSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'Invalid input', code: 'INVALID_INPUT' })
    }
    const { username, password } = parsed.data

    const record = await db.findUserByUsername(username.toLowerCase())
    if (!record || !verifyPassword(password, record.passwordHash)) {
      return reply.status(401).send({ ok: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' })
    }

    const token = app.jwt.sign({ sub: record.userId })
    return reply.status(200).send({ userId: record.userId, token })
  })
}
