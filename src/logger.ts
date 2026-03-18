import pino from 'pino'

// Set log level from environment or default to 'info'
const level = process.env.LOG_LEVEL || 'info'

const logger = pino({
  level: level || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
})

export default logger
