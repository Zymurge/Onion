import type { GameState, HexPos } from './types/index.js'
import { getOnionOrDefender } from './unitState.js'

export type ActionSubjectReference =
  | { kind: 'unit'; id: string }
  | { kind: 'stack'; id: string }

export type ActionSubject = {
  id: string
  kind: ActionSubjectReference['kind']
  typeId: string
  position: HexPos
  label: string
  size: number
  memberUnitIds: ReadonlyArray<string>
}

function resolveUnitSubject(state: GameState, unitId: string): ActionSubject {
  const lookup = getOnionOrDefender(unitId, state)
  if (lookup.unitId === undefined) {
    throw new Error(`Action subject unit '${unitId}' not found`)
  }

  const unit = lookup.kind === 'onion'
    ? state.onions[lookup.unitId]
    : state.defenders[lookup.unitId]
  if (unit === undefined) {
    throw new Error(`Action subject unit '${unitId}' not found`)
  }

  return {
    id: unit.unitId,
    kind: 'unit',
    typeId: unit.typeId,
    position: unit.position,
    label: unit.friendlyName,
    size: 1,
    memberUnitIds: [unit.unitId],
  }
}

function resolveStackSubject(state: GameState, groupId: string): ActionSubject {
  const group = state.stackRoster.groupsById[groupId]
  if (group === undefined) {
    throw new Error(`Action subject stack '${groupId}' not found`)
  }

  if (group.unitIds.length < 2) {
    throw new Error(`Action subject stack '${groupId}' must contain at least two members`)
  }

  for (const unitId of group.unitIds) {
    if (state.defenders[unitId] === undefined) {
      throw new Error(`Action subject stack '${groupId}' is missing member unit '${unitId}'`)
    }
  }

  const label = group.groupName?.trim()
  if (label === undefined || label.length === 0) {
    throw new Error(`Action subject stack '${groupId}' is missing a group name`)
  }

  return {
    id: groupId,
    kind: 'stack',
    typeId: group.unitType,
    position: group.position,
    label,
    size: group.unitIds.length,
    memberUnitIds: [...group.unitIds],
  }
}

/** Resolve a unit or stack reference from authoritative state without creating duplicate state. */
export function resolveActionSubject(state: GameState, reference: ActionSubjectReference): ActionSubject {
  return reference.kind === 'unit'
    ? resolveUnitSubject(state, reference.id)
    : resolveStackSubject(state, reference.id)
}