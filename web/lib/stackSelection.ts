import type { DefenderMap, GameState, OnionUnit, UnitState } from '../../shared/types/index.js'
import { getSessionUnitType, isSessionUnitTypeStackable, type SessionCatalog } from './sessionCatalog.js'
import type { StackActionSelection } from './gameClient.js'
import type { StackRosterState } from '../../shared/types/index.js'
import { buildStackRosterIndex } from '../../shared/stackRoster.js'
import {
  resolveSelectionOwnerUnitId,
} from './selectionIds.js'

/** Describes the canonical unit data needed for stack selection. */
export type StackSourceUnit = {
  unitId: string
  typeId: string
  position: { q: number; r: number }
  state: UnitState
  stackSize?: number
}

/** Canonical web-facing source state for stack membership resolution. */
export type WebStackSourceState = {
  onions?: Record<string, StackSourceUnit>
  defenders?: Record<string, StackSourceUnit>
  stackRoster?: StackRosterState
  catalog?: SessionCatalog
}

function isStackableUnitType(unitType: string | undefined, catalog?: SessionCatalog): boolean {
  if (unitType === undefined) {
    return false
  }

  return catalog !== undefined && isSessionUnitTypeStackable(catalog, unitType)
}

function toStackSourceUnit(unit: StackSourceUnit, stackSize?: number): StackSourceUnit {
  return {
    unitId: unit.unitId,
    typeId: unit.typeId,
    position: unit.position,
    state: unit.state,
    stackSize,
  }
}

/** Returns the authoritative Onion from a game state or throws when absent. */
export function getAuthoritativeOnion(state: GameState): OnionUnit {
  const onion = Object.values(state.onions)[0]
  if (onion === undefined) {
    throw new Error('Missing authoritative onion')
  }

  return onion
}

/** Builds the web-facing stack source state from the authoritative game state. */
export function buildWebStackSourceState(state: GameState, catalog?: SessionCatalog): WebStackSourceState {
  const onions = Object.fromEntries(
    Object.values(state.onions).map((onion) => [onion.unitId, toStackSourceUnit(onion)]),
  )
  const defenders = Object.fromEntries(
    Object.values(state.defenders).map((defender) => {
      const definition = catalog === undefined ? undefined : getSessionUnitType(catalog, defender.typeId)
      return [defender.unitId, toStackSourceUnit(defender, definition?.squads)]
    }),
  )

  return {
    onions,
    defenders,
    stackRoster: state.stackRoster,
    catalog,
  }
}

/** Resolves active stack members for a selected battlefield unit. */
export function resolveBattlefieldStackMemberIds(state: WebStackSourceState | null | undefined, unitId: string, catalog?: SessionCatalog): string[] {
  if (state === null || state === undefined) {
    return [unitId]
  }

  if (state.onions?.[unitId] !== undefined) {
    return [unitId]
  }

  const selectedUnit = state.defenders?.[unitId]
  if (selectedUnit === undefined) {
    return [unitId]
  }

  if (!isStackableUnitType(selectedUnit.typeId, catalog ?? state.catalog)) {
    return [unitId]
  }

  if (state.stackRoster === undefined) {
    throw new Error(`Missing stackRoster for grouped unit ${unitId}`)
  }

  const stackRosterIndex = buildStackRosterIndex(
    state.stackRoster,
    state.defenders as DefenderMap | undefined,
  )
  const group = stackRosterIndex.getUnitGroup(unitId)
  if (group === null) {
    throw new Error(`Missing stackRoster entry for grouped unit ${unitId}`)
  }

  const activeMemberIds = group.units
    .filter((member) => member.state !== 'destroyed')
    .map((member) => member.unitId)
  return activeMemberIds.length > 0 ? activeMemberIds : [unitId]
}

/** Resolves the selectable IDs associated with a battlefield stack. */
export function resolveBattlefieldStackSelectionIds(state: WebStackSourceState | null | undefined, unitId: string, catalog?: SessionCatalog): string[] {
  return resolveBattlefieldStackMemberIds(state, unitId, catalog)
}

/** Counts selected members belonging to a battlefield stack. */
export function countSelectedBattlefieldStackMembers(
  state: WebStackSourceState | null | undefined,
  unitId: string,
  selectedUnitIds: ReadonlyArray<string>,
  catalog?: SessionCatalog,
): number {
  if (selectedUnitIds.length === 0) {
    return 0
  }

  const stackedUnitIds = resolveBattlefieldStackMemberIds(state, unitId, catalog)
  if (stackedUnitIds.length > 1) {
    return stackedUnitIds.filter((memberId) => selectedUnitIds.includes(memberId)).length
  }

  return selectedUnitIds.some((selectionId) => resolveSelectionOwnerUnitId(selectionId) === unitId) ? 1 : 0
}

/** Counts distinct selected battlefield stack groups. */
export function countSelectedBattlefieldStackGroups(
  state: WebStackSourceState | null | undefined,
  selectedUnitIds: ReadonlyArray<string>,
  catalog?: SessionCatalog,
): number {
  if (selectedUnitIds.length === 0) {
    return 0
  }

  const selectedGroupKeys = new Set<string>()

  for (const selectedUnitId of selectedUnitIds) {
    const resolvedUnitId = resolveSelectionOwnerUnitId(selectedUnitId)
    const selectedGroupIds = resolveBattlefieldStackMemberIds(state, resolvedUnitId, catalog)
    selectedGroupKeys.add(selectedGroupIds.join('|'))
  }

  return selectedGroupKeys.size
}

/** Reports whether the current defender phase permits stack expansion. */
export function resolveBattlefieldStacksExpandable({
  activeRole,
  activeTurnActive,
  isCombatPhase,
  isMovementPhase,
}: {
  activeRole: 'onion' | 'defender' | null
  activeTurnActive: boolean
  isCombatPhase: boolean
  isMovementPhase: boolean
}): boolean {
  return activeTurnActive && activeRole === 'defender' && (isCombatPhase || isMovementPhase)
}

/** Reports whether a selected stack should render expanded. */
export function shouldExpandBattlefieldStackGroup({
  memberCount,
  selectedCount,
  stacksExpandable,
}: {
  memberCount: number
  selectedCount: number
  stacksExpandable: boolean
}): boolean {
  return memberCount > 1 && selectedCount > 0 && stacksExpandable
}

/** Builds a server-ready client stack selection or null for non-stacks. */
export function buildClientStackSelection(
  state: WebStackSourceState | null | undefined,
  anchorUnitId: string | null,
  selectedUnitIds: string[],
  catalog?: SessionCatalog,
): StackActionSelection | null {
  if (anchorUnitId === null) {
    return null
  }

  const availableUnitIds = resolveBattlefieldStackSelectionIds(state, anchorUnitId, catalog)
  if (availableUnitIds.length <= 1) {
    return null
  }

  const filteredSelectedUnitIds = selectedUnitIds.filter((unitId) => availableUnitIds.includes(unitId))

  return {
    anchorUnitId,
    availableUnitIds,
    selectedUnitIds: filteredSelectedUnitIds.length > 0 ? filteredSelectedUnitIds : availableUnitIds,
  }
}