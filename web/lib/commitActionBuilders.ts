import type { GameAction } from './gameClient'
import {
  buildClientStackSelection,
  buildCombatTargetActionId,
  isWeaponSelectionId,
} from './appViewHelpers'
import { buildRightRailStackSubmissionAction } from './rightRailSelection'

type StackSourceState = Parameters<typeof buildRightRailStackSubmissionAction>[0]['state']

type CommitActionFailureReason = 'empty-selection' | 'missing-target'

type CommitActionResult<TAction extends GameAction> =
  | { ok: true; action: TAction }
  | { ok: false; reason: CommitActionFailureReason }

type MoveCommitActionInput = {
  state: StackSourceState
  unitId: string
  selectedUnitIds: readonly string[]
  to: { q: number; r: number }
  attemptRam?: boolean
}

type CombatCommitActionInput = {
  state: StackSourceState
  anchorUnitId: string | null
  selectedUnitIds: readonly string[]
  targetId: string | null
  onionId?: string
}

type EndPhaseCommitAction = Extract<GameAction, { type: 'end-phase' }>

function buildMovePayload(
  state: StackSourceState,
  unitId: string,
  selectedUnitIds: readonly string[],
  to: { q: number; r: number },
  attemptRam?: boolean,
): CommitActionResult<Extract<GameAction, { type: 'MOVE' }>> {
  const selectedBoardUnitIds = selectedUnitIds.filter((selectionId) => !isWeaponSelectionId(selectionId))
  const stackSubmission = buildRightRailStackSubmissionAction({
    kind: 'move',
    state,
    anchorUnitId: unitId,
    selectedUnitIds: selectedBoardUnitIds,
    to,
    ...(attemptRam === undefined ? {} : { attemptRam }),
  })

  if (!stackSubmission.ok && stackSubmission.reason === 'empty-selection') {
    return stackSubmission
  }

  if (stackSubmission.ok) {
    return stackSubmission
  }

  const stackSelection = buildClientStackSelection(state, unitId, selectedBoardUnitIds)

  if (stackSelection === null) {
    return {
      ok: true,
      action: {
        type: 'MOVE',
        movers: [unitId],
        to,
        ...(attemptRam === undefined ? {} : { attemptRam }),
      },
    }
  }

  return {
    ok: true,
    action: {
      type: 'MOVE',
      movers: stackSelection.selectedUnitIds,
      to,
      ...(attemptRam === undefined ? {} : { attemptRam }),
    },
  }
}

function buildCombatPayload(
  state: StackSourceState,
  anchorUnitId: string | null,
  selectedUnitIds: readonly string[],
  targetId: string,
  onionId?: string,
): CommitActionResult<Extract<GameAction, { type: 'FIRE' }>> {
  const translatedTargetId = buildCombatTargetActionId(targetId, onionId)
  const stackSubmission = buildRightRailStackSubmissionAction({
    kind: 'combat',
    state,
    anchorUnitId,
    selectedUnitIds,
    targetId: translatedTargetId,
  })

  if (!stackSubmission.ok && stackSubmission.reason === 'empty-selection') {
    return stackSubmission
  }

  if (stackSubmission.ok) {
    return {
      ok: true,
      action: {
        type: 'FIRE',
        attackers: stackSubmission.action.attackers,
        targetId: stackSubmission.action.targetId,
      },
    }
  }

  return {
    ok: true,
    action: {
      type: 'FIRE',
      attackers: [...selectedUnitIds],
      targetId: translatedTargetId,
    },
  }
}

export function buildMoveCommitAction(input: MoveCommitActionInput): CommitActionResult<Extract<GameAction, { type: 'MOVE' }>> {
  return buildMovePayload(input.state, input.unitId, input.selectedUnitIds, input.to, input.attemptRam)
}

export function buildCombatCommitAction(input: CombatCommitActionInput): CommitActionResult<Extract<GameAction, { type: 'FIRE' }>> {
  if (input.targetId === null || input.targetId.trim().length === 0) {
    return { ok: false, reason: 'missing-target' }
  }

  return buildCombatPayload(input.state, input.anchorUnitId, input.selectedUnitIds, input.targetId, input.onionId)
}

export function buildEndPhaseCommitAction(): { ok: true; action: EndPhaseCommitAction } {
  return { ok: true, action: { type: 'end-phase' } }
}
