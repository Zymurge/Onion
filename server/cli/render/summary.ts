import type { DefenderUnit, EventEnvelope, GameState, HexPos, UnitStatus, Weapon } from '../../../shared/types/index.js'
import type { SessionStore } from '../session/store.js'

function posText(pos: HexPos): string {
  return `(${pos.q},${pos.r})`
}

function effectiveWeaponDisplayStatus(unitStatus: UnitStatus | undefined, weapon: Weapon): string {
  if (weapon.status === 'destroyed') {
    return 'destroyed'
  }
  if (unitStatus === 'disabled' || unitStatus === 'recovering') {
    return 'disabled'
  }
  return weapon.status
}

function weaponSummary(weapons: Weapon[] | undefined, unitStatus: UnitStatus | undefined): string {
  if (unitStatus === 'destroyed') {
    return '(n/a - unit destroyed)'
  }

  if (!weapons || weapons.length === 0) {
    return '(none)'
  }

  return weapons
    .map((weapon, index) => `${index}:${weapon.id}:${effectiveWeaponDisplayStatus(unitStatus, weapon)}`)
    .join(', ')
}

function defenderReadinessRank(defender: DefenderUnit): number {
  // Returns a rank for sorting: lower = more ready
  // 0: ready (all weapons ready, unit operational)
  // 1: spent (at least one weapon spent, unit operational)
  // 2: disabled (unit disabled)
  // 3: destroyed (unit destroyed)
  if (defender.status === 'destroyed') {
    return 3
  }
  if (defender.status === 'disabled' || defender.status === 'recovering') {
    return 2
  }
  // Unit is operational. Check weapons.
  if (!defender.weapons || defender.weapons.length === 0) {
    return 0 // No weapons = ready
  }
  const hasSpentWeapon = defender.weapons.some((w) => w.status === 'spent')
  return hasSpentWeapon ? 1 : 0
}

function defenderLine(defender: DefenderUnit): string {
  const squads = defender.squads ? ` squads=${defender.squads}` : ''
  const weapons = weaponSummary(defender.weapons, defender.status)
  return `  ${defender.id ?? '(unknown)'} ${defender.type} ${defender.status} at ${posText(defender.position)} weapons: ${weapons}${squads ? ` (${squads})` : ''}`
}

function sortDefenders(defenders: DefenderUnit[]): DefenderUnit[] {
  return defenders
    .slice()
    .sort((left, right) => {
      const leftRank = defenderReadinessRank(left)
      const rightRank = defenderReadinessRank(right)
      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }
      // Same readiness rank: sort by type
      return (left.type ?? '').localeCompare(right.type ?? '')
    })
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
  lines.push(`  onion weapons: ${weaponSummary(state.onion.weapons, state.onion.status)}`)
  if (Object.keys(state.defenders).length === 0) {
    lines.push('  defenders: (none)')
  } else {
    lines.push('  defenders:')
    for (const defender of sortDefenders(Object.values(state.defenders))) {
      const weapons = weaponSummary(defender.weapons, defender.status)
      const squads = defender.squads ? ` (squads=${defender.squads})` : ''
      lines.push(`    id=${defender.id ?? '(unknown)'} type=${defender.type} status=${defender.status} at ${posText(defender.position)} weapons: ${weapons}${squads}`)
    }
  }
  return lines.join('\n')
}

export function renderDefenders(state: GameState | null): string {
  if (!state) {
    return 'Defenders\n  (unloaded)'
  }

  const defenders = sortDefenders(Object.values(state.defenders))

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
    `  weapons: ${weaponSummary(state.onion.weapons, state.onion.status)}`,
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