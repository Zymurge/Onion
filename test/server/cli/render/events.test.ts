import { describe, it, expect } from 'vitest'
import { renderEvents } from '../../../../server/cli/render/events.js'
import type { EventEnvelope } from '../../../../shared/types/index.js'

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

  it('renders detailed weapon fire results', () => {
    const events: EventEnvelope[] = [
      {
        seq: 28,
        type: 'WEAPON_FIRED',
        timestamp: '123',
        weaponType: 'main',
        weaponIndex: 0,
        targetId: 'pigs-1',
        roll: 5,
        outcome: 'D',
        odds: '2:1',
      },
      {
        seq: 29,
        type: 'UNIT_STATUS_CHANGED',
        timestamp: '124',
        unitId: 'pigs-1',
        from: 'operational',
        to: 'disabled',
      },
    ]

    const rendered = renderEvents(events)
    expect(rendered).toContain('WEAPON_FIRED: weapon=main idx=0 target=pigs-1 roll=5 outcome=D odds=2:1')
    expect(rendered).toContain('UNIT_STATUS_CHANGED: unit=pigs-1 operational')
    expect(rendered).toContain('disabled')
  })
})
