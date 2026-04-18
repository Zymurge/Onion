import pino, { type Logger } from 'pino/browser.js'

export type WebLogLevel = 'debug' | 'info' | 'warn' | 'error'

const browserLogger: Logger = pino({
	level: 'info',
	browser: {
		asObject: true,
	},
})

function isValidLogLevel(value: unknown): value is WebLogLevel {
	return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
}

function forward(level: WebLogLevel, args: unknown[]): void {
	if (args.length === 0) {
		return
	}

	const method = browserLogger[level].bind(browserLogger)
	if (args.length === 1) {
		method(args[0])
		return
	}

	if (typeof args[0] === 'string') {
		method(args[1] as object, args[0])
		return
	}

	method(args[0] as object, ...(args.slice(1) as []))
}

export function setWebLoggerLevel(level: WebLogLevel): void {
	browserLogger.level = level
}

export function getWebLoggerLevel(): WebLogLevel {
	return browserLogger.level as WebLogLevel
}

export function isWebDebugLoggingEnabled(): boolean {
	return browserLogger.isLevelEnabled('debug')
}

export function resolveWebLogLevel(value: string | null | undefined): WebLogLevel | null {
	const normalized = value?.trim().toLowerCase()
	return isValidLogLevel(normalized) ? normalized : null
}

const logger = {
	debug(...args: unknown[]): void {
		forward('debug', args)
	},
	info(...args: unknown[]): void {
		forward('info', args)
	},
	warn(...args: unknown[]): void {
		forward('warn', args)
	},
	error(...args: unknown[]): void {
		forward('error', args)
	},
}

export default logger