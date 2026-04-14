import logger from '#server/logger'
import { buildApp } from '#server/app'
import { getPool, closePool } from '#server/db/client'
import { PostgresDb } from '#server/db/postgres'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const app = buildApp(new PostgresDb(getPool()))

try {
  await app.listen({ port, host })
  logger.info(`Onion Engine listening on http://${host}:${port}`)
} catch (err) {
  app.log.error(err)
  await closePool()
  process.exit(1)
}
