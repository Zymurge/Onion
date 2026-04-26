import { buildFriendlyName } from '../../shared/unitDefinitions'
import type { StackNamingSnapshot } from '../../shared/stackNaming'

type UnitSelectionNameInput = {
  kind: 'unit'
  unitId?: string
  unitType?: string
  friendlyName?: string
}

type GroupSelectionNameInput = {
  kind: 'group'
  groupKey: string
  stackNaming: StackNamingSnapshot
}

/**
 * Common display-name resolver for selection surfaces.
 *
 * This intentionally centralizes the repeated "if group, use the group label; otherwise use the
 * unit label" decision so map labels, rails, and inspectors can share one tested path.
 */
export type SelectionNameInput = UnitSelectionNameInput | GroupSelectionNameInput

/**
 * Resolves a display name for a selection:
 * - group selections use the canonical stack label from `stackNaming`
 * - unit selections use friendly name, then generated friendly name, then unit id
 */
export function resolveSelectionName(input: SelectionNameInput): string {
  if (input.kind === 'group') {
    return input.stackNaming.groupsInUse.find((group) => group.groupKey === input.groupKey)?.groupName ?? input.groupKey
  }

  const { unitId, unitType, friendlyName } = input

  if (friendlyName) return friendlyName
  if (unitType && unitId) return buildFriendlyName(unitType, unitId)
  return unitId || ''
}
