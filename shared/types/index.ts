export type TurnPhase =
  | 'ONION_MOVE'
  | 'ONION_COMBAT'
  | 'DEFENDER_RECOVERY'
  | 'DEFENDER_MOVE'
  | 'DEFENDER_COMBAT'
  | 'GEV_SECOND_MOVE'

export type UnitState = 'operational' | 'disabled' | 'recovering' | 'destroyed'
export type WeaponState = 'ready' | 'spent' | 'destroyed'
export type WeaponClass = 'main' | 'secondary' | 'ap' | 'missile'

export type PlayerRole = 'onion' | 'defender'
export type UnitTypeId = string
export type UnitType = UnitTypeId

import type { TargetRules } from '../targetRules.js'
export type { TargetRules } from '../targetRules.js'

import type { StackNamingSnapshot } from '../stackNaming.js'

export interface HexPos {
  q: number
  r: number
}

export interface UnitTerrainRule {
  canCross?: boolean
  canAccessCover?: boolean
  ignoresUnderlyingTerrain?: boolean
}

export interface RamProfile {
  treadLoss?: 0 | 1 | 2 | 3
  destroyOnRollAtMost?: number
}

export interface UnitAbilities {
  secondMove?: boolean
  secondMoveAllowance?: number
  canRam?: boolean
  ramCapacity?: number
  ramProfile?: RamProfile
  terrainRules?: Record<string, UnitTerrainRule>
  maxStacks: number
  isArmor?: boolean
  immobile?: boolean
}

/**
 * Represents the static attributes of type of a weapon in the game.
 * 
 * @property typeId Unique identifier for the weapon type.
 * @property name Human-readable name of the weapon type.
 * @property weaponClass Classification of the weapon
 * @property attack Attack value of the weapon.
 * @property range Range value of the weapon.
 * @property individuallyTargetable Whether this weapon can be targeted individually.
 * @property defense Optional defense value of a targetable weapon.
 * @property targetRules Optional target rules that define how this weapon can engage with other units. 
 */
export interface WeaponType {
  typeId: string
  name: string
  weaponClass: WeaponClass
  attack: number
  range: number
  individuallyTargetable: boolean
  defense?: number
  targetRules?: TargetRules
  friendlyNameTemplate?: string
}

/**
 * Static catalog (sent once at session init, cached client-side)
 */
export type WeaponTypeCatalog = Readonly<Record<string, WeaponType>>

/**
 * Represents an individual weapon on a unit and its status
 * 
 * @property id Unique identifier for the weapon instance.
 * @property typeId The lookup into the {@link WeaponTypeCatalog} for the static attributes of this weapon.
 * @property state The current state of the weapon (e.g., "ready", "spent", "destroyed"). 
 * @property ammo Optional ammo count for the weapon, if applicable.
 * @property friendlyName Optional human-readable name for display purposes.
 */
export interface Weapon {
  id: string
  typeId: string
  state: WeaponState
  ammo?: number
  friendlyName?: string
}

/**
 * The common static attributes of a unit in the game, including its movement, weapons and optional properties like squads and defensive
 * rules and capapilities. This interface is used as a base for both onion and defender unit types.
 * This interface is used to represent both onion and defender units in a unified way.
 * 
 * @property typeId The unique identifier of the unit.
 * @property name The type of the unit (e.g., "TheOnion", "LittlePigs").
 * @property friendlyName Optional human-readable name for the unit.
 * @property weapons Array of weapons associated with the unit. For weaponless units, this can be an empty array.
 */
export interface UnitTypeBase {
  typeId: UnitTypeId
  role: PlayerRole
  name: string
  stackable: boolean
  friendlyNameTemplate?: string
  movement: number
  defense: number
  cost?: number
  abilities: UnitAbilities
  weapons: ReadonlyArray<WeaponType>
  targetRules?: TargetRules
}

/**
 * Represents the static attributes of an onion unit in the game, extending the common UnitTypeBase interface.
 * 
 * @property treads The current tread points of the onion unit, which can range from 0 to 45.
 * @property treadsPerMove The number of treads required per movement point (range=treads/treadsPerMove).
 * @property ramsPerTurn The number of rams allowed per turn for the onion unit.
 */
export interface OnionUnitType extends UnitTypeBase {
  role: 'onion'
  treads: number
  treadsPerMove: number
  ramsPerTurn: number
}

/**
 * Represents the static attributes of a defender unit in the game, extending the common UnitTypeBase interface.
 * 
 * @property squads The maximnum number of squads in the unit for this type. Set to 1 for non-stackable units.
 */
export interface DefenderUnitType extends UnitTypeBase {
  role: 'defender'
  squads?: number
}

/**
 * Represents the dynamic status of a unit in the game
 */
export type GameUnit = OnionUnit | DefenderUnit

/**
 * Represents a catalog of unit types, keyed by unit type ID.
 */
export type UnitTypeCatalog = Readonly<Record<UnitTypeId, OnionUnitType | DefenderUnitType>>

/**
 * The dynamic status of a unit in the game, including its position, state, and other relevant properties.
 * 
 * @property unitId The unique identifier of the unit.
 * @property typeId The type ID of the unit, which corresponds to a key in the {@link UnitTypeCatalog} for static attributes.
 * @property position The hexagonal grid position of the unit, represented by q and r coordinates.
 * @property state The current status of the unit, which can be "operational", "disabled", "recovering", or "destroyed".
 * @property weapons An array of weapons associated with the unit, each with its own state and properties.
 * @property movementSpent A record of movement points spent by phase for the onion unit in the current turn.
 * @property friendlyName Optional human-readable name for the unit.
*/
export interface UnitStatus {
  unitId: string
  typeId: string
  position: HexPos
  state: UnitState
  weapons: ReadonlyArray<Weapon>
  movementSpent?: Partial<Record<TurnPhase, number>>
  friendlyName?: string  
}

/**
 * Represents the dynamic status of an Onion unit in the game, extending the common UnitStatus interface.
 * 
 * @property treads The current tread points of the onion unit, which can range from max treads to 0.
 * @property ramsRemaining The number of rams remaining for the onion unit in the current turn.
 */
export interface OnionUnit extends UnitStatus {
  role: 'onion'
  treads: number
  ramsRemaining: number
}

/**
 * Represents the dynamic status of a Defender unit in the game, extending the common UnitStatus interface.
 */
export interface DefenderUnit extends UnitStatus {
  role: 'defender'
  squads?: number
}

// Canonical state maps are read-only at the type boundary; call sites
// should build a new map rather than mutate this in place.
export type OnionMap = Readonly<Record<string, OnionUnit>>
export type DefenderMap = Readonly<Record<string, DefenderUnit>>

export type StackRosterUnitState = {
  unitId: string
  state: UnitState
  friendlyName?: string
  weapons?: ReadonlyArray<Weapon>
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

/**
 * The canonical game state bundle returned by the backend after each action.
 * 
 * This is the authoritative state of the game, including the onion, defenders,
 * stack roster, and other relevant information. It includes the dynamic state of the units in the game. The static type
 * information for the units is available in the UnitType definitions, which are not included in this state bundle.
 * 
 * @property onions A map of all onion units in the game, keyed by unit ID. (for future expansion to multi-onion scenarios)
 * @property defenders A map of all defender units in the game, keyed by unit ID.
 * @property stackNaming Persisted stack-name lifecycle state. 
 * @property stackRoster Persisted stack/group membership state.
 * @property currentPhase The current phase of the game.
 * @property turn The current turn number.
 */
export interface GameState {
  onions: OnionMap,
  defenders: DefenderMap,
  stackNaming: StackNamingSnapshot
  stackRoster: StackRosterState
  currentPhase: TurnPhase
  turn: number
}

/**
 * Static definitions sent once when a client session is initialized.
 * Dynamic game snapshots reference these definitions by type ID.
 */
export interface SessionInitPayload {
  unitTypes: UnitTypeCatalog
  weaponTypes: WeaponTypeCatalog
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

export type TerrainType = 'clear' | 'ridgeline' | 'crater'
