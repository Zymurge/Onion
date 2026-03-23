import { describe, it, expect } from 'vitest'
import { renderGameSummary, renderDefenders, renderOnion, renderLatestEvents } from './summary.js'
import type { GameState, EventEnvelope } from '../../types/index.js'
import type { SessionStore } from '../session/store.js'

describe('renderGameSummary', () => {
  it('renders unloaded state', () => {
    const session = {} as SessionStore
    expect(renderGameSummary(session, null)).toMatch(/unloaded/)
  })

  it('sorts defenders by readiness and keeps destroyed last', () => {
    const session = {
      gameId: 'g1',
      scenarioId: 's1',
      role: 'defender',
      phase: 'DEFENDER_COMBAT',
      turnNumber: 3,
      winner: null,
      lastEventSeq: 47,
    } as SessionStore

    const state = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        status: 'operational',
        position: { q: 3, r: 6 },
        treads: 33,
        weapons: [],
      },
      defenders: {
        'wolf-1': {
          id: 'wolf-1',
          type: 'BigBadWolf',
          status: 'destroyed',
          position: { q: 2, r: 6 },
          weapons: [{ id: 'main', status: 'ready' }],
        },
        'wolf-2': {
          id: 'wolf-2',
          type: 'BigBadWolf',
          status: 'operational',
          position: { q: 2, r: 7 },
          weapons: [{ id: 'main', status: 'spent' }],
        },
      },
    } as unknown as GameState

    const summary = renderGameSummary(session, state)
    const wolf2Index = summary.indexOf('id=wolf-2')
    const wolf1Index = summary.indexOf('id=wolf-1')

    expect(wolf2Index).toBeGreaterThan(-1)
    expect(wolf1Index).toBeGreaterThan(-1)
    expect(wolf2Index).toBeLessThan(wolf1Index)
  })

  it('renders destroyed defenders with n/a weapons and disabled defenders with disabled weapons', () => {
    const session = {
      gameId: 'g1',
      scenarioId: 's1',
      role: 'defender',
      phase: 'DEFENDER_COMBAT',
      turnNumber: 3,
      winner: null,
      lastEventSeq: 47,
    } as SessionStore

    const state = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        status: 'operational',
        position: { q: 3, r: 6 },
        treads: 33,
        weapons: [],
      },
      defenders: {
        'pigs-1': {
          id: 'pigs-1',
          type: 'LittlePigs',
          status: 'disabled',
          position: { q: 3, r: 7 },
          weapons: [{ id: 'rifle', status: 'ready' }],
        },
        'wolf-1': {
          id: 'wolf-1',
          type: 'BigBadWolf',
          status: 'destroyed',
          position: { q: 2, r: 6 },
          weapons: [{ id: 'main', status: 'ready' }],
        },
      },
    } as unknown as GameState

    const summary = renderGameSummary(session, state)

    expect(summary).toContain('id=pigs-1 type=LittlePigs status=disabled')
    expect(summary).toContain('weapons: 0:rifle:disabled')
    expect(summary).toContain('id=wolf-1 type=BigBadWolf status=destroyed')
    expect(summary).toContain('weapons: (n/a - unit destroyed)')
  })
})

describe('renderDefenders', () => {
  it('renders unloaded', () => {
    expect(renderDefenders(null)).toMatch(/unloaded/)
  })
  it('renders none', () => {
    expect(renderDefenders({ defenders: {} } as GameState)).toMatch(/none/)
  })

  it('renders effective weapon status for disabled and destroyed units', () => {
    const state = {
      defenders: {
        'pigs-1': {
          id: 'pigs-1',
          type: 'LittlePigs',
          status: 'disabled',
          position: { q: 3, r: 7 },
          weapons: [{ id: 'rifle', status: 'ready' }],
        },
        'wolf-1': {
          id: 'wolf-1',
          type: 'BigBadWolf',
          status: 'destroyed',
          position: { q: 2, r: 6 },
          weapons: [{ id: 'main', status: 'ready' }],
        },
      },
    } as unknown as GameState

    const rendered = renderDefenders(state)

    expect(rendered).toContain('pigs-1 LittlePigs disabled')
    expect(rendered).toContain('weapons: 0:rifle:disabled')
    expect(rendered).toContain('wolf-1 BigBadWolf destroyed')
    expect(rendered).toContain('weapons: (n/a - unit destroyed)')
  })
})

describe('renderOnion', () => {
  it('renders unloaded', () => {
    expect(renderOnion(null)).toMatch(/unloaded/)
  })

  it('renders disabled onion weapons as disabled', () => {
    const state = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        status: 'disabled',
        position: { q: 3, r: 6 },
        treads: 33,
        weapons: [{ id: 'main', status: 'ready' }],
      },
      defenders: {},
    } as unknown as GameState

    const rendered = renderOnion(state)
    expect(rendered).toContain('weapons: 0:main:disabled')
  })

  it('renders destroyed onion weapons as n/a', () => {
    const state = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        status: 'destroyed',
        position: { q: 3, r: 6 },
        treads: 0,
        weapons: [{ id: 'main', status: 'ready' }],
      },
      defenders: {},
    } as unknown as GameState

    const rendered = renderOnion(state)
    expect(rendered).toContain('weapons: (n/a - unit destroyed)')
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
