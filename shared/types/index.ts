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
export type MovementSpent = Partial<Record<TurnPhase, number>>

export type PlayerRole = 'onion' | 'defender'
export type UnitTypeId = string
export type UnitType = UnitTypeId
export type UnitClass = 'Infantry' | 'LightArmor' | 'HeavyArmor' | 'GEV' | 'Command' | 'Artillery' | 'Onion'
export type UnitClassTerrain = 'ridge' | 'stream'
export type UnitClassWholeHexTerrain = 'clear' | 'crater' | 'swamp'
export type UnitClassMobility = 'mobile' | 'immobile'

/** Terrain feature that occupies the boundary between two adjacent cells. */
export type ScenarioEdgeTerrain = 'ridge' | 'stream'
export type ScenarioEdgeVariant =
  | 'ridge-1'
  | 'ridge-2'
  | 'ridge-3'
  | 'ridge-4'
  | 'stream-1'
  | 'stream-2'
  | 'stream-3'
  | 'stream-4'

/** Canonical undirected edge feature between two adjacent scenario cells. */
export interface ScenarioTerrainEdge {
  /** First endpoint in ascending q/r order. */
  a: HexPos
  /** Second endpoint in ascending q/r order. */
  b: HexPos
  /** Edge terrain classification. */
  type: ScenarioEdgeTerrain
  /** Explicit visual variant selected by the scenario author. */
  variant: ScenarioEdgeVariant
}

import type { TargetRules } from '../targetRules.js'
export type { TargetRules } from '../targetRules.js'

import type { StackNamingSnapshot } from '../stackNaming/index.js'

/** Axial coordinates that identify a hex on the game map. */
export interface HexPos {
  /** Horizontal axial coordinate. */
  q: number
  /** Vertical axial coordinate. */
  r: number
}

/** Outcome parameters applied when a unit is rammed. */
export interface RamProfile {
  /** Number of tread points lost by the rammed unit. */
  treadLoss?: 0 | 1 | 2 | 3
  /** Highest die roll that destroys the rammed unit. */
  destroyOnRollAtMost?: number
}

/** Movement rule for one terrain edge type associated with a unit class. */
export interface UnitClassTerrainRule {
  /** Whether the unit class may cross the terrain edge. */
  canCross: boolean
  /** Additional movement cost for crossing the terrain edge. */
  movementSurcharge: number
}

/** Additional movement cost for entering a whole-hex terrain type. */
export interface UnitClassWholeHexTerrainRule {
  /** Whether the unit class may enter the whole-hex terrain. */
  canEnter: boolean
  /** Additional movement cost beyond the normal hex-entry cost. */
  movementSurcharge: number
}

/** Second-move eligibility and allowance for a unit class. */
export interface UnitClassSecondMoveRule {
  /** Whether the unit class may perform a second move. */
  allowed: boolean
  /** Movement allowance for the second move, when it is allowed. */
  allowance?: number
}

/** Ramming capability and per-turn capacity for a unit class. */
export interface UnitClassRamAttackerRule {
  /** Whether the unit class may initiate a ram. */
  canRam: boolean
  /** Maximum number of rams the unit class may make in one turn. */
  capacity: number
  /** Number of rams replenished or available per turn. */
  perTurn: number
}

/** Static gameplay rules shared by every unit of a unit class. */
export interface UnitClassRule {
  /** Mobility category used by movement and phase rules. */
  mobility: UnitClassMobility
  /** Whether the unit class uses armor combat rules. */
  isArmor: boolean
  /** Second-move rule for the unit class. */
  secondMove: UnitClassSecondMoveRule
  /** Terrain-edge rules for each supported edge terrain. */
  terrain: Readonly<Record<UnitClassTerrain, UnitClassTerrainRule>>
  /** Whole-hex terrain movement rules for each supported type. */
  wholeHexTerrain: Readonly<Record<UnitClassWholeHexTerrain, UnitClassWholeHexTerrainRule>>
  /** Ramming rules for attackers and rammed units. */
  ram: {
    attacker: UnitClassRamAttackerRule
    rammedTarget?: RamProfile
  }
}

/** Unit-specific limits declared by a unit type; class rules are resolved separately. */
export interface UnitAbilities {
  /** Maximum number of units that may occupy the same stack. */
  maxStacks: number
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
  maxAmmo?: number
  defaultQuantity?: number
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
 * @property friendlyName Human-readable name for display purposes.
 * @property ammo Optional ammo count for the weapon, if applicable.
 */
export interface Weapon {
  id: string
  typeId: string
  weaponClass: WeaponClass
  state: WeaponState
  friendlyName: string
  ammo?: number
}

/**
 * The common static attributes of a unit in the game, including its movement, weapons, and unit-specific metadata.
 * Class-owned movement, terrain, and ram rules are resolved separately from the unit definition.
 * This interface is used to represent both onion and defender units in a unified way.
 * 
 * @property typeId The unique identifier of the unit.
 * @property friendlyName Human-readable name for the unit.
 * @property name The type of the unit (e.g., "TheOnion", "LittlePigs").
 * @property weapons Array of weapons associated with the unit. For weaponless units, this can be an empty array.
 */
export interface UnitTypeBase {
  typeId: UnitTypeId
  unitClass: UnitClass
  name: string
  description: string
  stackable: boolean
  friendlyNameTemplate?: string
  spriteKey?: string
  /** Sprite viewport size as a multiplier of the hex diameter; values above 1 extend beyond the hex. */
  hexMapScale?: number
  /** Horizontal offset from the hex center in percentage points of the hex diameter; positive is right. */
  hexMapOffsetX?: number
  /** Vertical offset from the hex center in percentage points of the hex diameter; positive is up. */
  hexMapOffsetY?: number
  movement: number
  defense: number
  cost?: number
  abilities: UnitAbilities
  weapons: ReadonlyArray<WeaponType>
  weaponQuantities: Readonly<Record<string, number>>
  targetRules?: TargetRules
  maxTreads?: number
  treadsPerMove?: number
  squads?: number
}

/**
 * Represents the static attributes of an onion unit in the game, extending the common UnitTypeBase interface.
 * 
 * @property treads The current tread points of the onion unit, which can range from 0 to 45.
 * @property treadsPerMove The number of treads required per movement point (range=treads/treadsPerMove).
 */
export type OnionUnitType = UnitTypeBase

/**
 * Represents the static attributes of a defender unit in the game, extending the common UnitTypeBase interface.
 * 
 * @property squads The maximnum number of squads in the unit for this type. Set to 1 for non-stackable units.
 */
export type DefenderUnitType = UnitTypeBase

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
 * @property friendlyName Human-readable name for the unit.
 * @property movementSpent A record of movement points spent by phase for this unit in the current turn.
*/
export interface UnitStatus {
  unitId: string
  typeId: string
  position: HexPos
  state: UnitState
  side: PlayerRole
  weapons: ReadonlyArray<Weapon>
  friendlyName: string
  movementSpent?: MovementSpent
}

/**
 * Represents the dynamic status of an Onion unit in the game, extending the common UnitStatus interface.
 * 
 * @property treads The current tread points of the onion unit, which can range from max treads to 0.
 * @property ramsRemaining The number of rams remaining for the onion unit in the current turn.
 */
export interface OnionUnit extends UnitStatus {
  role: 'onion'
  treads?: number
  ramsRemaining?: number
}

/**
 * Represents the dynamic status of a Defender unit in the game, extending the common UnitStatus interface.
 */
export interface DefenderUnit extends UnitStatus {
  role: 'defender'
  treads?: number
  ramsRemaining?: number
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
  groupName?: string
  unitType: string
  position: HexPos
  unitIds: ReadonlyArray<string>
}

export type StackRosterState = {
  groupsById: Record<string, StackRosterGroupState>
  nextGroupOrdinal: number
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
  /** Static unit definitions referenced by game-state type IDs. */
  unitTypes: UnitTypeCatalog
  /** Static weapon definitions referenced by unit weapon type IDs. */
  weaponTypes: WeaponTypeCatalog
}

/** Common envelope for a persisted or live game event. */
export interface EventEnvelope {
  /** Monotonically increasing event sequence number. */
  seq: number
  /** Event-specific type identifier. */
  type: string
  /** ISO timestamp at which the event was created. */
  timestamp: string
  /** Identifier of the action or event that caused this event, when available. */
  causeId?: string
  /** Combat loss summary when the event reports stack destruction. */
  stackLoss?: CombatStackLossSummary
  /** Additional fields defined by the specific event type. */
  [key: string]: unknown
}

/** Counts the destroyed and surviving units in a combat-affected stack. */
export interface CombatStackLossSummary {
  /** Number of units destroyed by the combat result. */
  destroyed: number
  /** Number of units in the stack before the combat result. */
  total: number
  /** Number of units remaining after the combat result. */
  remaining: number
}

export type MoveCommand = { type: 'MOVE'; movers: ReadonlyArray<string>; to: HexPos; attemptRam?: boolean }

export type SingleUnitMoveCommand = { type: 'MOVE'; unitId: string; to: HexPos; attemptRam?: boolean }

export type Command =
  | MoveCommand
  | { type: 'FIRE'; attackers: ReadonlyArray<string>; targetId: string; onionId: string }
  | { type: 'END_PHASE' }

export interface ActionOkResponse {
  /** Always true for a successful action response. */
  ok: true
  /** Sequence number of the latest event included in the response. */
  seq: number
  /** Events produced while processing the action. */
  events: EventEnvelope[]
  /** Authoritative game state after the action. */
  state: GameState
  /** Current lifecycle status of the game. */
  status: 'waiting' | 'ready' | 'active' | 'completed' | 'archived'
  /** User ID of the game host. */
  hostUserId: string
  /** Monotonic revision of the returned snapshot. */
  snapshotRevision: number
  /** Winning role, or null while the game has no winner. */
  winner: 'onion' | 'defender' | null
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

export type TerrainType = 'clear' | 'ridgeline' | 'crater' | 'swamp'
