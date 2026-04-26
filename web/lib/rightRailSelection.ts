import type { GameAction, StackActionSelection } from './gameClient'
import { normalizeSelectionIds, parseStackMemberSelectionId, resolveBattlefieldStackMemberIds, resolveBattlefieldStackSelectionIds, resolveSelectionOwnerUnitId } from './appViewHelpers'
import type { BattlefieldOnionView, BattlefieldUnit } from './battlefieldView'
import { buildStackRosterIndex } from '../../shared/stackRoster'
import type { StackRosterState } from '../../shared/types/index'

type StackSourceState = Parameters<typeof resolveBattlefieldStackMemberIds>[0]

type RightRailStackMemberView = BattlefieldUnit | BattlefieldOnionView

export type RightRailStackSelectionModel = {
  anchorUnitId: string | null
  groupId: string | null
  memberUnitIds: string[]
  selectedUnitIds: string[]
  selectedCount: number
}

export type RightRailStackSelectionViewModel = RightRailStackSelectionModel & {
  selectedStackMembers: RightRailStackMemberView[]
  selectedStackSelectionCount: number
}

type StackSelectionFailureReason = 'missing-anchor' | 'not-a-stack' | 'empty-selection'

type StackSelectionResult =
  | { ok: true; selection: StackActionSelection }
  | { ok: false; reason: StackSelectionFailureReason }

type RightRailStackActionResult<TAction extends GameAction> =
  | { ok: true; action: TAction }
  | { ok: false; reason: StackSelectionFailureReason | 'missing-target' }

type RightRailStackSubmissionFailureReason = StackSelectionFailureReason | 'missing-target'

type RightRailMoveSubmissionInput = {
  kind: 'move'
  state: StackSourceState
  anchorUnitId: string | null
  selectedUnitIds: readonly string[]
  to: { q: number; r: number }
  attemptRam?: boolean
}

type RightRailCombatSubmissionInput = {
  kind: 'combat'
  state: StackSourceState
  anchorUnitId: string | null
  selectedUnitIds: readonly string[]
  targetId: string | null
}

export type RightRailStackSubmissionInput = RightRailMoveSubmissionInput | RightRailCombatSubmissionInput

export type RightRailStackSubmissionResult =
  | { ok: true; action: Extract<GameAction, { type: 'MOVE_STACK' } | { type: 'FIRE_STACK' }> }
  | { ok: false; reason: RightRailStackSubmissionFailureReason }

function uniqueIds(unitIds: readonly string[]): string[] {
  return Array.from(new Set(unitIds))
}

function normalizeStackMemberSelection(selectedUnitIds: readonly string[] | null | undefined, stackMemberIds: readonly string[]): string[] {
  return normalizeSelectionIds(selectedUnitIds, stackMemberIds)
}

export function selectRightRailStackMembers(stackMemberIds: readonly string[]): string[] {
  return uniqueIds(stackMemberIds)
}

export function toggleRightRailStackMemberSelection(
  selectedUnitIds: readonly string[] | null | undefined,
  stackMemberIds: readonly string[],
  unitId: string,
): string[] {
  const normalizedSelection = normalizeStackMemberSelection(selectedUnitIds, stackMemberIds)
  if (normalizedSelection.includes(unitId)) {
    return normalizedSelection.filter((selectedId) => selectedId !== unitId)
  }

  return [...normalizedSelection, unitId]
}

export function clearRightRailStackSelection(): string[] {
  return []
}

function findGroupIdForUnit(state: StackSourceState, unitId: string | null): string | null {
  if (unitId === null) {
    return null
  }

  return buildStackRosterIndex(state.stackRoster as StackRosterState | undefined).getUnitGroup(unitId)?.groupId ?? null
}

function buildValidatedStackSelection(
  state: StackSourceState,
  anchorUnitId: string | null,
  selectedUnitIds: readonly string[],
): StackSelectionResult {
  if (anchorUnitId === null) {
    return { ok: false, reason: 'missing-anchor' }
  }

  const availableUnitIds = uniqueIds(resolveBattlefieldStackSelectionIds(state, anchorUnitId))
  if (availableUnitIds.length <= 1) {
    return { ok: false, reason: 'not-a-stack' }
  }

  const normalizedSelectedUnitIds = uniqueIds(
    selectedUnitIds.flatMap((unitId) => {
      if (unitId === anchorUnitId) {
        return [...availableUnitIds]
      }

      if (availableUnitIds.includes(unitId)) {
        return [unitId]
      }

      const stackMemberSelection = parseStackMemberSelectionId(unitId)
      if (stackMemberSelection !== null) {
        const selectedStackMemberId = availableUnitIds[stackMemberSelection.memberIndex - 1]
        return selectedStackMemberId === undefined ? [] : [selectedStackMemberId]
      }

      const ownerUnitId = resolveSelectionOwnerUnitId(unitId)
      return ownerUnitId === anchorUnitId ? [...availableUnitIds] : []
    }),
  )
  if (normalizedSelectedUnitIds.length === 0) {
    return { ok: false, reason: 'empty-selection' }
  }

  return {
    ok: true,
    selection: {
      anchorUnitId,
      availableUnitIds,
      selectedUnitIds: normalizedSelectedUnitIds,
    },
  }
}

export function buildRightRailStackSelectionModel({
  state,
  inspectedUnitId,
  selectedStackUnitIds,
  activeSelectedUnitIds,
}: {
  state: StackSourceState
  inspectedUnitId: string | null
  selectedStackUnitIds: readonly string[]
  activeSelectedUnitIds: readonly string[]
}): RightRailStackSelectionModel {
  const memberUnitIds = uniqueIds(
    selectedStackUnitIds.length > 1
      ? selectedStackUnitIds
      : inspectedUnitId === null
        ? []
        : resolveBattlefieldStackMemberIds(state, inspectedUnitId),
  )
  const anchorUnitId = memberUnitIds[0] ?? inspectedUnitId ?? null
  const selectedUnitIds = memberUnitIds.filter((unitId) => activeSelectedUnitIds.includes(unitId))

  return {
    anchorUnitId,
    groupId: findGroupIdForUnit(state, anchorUnitId),
    memberUnitIds,
    selectedUnitIds,
    selectedCount: selectedUnitIds.length,
  }
}

export function buildRightRailStackSelectionViewModel({
  state,
  inspectedUnitId,
  selectedStackUnitIds,
  activeSelectedUnitIds,
  displayedDefenders,
  displayedOnion,
}: {
  state: StackSourceState
  inspectedUnitId: string | null
  selectedStackUnitIds: readonly string[]
  activeSelectedUnitIds: readonly string[]
  displayedDefenders: readonly BattlefieldUnit[]
  displayedOnion: BattlefieldOnionView | null
}): RightRailStackSelectionViewModel {
  const selectionModel = buildRightRailStackSelectionModel({
    state,
    inspectedUnitId,
    selectedStackUnitIds,
    activeSelectedUnitIds,
  })

  const visibleUnitsById = new Map<string, RightRailStackMemberView>()
  if (displayedOnion !== null) {
    visibleUnitsById.set(displayedOnion.id, displayedOnion)
  }

  for (const unit of displayedDefenders) {
    visibleUnitsById.set(unit.id, unit)
  }

  const selectedStackMembers = selectionModel.memberUnitIds
    .map((unitId) => visibleUnitsById.get(unitId) ?? null)
    .filter((unit): unit is RightRailStackMemberView => unit !== null)

  return {
    ...selectionModel,
    selectedStackMembers,
    selectedStackSelectionCount: selectionModel.selectedCount,
  }
}

export function buildRightRailMoveAction({
  state,
  anchorUnitId,
  selectedUnitIds,
  to,
  attemptRam,
}: {
  state: StackSourceState
  anchorUnitId: string | null
  selectedUnitIds: readonly string[]
  to: { q: number; r: number }
  attemptRam?: boolean
}): RightRailStackActionResult<Extract<GameAction, { type: 'MOVE_STACK' }>> {
  const submissionResult = buildRightRailStackSubmissionAction({
    kind: 'move',
    state,
    anchorUnitId,
    selectedUnitIds,
    to,
    attemptRam,
  })

  return submissionResult.ok
    ? submissionResult
    : submissionResult
}

export function buildRightRailCombatAction({
  state,
  anchorUnitId,
  selectedUnitIds,
  targetId,
}: {
  state: StackSourceState
  anchorUnitId: string | null
  selectedUnitIds: readonly string[]
  targetId: string | null
}): RightRailStackActionResult<Extract<GameAction, { type: 'FIRE_STACK' }>> {
  const submissionResult = buildRightRailStackSubmissionAction({
    kind: 'combat',
    state,
    anchorUnitId,
    selectedUnitIds,
    targetId,
  })

  return submissionResult.ok
    ? submissionResult
    : submissionResult
}

export function buildRightRailStackSubmissionAction(input: RightRailStackSubmissionInput): RightRailStackSubmissionResult {
  const selectionResult = buildValidatedStackSelection(input.state, input.anchorUnitId, input.selectedUnitIds)
  if (!selectionResult.ok) {
    return selectionResult
  }

  if (input.kind === 'move') {
    return {
      ok: true,
      action: {
        type: 'MOVE_STACK',
        selection: selectionResult.selection,
        to: input.to,
        ...(input.attemptRam === undefined ? {} : { attemptRam: input.attemptRam }),
      },
    }
  }

  if (input.targetId === null || input.targetId.trim().length === 0) {
    return { ok: false, reason: 'missing-target' }
  }

  return {
    ok: true,
    action: {
      type: 'FIRE_STACK',
      attackers: selectionResult.selection.selectedUnitIds,
      targetId: input.targetId,
      selection: selectionResult.selection,
    },
  }
}