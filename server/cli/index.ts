import logger from '../logger.js'
import { startCli } from './repl.js'

try {
  await startCli()
} catch (error) {
  logger.error({ error }, 'CLI exited with an unexpected error')
  process.exit(1)
}