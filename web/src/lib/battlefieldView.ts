import type { Weapon } from '../../../src/types/index'

// Returns true if the unit is eligible to move for the given player and phase
export function isUnitMoveEligible(
  unit: BattlefieldUnit | BattlefieldOnionView,
  phase: string | null,
  playerRole: 'onion' | 'defender'
): boolean {
  if (!unit || !phase) return false
  // Only allow movement in movement phases
  const isMovementPhase = phase === 'ONION_MOVE' || phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'
  if (!isMovementPhase) return false
  // Only allow movement for player's own units
  if (playerRole === 'onion' && 'movesRemaining' in unit) {
    return unit.status === 'operational' && unit.movesRemaining > 0
  }
  if (playerRole === 'defender' && 'move' in unit) {
    return unit.status === 'operational' && unit.move > 0
  }
  return false
}
export type Mode = 'fire' | 'combined' | 'end-phase'
export type UnitStatus = 'operational' | 'disabled' | 'recovering' | 'destroyed'

export type BattlefieldUnit = {
  id: string
  type: string
  status: UnitStatus
  q: number
  r: number
  move: number
  weapons: string
  attack: string
  actionableModes: Mode[]
}

export type BattlefieldOnionView = {
  id: string
  type: string
  q: number
  r: number
  status: string
  treads: number
  movesAllowed: number
  movesRemaining: number
  rams: number
  weapons: string
  weaponDetails?: ReadonlyArray<Weapon>
}

export type TimelineEvent = {
  seq: number
  type: string
  summary: string
  timestamp: string
  tone?: 'normal' | 'alert'
}

export type TerrainHex = {
  q: number
  r: number
  t: number
}

export function unitCode(unitType: string): string {
  switch (unitType) {
    case 'TheOnion':
      return 'ON'
    case 'BigBadWolf':
      return 'BW'
    case 'LittlePigs':
      return 'LP'
    case 'Puss':
      return 'PU'
    case 'Witch':
      return 'WI'
    default:
      return '??'
  }
}

export function statusTone(status: UnitStatus): string {
  switch (status) {
    case 'operational':
      return 'ready'
    case 'disabled':
      return 'dim'
    case 'recovering':
      return 'recovering'
    case 'destroyed':
      return 'destroyed'
  }
}