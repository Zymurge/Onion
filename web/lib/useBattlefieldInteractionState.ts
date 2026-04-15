import { useEffect, useState } from 'react'
import type { GameAction, GameSnapshot } from './gameClient'
import type { GameSessionController } from './gameSessionTypes'
import type { TurnPhase } from '../../shared/types/index'

type UseBattlefieldInteractionStateOptions = {
  activeSessionController: GameSessionController | null
  activeTurnActive: boolean
  clientSnapshot: GameSnapshot | null
  clientSnapshotPhase: TurnPhase | null
  isControlledSession: boolean
}

function isCombatSnapshotPhase(phase: TurnPhase | null): boolean {
  return phase === 'ONION_COMBAT' || phase === 'DEFENDER_COMBAT'
}

export function useBattlefieldInteractionState({
  activeSessionController,
  activeTurnActive,
  clientSnapshot,
  clientSnapshotPhase,
  isControlledSession,
}: UseBattlefieldInteractionStateOptions) {
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[] | null>(null)
  const [selectedCombatTargetId, setSelectedCombatTargetId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [, setPendingCombatSnapshot] = useState<GameSnapshot | null>(null)
  const [pendingCombatResolution, setPendingCombatResolution] = useState<GameSnapshot['combatResolution'] | null>(null)
  const [pendingRamResolution, setPendingRamResolution] = useState<GameSnapshot['ramResolution'] | null>(null)
  const [combatBaseSnapshot, setCombatBaseSnapshot] = useState<GameSnapshot | null>(null)
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

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
      return
    }

    try {
      const previousSnapshot = clientSnapshot
      const nextSnapshot = await activeSessionController.submitAction(action)
      setActionError(null)
      if (nextSnapshot?.combatResolution !== undefined) {
        setCombatBaseSnapshot(previousSnapshot)
        setPendingCombatSnapshot(nextSnapshot)
        setPendingCombatResolution(nextSnapshot.combatResolution)
      } else {
        clearPendingCombatResolution(false)
      }

      setPendingRamResolution(nextSnapshot?.ramResolution ?? null)
      if (nextSnapshot !== null && !isCombatSnapshotPhase(nextSnapshot.phase)) {
        setSelectedCombatTargetId(null)
      }
    } catch (error: unknown) {
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
      setSelectedCombatTargetId(null)
    }
  }

  function handleDismissCombatResolution() {
    clearPendingCombatResolution(true)
  }

  function handleDismissRamResolution() {
    setPendingRamResolution(null)
  }

  function handleSelectUnit(unitId: string, additive = false) {
    const authoritativeState = clientSnapshot?.authoritativeState
    const destroyedUnit = authoritativeState === undefined
      ? false
      : unitId === authoritativeState.onion.id
        ? authoritativeState.onion.status === 'destroyed'
        : authoritativeState.defenders[unitId]?.status === 'destroyed'

    if (destroyedUnit) {
      return
    }

    clearPendingCombatResolution(false)

    setSelectedUnitIds((currentSelection) => {
      const baseSelection = currentSelection ?? (clientSnapshot?.selectedUnitId ? [clientSnapshot.selectedUnitId] : [])

      if (!additive) {
        return [unitId]
      }

      if (baseSelection.includes(unitId)) {
        return baseSelection.filter((selectedId) => selectedId !== unitId)
      }

      return [...baseSelection, unitId]
    })
    setSelectedCombatTargetId(null)
    setActionError(null)
  }

  function handleDeselectUnit() {
    clearPendingCombatResolution(false)
    setSelectedUnitIds([])
    setSelectedCombatTargetId(null)
    setActionError(null)
  }

  async function handleMoveUnit(unitId: string, to: { q: number; r: number }) {
    if (!isControlledSession || activeSessionController === null) {
      return
    }

    if (!activeTurnActive) {
      return
    }

    setActionError(null)
    await commitClientAction({ type: 'MOVE', unitId, to })
    setSelectedUnitIds([])
  }

  async function handleRefresh() {
    setIsRefreshing(true)
    if (activeSessionController !== null) {
      try {
        await activeSessionController.refresh()
        setLastRefreshAt(new Date())
      } finally {
        setIsRefreshing(false)
      }
      return
    }

    setTimeout(() => {
      setLastRefreshAt(new Date())
      setIsRefreshing(false)
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
    handleRefresh,
    handleSelectUnit,
    isRefreshing,
    lastRefreshAt,
    pendingCombatResolution,
    pendingRamResolution,
    selectedCombatTargetId,
    selectedUnitIds,
    setActionError,
    setSelectedCombatTargetId,
    setSelectedUnitIds,
  }
}
