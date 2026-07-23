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

export function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'main',
    typeId: 'Puss.main',
    state: 'ready',
    ...overrides,
  }
}

export function makeDefender(overrides: Partial<DefenderUnit> = {}): DefenderUnit {
  return {
    unitId: 'puss-1',
    typeId: 'Puss',
    role: 'defender',
    position: { q: 2, r: 0 },
    state: 'operational',
    weapons: [makeWeapon()],
    ...overrides,
  }
}

export function makeOnion(overrides: Partial<OnionUnit> = {}): OnionUnit {
  return {
    unitId: 'onion-1',
    typeId: DEFAULT_ONION_UNIT_TYPE_ID,
    role: 'onion',
    position: { q: 0, r: 0 },
    state: 'operational',
    treads: 45,
    ramsRemaining: 2,
    weapons: [
      makeWeapon({ id: 'main', typeId: `${DEFAULT_ONION_UNIT_TYPE_ID}.main` }),
      makeWeapon({ id: 'secondary_1', typeId: `${DEFAULT_ONION_UNIT_TYPE_ID}.secondary_1` }),
    ],
    ...overrides,
  }
}

export function makeStackRoster(overrides: Partial<StackRosterState> = {}): StackRosterState {
  return {
    groupsById: {},
    ...overrides,
  }
}

export function makeStackNaming(overrides: Partial<StackNamingSnapshot> = {}): StackNamingSnapshot {
  return {
    groupsInUse: [],
    usedGroupNames: [],
    ...overrides,
  }
}

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    onions: { 'onion-1': makeOnion() },
    defenders: {},
    stackNaming: makeStackNaming(),
    stackRoster: makeStackRoster(),
    currentPhase: 'ONION_COMBAT',
    turn: 1,
    ...overrides,
  }
}

export type { DefenderUnit, GameState, HexPos, OnionUnit, StackRosterGroupState, StackRosterState, Weapon }
