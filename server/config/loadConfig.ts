import { z } from 'zod'

export type ServerEnvironment = Record<string, string | undefined>

const requiredEnvironmentKeys = [
  'ENGINE_PORT',
  'ENGINE_HOST',
  'DATABASE_URL',
  'JWT_SECRET',
  'NODE_ENV',
  'LOG_LEVEL',
  'SCENARIOS_DIR',
] as const

const nonEmptyString = z.preprocess(
  (value) => typeof value === 'string' ? value.trim() : value,
  z.string().min(1),
)

export const serverConfigSchema = z.object({
  ENGINE_PORT: z.preprocess(
    (value) => typeof value === 'string' ? value.trim() : value,
    z.coerce.number().int().min(1).max(65_535),
  ),
  ENGINE_HOST: nonEmptyString,
  DATABASE_URL: nonEmptyString,
  JWT_SECRET: nonEmptyString.pipe(z.string().min(32)),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']),
  SCENARIOS_DIR: nonEmptyString,
  LOBBY_POLL_INTERVAL_MS: z.preprocess(
    (value) => typeof value === 'string' ? value.trim() : value,
    z.coerce.number().int().min(1),
  ).default(3000),
  PRESENCE_DISCONNECT_GRACE_MS: z.preprocess(
    (value) => typeof value === 'string' ? value.trim() : value,
    z.coerce.number().int().min(0),
  ).default(3000),
}).transform((env) => ({
  port: env.ENGINE_PORT,
  host: env.ENGINE_HOST,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  scenariosDir: env.SCENARIOS_DIR,
  lobbyPollIntervalMs: env.LOBBY_POLL_INTERVAL_MS,
  presenceDisconnectGraceMs: env.PRESENCE_DISCONNECT_GRACE_MS,
}))

export type ServerConfig = z.infer<typeof serverConfigSchema>

export function loadConfig(env: ServerEnvironment = process.env): ServerConfig {
  const missingKeys = requiredEnvironmentKeys.filter((key) => env[key] === undefined)
  if (missingKeys.length > 0) {
    throw new Error(`Invalid server configuration: required values are missing: ${missingKeys.join(', ')}`)
  }

  const result = serverConfigSchema.safeParse(env)
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'configuration'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid server configuration: ${details}`)
  }

  return result.data
}
