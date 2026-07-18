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

export type StackRosterUnitState = {
  id: string
  status: UnitStatus
  friendlyName?: string
  weapons?: ReadonlyArray<Weapon>
  targetRules?: TargetRules
  squads?: number
}

export type StackRosterGroupState = {
  groupName: string
  unitType: string
  position: HexPos
  unitIds: ReadonlyArray<string>
}

export type StackRosterState = {
  groupsById: Record<string, StackRosterGroupState>
}

import type { TargetRules } from '../targetRules.js'
export type { TargetRules } from '../targetRules.js'

import type { StackNamingSnapshot } from '../stackNaming.js'

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
  friendlyName?: string
  friendlyNameTemplate?: string
  /** Optional target restrictions for this weapon. */
  targetRules?: TargetRules
}

/**
 * The common attributes of a unit in the game, including its type, position, status, and optional properties like squads and friendly name.
 * This interface is used to represent both onion and defender units in a unified way.
 * 
 * @property id The unique identifier of the unit.
 * @property type The type of the unit (e.g., "TheOnion", "LittlePigs").
 * @property position The hexagonal grid position of the unit, represented by q and r coordinates.
 * @property status The current status of the unit, which can be "operational", "disabled", "recovering", or "destroyed".
 * @property squads Optional number of squads in the unit (for defender units).
 * @property friendlyName Optional human-readable name for the unit.
 * @property weapons Optional array of weapons associated with the unit.
 * @property targetRules Optional target rules that define how this unit can engage with other units. 
 */
export interface UnitBase {
  id: string
  type: string
  position: HexPos
  status: UnitStatus
  friendlyName?: string
  weapons?: ReadonlyArray<Weapon>
  targetRules?: TargetRules
}

export interface OnionUnit extends UnitBase {
  treads: number
  missiles?: number
  batteries?: {
    main: number
    secondary: number
    ap: number
  }
}

export interface DefenderUnit extends UnitBase {
  squads?: number
}

// Canonical defender state is read-only at the type boundary; call sites
// should build a new map rather than mutate this in place.
export type DefenderMap = Readonly<Record<string, DefenderUnit>>

/**
 * The canonical game state bundle returned by the backend after each action.
 * 
 * This is the authoritative state of the game, including the onion, defenders,
 * stack roster, and other relevant information.
 */
export interface GameState {
  onion: OnionUnit,
  defenders: DefenderMap,
  stackNaming?: StackNamingSnapshot
  stackRoster?: StackRosterState
  ramsThisTurn?: number
  movementSpent?: Record<string, number>
}

export interface EventEnvelope {
  seq: number
  type: string
  timestamp: string
  causeId?: string
  [key: string]: unknown
}

export type MoveCommand = { type: 'MOVE'; movers: ReadonlyArray<string>; to: HexPos; attemptRam?: boolean }

export type SingleUnitMoveCommand = { type: 'MOVE'; unitId: string; to: HexPos; attemptRam?: boolean }

export type Command =
  | MoveCommand
  | { type: 'FIRE'; attackers: ReadonlyArray<string>; targetId: string }
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
