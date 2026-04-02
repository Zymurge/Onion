export type TurnPhase =
  | 'ONION_MOVE'
  | 'ONION_COMBAT'
  | 'DEFENDER_RECOVERY'
  | 'DEFENDER_MOVE'
  | 'DEFENDER_COMBAT'
  | 'GEV_SECOND_MOVE'

export type UnitStatus = 'operational' | 'disabled' | 'recovering' | 'destroyed'
export type WeaponStatus = 'ready' | 'spent' | 'destroyed'

export type PlayerRole = 'onion' | 'defender'

export type OnionWeaponType = 'main' | 'secondary' | 'ap' | 'missile'

/**
 * Explicit targeting restrictions for a weapon definition.
 *
 * Use explicit unit and weapon identifiers instead of abstract combat classes
 * so special-case rules remain easy to read and extend.
 */
export interface TargetRules {
  /** Unit types this weapon may target. */
  allowedTargetUnitTypes?: ReadonlyArray<string>
  /** Weapon ids this weapon may target, when the target is a subsystem. */
  allowedTargetWeaponIds?: ReadonlyArray<string>
  /** Unit types that may target this unit. */
  allowedAttackerUnitTypes?: ReadonlyArray<string>
  /** Weapon ids that may target this unit. */
  allowedAttackerWeaponIds?: ReadonlyArray<string>
}

export interface HexPos {
  q: number
  r: number
}

export interface Weapon {
  id: string
  name: string
  attack: number
  range: number
  defense: number
  status: WeaponStatus
  individuallyTargetable: boolean
  /** Optional target restrictions for this weapon. */
  targetRules?: TargetRules
}

export interface DefenderUnit {
  id?: string
  type: string
  position: HexPos
  status: UnitStatus
  weapons?: Weapon[]
  squads?: number
  targetRules?: TargetRules
}

export interface GameState {
  onion: {
    id?: string
    type?: string
    position: HexPos
    treads: number
    missiles?: number
    status?: UnitStatus
    weapons?: Weapon[]
    targetRules?: TargetRules
    batteries?: {
      main: number
      secondary: number
      ap: number
    }
  }
  defenders: Record<string, DefenderUnit>
  ramsThisTurn?: number
  movementSpent?: Record<string, number>
}

export interface EventEnvelope {
  seq: number
  type: string
  timestamp: string
  [key: string]: unknown
}

export type Command =
  | { type: 'MOVE'; unitId: string; to: HexPos }
  | { type: 'FIRE'; attackers: string[]; targetId: string }
  | { type: 'FIRE_WEAPON'; weaponType: OnionWeaponType; weaponIndex: number; targetId: string }
  | { type: 'FIRE_UNIT'; unitId: string; targetId: string }
  | { type: 'COMBINED_FIRE'; unitIds: string[]; targetId: string }
  | { type: 'END_PHASE' }

export interface ActionOkResponse {
  ok: true
  seq: number
  events: EventEnvelope[]
  state: GameState
  movementRemainingByUnit: Record<string, number>
}

/**
 * Error response for a failed action (e.g., invalid move, wrong phase).
 *
 * @property ok Always false for error responses.
 * @property error Human-readable error message.
 * @property code Machine-readable error code (e.g., "MOVE_INVALID", "WRONG_PHASE").
 * @property detailCode Optional machine-readable subcode for granular error details (e.g., "NO_PATH", "BLOCKED_BY_UNIT").
 * @property currentPhase The phase in which the error occurred.
 */
export interface ActionErrorResponse {
  /** Always false for error responses. */
  ok: false
  /** Human-readable error message. */
  error: string
  /** Machine-readable error code (e.g., "MOVE_INVALID", "WRONG_PHASE"). */
  code: string
  /** Optional machine-readable subcode for granular error details (e.g., "NO_PATH", "BLOCKED_BY_UNIT"). */
  detailCode?: string
  /** The phase in which the error occurred. */
  currentPhase: TurnPhase
}

export type ActionResponse = ActionOkResponse | ActionErrorResponse
