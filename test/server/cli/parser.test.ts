import { describe, expect, it } from 'vitest'

import { parseCommand } from '../../../server/cli/parser.js'

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

  it('parses debug on', () => {
    expect(parseCommand('debug on')).toEqual({
      ok: true,
      command: { kind: 'debug', enabled: true },
    })
  })

  it('parses debug status', () => {
    expect(parseCommand('debug status')).toEqual({
      ok: true,
      command: { kind: 'debug' },
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

  it('parses game create alias', () => {
    expect(parseCommand('g c swamp-siege-01 defender')).toEqual({
      ok: true,
      command: { kind: 'game-create', scenarioId: 'swamp-siege-01', role: 'defender' },
    })
  })

  it('parses game join', () => {
    expect(parseCommand('game join 123')).toEqual({
      ok: true,
      command: { kind: 'game-join', gameId: '123' },
    })
  })

  it('parses game join alias', () => {
    expect(parseCommand('g j 123')).toEqual({
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

  it('parses game load alias', () => {
    expect(parseCommand('g l 123')).toEqual({
      ok: true,
      command: { kind: 'game-load', gameId: '123' },
    })
  })

  it('parses game list alias', () => {
    expect(parseCommand('g ls')).toEqual({
      ok: true,
      command: { kind: 'game-list' },
    })
  })

  it('parses refresh', () => {
    expect(parseCommand('refresh')).toEqual({
      ok: true,
      command: { kind: 'refresh' },
    })
  })

  it('parses refresh alias', () => {
    expect(parseCommand('r')).toEqual({
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

  it('parses show aliases', () => {
    expect(parseCommand('s m')).toEqual({ ok: true, command: { kind: 'show', target: 'map' } })
    expect(parseCommand('s d')).toEqual({ ok: true, command: { kind: 'show', target: 'defenders' } })
    expect(parseCommand('s s')).toEqual({ ok: true, command: { kind: 'show', target: 'state' } })
    expect(parseCommand('s u')).toEqual({ ok: true, command: { kind: 'show', target: 'units' } })
    expect(parseCommand('s o')).toEqual({ ok: true, command: { kind: 'show', target: 'onion' } })
    expect(parseCommand('s e')).toEqual({ ok: true, command: { kind: 'show', target: 'events' } })
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

  it('parses unified fire command with one attacker', () => {
    expect(parseCommand('fire wolf-1 main')).toEqual({
      ok: true,
      command: { kind: 'fire', targetId: 'wolf-1', attackers: ['main'] },
    })
  })

  it('parses unified fire command with multiple attackers', () => {
    expect(parseCommand('fire main wolf-1 puss-1')).toEqual({
      ok: true,
      command: { kind: 'fire', targetId: 'main', attackers: ['wolf-1', 'puss-1'] },
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

  it('rejects malformed fire command', () => {
    expect(parseCommand('fire wolf-1')).toEqual({
      ok: false,
      error: 'usage: fire <targetId> <attacker1> [attacker2...]',
    })
  })

  it('rejects fire command with empty attacker token', () => {
    expect(parseCommand('fire wolf-1 ""')).toEqual({
      ok: false,
      error: 'usage: fire <targetId> <attacker1> [attacker2...]',
    })
  })

  it('rejects invalid debug argument', () => {
    expect(parseCommand('debug maybe')).toEqual({
      ok: false,
      error: 'usage: debug [on|off|status]',
    })
  })
})