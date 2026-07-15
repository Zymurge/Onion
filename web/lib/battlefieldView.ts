import type { DefenderUnit, HexPos, TargetRules, Weapon } from '../../shared/types/index'

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

export type BattlefieldUnitView = Omit<DefenderUnit, 'id'> & {
  id: string
  position: DefenderUnit['position']
  q: number
  r: number
  move: number
  attack: string
  // Derived display label for weapon state; the canonical weapon data stays
  // in `weapons` and mirrors the defender record.
  weaponSummary?: string
  weapons: ReadonlyArray<Weapon> | string
  weaponDetails?: ReadonlyArray<Weapon>
  defense?: number
  actionableModes: Mode[]
}

export type BattlefieldUnit = BattlefieldUnitView

export type BattlefieldOnionView = {
  id: string
  type: string
  friendlyName?: string
  position: { q: number; r: number }
  // q: number
  // r: number
  status: UnitStatus
  treads: number
  movesAllowed: number
  movesRemaining: number
  rams: number
  weapons: string
  weaponDetails?: ReadonlyArray<Weapon>
  targetRules?: TargetRules
}

export type TimelineEvent = {
  seq: number
  type: string
  summary: string
  timestamp: string
  tone?: 'normal' | 'alert'
  details?: ReadonlyArray<string>
  payload?: Readonly<Record<string, unknown>>
}

export type TerrainHex = {
  q: number
  r: number
  t: number
}

export function getBattlefieldPosition(unit: { position?: HexPos; q?: number; r?: number }): HexPos {
  return unit.position ?? { q: unit.q ?? 0, r: unit.r ?? 0 }
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