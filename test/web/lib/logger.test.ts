import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
	vi.restoreAllMocks()
	vi.resetModules()
})

describe('web logger', () => {
	it('suppresses debug logs when configured for info', async () => {
		const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
		const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
		const { default: logger, setWebLoggerLevel } = await import('#web/lib/logger')

		setWebLoggerLevel('info')
		logger.debug('debug message')
		logger.info('info message')

		expect(debugSpy).not.toHaveBeenCalled()
		expect(infoSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: 'info message', level: 30 }))
	})

	it('emits debug logs when configured for debug', async () => {
		const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
		const { default: logger, setWebLoggerLevel } = await import('#web/lib/logger')

		setWebLoggerLevel('debug')
		logger.debug('debug message', { event: 'handled' })

		expect(debugSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: 'debug message', event: 'handled', level: 20 }))
	})
})