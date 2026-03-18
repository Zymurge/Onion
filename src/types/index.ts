export type TurnPhase =
  | 'ONION_MOVE'
  | 'ONION_COMBAT'
  | 'DEFENDER_RECOVERY'
  | 'DEFENDER_MOVE'
  | 'DEFENDER_COMBAT'
  | 'GEV_SECOND_MOVE'

export type UnitStatus = 'operational' | 'disabled' | 'recovering' | 'destroyed'
export type WeaponStatus = 'ready' | 'destroyed'

export type PlayerRole = 'onion' | 'defender'

export type OnionWeaponType = 'main' | 'secondary' | 'ap' | 'missile'

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
}

export interface DefenderUnit {
  id?: string
  type: string
  position: HexPos
  status: UnitStatus
  weapons?: Weapon[]
  squads?: number
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
    batteries?: {
      main: number
      secondary: number
      ap: number
    }
  }
  defenders: Record<string, DefenderUnit>
  ramsThisTurn?: number
}

export interface EventEnvelope {
  seq: number
  type: string
  timestamp: string
  [key: string]: unknown
}

export type Command =
  | { type: 'MOVE'; unitId: string; to: HexPos }
  | { type: 'FIRE_WEAPON'; weaponType: OnionWeaponType; weaponIndex: number; targetId: string }
  | { type: 'FIRE_UNIT'; unitId: string; targetId: string }
  | { type: 'COMBINED_FIRE'; unitIds: string[]; targetId: string }
  | { type: 'END_PHASE' }

export interface ActionOkResponse {
  ok: true
  seq: number
  events: EventEnvelope[]
  state: GameState
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
