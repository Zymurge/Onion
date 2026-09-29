import type { Command } from '#shared/types/index'

/** Combat Results Table outcomes. */
export type CombatResult = 'NE' | 'D' | 'X'

/** Result of rolling on the Combat Results Table. */
export interface CombatRoll {
  /** Die roll result (1-6). */
  roll: number
  /** Combat result. */
  result: CombatResult
  /** Odds ratio used. */
  odds: string
}

/** Result of a combat action. */
export interface CombatResultDetails {
  /** Whether the attack succeeded. */
  success: boolean
  /** Combat roll details. */
  roll?: CombatRoll
  /** Damage applied. */
  damage?: {
    /** Target unit ID. */
    targetId: string
    /** Tread damage (for Onion). */
    treads?: number
    /** Weapon destroyed (for individually targetable weapons). */
    weaponDestroyed?: string
    /** Unit destroyed (for defenders). */
    unitDestroyed?: boolean
    /** Squads lost (for infantry). */
    squadsLost?: number
  }
  /** Error message if combat failed. */
  error?: string
}

export type CombatValidationCode =
  | 'WRONG_PHASE'
  | 'WEAPON_NOT_FOUND'
  | 'WEAPON_EXHAUSTED'
  | 'ATTACKER_NOT_FOUND'
  | 'ATTACKER_NOT_OPERATIONAL'
  | 'NO_READY_WEAPONS'
  | 'NO_TARGET'
  | 'INVALID_TARGET'
  | 'TARGET_OUT_OF_RANGE'
  | 'NO_ATTACKERS'
  | 'MULTI_ATTACK_TREAD_TARGET'
  | 'DUPLICATE_ATTACKER'
  | 'ONION_NOT_FOUND'

export type CombatTarget =
  | { kind: 'defender'; id: string }
  | { kind: 'treads'; id: string }
  | { kind: 'weapon'; id: string }

export interface CombatPlan {
  actionType: Extract<Command, { type: 'FIRE' }>['type']
  actor: 'onion' | 'defender'
  attackerIds: string[]
  onionId: string
  target: CombatTarget
  attackStrength: number
  defense: number
  weaponId?: string
  weaponIds?: string[]
}

export type CombatValidation =
  | { ok: true; plan: CombatPlan }
  | { ok: false; code: CombatValidationCode; error: string }

export interface CombatExecutionResult {
  success: boolean
  actionType: CombatPlan['actionType']
  attackerIds: string[]
  onionId: string
  targetId: string
  roll?: CombatRoll
  treadsLost?: number
  destroyedWeaponId?: string
  statusChanges?: Array<{ unitId: string; from: string; to: string }>
  squadsLost?: number
  error?: string
}

export type CombatOutcomeEffect =
  | 'no-effect'
  | 'disabled'
  | 'destroyed'
  | 'tread-loss'
  | 'weapon-destroyed'

export interface CombatOutcomeResolution {
  targetId: string
  effect: CombatOutcomeEffect
  result: CombatResult
  treadsLost?: number
  weaponId?: string
  weaponDestroyed?: string
}