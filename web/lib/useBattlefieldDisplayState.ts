import { useMemo } from 'react'
import type { GameSnapshot } from './gameClient'
import {
  buildCombatRangeSources,
  buildLiveDefenders,
  buildLiveOnion,
  buildScenarioMap,
  countSelectedBattlefieldStackMembers,
  countSelectedBattlefieldStackGroups,
  formatLiveConnectionStatus,
  getPhaseAdvanceLabel,
  getPhaseOwner,
  isWeaponSelectionId,
  isBattlefieldUnitCombatReady,
  parseAttackStats,
  parseRangeValue,
  parseWeaponStats,
  resolveBattlefieldStackMemberIds,
  normalizeSelectionIds,
  resolveSelectionOwnerUnitId,
  stripWeaponSelectionId,
} from './appViewHelpers'
import { buildCombatRangeHexKeys } from './combatRange'
import { buildCombatTargetOptions } from './combatPreview'
import { buildRightRailStackSelectionViewModel } from './rightRailSelection'
import type { GameSessionViewState } from './gameSessionTypes'
import type { SessionBinding } from './sessionBinding'
import type { Mode } from './battlefieldView'
import type { TurnPhase } from '../../shared/types/index'

type UseBattlefieldDisplayStateOptions = {
  combatBaseSnapshot: GameSnapshot | null
  activeMode: Mode
  lastRefreshAt: Date | null
  selectedCombatTargetId: string | null
  selectedUnitIds: string[] | null
  sessionState: GameSessionViewState
  activeSessionBinding: SessionBinding | null
}

type RightRailStackPanelViewModel = {
  isVisible: boolean
  selectedStackMembers: ReturnType<typeof buildRightRailStackSelectionViewModel>['selectedStackMembers']
  selectedStackMemberIds: ReturnType<typeof buildRightRailStackSelectionViewModel>['memberUnitIds']
  selectedStackSelectionCount: number
  selectedStackSelectionIds: string[]
}

const turnPhaseLabels: Record<TurnPhase, string> = {
  ONION_MOVE: 'Onion Movement',
  ONION_COMBAT: 'Onion Combat',
  DEFENDER_RECOVERY: 'Defender Recovery',
  DEFENDER_MOVE: 'Defender Movement',
  DEFENDER_COMBAT: 'Defender Combat',
  GEV_SECOND_MOVE: 'GEV Second Move',
}

export function useBattlefieldDisplayState({
  combatBaseSnapshot,
  activeMode,
  lastRefreshAt,
  selectedCombatTargetId,
  selectedUnitIds,
  sessionState,
  activeSessionBinding,
}: UseBattlefieldDisplayStateOptions) {
  return useMemo(() => {
    const clientSnapshot = combatBaseSnapshot ?? sessionState.snapshot
    const clientSession = sessionState.session
    const activeGameIdProp = activeSessionBinding?.gameId
    const activePhase = clientSnapshot?.phase ?? null
    const authoritativeState = clientSnapshot?.authoritativeState ?? null
    const selectedBoardUnitId = (() => {
      const selectionId = selectedUnitIds?.find((candidateSelectionId) => !isWeaponSelectionId(candidateSelectionId)) ?? null
      return selectionId === null ? null : resolveSelectionOwnerUnitId(selectionId)
    })()
    const selectedStackUnitIds = selectedBoardUnitId === null ? [] : resolveBattlefieldStackMemberIds(authoritativeState, selectedBoardUnitId)
    const activeSelectedUnitIds = selectedUnitIds ?? []
    const headerHasSnapshot = clientSnapshot !== null
    const activeTurnNumber = clientSnapshot?.turnNumber ?? null
    const activeScenarioName = clientSnapshot?.scenarioName ?? null
    const activeRole = clientSession?.role ?? null
    const activeGameId = clientSnapshot?.gameId ?? activeGameIdProp ?? null
    const activePhaseOwner = getPhaseOwner(activePhase)
    const activeTurnActive = headerHasSnapshot && activeRole !== null && activePhaseOwner === activeRole
    const phaseAdvanceLabel = getPhaseAdvanceLabel(activePhase, activeRole)
    const shellPhase = activePhase ?? 'DEFENDER_MOVE'
    const activePhaseLabel = activePhase === null ? 'WAITING' : turnPhaseLabels[activePhase]
    const isCombatPhase = activePhase === 'ONION_COMBAT' || activePhase === 'DEFENDER_COMBAT'
    const activeCombatRole: 'onion' | 'defender' | null = activePhase === null ? null : activePhase.startsWith('ONION_') ? 'onion' : activePhase.startsWith('DEFENDER_') ? 'defender' : null
    const isMovementPhase = activePhase === 'ONION_MOVE' || activePhase === 'DEFENDER_MOVE' || activePhase === 'GEV_SECOND_MOVE'
    const displayedScenarioMap = buildScenarioMap(clientSnapshot)
    const victoryObjectives = clientSnapshot?.victoryObjectives ?? []
    const escapeHexes = clientSnapshot?.escapeHexes ?? []

    const scenarioMapSnapshot = clientSnapshot === null ? null : buildScenarioMap(clientSnapshot)
    const movementRemainingSnapshot = clientSnapshot?.movementRemainingByUnit ?? null
    const displayedDefenders = authoritativeState === null ? [] : buildLiveDefenders({
      authoritativeState,
      scenarioMap: scenarioMapSnapshot,
      movementRemainingByUnit: movementRemainingSnapshot,
    } as GameSnapshot, activePhase, activeTurnActive)
    const displayedOnion = clientSnapshot === null ? null : buildLiveOnion(clientSnapshot, activePhase)
    const onionWeapons = parseWeaponStats(displayedOnion?.weapons ?? '')
    const readyWeaponDetails = displayedOnion?.weaponDetails?.filter((weapon) => weapon.status === 'ready') ?? []
    const readyDefenderUnitIds = new Set(
      displayedDefenders
        .filter(isBattlefieldUnitCombatReady)
        .map((unit) => unit.id),
    )
    const selectedCombatOwnerUnitIds = activeSelectedUnitIds.map(resolveSelectionOwnerUnitId)
    const selectedCombatSelectionIds = !isCombatPhase
      ? []
      : activeCombatRole === 'defender'
        ? normalizeSelectionIds(selectedCombatOwnerUnitIds, Array.from(readyDefenderUnitIds))
        : activeSelectedUnitIds
    const selectedCombatAttackerIds = !isCombatPhase
      ? []
      : activeCombatRole === 'onion'
        ? selectedCombatSelectionIds.filter(isWeaponSelectionId).map(stripWeaponSelectionId)
        : [...selectedCombatSelectionIds]
    const selectedCombatAttackStrength = !isCombatPhase
      ? 0
      : activeCombatRole === 'onion'
        ? (displayedOnion?.weaponDetails ?? [])
          .filter((weapon) => weapon.status === 'ready' && selectedCombatAttackerIds.includes(weapon.id))
          .reduce((total, weapon) => total + weapon.attack, 0)
        : displayedDefenders
          .filter(isBattlefieldUnitCombatReady)
          .reduce(
            (total, unit) => total + (parseRangeValue(parseAttackStats(unit.attack).damage) * countSelectedBattlefieldStackMembers(authoritativeState, unit.id, selectedCombatSelectionIds)),
            0,
          )
    const selectedCombatAttackGroupCount = !isCombatPhase
      ? 0
      : activeCombatRole === 'defender'
        ? countSelectedBattlefieldStackGroups(authoritativeState, selectedCombatSelectionIds)
        : selectedCombatAttackerIds.length > 0 ? 1 : 0
    const selectedCombatAttackLabel = selectedCombatAttackStrength > 0 ? `Attack ${selectedCombatAttackStrength}` : 'Attack 0'
    const selectedCombatAttackCount = selectedCombatAttackerIds.length
    const selectedInspectorUnitId = (() => {
      const selectionSourceIds = activeCombatRole === 'defender' && isCombatPhase ? selectedCombatSelectionIds : activeSelectedUnitIds
      const selectionId = selectionSourceIds.find((candidateSelectionId) => !isWeaponSelectionId(candidateSelectionId)) ?? null
      return selectionId === null ? null : resolveSelectionOwnerUnitId(selectionId)
    })()
    const selectedInspectorOnion = selectedInspectorUnitId !== null && selectedInspectorUnitId === displayedOnion?.id ? displayedOnion : null
    const rightRailStackSelection = buildRightRailStackSelectionViewModel({
      state: authoritativeState,
      inspectedUnitId: selectedInspectorUnitId,
      selectedStackUnitIds,
      activeSelectedUnitIds: selectedCombatSelectionIds,
      displayedDefenders,
      displayedOnion,
    })
    const rightRailStackPanel: RightRailStackPanelViewModel = {
      isVisible: rightRailStackSelection.selectedStackMembers.length > 1 && !(isCombatPhase && activeCombatRole === 'defender'),
      selectedStackMembers: rightRailStackSelection.selectedStackMembers,
      selectedStackMemberIds: rightRailStackSelection.memberUnitIds,
      selectedStackSelectionCount: selectedCombatSelectionIds.length,
      selectedStackSelectionIds: selectedCombatSelectionIds,
    }
    const selectedInspectorDefender =
      selectedInspectorOnion !== null ||
      selectedInspectorUnitId === null ||
      (isCombatPhase && activeCombatRole === 'defender')
        ? null
        : displayedDefenders.find((unit) => unit.id === selectedInspectorUnitId) ?? null
    const combatRangeHexKeys = !isCombatPhase || displayedScenarioMap === null
      ? new Set<string>()
      : buildCombatRangeHexKeys(
        buildCombatRangeSources(activePhase, activeCombatRole, activeCombatRole === 'defender' ? selectedCombatSelectionIds : activeSelectedUnitIds, displayedDefenders, displayedOnion),
        displayedScenarioMap,
      )
    const combatTargetOptions = buildCombatTargetOptions({
      activeCombatRole,
      combatRangeHexKeys,
      displayedDefenders,
      displayedOnion,
      selectedUnitIds: activeCombatRole === 'defender' ? selectedCombatSelectionIds : activeSelectedUnitIds,
      selectedAttackStrength: selectedCombatAttackStrength,
      selectedAttackGroupCount: selectedCombatAttackGroupCount,
      displayedScenarioMap,
    })
    const combatTargetIds = new Set(combatTargetOptions.map((target) => target.id))
    const selectedCombatTargetIdForRender = selectedCombatTargetId !== null && combatTargetIds.has(selectedCombatTargetId) ? selectedCombatTargetId : null
    const selectedCombatTarget = selectedCombatTargetIdForRender === null ? null : combatTargetOptions.find((target) => target.id === selectedCombatTargetIdForRender) ?? null
    const connectionStatus = sessionState.liveConnection
    const connectionLabel = formatLiveConnectionStatus(connectionStatus)
    const lastUpdatedAt = sessionState.lastUpdatedAt ?? lastRefreshAt

    return {
      activeCombatRole,
      activeGameId,
      activeMode,
      activePhase,
      activePhaseLabel,
      activeRole,
      activeScenarioName,
      activeSelectedUnitIds: activeCombatRole === 'defender' && isCombatPhase ? selectedCombatSelectionIds : activeSelectedUnitIds,
      activeTurnActive,
      activeTurnNumber,
      clientSession,
      clientSnapshot,
      combatRangeHexKeys,
      combatTargetIds,
      combatTargetOptions,
      connectionLabel,
      connectionStatus,
      displayedDefenders,
      displayedOnion,
      displayedScenarioMap,
      headerHasSnapshot,
      isCombatPhase,
      isMovementPhase,
      lastUpdatedAt,
      onionWeapons,
      phaseAdvanceLabel,
      readyWeaponDetails,
      victoryObjectives,
      escapeHexes,
      selectedCombatAttackerIds,
      selectedCombatAttackCount,
      selectedCombatAttackGroupCount,
      selectedCombatAttackLabel,
      selectedCombatAttackStrength,
      selectedCombatTarget,
      selectedCombatTargetIdForRender,
      selectedInspectorDefender,
      selectedInspectorOnion,
      selectedInspectorUnitId,
      rightRailStackPanel,
      selectedStackUnitIds,
      shellPhase,
    }
  }, [
    activeSessionBinding,
    activeMode,
    combatBaseSnapshot,
    lastRefreshAt,
    selectedCombatTargetId,
    selectedUnitIds,
    sessionState,
  ])
}
