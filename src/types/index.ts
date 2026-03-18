export type TurnPhase =
  | 'ONION_MOVE'
  | 'ONION_COMBAT'
  | 'DEFENDER_RECOVERY'
  | 'DEFENDER_MOVE'
  | 'DEFENDER_COMBAT'
  | 'GEV_SECOND_MOVE'

export type UnitStatus = 'operational' | 'disabled' | 'recovering' | 'destroyed'

export type PlayerRole = 'onion' | 'defender'

export interface HexPos {
  q: number
  r: number
}

export interface DefenderUnit {
  type: string
  position: HexPos
  status: UnitStatus
  squads?: number
}

export interface GameState {
  onion: {
    position: HexPos
    treads: number
    missiles: number
    batteries: {
      main: number
      secondary: number
      ap: number
    }
  }
  defenders: Record<string, DefenderUnit>
}

export interface EventEnvelope {
  seq: number
  type: string
  timestamp: string
  [key: string]: unknown
}

export type Command =
  | { type: 'MOVE'; unitId: string; to: HexPos }
  | { type: 'FIRE_WEAPON'; weaponId: string; targetId: string }
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
