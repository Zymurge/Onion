import type { StackNamingSnapshot } from '#shared/stackNaming'
import type {
  DefenderUnit,
  GameState,
  HexPos,
  OnionUnit,
  StackRosterGroupState,
  StackRosterState,
  Weapon,
} from '#shared/types/index'
import { DEFAULT_ONION_UNIT_TYPE_ID } from '#shared/unitDefinitions'

/**
 * Utility to create a new Weapon object with default properties, allowing for overrides.
 * 
 * @param overrides Partial properties to override the default weapon.
 * @returns A new Weapon object with the specified overrides.
 */
export function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'main',
    typeId: 'Puss.main',
    state: 'ready',
    friendlyName: 'Main Battery 1',
    ...overrides,
  }
}

/**
 * Utility to create a new DefenderUnit object with default properties, allowing for overrides. 
 * @param overrides Partial properties to override the default defender unit.
 * @returns A new DefenderUnit object with the specified overrides.
 */
export function makeDefender(overrides: Partial<DefenderUnit> = {}): DefenderUnit {
  return {
    unitId: 'puss-1',
    typeId: 'Puss',
    role: 'defender',
    position: { q: 2, r: 0 },
    state: 'operational',
    weapons: [makeWeapon()],
    friendlyName: 'Puss 1',
    ...overrides,
  }
}

/**
 * Utility to create a new OnionUnit object with default properties, allowing for overrides.
 * @param overrides Partial properties to override the default onion unit.
 * @returns A new OnionUnit object with the specified overrides.
 */
export function makeOnion(overrides: Partial<OnionUnit> = {}): OnionUnit {
  return {
    unitId: 'onion-1',
    typeId: DEFAULT_ONION_UNIT_TYPE_ID,
    role: 'onion',
    position: { q: 0, r: 0 },
    state: 'operational',
    friendlyName: 'The Onion 1',
    treads: 45,
    ramsRemaining: 2,
    weapons: [
      makeWeapon({ id: 'main', typeId: `${DEFAULT_ONION_UNIT_TYPE_ID}.main`, friendlyName: 'Main Battery 1' }),
      makeWeapon({ id: 'secondary_1', typeId: `${DEFAULT_ONION_UNIT_TYPE_ID}.secondary_1`, friendlyName: 'Secondary Battery 1' }),
      makeWeapon({ id: 'ap_1', typeId: `${DEFAULT_ONION_UNIT_TYPE_ID}.ap_1`, friendlyName: 'AP Gun 1' }),
    ],
    ...overrides,
  }
}

/**
 * Utility to create a new StackRosterState object with default properties, allowing for overrides.
 * Provides a default stack group for Little Pigs at position (1,1) with units pigs-1 and pigs-2.
 * @param overrides Partial properties to override the default stack roster state.
 * @returns A new StackRosterState object with the specified overrides.
 */
export function makeStackRoster(overrides: Partial<StackRosterState> = {}): StackRosterState {
  return {
      groupsById: {
        'LittlePigs:1,1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 1, r: 1 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      },
      ...overrides,
  }
}

/**
 * Utility to create a new StackNamingSnapshot object with default properties, allowing for overrides.
 * Provides a default stack naming snapshot with a single group in use for Little Pigs at position (1,1).
 * @param overrides Partial properties to override the default stack naming snapshot.
 * @returns A new StackNamingSnapshot object with the specified overrides.
 */
export function makeStackNaming(overrides: Partial<StackNamingSnapshot> = {}): StackNamingSnapshot {
  return {
    groupsInUse: [
      { groupKey: 'LittlePigs:1,1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }
    ],
    usedGroupNames: ['Little Pigs group 1'],
    ...overrides,
  }
}

/**
 * Utility to create a new GameState object with default properties, allowing for overrides.
 * The default game state includes one onion unit, one swamp, two pig defenders in a stack, and a single puss.
 * @param overrides Partial properties to override the default game state.
 * @returns A new GameState object with the specified overrides.
 */
export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    onions: { 'onion-1': makeOnion() },
    defenders: {
      'swamp-1': makeDefender({ unitId: 'swamp-1', typeId: 'Swamp',      position: { q: 8, r: 8 }, weapons: [], friendlyName: 'Swamp 1' }),
      'pigs-1':  makeDefender({ unitId: 'pigs-1',  typeId: 'LittlePigs', position: { q: 1, r: 1 }, weapons: [], friendlyName: 'Little Pigs 1' }),
      'pigs-2':  makeDefender({ unitId: 'pigs-2',  typeId: 'LittlePigs', position: { q: 1, r: 1 }, weapons: [], friendlyName: 'Little Pigs 2' }),
      'puss-1':  makeDefender({ unitId: 'puss-1',  typeId: 'Puss',       position: { q: 2, r: 0 }, weapons: [], friendlyName: 'Puss 1' }),
    },
    stackRoster: makeStackRoster(),
    stackNaming: makeStackNaming(),
    currentPhase: 'ONION_COMBAT',
    turn: 1,
    ...overrides,
  }
}

export type { DefenderUnit, GameState, HexPos, OnionUnit, StackRosterGroupState, StackRosterState, Weapon }
