import { z } from 'zod'

export type ServerEnvironment = Record<string, string | undefined>

const requiredEnvironmentKeys = [
  'PORT',
  'HOST',
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
  PORT: z.preprocess(
    (value) => typeof value === 'string' ? value.trim() : value,
    z.coerce.number().int().min(1).max(65_535),
  ),
  HOST: nonEmptyString,
  DATABASE_URL: nonEmptyString,
  JWT_SECRET: nonEmptyString.pipe(z.string().min(32)),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
  SCENARIOS_DIR: nonEmptyString,
}).transform((env) => ({
  port: env.PORT,
  host: env.HOST,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  scenariosDir: env.SCENARIOS_DIR,
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
