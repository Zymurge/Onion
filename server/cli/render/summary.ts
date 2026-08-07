import { getUnitDefinition } from '#shared/unitDefinitions'
import type { DefenderUnit, EventEnvelope, GameState, HexPos, UnitState, Weapon } from '#shared/types/index'
import type { SessionStore } from '#server/cli/session/store'

function posText(pos: HexPos): string {
  return `(${pos.q},${pos.r})`
}

function effectiveWeaponDisplayStatus(unitState: UnitState | undefined, weapon: Weapon): string {
  if (weapon.state === 'destroyed') {
    return 'destroyed'
  }
  if (unitState === 'disabled' || unitState === 'recovering') {
    return 'disabled'
  }
  return weapon.state
}

function weaponSummary(weapons: ReadonlyArray<Weapon> | undefined, unitState: UnitState | undefined): string {
  if (unitState === 'destroyed') {
    return '(n/a - unit destroyed)'
  }

  if (!weapons || weapons.length === 0) {
    return '(none)'
  }

  return weapons
    .map((weapon, index) => `${index}:${weapon.id}:${effectiveWeaponDisplayStatus(unitState, weapon)}`)
    .join(', ')
}

function defenderReadinessRank(defender: DefenderUnit): number {
  // Returns a rank for sorting: lower = more ready
  // 0: ready (all weapons ready, unit operational)
  // 1: spent (at least one weapon spent, unit operational)
  // 2: disabled (unit disabled)
  // 3: destroyed (unit destroyed)
  if (defender.state === 'destroyed') {
    return 3
  }
  if (defender.state === 'disabled' || defender.state === 'recovering') {
    return 2
  }
  // Unit is operational. Check weapons.
  if (!defender.weapons || defender.weapons.length === 0) {
    return 0 // No weapons = ready
  }
  const hasSpentWeapon = defender.weapons.some((w) => w.state === 'spent')
  return hasSpentWeapon ? 1 : 0
}

function defenderLine(defender: DefenderUnit): string {
  const definition = getUnitDefinition(defender.typeId)
  const squads = definition?.role === 'defender' && definition.squads ? ` squads=${definition.squads}` : ''
  const weapons = weaponSummary(defender.weapons, defender.state)
  return `  ${defender.unitId} ${defender.typeId} ${defender.state} at ${posText(defender.position)} weapons: ${weapons}${squads ? ` (${squads})` : ''}`
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
      return left.typeId.localeCompare(right.typeId)
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

  for (const onion of Object.values(state.onions)) {
    lines.push(`  onion: id=${onion.unitId} type=${onion.typeId} status=${onion.state} at ${posText(onion.position)} treads=${onion.treads}`)
    lines.push(`  onion weapons: ${weaponSummary(onion.weapons, onion.state)}`)
  }
  if (Object.keys(state.onions).length === 0) {
    lines.push('  onions: (none)')
  }
  if (Object.keys(state.defenders).length === 0) {
    lines.push('  defenders: (none)')
  } else {
    lines.push('  defenders:')
    for (const defender of sortDefenders(Object.values(state.defenders))) {
      const definition = getUnitDefinition(defender.typeId)
      const weapons = weaponSummary(defender.weapons, defender.state)
      const squads = definition?.role === 'defender' && definition.squads ? ` (squads=${definition.squads})` : ''
      lines.push(`    id=${defender.unitId} type=${defender.typeId} status=${defender.state} at ${posText(defender.position)} weapons: ${weapons}${squads}`)
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
    ...Object.values(state.onions).flatMap((onion) => [
      `  id: ${onion.unitId}`,
      `  type: ${onion.typeId}`,
      `  status: ${onion.state}`,
      `  position: ${posText(onion.position)}`,
      `  treads: ${onion.treads}`,
      `  weapons: ${weaponSummary(onion.weapons, onion.state)}`,
    ]),
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