import type { UnitClass, UnitClassRule } from './types/index.js'

/** Canonical PascalCase identifiers for all supported unit classes. */
export const UNIT_CLASSES = Object.freeze([
  'Infantry',
  'LightArmor',
  'HeavyArmor',
  'GEV',
  'Command',
  'Artillery',
  'Onion',
] as const satisfies readonly UnitClass[])

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child)
  }
  return value
}

const CLASS_RULES: Record<UnitClass, UnitClassRule> = {
  Infantry: {
    mobility: 'mobile',
    isArmor: false,
    secondMove: { allowed: false },
    terrain: {
      ridge: { canCross: true, movementSurcharge: 0 },
      stream: { canCross: true, movementSurcharge: 0 },
    },
    wholeHexTerrain: {
      clear: { canEnter: true, movementSurcharge: 0 },
      crater: { canEnter: false, movementSurcharge: 0 },
      swamp: { canEnter: true, movementSurcharge: 0 },
    },
    ram: {
      attacker: { canRam: false, capacity: 0, perTurn: 0 },
      rammedTarget: { treadLoss: 0, destroyOnRollAtMost: 4 },
    },
  },
  LightArmor: {
    mobility: 'mobile',
    isArmor: true,
    secondMove: { allowed: false },
    terrain: {
      ridge: { canCross: false, movementSurcharge: 0 },
      stream: { canCross: true, movementSurcharge: 1 },
    },
    wholeHexTerrain: {
      clear: { canEnter: true, movementSurcharge: 0 },
      crater: { canEnter: false, movementSurcharge: 0 },
      swamp: { canEnter: true, movementSurcharge: 1 },
    },
    ram: {
      attacker: { canRam: false, capacity: 0, perTurn: 0 },
      rammedTarget: { treadLoss: 1, destroyOnRollAtMost: 4 },
    },
  },
  HeavyArmor: {
    mobility: 'mobile',
    isArmor: true,
    secondMove: { allowed: false },
    terrain: {
      ridge: { canCross: false, movementSurcharge: 0 },
      stream: { canCross: true, movementSurcharge: 0 },
    },
    wholeHexTerrain: {
      clear: { canEnter: true, movementSurcharge: 0 },
      crater: { canEnter: false, movementSurcharge: 0 },
      swamp: { canEnter: true, movementSurcharge: 1 },
    },
    ram: {
      attacker: { canRam: false, capacity: 0, perTurn: 0 },
      rammedTarget: { treadLoss: 2, destroyOnRollAtMost: 4 },
    },
  },
  GEV: {
    mobility: 'mobile',
    isArmor: true,
    secondMove: { allowed: true, allowance: 3 },
    terrain: {
      ridge: { canCross: false, movementSurcharge: 0 },
      stream: { canCross: true, movementSurcharge: 0 },
    },
    wholeHexTerrain: {
      clear: { canEnter: true, movementSurcharge: 0 },
      crater: { canEnter: false, movementSurcharge: 0 },
      swamp: { canEnter: true, movementSurcharge: 0 },
    },
    ram: {
      attacker: { canRam: false, capacity: 0, perTurn: 0 },
      rammedTarget: { treadLoss: 1, destroyOnRollAtMost: 4 },
    },
  },
  Command: {
    mobility: 'immobile',
    isArmor: false,
    secondMove: { allowed: false },
    terrain: {
      ridge: { canCross: false, movementSurcharge: 0 },
      stream: { canCross: false, movementSurcharge: 0 },
    },
    wholeHexTerrain: {
      clear: { canEnter: true, movementSurcharge: 0 },
      crater: { canEnter: false, movementSurcharge: 0 },
      swamp: { canEnter: true, movementSurcharge: 1 },
    },
    ram: {
      attacker: { canRam: false, capacity: 0, perTurn: 0 },
      rammedTarget: { treadLoss: 1, destroyOnRollAtMost: 4 },
    },
  },
  Artillery: {
    mobility: 'immobile',
    isArmor: false,
    secondMove: { allowed: false },
    terrain: {
      ridge: { canCross: false, movementSurcharge: 0 },
      stream: { canCross: false, movementSurcharge: 0 },
    },
    wholeHexTerrain: {
      clear: { canEnter: true, movementSurcharge: 0 },
      crater: { canEnter: false, movementSurcharge: 0 },
      swamp: { canEnter: true, movementSurcharge: 1 },
    },
    ram: {
      attacker: { canRam: false, capacity: 0, perTurn: 0 },
      rammedTarget: { treadLoss: 1, destroyOnRollAtMost: 4 },
    },
  },
  Onion: {
    mobility: 'mobile',
    isArmor: false,
    secondMove: { allowed: false },
    terrain: {
      ridge: { canCross: true, movementSurcharge: 0 },
      stream: { canCross: true, movementSurcharge: 0 },
    },
    wholeHexTerrain: {
      clear: { canEnter: true, movementSurcharge: 0 },
      crater: { canEnter: false, movementSurcharge: 0 },
      swamp: { canEnter: true, movementSurcharge: 1 },
    },
    ram: {
      attacker: { canRam: true, capacity: 2, perTurn: 2 },
    },
  },
}

/** Immutable gameplay rules indexed by canonical unit class. */
export const UNIT_CLASS_RULES: Readonly<Record<UnitClass, UnitClassRule>> = deepFreeze(CLASS_RULES)

/** Returns whether a value is a supported unit-class identifier. */
export function isUnitClass(value: unknown): value is UnitClass {
  return typeof value === 'string' && (UNIT_CLASSES as readonly string[]).includes(value)
}

/** Returns the immutable gameplay rules for a supported unit class. */
export function getUnitClassRule(unitClass: UnitClass): UnitClassRule {
  return UNIT_CLASS_RULES[unitClass]
}
