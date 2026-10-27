import type { StackNamingSnapshot } from '../../shared/stackNaming/index.js'
import { resolveStackLabel } from '../../shared/stackNaming/index.js'
import type { StackRosterIndex } from '../../shared/stackRoster/index.js'
import type { GameUnit } from '../../shared/types/index.js'
import { isSessionUnitTypeStackable, type SessionCatalog } from './sessionCatalog.js'
import { resolveSelectionName } from './resolveSelectionName.js'

function isStackableUnitType(unitType: string | undefined, catalog?: SessionCatalog): boolean {
  if (unitType === undefined) {
    return false
  }

  return catalog !== undefined && isSessionUnitTypeStackable(catalog, unitType)
}

type BattlefieldNamingUnit = GameUnit & {
  stackSize?: number
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
export function getBattlefieldStackSize(unit: { stackSize?: number }): number {
  return Math.max(unit.stackSize ?? 1, 1)
}

/** Resolves a grouped or unit battlefield label. */
export function resolveBattlefieldStackLabel(
  unitType: string,
  unitId: string | undefined,
  friendlyName?: string,
  stackSize = 1,
  groupId?: string,
  stackNaming?: StackNamingSnapshot,
): string {
  if (groupId !== undefined && stackSize > 1) {
    if (stackNaming === undefined) {
      throw new Error(`Missing stackNaming for grouped unit ${unitId ?? unitType} at ${groupId}`)
    }

    return resolveSelectionName({ kind: 'group', groupId, stackNaming })
  }

  return resolveStackLabel(unitType, unitId, friendlyName, stackSize)
}

/** Resolves a map display name using canonical stack naming when available. */
export function resolveBattlefieldDisplayName(
  unit: BattlefieldNamingUnit,
  stackNaming?: StackNamingSnapshot,
  groupId?: string,
): string {
  if (stackNaming !== undefined && getBattlefieldStackSize(unit) > 1) {
    if (groupId === undefined) {
      throw new Error(`Missing stack roster group for grouped unit ${unit.unitId}`)
    }

    return resolveSelectionName({ kind: 'group', groupId, stackNaming })
  }

  return resolveSelectionName({
    kind: 'unit',
    unitId: unit.unitId,
    unitType: unit.typeId,
    friendlyName: unit.friendlyName,
  })
}

/** Resolves a unit's friendly name while validating roster and naming metadata. */
export function resolveBattlefieldFriendlyName(
  unit: BattlefieldNamingUnit,
  stackNaming?: StackNamingSnapshot,
  stackRosterIndex?: StackRosterIndex,
  catalog?: SessionCatalog,
): string {
  if (unit.state === 'destroyed') {
    return resolveBattlefieldUnitName(unit.typeId, unit.unitId, unit.friendlyName)
  }

  const isStackable = isStackableUnitType(unit.typeId, catalog)

  if (isStackable) {
    if (stackRosterIndex === undefined) {
      return resolveBattlefieldUnitName(unit.typeId, unit.unitId, unit.friendlyName)
    }

    const rosterGroup = stackRosterIndex.getUnitGroup(unit.unitId)
    if (rosterGroup === null) {
      return resolveBattlefieldUnitName(unit.typeId, unit.unitId, unit.friendlyName)
    }

    if (rosterGroup.unitIds.length <= 1) {
      return resolveBattlefieldUnitName(unit.typeId, unit.unitId, unit.friendlyName)
    }

    if (stackNaming === undefined) {
      throw new Error(`Missing stackNaming for grouped unit ${unit.unitId}`)
    }

    const namingGroup = stackNaming.groupsInUse.find((entry) => entry.groupId === rosterGroup.groupId) ?? null
    if (namingGroup === null) {
      throw new Error(`Missing stackNaming entry for grouped unit ${unit.unitId} at ${rosterGroup.groupId}`)
    }

    if (rosterGroup.groupName !== namingGroup.groupName) {
      throw new Error(`Conflicting stacked-unit labels for ${unit.unitId}: roster=${rosterGroup.groupName}, naming=${namingGroup.groupName}`)
    }

    return resolveSelectionName({ kind: 'group', groupId: namingGroup.groupId, stackNaming })
  }

  return resolveBattlefieldUnitName(unit.typeId, unit.unitId, unit.friendlyName)
}