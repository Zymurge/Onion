import type { DefenderUnit, EventEnvelope, GameState, HexPos, Weapon } from '../../types/index.js'
import type { SessionStore } from '../session/store.js'

function posText(pos: HexPos): string {
  return `(${pos.q},${pos.r})`
}

function weaponSummary(weapons: Weapon[] | undefined): string {
  if (!weapons || weapons.length === 0) {
    return '(none)'
  }

  return weapons
    .map((weapon, index) => `${index}:${weapon.id}:${weapon.status}`)
    .join(', ')
}

function defenderLine(defender: DefenderUnit): string {
  const squads = defender.squads ? ` squads=${defender.squads}` : ''
  return `  ${defender.id ?? '(unknown)'} ${defender.type} ${defender.status} at ${posText(defender.position)}${squads}`
}

export function renderGameSummary(session: SessionStore, state: GameState | null): string {
  const lines = [
    'Game',
    `  gameId: ${session.gameId ?? '(unset)'}`,
    `  scenarioId: ${session.scenarioId ?? '(unset)'}`,
    `  role: ${session.role ?? '(unset)'}`,
    `  phase: ${session.phase ?? '(unset)'}`,
    `  turn: ${session.turnNumber ?? '(unset)'}`,
    `  winner: ${session.winner ?? '(none)'}`,
    `  eventSeq: ${session.lastEventSeq ?? '(unset)'}`,
  ]

  if (!state) {
    lines.push('  state: (unloaded)')
    return lines.join('\n')
  }

  lines.push(`  onion: id=${state.onion.id ?? '(unknown)'} type=${state.onion.type ?? 'TheOnion'} status=${state.onion.status ?? 'operational'} at ${posText(state.onion.position)} treads=${state.onion.treads}`)
  lines.push(`  onion weapons: ${weaponSummary(state.onion.weapons)}`)
  if (Object.keys(state.defenders).length === 0) {
    lines.push('  defenders: (none)')
  } else {
    lines.push('  defenders:')
    for (const defender of Object.values(state.defenders)) {
      lines.push(`    id=${defender.id ?? '(unknown)'} type=${defender.type} status=${defender.status} at ${posText(defender.position)}`)
    }
  }
  return lines.join('\n')
}

export function renderDefenders(state: GameState | null): string {
  if (!state) {
    return 'Defenders\n  (unloaded)'
  }

  const defenders = Object.values(state.defenders)
    .slice()
    .sort((left, right) => (left.id ?? '').localeCompare(right.id ?? ''))

  if (defenders.length === 0) {
    return 'Defenders\n  (none)'
  }

  return ['Defenders', ...defenders.map(defenderLine)].join('\n')
}

export function renderOnion(state: GameState | null): string {
  if (!state) {
    return 'Onion\n  (unloaded)'
  }

  return [
    'Onion',
    `  id: ${state.onion.id ?? '(unknown)'}`,
    `  type: ${state.onion.type ?? 'TheOnion'}`,
    `  status: ${state.onion.status ?? 'operational'}`,
    `  position: ${posText(state.onion.position)}`,
    `  treads: ${state.onion.treads}`,
    `  weapons: ${weaponSummary(state.onion.weapons)}`,
  ].join('\n')
}

export function renderLatestEvents(events: EventEnvelope[]): string {
  if (events.length === 0) {
    return 'Recent events\n  (none)'
  }

  const lines = ['Recent events']
  for (const event of events.slice(-5)) {
    lines.push(`  #${event.seq} ${event.type}`)
  }
  return lines.join('\n')
}