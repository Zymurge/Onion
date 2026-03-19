import { describe, expect, it } from 'vitest'

import { parseCommand } from './parser.js'

describe('parseCommand', () => {
  it('parses help', () => {
    expect(parseCommand('help')).toEqual({ ok: true, command: { kind: 'help', topic: undefined } })
  })

  it('parses exit alias', () => {
    expect(parseCommand('quit')).toEqual({ ok: true, command: { kind: 'exit' } })
  })

  it('parses config set url', () => {
    expect(parseCommand('config set url http://localhost:3000')).toEqual({
      ok: true,
      command: { kind: 'config-set-url', url: 'http://localhost:3000' },
    })
  })

  it('parses register', () => {
    expect(parseCommand('register shrek swamp1234')).toEqual({
      ok: true,
      command: { kind: 'register', username: 'shrek', password: 'swamp1234' },
    })
  })

  it('parses login', () => {
    expect(parseCommand('login donkey swamp1234')).toEqual({
      ok: true,
      command: { kind: 'login', username: 'donkey', password: 'swamp1234' },
    })
  })

  it('parses scenarios alias', () => {
    expect(parseCommand('scen')).toEqual({
      ok: true,
      command: { kind: 'scenarios' },
    })
  })

  it('parses scenario show', () => {
    expect(parseCommand('scenario show swamp-siege-01')).toEqual({
      ok: true,
      command: { kind: 'scenario-show', scenarioId: 'swamp-siege-01' },
    })
  })

  it('parses game create', () => {
    expect(parseCommand('game create swamp-siege-01 onion')).toEqual({
      ok: true,
      command: { kind: 'game-create', scenarioId: 'swamp-siege-01', role: 'onion' },
    })
  })

  it('parses game join', () => {
    expect(parseCommand('game join 123')).toEqual({
      ok: true,
      command: { kind: 'game-join', gameId: '123' },
    })
  })

  it('parses game load', () => {
    expect(parseCommand('game load 123')).toEqual({
      ok: true,
      command: { kind: 'game-load', gameId: '123' },
    })
  })

  it('parses refresh', () => {
    expect(parseCommand('refresh')).toEqual({
      ok: true,
      command: { kind: 'refresh' },
    })
  })

  it('parses show map', () => {
    expect(parseCommand('show map')).toEqual({
      ok: true,
      command: { kind: 'show', target: 'map' },
    })
  })

  it('parses events after seq', () => {
    expect(parseCommand('events after 12')).toEqual({
      ok: true,
      command: { kind: 'events', after: 12 },
    })
  })

  it('parses move with q,r syntax', () => {
    expect(parseCommand('move onion 1,10')).toEqual({
      ok: true,
      command: { kind: 'move', unitId: 'onion', to: { q: 1, r: 10 } },
    })
  })

  it('parses fire-weapon', () => {
    expect(parseCommand('fire-weapon main 0 wolf-1')).toEqual({
      ok: true,
      command: { kind: 'fire-weapon', weaponType: 'main', weaponIndex: 0, targetId: 'wolf-1' },
    })
  })

  it('parses fire-unit', () => {
    expect(parseCommand('fire-unit wolf-1 onion')).toEqual({
      ok: true,
      command: { kind: 'fire-unit', unitId: 'wolf-1', targetId: 'onion' },
    })
  })

  it('parses combined-fire', () => {
    expect(parseCommand('combined-fire wolf-1 puss-1 -> main')).toEqual({
      ok: true,
      command: { kind: 'combined-fire', unitIds: ['wolf-1', 'puss-1'], targetId: 'main' },
    })
  })

  it('parses end-phase alias', () => {
    expect(parseCommand('ep')).toEqual({
      ok: true,
      command: { kind: 'end-phase' },
    })
  })

  it('rejects unknown commands', () => {
    expect(parseCommand('launch')).toEqual({ ok: false, error: 'unknown command: launch' })
  })

  it('rejects incomplete game create', () => {
    expect(parseCommand('game create swamp-siege-01')).toEqual({
      ok: false,
      error: 'usage: game create <scenarioId> <onion|defender>',
    })
  })

  it('rejects malformed combined-fire', () => {
    expect(parseCommand('combined-fire wolf-1 main')).toEqual({
      ok: false,
      error: 'usage: combined-fire <unitId...> -> <targetId>',
    })
  })
})