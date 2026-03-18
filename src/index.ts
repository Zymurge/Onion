import logger from './logger.js'
import { buildApp } from './app.js'
import { getPool, closePool } from './db/client.js'
import { PostgresDb } from './db/postgres.js'

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
