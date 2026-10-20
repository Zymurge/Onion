import type { DefenderUnit, HexPos, OnionUnit, TurnPhase } from '../../shared/types/index.js'
import { evaluateMovementEligibility } from './actionEligibility/movement.js'

// Returns true if the unit is eligible to move for the given player and phase
export function isUnitMoveEligible(
  unit: BattlefieldDefenderView | BattlefieldOnionView,
  phase: TurnPhase | null,
  playerRole: 'onion' | 'defender'
): boolean {
  return evaluateMovementEligibility({ unit, phase, viewerRole: playerRole }).eligible
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