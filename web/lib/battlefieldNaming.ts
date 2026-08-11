import type { StackNamingSnapshot } from '../../shared/stackNaming.js'
import { buildStackGroupKey, resolveStackLabel } from '../../shared/stackNaming.js'
import type { StackRosterState } from '../../shared/types/index.js'
import { isSessionUnitTypeStackable, type SessionCatalog } from './sessionCatalog.js'
import { resolveSelectionName } from './resolveSelectionName.js'

function isStackableUnitType(unitType: string | undefined, catalog?: SessionCatalog): boolean {
  if (unitType === undefined) {
    return false
  }

  return catalog !== undefined && isSessionUnitTypeStackable(catalog, unitType)
}

/** Resolves a unit's friendly battlefield name. */
export function resolveBattlefieldUnitName(unitType: string, unitId: string | undefined, friendlyName?: string): string {
  return resolveSelectionName({
    kind: 'unit',
    unitId,
    unitType,
    friendlyName,
  })
}

/** Returns the minimum effective stack size for a unit. */
export function getBattlefieldStackSize(unit: { squads?: number }): number {
  return Math.max(unit.squads ?? 1, 1)
}

/** Resolves a grouped or unit battlefield label. */
export function resolveBattlefieldStackLabel(
  unitType: string,
  unitId: string | undefined,
  friendlyName?: string,
  stackSize = 1,
  groupKey?: string,
  stackNaming?: StackNamingSnapshot,
): string {
  if (groupKey !== undefined) {
    if (stackNaming === undefined) {
      throw new Error(`Missing stackNaming for grouped unit ${unitId ?? unitType} at ${groupKey}`)
    }

    return resolveSelectionName({ kind: 'group', groupKey, stackNaming })
  }

  return resolveStackLabel(unitType, unitId, friendlyName, stackSize)
}

/** Resolves a map display name using canonical stack naming when available. */
export function resolveBattlefieldDisplayName(
  unit: {
    id: string
    type: string
    position?: { q: number; r: number }
    q?: number
    r?: number
    friendlyName?: string
    squads?: number
  },
  stackNaming?: StackNamingSnapshot,
): string {
  const position = unit.position ?? { q: unit.q ?? 0, r: unit.r ?? 0 }

  if (stackNaming !== undefined) {
    const groupKey = buildStackGroupKey(unit.type, position)
    const group = stackNaming.groupsInUse.find((entry) => entry.groupKey === groupKey)
    if (group !== undefined) {
      return resolveSelectionName({ kind: 'group', groupKey: group.groupKey, stackNaming })
    }

    if (getBattlefieldStackSize(unit) > 1) {
      throw new Error(`Missing stackNaming entry for grouped unit ${unit.id} at ${groupKey}`)
    }
  }

  return resolveSelectionName({
    kind: 'unit',
    unitId: unit.id,
    unitType: unit.type,
    friendlyName: unit.friendlyName,
  })
}

/** Resolves a unit's friendly name while validating roster and naming metadata. */
export function resolveBattlefieldFriendlyName(
  unit: {
    id: string
    type: string
    position?: { q: number; r: number }
    q?: number
    r?: number
    friendlyName?: string
  },
  stackNaming?: StackNamingSnapshot,
  stackRoster?: StackRosterState,
  catalog?: SessionCatalog,
): string {
  const position = unit.position ?? { q: unit.q ?? 0, r: unit.r ?? 0 }
  const groupKey = buildStackGroupKey(unit.type, position)
  const rosterGroup = stackRoster === undefined
    ? null
    : Object.entries(stackRoster.groupsById ?? {})
      .map(([, group]) => group)
      .find((group) => Array.isArray(group.unitIds) && group.unitIds.includes(unit.id))
      ?? null
  const isStackable = isStackableUnitType(unit.type, catalog)
  const namingGroup = stackNaming?.groupsInUse.find((entry) => entry.groupKey === groupKey) ?? null

  if (isStackable) {
    if (stackRoster === undefined) {
      return resolveBattlefieldUnitName(unit.type, unit.id, unit.friendlyName)
    }

    if (stackNaming === undefined) {
      throw new Error(`Missing stackNaming for grouped unit ${unit.id}`)
    }

    if (rosterGroup === null) {
      throw new Error(`Missing roster group for grouped unit ${unit.id} at ${groupKey}`)
    }

    if (namingGroup === null) {
      throw new Error(`Missing stackNaming entry for grouped unit ${unit.id} at ${groupKey}`)
    }

    if (rosterGroup.groupName !== namingGroup.groupName) {
      throw new Error(`Conflicting stacked-unit labels for ${unit.id}: roster=${rosterGroup.groupName}, naming=${namingGroup.groupName}`)
    }

    return resolveSelectionName({ kind: 'group', groupKey: namingGroup.groupKey, stackNaming })
  }

  return resolveBattlefieldUnitName(unit.type, unit.id, unit.friendlyName)
}