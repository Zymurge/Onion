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
  | { type: 'MOVE_ONION'; to: HexPos }
  | { type: 'FIRE_WEAPON'; weaponId: string; targetId: string }
  | { type: 'MOVE_UNIT'; unitId: string; to: HexPos }
  | { type: 'FIRE_UNIT'; unitId: string; targetId: string }
  | { type: 'COMBINED_FIRE'; unitIds: string[]; targetId: string }
  | { type: 'END_PHASE' }

export interface ActionOkResponse {
  ok: true
  seq: number
  events: EventEnvelope[]
  state: GameState
}

export interface ActionErrorResponse {
  ok: false
  error: string
  code: string
  currentPhase: TurnPhase
}

export type ActionResponse = ActionOkResponse | ActionErrorResponse
