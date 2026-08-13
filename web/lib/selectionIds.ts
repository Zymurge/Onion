import { formatCombatTargetId } from '../../shared/combatTarget.js'

const STACK_MEMBER_SELECTION_PREFIX = 'stack-member:'

/** Builds the stable selection ID for a stack member. */
export function buildStackMemberSelectionId(unitId: string, memberIndex: number): string {
  return `${STACK_MEMBER_SELECTION_PREFIX}${unitId}:${memberIndex}`
}

/** Reports whether a selection ID identifies a stack member. */
export function isStackMemberSelectionId(selectionId: string): boolean {
  return selectionId.startsWith(STACK_MEMBER_SELECTION_PREFIX)
}

/** Parses a stack-member selection ID, returning null for malformed IDs. */
export function parseStackMemberSelectionId(selectionId: string): { unitId: string; memberIndex: number } | null {
  const match = /^stack-member:([^:]+):(\d+)$/.exec(selectionId)
  if (match === null) {
    return null
  }

  return {
    unitId: match[1],
    memberIndex: Number.parseInt(match[2], 10),
  }
}

/** Resolves a stack-member selection to its owning unit ID. */
export function resolveSelectionOwnerUnitId(selectionId: string): string {
  return parseStackMemberSelectionId(selectionId)?.unitId ?? selectionId
}

/** Reports whether a selection ID identifies a weapon. */
export function isWeaponSelectionId(selectionId: string): boolean {
  return selectionId.startsWith('weapon:')
}

/** Removes the weapon prefix from a selection ID. */
export function stripWeaponSelectionId(selectionId: string): string {
  return selectionId.replace(/^weapon:/, '')
}

/** Builds the stable selection ID for a weapon. */
export function buildWeaponSelectionId(weaponId: string): string {
  return `weapon:${weaponId}`
}

/** Resolves a selected target to the action ID expected by combat commands. */
export function buildCombatTargetActionId(targetId: string, onionId: string | undefined): string {
  if (targetId.startsWith('weapon:')) {
    return stripWeaponSelectionId(targetId)
  }

  if (onionId !== undefined && targetId === onionId) {
    return formatCombatTargetId({ kind: 'treads', onionId })
  }

  return targetId
}

/** Filters selections to allowed IDs and removes duplicates. */
export function normalizeSelectionIds(selectedIds: readonly string[] | null | undefined, allowedIds: readonly string[]): string[] {
  const allowedIdSet = new Set(allowedIds)
  return Array.from(new Set((selectedIds ?? []).filter((selectionId) => allowedIdSet.has(selectionId))))
}