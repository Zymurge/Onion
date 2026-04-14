import type { TargetRules, Weapon } from './types/index.js'

export type TerrainType = 'clear' | 'ridgeline' | 'crater'

export type UnitType =
  | 'TheOnion'
  | 'BigBadWolf'
  | 'Puss'
  | 'Witch'
  | 'LordFarquaad'
  | 'Pinocchio'
  | 'Dragon'
  | 'LittlePigs'
  | 'Castle'

export type WeaponStatus = 'ready' | 'spent' | 'destroyed'

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
  terrainRules?: Record<string, UnitTerrainRule>
  ramProfile?: RamProfile
  maxStacks: number
  isArmor?: boolean
  immobile?: boolean
}

export interface UnitDefinition {
  name: string
  type: UnitType
  movement: number
  defense: number
  cost?: number
  abilities: UnitAbilities
  weapons: Weapon[]
  targetRules?: TargetRules
}