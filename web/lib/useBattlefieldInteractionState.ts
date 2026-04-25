import { useEffect, useState } from 'react'
import { findMovePath, type MoveMapSnapshot } from '../../shared/movePlanner'
import { getUnitMovementAllowance, getUnitRamCapacity } from '../../shared/unitMovement'
import type { GameAction, GameSnapshot } from './gameClient'
import type { GameSessionController } from './gameSessionTypes'
import { buildClientStackSelection, isWeaponSelectionId, resolveBattlefieldStackSelectionIds, resolveSelectionOwnerUnitId } from './appViewHelpers'
import { buildRightRailStackSubmissionAction } from './rightRailSelection'
import type { TurnPhase } from '../../shared/types/index'
import logger from './logger'

type UseBattlefieldInteractionStateOptions = {
  activeSessionController: GameSessionController | null
  activeTurnActive: boolean
  clientSnapshot: GameSnapshot | null
  clientSnapshotPhase: TurnPhase | null
  isControlledSession: boolean
  isInteractionLocked: boolean
  isSelectionLocked: boolean
}

type RamPrompt = {
  unitId: string
  to: { q: number; r: number }
  targetLabel: string
}

function isCombatSnapshotPhase(phase: TurnPhase | null): boolean {
  return phase === 'ONION_COMBAT' || phase === 'DEFENDER_COMBAT'
}

function buildMoveMapSnapshot(snapshot: GameSnapshot, movingUnitId: string): MoveMapSnapshot | null {
  const authoritativeState = snapshot.authoritativeState
  const scenarioMap = snapshot.scenarioMap

  if (authoritativeState === undefined || scenarioMap === undefined) {
    return null
  }

  const occupiedHexes: NonNullable<MoveMapSnapshot['occupiedHexes']> = [
    ...(authoritativeState.onion.id !== movingUnitId && authoritativeState.onion.status !== 'destroyed'
      ? [{ q: authoritativeState.onion.position.q, r: authoritativeState.onion.position.r, role: 'onion' as const, unitType: authoritativeState.onion.type ?? 'TheOnion', squads: 1 }]
      : []),
    ...Object.values(authoritativeState.defenders)
      .filter((unit) => unit.id !== movingUnitId && unit.status !== 'destroyed')
      .map((unit) => ({ q: unit.position.q, r: unit.position.r, role: 'defender' as const, unitType: unit.type, squads: unit.squads })),
  ]

  return {
    width: scenarioMap.width,
    height: scenarioMap.height,
    cells: scenarioMap.cells,
    hexes: scenarioMap.hexes,
    occupiedHexes,
  }
}

function buildRamPrompt(snapshot: GameSnapshot | null, unitId: string, to: { q: number; r: number }): RamPrompt | null {
  if (snapshot === null || snapshot.authoritativeState === undefined || snapshot.scenarioMap === undefined) {
    return null
  }

  if (snapshot.phase !== 'ONION_MOVE') {
    return null
  }

  const onion = snapshot.authoritativeState.onion
  if (unitId !== onion.id || onion.status !== 'operational') {
    return null
  }

  const remainingRams = Math.max(getUnitRamCapacity(onion.type ?? 'TheOnion') - (snapshot.authoritativeState.ramsThisTurn ?? 0), 0)
  if (remainingRams === 0) {
    return null
  }

  const movementAllowance = snapshot.movementRemainingByUnit?.[unitId] ?? getUnitMovementAllowance(onion.type ?? 'TheOnion', snapshot.phase, onion.treads)
  const moveMap = buildMoveMapSnapshot(snapshot, unitId)
  if (moveMap === null) {
    return null
  }

  const pathResult = findMovePath({
    map: moveMap,
    from: onion.position,
    to,
    movementAllowance,
    movingRole: 'onion',
    movingUnitType: onion.type ?? 'TheOnion',
    incomingSquads: 1,
  })

  if (!pathResult.found) {
    return null
  }

  const occupiedLookup = new Set(moveMap.occupiedHexes?.map((occupant) => `${occupant.q},${occupant.r}`) ?? [])
  const rammedStep = pathResult.path.find((step) => occupiedLookup.has(`${step.q},${step.r}`))
  if (rammedStep === undefined) {
    return null
  }

  const targetDefender = Object.values(snapshot.authoritativeState.defenders).find((unit) => unit.position.q === rammedStep.q && unit.position.r === rammedStep.r && unit.status !== 'destroyed')
  const targetLabel = targetDefender?.type ?? 'occupied hex'

  return {
    unitId,
    to,
    targetLabel,
  }
}

function buildSelectedBoardUnitIds(selectedUnitIds: string[] | null, defaultSelection: string[]): string[] {
  return (selectedUnitIds ?? defaultSelection).filter((selectionId) => !isWeaponSelectionId(selectionId))
}

export function useBattlefieldInteractionState({
  activeSessionController,
  activeTurnActive,
  clientSnapshot,
  clientSnapshotPhase,
  isControlledSession,
  isInteractionLocked,
  isSelectionLocked,
}: UseBattlefieldInteractionStateOptions) {
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[] | null>(null)
  const [hasExplicitSelection, setHasExplicitSelection] = useState(false)
  const [selectedCombatTargetId, setSelectedCombatTargetId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [, setPendingCombatSnapshot] = useState<GameSnapshot | null>(null)
  const [pendingCombatResolution, setPendingCombatResolution] = useState<GameSnapshot['combatResolution'] | null>(null)
  const [pendingRamResolution, setPendingRamResolution] = useState<GameSnapshot['ramResolution'] | null>(null)
  const [pendingRamPrompt, setPendingRamPrompt] = useState<RamPrompt | null>(null)
  const [combatBaseSnapshot, setCombatBaseSnapshot] = useState<GameSnapshot | null>(null)
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  function debugLog(event: string, details: Record<string, unknown>) {
    if (typeof window === 'undefined') {
      return
    }

    logger.debug(`[interaction-debug] ${event}`, {
      ts: Date.now(),
      ...details,
    })
  }

  useEffect(() => {
    if (
      clientSnapshot === null
      || !isCombatSnapshotPhase(clientSnapshotPhase)
    ) {
      setPendingCombatSnapshot(null)
      setPendingCombatResolution(null)
      setCombatBaseSnapshot(null)
      setSelectedCombatTargetId(null)
    }
  }, [clientSnapshot, clientSnapshotPhase])

  async function commitClientAction(action: GameAction) {
    if (!isControlledSession || activeSessionController === null) {
      debugLog('commitClientAction skipped', {
        action,
        isControlledSession,
        hasController: activeSessionController !== null,
        isInteractionLocked,
        activeTurnActive,
        clientSnapshotPhase,
      })
      return
    }

    debugLog('commitClientAction start', {
      action,
      isInteractionLocked,
      activeTurnActive,
      clientSnapshotPhase,
      selectedUnitIds,
      selectedCombatTargetId,
    })

    try {
      const previousSnapshot = clientSnapshot
      const nextSnapshot = await activeSessionController.submitAction(action)
      debugLog('commitClientAction success', {
        action,
        fromPhase: previousSnapshot?.phase ?? null,
        toPhase: nextSnapshot?.phase ?? null,
        nextEventSeq: nextSnapshot?.lastEventSeq ?? null,
      })
      setActionError(null)
      if (nextSnapshot?.combatResolution !== undefined) {
        setCombatBaseSnapshot(previousSnapshot)
        setPendingCombatSnapshot(nextSnapshot)
        setPendingCombatResolution(nextSnapshot.combatResolution)
      } else {
        clearPendingCombatResolution(false)
      }

      setPendingRamResolution(nextSnapshot?.ramResolution?.length ? nextSnapshot.ramResolution : null)
      if (nextSnapshot !== null && !isCombatSnapshotPhase(nextSnapshot.phase)) {
        setSelectedCombatTargetId(null)
      }
    } catch (error: unknown) {
      debugLog('commitClientAction failure', {
        action,
        error,
        clientSnapshotPhase,
      })
      const errorMessage =
        error instanceof Error && error.message
          ? `Error: ${error.message}`
          : 'Error unknown'
      setActionError(`Failed to submit action: ${errorMessage}`)
      if (action.type === 'FIRE' && activeSessionController !== null) {
        clearPendingCombatResolution(true)

        try {
          await activeSessionController.refresh()
        } catch {
          // Keep the error banner; the user can retry or refresh manually.
        }
      }
    }
  }

  function clearPendingCombatResolution(clearSelection: boolean) {
    setCombatBaseSnapshot(null)
    setPendingCombatSnapshot(null)
    setPendingCombatResolution(null)
    setPendingRamResolution(null)

    if (clearSelection) {
      setSelectedUnitIds([])
      setHasExplicitSelection(true)
      setSelectedCombatTargetId(null)
    }
    setPendingRamPrompt(null)
  }

  function handleDismissCombatResolution() {
    clearPendingCombatResolution(true)
  }

  function handleDismissRamResolution(resolutionIndex: number) {
    setPendingRamResolution((current) => {
      if (current === null || current === undefined || current.length === 0) {
        return null
      }

      const remaining = current.filter((_, index) => index !== resolutionIndex)
      return remaining.length > 0 ? remaining : null
    })
  }

  function handleResolveRamPrompt(attemptRam: boolean) {
    if (pendingRamPrompt === null) {
      return
    }

    const prompt = pendingRamPrompt
    setPendingRamPrompt(null)

    const defaultSelection = clientSnapshot?.selectedUnitId
      ? resolveBattlefieldStackSelectionIds(clientSnapshot.authoritativeState ?? null, clientSnapshot.selectedUnitId)
      : []
    const selectedBoardUnitIds = buildSelectedBoardUnitIds(selectedUnitIds, defaultSelection)
    const stackSelection = buildClientStackSelection(clientSnapshot?.authoritativeState ?? null, prompt.unitId, selectedBoardUnitIds)

    void commitClientAction(
      stackSelection === null
        ? { type: 'MOVE', unitId: prompt.unitId, to: prompt.to, attemptRam }
        : { type: 'MOVE_STACK', selection: stackSelection, to: prompt.to, attemptRam },
    )
    setSelectedUnitIds([])
    setHasExplicitSelection(true)
  }

  function handleSelectUnit(unitId: string, additive = false) {
    if (isSelectionLocked) {
      debugLog('handleSelectUnit blocked', {
        unitId,
        additive,
        isSelectionLocked,
      })
      return
    }

    const authoritativeState = clientSnapshot?.authoritativeState
    const selectionOwnerUnitId = resolveSelectionOwnerUnitId(unitId)
    const destroyedUnit = authoritativeState === undefined
      ? false
      : selectionOwnerUnitId === authoritativeState.onion.id
        ? authoritativeState.onion.status === 'destroyed'
        : (() => {
          const defender = authoritativeState.defenders[selectionOwnerUnitId]
          return defender?.status === 'destroyed' && defender.type !== 'Swamp'
        })()

    if (destroyedUnit) {
      return
    }

    const defaultSelection = clientSnapshot?.selectedUnitId
      ? resolveBattlefieldStackSelectionIds(clientSnapshot.authoritativeState ?? null, clientSnapshot.selectedUnitId)
      : []
    const baseSelection = selectedUnitIds ?? defaultSelection
    const preserveCombatSelection =
      clientSnapshotPhase === 'ONION_COMBAT' &&
      !additive &&
      selectionOwnerUnitId !== authoritativeState?.onion.id &&
      authoritativeState?.defenders[selectionOwnerUnitId] !== undefined &&
      baseSelection.some(isWeaponSelectionId)

    if (preserveCombatSelection) {
      debugLog('handleSelectUnit preserved combat selection', {
        unitId,
        clientSnapshotPhase,
        selectedUnitIds,
      })
      return
    }

    clearPendingCombatResolution(false)
    setPendingRamPrompt(null)

    debugLog('handleSelectUnit', {
      unitId,
      additive,
      clientSnapshotPhase,
      selectedUnitIds,
    })

    setSelectedUnitIds((currentSelection) => {
      const baseSelection = currentSelection ?? defaultSelection

      if (!additive) {
        const stackMemberIds = resolveBattlefieldStackSelectionIds(clientSnapshot?.authoritativeState ?? null, selectionOwnerUnitId)
        setHasExplicitSelection(true)
        return stackMemberIds
      }

      setHasExplicitSelection(true)
      if (baseSelection.includes(unitId)) {
        return baseSelection.filter((selectedId) => selectedId !== unitId)
      }

      return [...baseSelection, unitId]
    })
    setSelectedCombatTargetId(null)
    setActionError(null)
  }

  function handleDeselectUnit() {
    if (isSelectionLocked) {
      debugLog('handleDeselectUnit blocked', {
        isSelectionLocked,
      })
      return
    }

    clearPendingCombatResolution(false)
    debugLog('handleDeselectUnit', {
      clientSnapshotPhase,
      selectedUnitIds,
    })
    setSelectedUnitIds([])
    setHasExplicitSelection(true)
    setSelectedCombatTargetId(null)
    setPendingRamPrompt(null)
    setActionError(null)
  }

  async function handleMoveUnit(unitId: string, to: { q: number; r: number }) {
    if (!isControlledSession || activeSessionController === null) {
      debugLog('handleMoveUnit skipped', {
        unitId,
        to,
        isControlledSession,
        hasController: activeSessionController !== null,
      })
      return
    }

    if (!activeTurnActive || isInteractionLocked) {
      debugLog('handleMoveUnit blocked', {
        unitId,
        to,
        activeTurnActive,
        isInteractionLocked,
      })
      return
    }

    const ramPrompt = buildRamPrompt(clientSnapshot, unitId, to)
    if (ramPrompt !== null) {
      debugLog('handleMoveUnit ram prompt', {
        unitId,
        to,
        targetLabel: ramPrompt.targetLabel,
      })
      setPendingRamPrompt(ramPrompt)
      return
    }

    setActionError(null)
    const defaultSelection = clientSnapshot?.selectedUnitId
      ? resolveBattlefieldStackSelectionIds(clientSnapshot.authoritativeState ?? null, clientSnapshot.selectedUnitId)
      : []
    const selectedBoardUnitIds = buildSelectedBoardUnitIds(selectedUnitIds, defaultSelection)
    const stackSubmission = buildRightRailStackSubmissionAction({
      kind: 'move',
      state: clientSnapshot?.authoritativeState ?? null,
      anchorUnitId: unitId,
      selectedUnitIds: selectedBoardUnitIds,
      to,
    })

    if (!stackSubmission.ok && stackSubmission.reason === 'empty-selection') {
      setActionError('Select at least one stack member before submitting the move.')
      debugLog('handleMoveUnit blocked', {
        unitId,
        to,
        reason: stackSubmission.reason,
        selectedBoardUnitIds,
      })
      return
    }

    const stackSelection = stackSubmission.ok ? stackSubmission.action.selection : buildClientStackSelection(clientSnapshot?.authoritativeState ?? null, unitId, selectedBoardUnitIds)
    await commitClientAction(
      stackSelection === null
        ? { type: 'MOVE', unitId, to }
        : { type: 'MOVE_STACK', selection: stackSelection, to },
    )
    setSelectedUnitIds([])
    setHasExplicitSelection(true)
  }

  async function handleRefresh() {
    debugLog('handleRefresh start', {
      activeTurnActive,
      clientSnapshotPhase,
      isInteractionLocked,
      isRefreshing,
    })
    setIsRefreshing(true)
    if (activeSessionController !== null) {
      try {
        await activeSessionController.refresh()
        setLastRefreshAt(new Date())
        debugLog('handleRefresh success', {
          activeTurnActive,
          clientSnapshotPhase,
        })
      } catch (error) {
        debugLog('handleRefresh failure', {
          error,
          activeTurnActive,
          clientSnapshotPhase,
        })
        throw error
      } finally {
        setIsRefreshing(false)
      }
      return
    }

    setTimeout(() => {
      setLastRefreshAt(new Date())
      setIsRefreshing(false)
      debugLog('handleRefresh fallback complete', {
        activeTurnActive,
        clientSnapshotPhase,
      })
    }, 800)
  }

  return {
    actionError,
    combatBaseSnapshot,
    commitClientAction,
    handleDeselectUnit,
    handleDismissCombatResolution,
    handleDismissRamResolution,
    handleMoveUnit,
    handleResolveRamPrompt,
    handleRefresh,
    handleSelectUnit,
    isRefreshing,
    lastRefreshAt,
    pendingRamPrompt,
    pendingCombatResolution,
    pendingRamResolution,
    hasExplicitSelection,
    selectedCombatTargetId,
    selectedUnitIds,
    setActionError,
    setSelectedCombatTargetId,
    setSelectedUnitIds,
  }
}
