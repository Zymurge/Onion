import type { GameState, HexPos } from '../../../shared/types/index.js'
import type { ScenarioDetail } from '../api/client.js'

function terrainCode(terrain: number | undefined): string {
  switch (terrain) {
    case 1:
      return 'rd'
    case 2:
      return 'cr'
    case 3:
      return 'CP'
    default:
      return '..'
  }
}

function unitCode(unitType: string): string {
  switch (unitType) {
    case 'TheOnion':
      return 'ON'
    case 'BigBadWolf':
      return 'BW'
    case 'Puss':
      return 'PU'
    case 'Witch':
      return 'WI'
    case 'LordFarquaad':
      return 'LF'
    case 'Pinocchio':
      return 'PI'
    case 'Dragon':
      return 'DR'
    case 'LittlePigs':
      return 'LP'
    case 'Castle':
      return 'CP'
    default:
      return '??'
  }
}

function keyOf(pos: HexPos): string {
  return `${pos.q},${pos.r}`
}

export function renderMap(state: GameState | null, scenario: ScenarioDetail | null): string {
  if (!state || !scenario?.map) {
    return 'Map\n  (unavailable)'
  }

  const terrain = new Map<string, number>()
  for (const hex of scenario.map.hexes ?? []) {
    terrain.set(`${hex.q},${hex.r}`, hex.t)
  }

  const occupants = new Map<string, string>()
  occupants.set(keyOf(state.onion.position), unitCode(state.onion.type ?? 'TheOnion'))
  for (const defender of Object.values(state.defenders)) {
    if (defender.status === 'destroyed') continue
    occupants.set(keyOf(defender.position), unitCode(defender.type))
  }

  const lines = ['Map']
  for (let r = 0; r < scenario.map.height; r += 1) {
    const cells: string[] = []
    for (let q = 0; q < scenario.map.width; q += 1) {
      const key = `${q},${r}`
      const marker = occupants.get(key) ?? terrainCode(terrain.get(key))
      cells.push(`[${marker}]`)
    }
    const prefix = r % 2 === 1 ? '  ' : ''
    lines.push(`r${String(r).padStart(2, '0')} ${prefix}${cells.join('')}`)
  }

  const qLabels = Array.from({ length: scenario.map.width }, (_, index) => `q${String(index).padStart(2, '0')}`).join(' ')
  lines.push(`    ${qLabels}`)
  return lines.join('\n')
}