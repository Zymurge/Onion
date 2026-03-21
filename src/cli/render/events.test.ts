import { describe, it, expect } from 'vitest'
import { renderEvents } from './events.js'
import type { EventEnvelope } from '../../types/index.js'

describe('renderEvents', () => {
  it('renders no events', () => {
    expect(renderEvents([])).toMatch(/\(none\)/)
  })

  it('renders a single event', () => {
    const events: EventEnvelope[] = [
      { seq: 1, type: 'MOVE', timestamp: '123', actor: 'onion', to: { q: 1, r: 2 } },
    ]
    expect(renderEvents(events)).toContain('MOVE')
    expect(renderEvents(events)).toContain('#1')
    expect(renderEvents(events)).toContain('actor="onion"')
  })
})
