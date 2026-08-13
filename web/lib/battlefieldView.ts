import type { DefenderUnit, HexPos, OnionUnit } from '../../shared/types/index.js'

// Returns true if the unit is eligible to move for the given player and phase
export function isUnitMoveEligible(
  unit: BattlefieldDefenderView | BattlefieldOnionView,
  phase: string | null,
  playerRole: 'onion' | 'defender'
): boolean {
  if (!unit || !phase) return false
  // Only allow movement in movement phases
  const isMovementPhase = phase === 'ONION_MOVE' || phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'
  if (!isMovementPhase) return false
  // Only allow movement for player's own units
  if (playerRole === 'onion' && 'movesAllowed' in unit) {
    return unit.state === 'operational' && unit.movesRemaining > 0
  }
  if (playerRole === 'defender' && 'actionableModes' in unit) {
    return unit.state === 'operational' && unit.movesRemaining > 0
  }
  return false
}
export type Mode = 'fire' | 'combined' | 'end-phase'
export type UnitStatus = 'operational' | 'disabled' | 'recovering' | 'destroyed'

export type BattlefieldDefenderView = DefenderUnit & {
  movesRemaining: number
  stackSize: number
  actionableModes: Mode[]
}

export type BattlefieldUnit = BattlefieldDefenderView

export type BattlefieldOnionView = OnionUnit & {
  movesAllowed: number
  movesRemaining: number
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

export type TerrainHex = HexPos & { t: number }

export function getBattlefieldPosition(unit: { position: HexPos }): HexPos {
  return unit.position
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