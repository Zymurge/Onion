import logger from '#server/logger'
import { startCli } from '#server/cli/repl'

try {
  await startCli()
} catch (error) {
  logger.error({ error }, 'CLI exited with an unexpected error')
  process.exit(1)
}