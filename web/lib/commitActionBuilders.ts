import type { GameAction } from './gameClient'
import {
  buildCombatTargetActionId,
  isWeaponSelectionId,
} from './appViewHelpers'
import { buildRightRailStackSubmissionAction } from './rightRailSelection'
import { getAllUnitDefinitions } from '../../shared/unitDefinitions'

type StackSourceState = Parameters<typeof buildRightRailStackSubmissionAction>[0]['state']

type CommitActionFailureReason = 'empty-selection' | 'missing-target' | 'missing-stack-selection'

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

const UNIT_DEFINITIONS = getAllUnitDefinitions()

function resolveUnitType(state: StackSourceState, unitId: string | null): string | null {
  if (unitId === null) {
    return null
  }

  if (state.onion?.id === unitId) {
    return state.onion.type ?? 'TheOnion'
  }

  return state.defenders?.[unitId]?.type ?? null
}

function isStackableUnitType(unitType: string | null): boolean {
  if (unitType === null) {
    return false
  }

  return (UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]?.abilities.maxStacks ?? 1) > 1
}

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

  if (!isStackableUnitType(resolveUnitType(state, unitId))) {
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
    ok: false,
    reason: 'missing-stack-selection',
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

  if (!isStackableUnitType(resolveUnitType(state, anchorUnitId ?? selectedUnitIds[0] ?? null))) {
    return {
      ok: true,
      action: {
        type: 'FIRE',
        attackers: [...selectedUnitIds],
        targetId: translatedTargetId,
      },
    }
  }

  return {
    ok: false,
    reason: 'missing-stack-selection',
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
