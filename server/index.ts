import logger from '#server/logger'
import { buildApp } from '#server/app'
import { getPool, closePool } from '#server/db/client'
import { runMigrations } from '#server/db/migrate'
import { PostgresDb } from '#server/db/postgres'
import { createE2ERollSourceFactory } from '#server/engine/e2eRamRolls'
import { loadConfig } from '#server/config/loadConfig'

const config = loadConfig()
const pool = getPool(config.databaseUrl)

const app = buildApp(new PostgresDb(pool), {
  createRamRolls: createE2ERollSourceFactory(process.env.E2E_RAM_ROLLS, process.env.E2E_RAM_ROLLS_BY_SCENARIO),
  createCombatRolls: createE2ERollSourceFactory(process.env.E2E_COMBAT_ROLLS),
  config,
})

try {
  await runMigrations(pool)
  await app.listen({ port: config.port, host: config.host })
  logger.info(`Onion Engine listening on http://${config.host}:${config.port}`)
} catch (err) {
  app.log.error(err)
  await closePool()
  process.exit(1)
}
