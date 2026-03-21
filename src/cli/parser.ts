import type { CliCommand, ParseResult } from './types.js'

function tokenize(input: string): string[] {
  const tokens: string[] = []
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g

  for (const match of input.matchAll(pattern)) {
    const [, doubleQuoted, singleQuoted, bare] = match
    tokens.push((doubleQuoted ?? singleQuoted ?? bare).replace(/\\(["'\\])/g, '$1'))
  }

  return tokens
}

function normalizeVerb(token: string): string {
  return token.toLowerCase()
}

function parseHelp(tokens: string[]): CliCommand {
  return { kind: 'help', topic: tokens[1] }
}

function parseDebug(tokens: string[]): ParseResult {
  if (!tokens[1] || normalizeVerb(tokens[1]) === 'status') {
    return { ok: true, command: { kind: 'debug' } }
  }

  if (normalizeVerb(tokens[1]) === 'on') {
    return { ok: true, command: { kind: 'debug', enabled: true } }
  }

  if (normalizeVerb(tokens[1]) === 'off') {
    return { ok: true, command: { kind: 'debug', enabled: false } }
  }

  return { ok: false, error: 'usage: debug [on|off|status]' }
}

function parseConfig(tokens: string[]): ParseResult {
  if (tokens.length === 2 && normalizeVerb(tokens[1]) === 'show') {
    return { ok: true, command: { kind: 'config-show' } }
  }

  if (tokens.length >= 4 && normalizeVerb(tokens[1]) === 'set' && normalizeVerb(tokens[2]) === 'url') {
    return { ok: true, command: { kind: 'config-set-url', url: tokens.slice(3).join(' ') } }
  }

  return {
    ok: false,
    error: 'usage: config show | config set url <url>',
  }
}

function requireArgs(tokens: string[], usage: string, count: number): ParseResult | null {
  if (tokens.length < count) {
    return { ok: false, error: `usage: ${usage}` }
  }

  return null
}

function parseGame(tokens: string[]): ParseResult {
  const subcommand = normalizeVerb(tokens[1] ?? '')

  switch (subcommand) {
    case 'create': {
      const missing = requireArgs(tokens, 'game create <scenarioId> <onion|defender>', 4)
      if (missing) return missing
      const role = normalizeVerb(tokens[3])
      if (role !== 'onion' && role !== 'defender') {
        return { ok: false, error: 'usage: game create <scenarioId> <onion|defender>' }
      }
      return { ok: true, command: { kind: 'game-create', scenarioId: tokens[2], role } }
    }
    case 'join': {
      const missing = requireArgs(tokens, 'game join <gameId>', 3)
      if (missing) return missing
      return { ok: true, command: { kind: 'game-join', gameId: tokens[2] } }
    }
    case 'load': {
      const missing = requireArgs(tokens, 'game load <gameId>', 3)
      if (missing) return missing
      return { ok: true, command: { kind: 'game-load', gameId: tokens[2] } }
    }
    default:
      return { ok: false, error: 'usage: game create <scenarioId> <onion|defender> | game join <gameId> | game load <gameId>' }
  }
}

function parseScenario(tokens: string[]): ParseResult {
  if (normalizeVerb(tokens[1] ?? '') !== 'show' || !tokens[2]) {
    return { ok: false, error: 'usage: scenario show <scenarioId>' }
  }

  return { ok: true, command: { kind: 'scenario-show', scenarioId: tokens[2] } }
}

function parseInteger(value: string): number | null {
  if (!/^-?\d+$/.test(value)) {
    return null
  }

  return Number(value)
}

function parsePosition(tokens: string[], startIndex: number): { q: number; r: number } | null {
  const single = tokens[startIndex]
  if (!single) return null
  if (single.includes(',')) {
    const [qToken, rToken] = single.split(',')
    const q = parseInteger(qToken)
    const r = parseInteger(rToken)
    return q === null || r === null ? null : { q, r }
  }

  const q = parseInteger(single)
  const r = parseInteger(tokens[startIndex + 1] ?? '')
  return q === null || r === null ? null : { q, r }
}

function parseShow(tokens: string[]): ParseResult {
  const target = tokens[1]?.toLowerCase() as CliCommand extends { kind: 'show'; target?: infer T } ? T : never
  if (!target) {
    return { ok: true, command: { kind: 'show' } }
  }
  if (['map', 'state', 'units', 'onion', 'defenders', 'events'].includes(target)) {
    return { ok: true, command: { kind: 'show', target } }
  }
  return { ok: false, error: 'usage: show [map|state|units|onion|defenders|events]' }
}

function parseEvents(tokens: string[]): ParseResult {
  if (!tokens[1]) {
    return { ok: true, command: { kind: 'events' } }
  }
  if (normalizeVerb(tokens[1]) !== 'after') {
    return { ok: false, error: 'usage: events [after <seq>]' }
  }
  const after = parseInteger(tokens[2] ?? '')
  if (after === null) {
    return { ok: false, error: 'usage: events [after <seq>]' }
  }
  return { ok: true, command: { kind: 'events', after } }
}

function parseMove(tokens: string[]): ParseResult {
  const missing = requireArgs(tokens, 'move <unitId> <q,r>', 3)
  if (missing) return missing
  const to = parsePosition(tokens, 2)
  if (!to) {
    return { ok: false, error: 'usage: move <unitId> <q,r>' }
  }
  return { ok: true, command: { kind: 'move', unitId: tokens[1], to } }
}

function parseFireWeapon(tokens: string[]): ParseResult {
  const missing = requireArgs(tokens, 'fire-weapon <main|secondary|ap|missile> <index> <targetId>', 4)
  if (missing) return missing
  const weaponType = normalizeVerb(tokens[1])
  if (!['main', 'secondary', 'ap', 'missile'].includes(weaponType)) {
    return { ok: false, error: 'usage: fire-weapon <main|secondary|ap|missile> <index> <targetId>' }
  }
  const weaponIndex = parseInteger(tokens[2])
  if (weaponIndex === null) {
    return { ok: false, error: 'usage: fire-weapon <main|secondary|ap|missile> <index> <targetId>' }
  }
  return {
    ok: true,
    command: { kind: 'fire-weapon', weaponType: weaponType as 'main' | 'secondary' | 'ap' | 'missile', weaponIndex, targetId: tokens[3] },
  }
}

function parseFireUnit(tokens: string[]): ParseResult {
  const missing = requireArgs(tokens, 'fire-unit <unitId> <targetId>', 3)
  if (missing) return missing
  return { ok: true, command: { kind: 'fire-unit', unitId: tokens[1], targetId: tokens[2] } }
}

function parseCombinedFire(tokens: string[]): ParseResult {
  const arrowIndex = tokens.indexOf('->')
  if (arrowIndex < 2 || arrowIndex !== tokens.length - 2) {
    return { ok: false, error: 'usage: combined-fire <unitId...> -> <targetId>' }
  }
  return {
    ok: true,
    command: { kind: 'combined-fire', unitIds: tokens.slice(1, arrowIndex), targetId: tokens[arrowIndex + 1] },
  }
}

export function parseCommand(input: string): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: 'empty command' }
  }

  const tokens = tokenize(trimmed)
  if (tokens.length === 0) {
    return { ok: false, error: 'empty command' }
  }

  const verb = normalizeVerb(tokens[0])

  switch (verb) {
    case 'help':
      return { ok: true, command: parseHelp(tokens) }
    case 'exit':
    case 'quit':
      return { ok: true, command: { kind: 'exit' } }
    case 'status':
      return { ok: true, command: { kind: 'status' } }
    case 'debug':
      return parseDebug(tokens)
    case 'config':
      return parseConfig(tokens)
    case 'register': {
      const missing = requireArgs(tokens, 'register <username> <password>', 3)
      if (missing) return missing
      return { ok: true, command: { kind: 'register', username: tokens[1], password: tokens[2] } }
    }
    case 'login': {
      const missing = requireArgs(tokens, 'login <username> <password>', 3)
      if (missing) return missing
      return { ok: true, command: { kind: 'login', username: tokens[1], password: tokens[2] } }
    }
    case 'scenarios':
    case 'scen':
      return { ok: true, command: { kind: 'scenarios' } }
    case 'scenario':
      return parseScenario(tokens)
    case 'game':
      return parseGame(tokens)
    case 'refresh':
      return { ok: true, command: { kind: 'refresh' } }
    case 'show':
      return parseShow(tokens)
    case 'events':
      return parseEvents(tokens)
    case 'move':
      return parseMove(tokens)
    case 'fire-weapon':
    case 'fp':
      return parseFireWeapon(tokens)
    case 'fire-unit':
    case 'fu':
      return parseFireUnit(tokens)
    case 'combined-fire':
    case 'cf':
      return parseCombinedFire(tokens)
    case 'end-phase':
    case 'ep':
      return { ok: true, command: { kind: 'end-phase' } }
    default:
      return {
        ok: false,
        error: `unknown command: ${tokens[0]}`,
      }
  }
}