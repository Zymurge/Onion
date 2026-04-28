import { useMemo } from 'react'
import type { ServerGameSnapshot } from './gameClient'
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
  resolveSelectionOwnerUnitId,
  stripWeaponSelectionId,
} from './appViewHelpers'
import { buildCombatRangeHexKeys } from './combatRange'
import { buildCombatTargetOptions } from './combatPreview'
import { buildRightRailStackSelectionViewModel } from './rightRailSelection'
import type { GameSessionViewState } from './gameSessionTypes'
import type { SessionBinding } from './sessionBinding'
import type { GameState, TurnPhase } from '../../shared/types/index'
import { getAllUnitDefinitions } from '../../shared/unitDefinitions'
import { validateStackRosterConsistency } from '../../shared/stackRoster'
import type { BattlefieldInteractionState } from './useBattlefieldInteractionState'
type StackSourceState = Parameters<typeof resolveBattlefieldStackMemberIds>[0]

const UNIT_DEFINITIONS = getAllUnitDefinitions()

type UseBattlefieldDisplayStateOptions = {
  combatBaseSnapshot: ServerGameSnapshot | null
  interactionState: BattlefieldInteractionState
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

function hasImplicitStackedDefenders(authoritativeState: GameState): boolean {
  const stackableUnitCountsByPosition = new Map<string, number>()

  for (const defender of Object.values(authoritativeState.defenders)) {
    const maxStacks = UNIT_DEFINITIONS[defender.type as keyof typeof UNIT_DEFINITIONS]?.abilities.maxStacks ?? 1
    if (maxStacks <= 1) {
      continue
    }

    if ((defender.squads ?? 1) > 1) {
      return true
    }

    const groupKey = `${defender.type}:${defender.position.q},${defender.position.r}`
    const nextCount = (stackableUnitCountsByPosition.get(groupKey) ?? 0) + 1
    stackableUnitCountsByPosition.set(groupKey, nextCount)
    if (nextCount > 1) {
      return true
    }
  }

  return false
}

function assertCanonicalStackProjection(authoritativeState: GameState): { error: string | null } {
  const stackRoster = authoritativeState.stackRoster
  if (hasImplicitStackedDefenders(authoritativeState) && stackRoster === undefined) {
    return { error: 'Loaded game snapshot is missing canonical stackRoster data for stacked defenders' }
  }
  const consistencyIssues = validateStackRosterConsistency(authoritativeState.defenders, stackRoster)
  if (consistencyIssues.length > 0) {
    return { error: `Loaded game snapshot has invalid stack roster: ${consistencyIssues.map((issue) => issue.message).join('; ')}` }
  }
  return { error: null }
}

export function useBattlefieldDisplayState({
  combatBaseSnapshot,
  interactionState,
  sessionState,
  activeSessionBinding,
}: UseBattlefieldDisplayStateOptions) {
  return useMemo(() => {
    const clientSnapshot = combatBaseSnapshot ?? sessionState.snapshot
    const clientSession = sessionState.session
    const {
      activeMode,
      lastRefreshAt,
      selectedCombatTargetId,
      selectedUnitIds,
    } = interactionState
    const activeGameIdProp = activeSessionBinding?.gameId
    const activePhase = clientSnapshot?.phase ?? null
    const authoritativeState = clientSnapshot?.authoritativeState ?? null
    let error: string | null = null
    if (authoritativeState !== null) {
      const validation = assertCanonicalStackProjection(authoritativeState)
      if (validation.error !== null) {
        error = validation.error
      }
    }
    const selectedBoardUnitId = (() => {
      const selectionId = selectedUnitIds?.find((candidateSelectionId) => !isWeaponSelectionId(candidateSelectionId)) ?? null
      return selectionId === null ? null : resolveSelectionOwnerUnitId(selectionId)
    })()
    const stackSourceState = authoritativeState as StackSourceState | null
    const selectedStackUnitIds = selectedBoardUnitId === null ? [] : resolveBattlefieldStackMemberIds(stackSourceState, selectedBoardUnitId)
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
    } as ServerGameSnapshot, activePhase, activeTurnActive)
    const displayedOnion = clientSnapshot === null ? null : buildLiveOnion(clientSnapshot, activePhase)
    const onionWeapons = parseWeaponStats(displayedOnion?.weapons ?? '')
    const readyWeaponDetails = displayedOnion?.weaponDetails?.filter((weapon) => weapon.status === 'ready') ?? []
    const readyDefenderUnitIds = new Set(
      displayedDefenders
        .filter(isBattlefieldUnitCombatReady)
        .map((unit) => unit.id),
    )
    const selectedCombatSelectionIds = !isCombatPhase
      ? []
      : activeCombatRole === 'defender'
        ? Array.from(new Set(activeSelectedUnitIds.filter((selectionId) => readyDefenderUnitIds.has(resolveSelectionOwnerUnitId(selectionId)))))
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
            (total, unit) => total + (parseRangeValue(parseAttackStats(unit.attack).damage) * countSelectedBattlefieldStackMembers(stackSourceState, unit.id, selectedCombatSelectionIds)),
            0,
          )
    const selectedCombatAttackGroupCount = !isCombatPhase
      ? 0
      : activeCombatRole === 'defender'
        ? countSelectedBattlefieldStackGroups(stackSourceState, selectedCombatSelectionIds)
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
      state: stackSourceState,
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
      error,
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
    combatBaseSnapshot,
    interactionState,
    sessionState,
  ])
}
