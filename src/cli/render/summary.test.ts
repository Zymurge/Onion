import { describe, it, expect } from 'vitest'
import { renderGameSummary, renderDefenders, renderOnion, renderLatestEvents } from './summary.js'
import type { GameState, EventEnvelope } from '../../types/index.js'
import type { SessionStore } from '../session/store.js'

describe('renderGameSummary', () => {
  it('renders unloaded state', () => {
    const session = {} as SessionStore
    expect(renderGameSummary(session, null)).toMatch(/unloaded/)
  })
})

describe('renderDefenders', () => {
  it('renders unloaded', () => {
    expect(renderDefenders(null)).toMatch(/unloaded/)
  })
  it('renders none', () => {
    expect(renderDefenders({ defenders: {} } as GameState)).toMatch(/none/)
  })
})

describe('renderOnion', () => {
  it('renders unloaded', () => {
    expect(renderOnion(null)).toMatch(/unloaded/)
  })
})

describe('renderLatestEvents', () => {
  it('renders none', () => {
    expect(renderLatestEvents([])).toMatch(/none/)
  })
  it('renders an event', () => {
    const events: EventEnvelope[] = [{ seq: 1, type: 'MOVE', timestamp: 0 } as any]
    expect(renderLatestEvents(events)).toContain('MOVE')
  })
})
