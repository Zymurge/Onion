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
    const group = input.stackNaming.groupsInUse.find((candidate) => candidate.groupKey === input.groupKey)
    if (group === undefined) {
      throw new Error(`Missing stack label for group ${input.groupKey}`)
    }

    return group.groupName
  }

  const { unitId, friendlyName } = input

  const resolvedFriendlyName = friendlyName?.trim()
  if (resolvedFriendlyName !== undefined && resolvedFriendlyName.length > 0) {
    return resolvedFriendlyName
  }

  throw new Error(`Missing friendly name for unit ${unitId ?? 'unknown unit'}`)
}
