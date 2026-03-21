import pino from 'pino'

// Set log level from environment or default to 'info'
const level = process.env.LOG_LEVEL || 'info'

const logger = process.env.NODE_ENV === 'development'
  ? pino({
      level: level || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          destination: 2,
          sync: true,
        },
      },
    })
  : pino(
      { level: level || 'info' },
      pino.destination({ dest: 2, sync: true }),
    )

export function setLoggerLevel(level: 'debug' | 'info'): void {
  logger.level = level
}

export function getLoggerLevel(): string {
  return logger.level
}

export function isDebugLoggingEnabled(): boolean {
  return logger.isLevelEnabled('debug')
}

export default logger
