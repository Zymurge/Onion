import type { StackNamingSnapshot } from '../stackNaming.js'

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

export type { TargetRules } from '../targetRules.js'

import type { TargetRules } from '../targetRules.js'

export interface HexPos {
  q: number
  r: number
}

export interface Weapon {
  id: string
  name: string
  friendlyNameTemplate?: string
  friendlyName?: string
  attack: number
  range: number
  defense: number
  status: WeaponStatus
  individuallyTargetable: boolean
  /** Optional target restrictions for this weapon. */
  targetRules?: TargetRules
}

export interface StackRosterUnitState {
  id: string
  status: UnitStatus
  friendlyName: string
  weapons?: Weapon[]
  targetRules?: TargetRules
}

export interface StackRosterGroupState {
  groupId?: string
  groupName: string
  unitType: string
  position: HexPos
  unitIds?: string[]
  units?: StackRosterUnitState[]
}

export interface StackRosterState {
  groupsById: Record<string, StackRosterGroupState>
}

export interface DefenderUnit {
  id?: string
  type: string
  position: HexPos
  status: UnitStatus
  weapons?: Weapon[]
  squads?: number
  targetRules?: TargetRules
  friendlyName?: string
}

export interface GameUnitState {
  id?: string
  type?: string
  position: HexPos
  status?: UnitStatus
  weapons?: Weapon[]
  targetRules?: TargetRules
  friendlyName?: string
}

export interface GameOnionState extends GameUnitState {
  treads: number
  missiles?: number
  batteries?: {
    main: number
    secondary: number
    ap: number
  }
}

export interface GameState {
  onion: GameOnionState
  defenders: Record<string, DefenderUnit>
  stackRoster?: StackRosterState
  stackNaming?: StackNamingSnapshot
  ramsThisTurn?: number
  movementSpent?: Record<string, number>
  combatSpent?: Record<string, number>
}

export interface EventEnvelope {
  seq: number
  type: string
  timestamp: string
  causeId?: string
  phase?: TurnPhase
  turnNumber?: number
  friendlyName?: string
  unitFriendlyName?: string
  weaponFriendlyName?: string
  attackerFriendlyNames?: string[]
  targetFriendlyName?: string
  [key: string]: unknown
}

export type Command =
  | { type: 'MOVE'; unitId: string; to: HexPos; attemptRam?: boolean }
  | { type: 'FIRE'; attackers: string[]; targetId: string }
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
