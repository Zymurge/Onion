import { useMemo } from 'react'
import type { GameSnapshot } from './gameClient'
import {
  buildCombatRangeSources,
  buildLiveDefenders,
  buildLiveOnion,
  buildScenarioMap,
  formatLiveConnectionStatus,
  getPhaseAdvanceLabel,
  getPhaseOwner,
  isWeaponSelectionId,
  parseAttackStats,
  parseRangeValue,
  parseWeaponStats,
  stripWeaponSelectionId,
} from './appViewHelpers'
import { buildCombatRangeHexKeys } from './combatRange'
import { buildCombatTargetOptions } from './combatPreview'
import type { GameSessionViewState } from './gameSessionTypes'
import type { SessionBinding } from './sessionBinding'
import type { Mode } from './battlefieldView'
import type { TurnPhase } from '../../shared/types/index'

type UseBattlefieldDisplayStateOptions = {
  combatBaseSnapshot: GameSnapshot | null
  lastRefreshAt: Date | null
  selectedCombatTargetId: string | null
  selectedUnitIds: string[] | null
  sessionState: GameSessionViewState
  activeSessionBinding: SessionBinding | null
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
    const selectedSnapshotUnitId = clientSnapshot?.selectedUnitId ?? null
    const activeSelectedUnitIds = selectedUnitIds ?? (selectedSnapshotUnitId ? [selectedSnapshotUnitId] : [])
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
    const activeMode: Mode = clientSnapshot?.mode ?? 'fire'
    const isCombatPhase = activePhase === 'ONION_COMBAT' || activePhase === 'DEFENDER_COMBAT'
    const activeCombatRole: 'onion' | 'defender' | null = activePhase === null ? null : activePhase.startsWith('ONION_') ? 'onion' : activePhase.startsWith('DEFENDER_') ? 'defender' : null
    const isMovementPhase = activePhase === 'ONION_MOVE' || activePhase === 'DEFENDER_MOVE' || activePhase === 'GEV_SECOND_MOVE'
    const displayedScenarioMap = buildScenarioMap(clientSnapshot)
    const selectedCombatAttackerIds = !isCombatPhase
      ? []
      : activeCombatRole === 'onion'
        ? activeSelectedUnitIds.filter(isWeaponSelectionId).map(stripWeaponSelectionId)
        : [...activeSelectedUnitIds]

    const authoritativeState = clientSnapshot?.authoritativeState ?? null
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
    const selectedCombatAttackStrength = !isCombatPhase
      ? 0
      : activeCombatRole === 'onion'
        ? (displayedOnion?.weaponDetails ?? [])
          .filter((weapon) => weapon.status === 'ready' && selectedCombatAttackerIds.includes(weapon.id))
          .reduce((total, weapon) => total + weapon.attack, 0)
        : displayedDefenders
          .filter((unit) => activeSelectedUnitIds.includes(unit.id))
          .reduce((total, unit) => total + parseRangeValue(parseAttackStats(unit.attack).damage), 0)
    const selectedCombatAttackLabel = selectedCombatAttackStrength > 0 ? `Attack ${selectedCombatAttackStrength}` : 'Attack 0'
    const selectedCombatAttackCount = selectedCombatAttackerIds.length
    const selectedInspectorUnitId = activeSelectedUnitIds.find((selectionId) => !isWeaponSelectionId(selectionId)) ?? null
    const selectedInspectorOnion = selectedInspectorUnitId !== null && selectedInspectorUnitId === displayedOnion?.id ? displayedOnion : null
    const selectedInspectorDefender =
      selectedInspectorOnion !== null || selectedInspectorUnitId === null
        ? null
        : displayedDefenders.find((unit) => unit.id === selectedInspectorUnitId) ?? null
    const combatRangeHexKeys = !isCombatPhase || displayedScenarioMap === null
      ? new Set<string>()
      : buildCombatRangeHexKeys(
        buildCombatRangeSources(activePhase, activeCombatRole, activeSelectedUnitIds, displayedDefenders, displayedOnion),
        displayedScenarioMap,
      )
    const combatTargetOptions = buildCombatTargetOptions({
      activeCombatRole,
      combatRangeHexKeys,
      displayedDefenders,
      displayedOnion,
      selectedUnitIds: activeSelectedUnitIds,
      selectedAttackStrength: selectedCombatAttackStrength,
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
      activeSelectedUnitIds,
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
      selectedCombatAttackerIds,
      selectedCombatAttackCount,
      selectedCombatAttackLabel,
      selectedCombatAttackStrength,
      selectedCombatTarget,
      selectedCombatTargetIdForRender,
      selectedInspectorDefender,
      selectedInspectorOnion,
      selectedInspectorUnitId,
      shellPhase,
    }
  }, [
    activeSessionBinding,
    combatBaseSnapshot,
    lastRefreshAt,
    selectedCombatTargetId,
    selectedUnitIds,
    sessionState,
  ])
}
