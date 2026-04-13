type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function getInitialLevel(): LogLevel {
  const envLevel = typeof process !== 'undefined' ? process.env.LOG_LEVEL?.toLowerCase() : undefined
  if (envLevel === 'debug' || envLevel === 'info' || envLevel === 'warn' || envLevel === 'error') {
    return envLevel
  }

  return 'info'
}

function formatLogPayload(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg
      }

      if (arg instanceof Error) {
        return arg.stack ?? arg.message
      }

      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

class SimpleLogger {
  level: LogLevel

  constructor(level: LogLevel) {
    this.level = level
  }

  private shouldLog(level: LogLevel): boolean {
    return levelOrder[level] >= levelOrder[this.level]
  }

  private emit(level: LogLevel, args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return
    }

    const message = formatLogPayload(args)
    const loggerMethod = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
    loggerMethod.call(console, message)
  }

  debug(...args: unknown[]): void {
    this.emit('debug', args)
  }

  info(...args: unknown[]): void {
    this.emit('info', args)
  }

  warn(...args: unknown[]): void {
    this.emit('warn', args)
  }

  error(...args: unknown[]): void {
    this.emit('error', args)
  }

  isLevelEnabled(level: LogLevel): boolean {
    return levelOrder[level] >= levelOrder[this.level]
  }
}

const logger = new SimpleLogger(getInitialLevel())

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
