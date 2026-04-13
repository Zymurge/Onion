import { describe, it, expect } from 'vitest'
import * as runtime from '../../../server/cli/runtime.js'
import { setLoggerLevel } from '../../../server/logger.js'

describe('isErrorLevelEvent', () => {
  it('detects error type', () => {
    expect(runtime.isErrorLevelEvent({ type: 'ERROR', seq: 1, timestamp: '0' })).toBe(true)
    expect(runtime.isErrorLevelEvent({ type: 'MOVE_ERROR', seq: 2, timestamp: '0' })).toBe(true)
    expect(runtime.isErrorLevelEvent({ type: 'MOVE', seq: 3, timestamp: '0', level: 'error' })).toBe(true)
    expect(runtime.isErrorLevelEvent({ type: 'MOVE', seq: 4, timestamp: '0', severity: 'error' })).toBe(true)
  })
  it('ignores non-error', () => {
    expect(runtime.isErrorLevelEvent({ type: 'MOVE', seq: 5, timestamp: '0' })).toBe(false)
  })
})

describe('logCapturedEvents', () => {
  it('does nothing for empty events', () => {
    expect(() => runtime.logCapturedEvents('test', [])).not.toThrow()
  })
})

describe('debug logging commands', () => {
  it('toggles debug logging on and off', async () => {
    setLoggerLevel('info')

    const enable = await runtime.executeCommand({} as any, { kind: 'debug', enabled: true })
    expect(enable.message).toContain('Debug logging: on (debug)')

    const disable = await runtime.executeCommand({} as any, { kind: 'debug', enabled: false })
    expect(disable.message).toContain('Debug logging: off (info)')
  })

  it('includes debug logging status in session output', () => {
    setLoggerLevel('info')
    expect(runtime.renderStatusText({} as any)).toContain('debugLogging: off (info)')
  })
})
