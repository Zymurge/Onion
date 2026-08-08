import { useEffect, useRef, useState } from 'react'
import { findMovePath, type MoveMapSnapshot } from '../../shared/movePlanner'
import { getUnitMovementAllowance } from '../../shared/unitMovement'
import type { GameAction, ServerGameSnapshot } from './gameClient'
import type { GameSessionController } from './gameSessionTypes'
import { getAuthoritativeOnion, isWeaponSelectionId, resolveBattlefieldStackSelectionIds, resolveSelectionOwnerUnitId } from './appViewHelpers'
import { buildMoveCommitAction } from './commitActionBuilders'
import { clearRightRailStackSelection, selectRightRailStackMembers, toggleRightRailStackMemberSelection } from './rightRailSelection'
import type { TurnPhase } from '../../shared/types/index'
import type { Mode } from './battlefieldView'
import { isSessionUnitTypeStackable, type SessionCatalog } from './sessionCatalog'
import logger from './logger'

type UseBattlefieldInteractionStateOptions = {
  activeSessionController: GameSessionController | null
  activeTurnActive: boolean
  clientSnapshot: ServerGameSnapshot | null
  clientSnapshotPhase: TurnPhase | null
  catalog: SessionCatalog | null
  isControlledSession: boolean
  isInteractionLocked: boolean
  isSelectionLocked: boolean
}

type RamPrompt = {
  unitId: string
  to: { q: number; r: number }
  targetLabel: string
}

function summarizeStackState(
  state: ServerGameSnapshot['authoritativeState'] | null | undefined,
  unitId: string,
  phase: TurnPhase | null = null,
  catalog?: SessionCatalog,
): string {
  if (state === null || state === undefined) {
    return `unitId=${unitId}, phase=${phase ?? 'unknown'}, snapshot=missing`
  }

  const stackableDefenderIds = Object.values(state.defenders)
    .filter((defender) => catalog !== undefined && isSessionUnitTypeStackable(catalog, defender.typeId))
    .map((defender) => defender.unitId)
  const stackRosterGroupKeys = Object.keys(state.stackRoster?.groupsById ?? {})

  return `unitId=${unitId}, phase=${phase ?? 'unknown'}, stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=${stackRosterGroupKeys.join(', ') || 'none'}`
}

export type BattlefieldInteractionState = {
  selectedUnitIds: string[] | null
  hasExplicitSelection: boolean
  selectedCombatTargetId: string | null
  activeMode: Mode
  actionError: string | null
  combatBaseSnapshot: ServerGameSnapshot | null
  pendingCombatResolution: ServerGameSnapshot['combatResolution'] | null
  pendingRamResolution: ServerGameSnapshot['ramResolution'] | null
  pendingRamPrompt: RamPrompt | null
  lastRefreshAt: Date | null
  isRefreshing: boolean
}

function isCombatSnapshotPhase(phase: TurnPhase | null): boolean {
  return phase === 'ONION_COMBAT' || phase === 'DEFENDER_COMBAT'
}

function buildMoveMapSnapshot(snapshot: ServerGameSnapshot, movingUnitId: string): MoveMapSnapshot | null {
  const authoritativeState = snapshot.authoritativeState
  const scenarioMap = snapshot.scenarioMap

  if (authoritativeState === undefined || scenarioMap === undefined) {
    return null
  }

  const occupiedHexes: NonNullable<MoveMapSnapshot['occupiedHexes']> = [
    ...Object.values(authoritativeState.onions)
      .filter((unit) => unit.unitId !== movingUnitId && unit.state !== 'destroyed')
      .map((unit) => ({ q: unit.position.q, r: unit.position.r, role: 'onion' as const, unitType: unit.typeId, squads: 1 })),
    ...Object.values(authoritativeState.defenders)
      .filter((unit) => unit.unitId !== movingUnitId && unit.state !== 'destroyed')
      .map((unit) => ({ q: unit.position.q, r: unit.position.r, role: 'defender' as const, unitType: unit.typeId, squads: (unit as typeof unit & { squads?: number }).squads })),
  ]

  return {
    width: scenarioMap.width,
    height: scenarioMap.height,
    cells: scenarioMap.cells,
    hexes: scenarioMap.hexes,
    occupiedHexes,
  }
}

function buildRamPrompt(snapshot: ServerGameSnapshot | null, unitId: string, to: { q: number; r: number }): RamPrompt | null {
  if (snapshot === null || snapshot.authoritativeState === undefined || snapshot.scenarioMap === undefined) {
    return null
  }

  if (snapshot.phase !== 'ONION_MOVE') {
    return null
  }

  const onion = snapshot.authoritativeState.onions[unitId] ?? getAuthoritativeOnion(snapshot.authoritativeState)
  if (unitId !== onion.unitId || onion.state !== 'operational') {
    return null
  }

  if (onion.ramsRemaining === 0) {
    return null
  }

  const movementAllowance = snapshot.movementRemainingByUnit?.[unitId] ?? getUnitMovementAllowance(onion.typeId, snapshot.phase, onion.treads)
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
    movingUnitType: onion.typeId,
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

  const targetDefender = Object.values(snapshot.authoritativeState.defenders).find((unit) => unit.position.q === rammedStep.q && unit.position.r === rammedStep.r && unit.state !== 'destroyed')
  const targetLabel = targetDefender?.typeId ?? 'occupied hex'

  return {
    unitId,
    to,
    targetLabel,
  }
}

function buildSelectedBoardUnitIds(selectedUnitIds: string[] | null): string[] {
  return (selectedUnitIds ?? []).filter((selectionId) => !isWeaponSelectionId(selectionId))
}

function isSelectionPresentInSnapshot(selectionId: string, snapshot: ServerGameSnapshot): boolean {
  const state = snapshot.authoritativeState
  if (state === undefined) {
    return false
  }

  if (isWeaponSelectionId(selectionId)) {
    const weaponId = selectionId.replace(/^weapon:/, '')
    return Object.values(state.onions).some((onion) => onion.weapons.some((weapon) => weapon.id === weaponId))
  }

  const unitId = resolveSelectionOwnerUnitId(selectionId)
  return state.onions[unitId] !== undefined || state.defenders[unitId] !== undefined
}

function getSnapshotSelectionKey(snapshot: ServerGameSnapshot): string {
  const state = snapshot.authoritativeState
  if (state === undefined) {
    return `${snapshot.phase}:${snapshot.lastEventSeq}:missing`
  }

  const defenderIds = Object.keys(state.defenders).sort().join(',')
  const weaponIds = Object.values(state.onions)
    .flatMap((onion) => onion.weapons.map((weapon) => weapon.id))
    .sort()
    .join(',')
  return `${snapshot.phase}:${snapshot.lastEventSeq}:${defenderIds}:${weaponIds}`
}

export function useBattlefieldInteractionState({
  activeSessionController,
  activeTurnActive,
  clientSnapshot,
  clientSnapshotPhase,
  catalog,
  isControlledSession,
  isInteractionLocked,
  isSelectionLocked,
}: UseBattlefieldInteractionStateOptions) {
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[] | null>(null)
  const [hasExplicitSelection, setHasExplicitSelection] = useState(false)
  const [selectedCombatTargetId, setSelectedCombatTargetId] = useState<string | null>(null)
  const [activeMode, setActiveMode] = useState<Mode>('fire')
  const [actionError, setActionError] = useState<string | null>(null)
  const [, setPendingCombatSnapshot] = useState<ServerGameSnapshot | null>(null)
  const [pendingCombatResolution, setPendingCombatResolution] = useState<ServerGameSnapshot['combatResolution'] | null>(null)
  const [pendingRamResolution, setPendingRamResolution] = useState<ServerGameSnapshot['ramResolution'] | null>(null)
  const [combatBaseSnapshot, setCombatBaseSnapshot] = useState<ServerGameSnapshot | null>(null)

  const [pendingRamPrompt, setPendingRamPrompt] = useState<RamPrompt | null>(null)
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const previousSnapshotPhaseRef = useRef(clientSnapshotPhase)
  const previousSnapshotSelectionKeyRef = useRef(clientSnapshot === null ? null : getSnapshotSelectionKey(clientSnapshot))

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

  useEffect(() => {
    if (previousSnapshotPhaseRef.current !== clientSnapshotPhase) {
      setSelectedUnitIds([])
      setHasExplicitSelection(true)
      setSelectedCombatTargetId(null)
    }
    previousSnapshotPhaseRef.current = clientSnapshotPhase
  }, [clientSnapshotPhase])

  useEffect(() => {
    if (clientSnapshot === null) {
      return
    }

    const snapshotSelectionKey = getSnapshotSelectionKey(clientSnapshot)
    if (previousSnapshotSelectionKeyRef.current === snapshotSelectionKey) {
      return
    }
    previousSnapshotSelectionKeyRef.current = snapshotSelectionKey

    setSelectedUnitIds((currentSelection) => {
      if (currentSelection === null) {
        return currentSelection
      }

      const nextSelection = currentSelection.filter((selectionId) => isSelectionPresentInSnapshot(selectionId, clientSnapshot))
      return nextSelection.length === currentSelection.length ? currentSelection : nextSelection
    })
  }, [clientSnapshot])

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

      setPendingRamResolution(nextSnapshot?.ramResolution ?? null)
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

    const moveAction = buildMoveCommitAction({
      state: {
        ...clientSnapshot?.authoritativeState,
        catalog: catalog ?? undefined,
      } as Parameters<typeof buildMoveCommitAction>[0]['state'],
      unitId: prompt.unitId,
      selectedUnitIds: selectedUnitIds ?? [],
      to: prompt.to,
      attemptRam,
    })

    if (!moveAction.ok) {
      const diagnosticSuffix = summarizeStackState(clientSnapshot?.authoritativeState, prompt.unitId, clientSnapshotPhase, catalog ?? undefined)
      setActionError(
        moveAction.reason === 'snapshot-missing-stack-selection'
          ? `Loaded game snapshot is missing canonical stackRoster data for the selected unit (${diagnosticSuffix}).`
          : 'Select at least one stack member before submitting the move.',
      )
      return
    }

    void commitClientAction(moveAction.action)
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
    const authoritativeOnion = authoritativeState === undefined ? null : authoritativeState.onions[selectionOwnerUnitId]
    const destroyedUnit = authoritativeState === undefined
      ? false
      : authoritativeOnion?.unitId === selectionOwnerUnitId
        ? authoritativeOnion.state === 'destroyed'
        : (() => {
          const defender = authoritativeState.defenders[selectionOwnerUnitId]
          return defender?.state === 'destroyed' && defender.typeId !== 'Swamp'
        })()

    if (destroyedUnit) {
      return
    }

    const baseSelection = selectedUnitIds ?? []
    const preserveCombatSelection =
      clientSnapshotPhase === 'ONION_COMBAT' &&
      !additive &&
      authoritativeOnion?.unitId !== selectionOwnerUnitId &&
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

    let nextStackSelection: string[] | null = null
    if (!additive) {
      try {
        nextStackSelection = resolveBattlefieldStackSelectionIds(
          clientSnapshot?.authoritativeState as Parameters<typeof resolveBattlefieldStackSelectionIds>[0],
          selectionOwnerUnitId,
          catalog ?? undefined,
        )
      } catch (error) {
        debugLog('handleSelectUnit selection resolution failed', {
          unitId,
          selectionOwnerUnitId,
          additive,
          error,
        })

        const errorMessage = error instanceof Error ? error.message : 'Failed to resolve stack selection.'
        const diagnosticSuffix = summarizeStackState(clientSnapshot?.authoritativeState, selectionOwnerUnitId, clientSnapshotPhase, catalog ?? undefined)
        setActionError(`${errorMessage} (${diagnosticSuffix})`)
        return
      }
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
      const baseSelection = currentSelection ?? []

      if (!additive) {
        setHasExplicitSelection(true)
        return nextStackSelection ?? [selectionOwnerUnitId]
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

  function handleSelectStackMember(unitId: string, stackMemberIds: readonly string[]) {
    if (isSelectionLocked) {
      debugLog('handleSelectStackMember blocked', {
        unitId,
        isSelectionLocked,
      })
      return
    }

    clearPendingCombatResolution(false)
    setPendingRamPrompt(null)
    setSelectedCombatTargetId(null)
    setActionError(null)

    setSelectedUnitIds((currentSelection) =>
      toggleRightRailStackMemberSelection(currentSelection, stackMemberIds, unitId),
    )
    setHasExplicitSelection(true)
  }

  function handleSelectAllStackMembers(stackMemberIds: readonly string[]) {
    if (isSelectionLocked) {
      debugLog('handleSelectAllStackMembers blocked', {
        isSelectionLocked,
        stackMemberIds,
      })
      return
    }

    clearPendingCombatResolution(false)
    setPendingRamPrompt(null)
    setSelectedCombatTargetId(null)
    setActionError(null)

    setSelectedUnitIds(selectRightRailStackMembers(stackMemberIds))
    setHasExplicitSelection(true)
  }

  function handleClearStackSelection() {
    if (isSelectionLocked) {
      debugLog('handleClearStackSelection blocked', {
        isSelectionLocked,
      })
      return
    }

    clearPendingCombatResolution(false)
    setPendingRamPrompt(null)
    setSelectedCombatTargetId(null)
    setActionError(null)

    setSelectedUnitIds(clearRightRailStackSelection())
    setHasExplicitSelection(true)
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
    const moveAction = buildMoveCommitAction({
      state: {
        ...clientSnapshot?.authoritativeState,
        catalog: catalog ?? undefined,
      } as Parameters<typeof buildMoveCommitAction>[0]['state'],
      unitId,
      selectedUnitIds: selectedUnitIds ?? [],
      to,
    })

    if (!moveAction.ok) {
      setActionError('Select at least one stack member before submitting the move.')
      debugLog('handleMoveUnit blocked', {
        unitId,
        to,
        reason: moveAction.reason,
        selectedBoardUnitIds: buildSelectedBoardUnitIds(selectedUnitIds),
      })
      return
    }

    await commitClientAction(moveAction.action)
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

  const interactionState: BattlefieldInteractionState = {
    selectedUnitIds,
    hasExplicitSelection,
    selectedCombatTargetId,
    activeMode,
    actionError,
    combatBaseSnapshot,
    pendingCombatResolution,
    pendingRamResolution,
    pendingRamPrompt,
    lastRefreshAt,
    isRefreshing,
  }

  return {
    interactionState,
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
    handleSelectStackMember,
    handleSelectAllStackMembers,
    handleClearStackSelection,
    isRefreshing,
    lastRefreshAt,
    pendingRamPrompt,
    pendingCombatResolution,
    pendingRamResolution,
    hasExplicitSelection,
    activeMode,
    selectedCombatTargetId,
    selectedUnitIds,
    setActiveMode,
    setActionError,
    setSelectedCombatTargetId,
    setSelectedUnitIds,
  }
}
