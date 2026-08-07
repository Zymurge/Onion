import { useMemo } from 'react'
import type { ServerGameSnapshot } from './gameClient'
import {
  buildCombatRangeSources,
  buildWebStackSourceState,
  buildLiveDefenders,
  buildLiveOnions,
  buildScenarioMap,
  countSelectedBattlefieldStackGroups,
  formatLiveConnectionStatus,
  getBattlefieldWeaponAttack,
  getPhaseAdvanceLabel,
  getPhaseOwner,
  isWeaponSelectionId,
  isBattlefieldUnitCombatReady,
  parseAttackStats,
  parseRangeValue,
  parseWeaponStats,
  resolveBattlefieldStacksExpandable,
  resolveBattlefieldFriendlyName,
  resolveBattlefieldWeaponName,
  resolveBattlefieldStackMemberIds,
  resolveSelectionOwnerUnitId,
  stripWeaponSelectionId,
  isBattlefieldWeaponReady,
} from './appViewHelpers'
import { buildCombatRangeHexKeys } from './combatRange'
import { buildCombatTargetOptions } from './combatPreview'
import { buildRightRailStackSelectionViewModel } from './rightRailSelection'
import type { GameSessionViewState } from './gameSessionTypes'
import type { SessionBinding } from './sessionBinding'
import type { GameState, TurnPhase } from '../../shared/types/index'
import { isSessionUnitTypeStackable } from './sessionCatalog'
import { validateStackRosterConsistency } from '../../shared/stackRoster'
import type { BattlefieldInteractionState } from './useBattlefieldInteractionState'

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

function hasImplicitStackedDefenders(authoritativeState: GameState, catalog: GameSessionViewState['catalog']): boolean {
  const stackableUnitCountsByPosition = new Map<string, number>()

  for (const defender of Object.values(authoritativeState.defenders)) {
    if (catalog === null || catalog === undefined || !isSessionUnitTypeStackable(catalog, defender.typeId)) {
      continue
    }

    const groupKey = `${defender.typeId}:${defender.position.q},${defender.position.r}`
    const nextCount = (stackableUnitCountsByPosition.get(groupKey) ?? 0) + 1
    stackableUnitCountsByPosition.set(groupKey, nextCount)
    if (nextCount > 1) {
      return true
    }
  }

  return false
}

function assertCanonicalStackProjection(authoritativeState: GameState, catalog: GameSessionViewState['catalog']): { error: string | null } {
  const stackRoster = authoritativeState.stackRoster
  const stackableDefenderIds = Object.values(authoritativeState.defenders)
    .filter((defender) => catalog !== null && catalog !== undefined && isSessionUnitTypeStackable(catalog, defender.typeId))
    .map((defender) => defender.unitId)
  const stackRosterGroupKeys = Object.keys(stackRoster?.groupsById ?? {})
  if (hasImplicitStackedDefenders(authoritativeState, catalog) && stackRoster === undefined) {
    return {
      error: `Loaded game snapshot is missing canonical stackRoster data for stacked defenders (stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=${stackRosterGroupKeys.join(', ') || 'none'})`,
    }
  }

  if (stackRoster !== undefined) {
    if (stackRoster.groupsById === undefined || stackRoster.groupsById === null || typeof stackRoster.groupsById !== 'object') {
      return {
        error: `Loaded game snapshot is missing canonical stackRoster groupsById data (stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=none)`,
      }
    }
    for (const [groupId, group] of Object.entries(stackRoster.groupsById)) {
      if (!Array.isArray(group.unitIds)) {
        return {
          error: `Loaded game snapshot has invalid stack roster group shape for ${groupId} (stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=${Object.keys(stackRoster.groupsById).join(', ') || 'none'})`,
        }
      }
    }
  }

  const consistencyIssues = validateStackRosterConsistency(authoritativeState.defenders, stackRoster)
  if (consistencyIssues.length > 0) {
    return {
      error: `Loaded game snapshot has invalid stack roster: ${consistencyIssues.map((issue) => issue.message).join('; ')} (stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=${stackRosterGroupKeys.join(', ') || 'none'})`,
    }
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
    const catalog = sessionState.catalog
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
      const validation = assertCanonicalStackProjection(authoritativeState, catalog)
      if (validation.error !== null) {
        error = validation.error
      }
    }
    const hasValidationError = error !== null
    const selectedBoardUnitId = (() => {
      const selectionId = selectedUnitIds?.find((candidateSelectionId) => !isWeaponSelectionId(candidateSelectionId)) ?? null
      return selectionId === null ? null : resolveSelectionOwnerUnitId(selectionId)
    })()
    const stackSourceState = authoritativeState === null ? null : buildWebStackSourceState(authoritativeState, catalog ?? undefined)
    const selectedStackUnitIds = selectedBoardUnitId === null || hasValidationError ? [] : resolveBattlefieldStackMemberIds(stackSourceState, selectedBoardUnitId, catalog ?? undefined)
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
    const stacksExpandable = resolveBattlefieldStacksExpandable({
      activeRole,
      activeTurnActive,
      isCombatPhase,
      isMovementPhase,
    })
    const displayedScenarioMap = buildScenarioMap(clientSnapshot)
    const victoryObjectives = clientSnapshot?.victoryObjectives ?? []
    const escapeHexes = clientSnapshot?.escapeHexes ?? []

    const scenarioMapSnapshot = clientSnapshot === null ? null : buildScenarioMap(clientSnapshot)
    const movementRemainingSnapshot = clientSnapshot?.movementRemainingByUnit ?? null
    const displayedDefenders = authoritativeState === null || hasValidationError ? [] : buildLiveDefenders({
      authoritativeState,
      scenarioMap: scenarioMapSnapshot,
      movementRemainingByUnit: movementRemainingSnapshot,
    } as ServerGameSnapshot, activePhase, activeTurnActive, catalog ?? undefined)
    const displayedOnions = clientSnapshot === null || hasValidationError ? [] : buildLiveOnions(clientSnapshot, activePhase, catalog ?? undefined)
    const selectedOnionId = activeSelectedUnitIds.map(resolveSelectionOwnerUnitId).find((unitId) => displayedOnions.some((onion) => onion.id === unitId))
    const displayedOnion = displayedOnions.find((onion) => onion.id === selectedOnionId) ?? displayedOnions[0] ?? null
    const stackNaming = hasValidationError ? null : authoritativeState?.stackNaming ?? null
    const onionWeapons = parseWeaponStats(displayedOnion?.weapons ?? '')
    const readyWeaponDetails = displayedOnion?.weaponDetails?.filter(isBattlefieldWeaponReady) ?? []
    const readyDefenderUnitIds = new Set(
      displayedDefenders
        .filter(isBattlefieldUnitCombatReady)
        .map((unit) => unit.id),
    )
    const selectedCombatSelectionIds = hasValidationError || !isCombatPhase
      ? []
      : activeCombatRole === 'defender'
        ? Array.from(new Set(activeSelectedUnitIds.filter((selectionId) => readyDefenderUnitIds.has(resolveSelectionOwnerUnitId(selectionId)))))
        : activeSelectedUnitIds
    const stackRoster = hasValidationError || stackSourceState?.stackRoster === undefined
      ? undefined
      : stackSourceState.stackRoster as import('../../shared/types/index').StackRosterState
    const selectedAttackSelectionIds = isCombatPhase ? selectedCombatSelectionIds : activeSelectedUnitIds
    const selectedCombatAttackerIds = !isCombatPhase
      ? []
      : activeCombatRole === 'onion'
        ? selectedAttackSelectionIds.filter(isWeaponSelectionId).map(stripWeaponSelectionId)
        : [...selectedCombatSelectionIds]
    const selectedCombatAttackStrength = activeCombatRole === 'onion'
      ? (displayedOnion?.weaponDetails ?? [])
        .filter((weapon) => isBattlefieldWeaponReady(weapon) && selectedCombatAttackerIds.includes(weapon.id))
        .reduce((total, weapon) => total + getBattlefieldWeaponAttack(weapon, catalog ?? undefined), 0)
      : (() => {
        const selectedUnitIdSet = new Set(selectedAttackSelectionIds.map(resolveSelectionOwnerUnitId))

        return displayedDefenders
          .filter((unit) => selectedUnitIdSet.has(unit.id))
          .reduce((total, unit) => total + parseRangeValue(parseAttackStats(unit.attack).damage), 0)
      })()
    const selectedCombatAttackMemberLabels = hasValidationError
      ? []
      : activeCombatRole === 'onion'
      ? selectedCombatAttackerIds
        .map((weaponId) => displayedOnion?.weaponDetails?.find((weapon) => weapon.id === weaponId) ?? null)
        .filter((weapon): weapon is NonNullable<typeof weapon> => weapon !== null)
        .map((weapon) => resolveBattlefieldWeaponName(weapon, catalog ?? undefined))
      : selectedCombatAttackerIds
        .map((unitId) => displayedDefenders.find((unit) => unit.id === unitId) ?? null)
        .filter((unit): unit is NonNullable<typeof unit> => unit !== null)
        .map((unit) => resolveBattlefieldFriendlyName(unit, stackNaming ?? undefined, stackRoster, catalog ?? undefined))
    const selectedCombatAttackGroupCount = !isCombatPhase
      ? 0
      : activeCombatRole === 'defender'
        ? countSelectedBattlefieldStackGroups(stackSourceState, selectedCombatSelectionIds, catalog ?? undefined)
        : selectedCombatAttackerIds.length > 0 ? 1 : 0
    const selectedCombatAttackLabel = selectedCombatAttackStrength > 0 ? `Attack ${selectedCombatAttackStrength}` : 'Attack 0'
    const selectedCombatAttackCount = selectedCombatAttackerIds.length
    const selectedInspectorUnitId = (() => {
      const selectionId = activeSelectedUnitIds.find((candidateSelectionId) => !isWeaponSelectionId(candidateSelectionId)) ?? null
      return selectionId === null ? null : resolveSelectionOwnerUnitId(selectionId)
    })()
    const selectedInspectorOnion = selectedInspectorUnitId !== null && selectedInspectorUnitId === displayedOnion?.id ? displayedOnion : null
    const rightRailStackSelection = hasValidationError || stackSourceState === null
      ? {
        anchorUnitId: null,
        groupId: null,
        memberUnitIds: [],
        selectedUnitIds: [],
        selectedCount: 0,
        selectedStackMembers: [],
        selectedStackSelectionCount: 0,
      }
      : buildRightRailStackSelectionViewModel({
        state: stackSourceState,
        inspectedUnitId: selectedInspectorUnitId,
        selectedStackUnitIds,
        activeSelectedUnitIds: selectedCombatSelectionIds,
        displayedDefenders,
        displayedOnion,
        displayedOnions,
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
      selectedInspectorUnitId === null
        ? null
        : displayedDefenders.find((unit) => unit.id === selectedInspectorUnitId) ?? null
    const selectedInspectorLabel = selectedInspectorOnion !== null
      ? resolveBattlefieldFriendlyName(selectedInspectorOnion, stackNaming ?? undefined, stackRoster, catalog ?? undefined)
      : selectedInspectorDefender !== null
        ? resolveBattlefieldFriendlyName(selectedInspectorDefender, stackNaming ?? undefined, stackRoster, catalog ?? undefined)
        : null
    const combatRangeHexKeys = !isCombatPhase || displayedScenarioMap === null
      ? new Set<string>()
      : buildCombatRangeHexKeys(
        buildCombatRangeSources(activePhase, activeCombatRole, activeCombatRole === 'defender' ? selectedCombatSelectionIds : activeSelectedUnitIds, displayedDefenders, displayedOnion, catalog ?? undefined),
        displayedScenarioMap,
      )
    const combatTargetOptions = buildCombatTargetOptions({
      activeCombatRole,
      combatRangeHexKeys,
      displayedDefenders,
      displayedOnion,
      stackRoster: stackRoster ?? null,
      stackNaming,
      selectedUnitIds: activeCombatRole === 'defender' ? selectedCombatSelectionIds : activeSelectedUnitIds,
      selectedAttackStrength: selectedCombatAttackStrength,
      selectedAttackGroupCount: selectedCombatAttackGroupCount,
      displayedScenarioMap,
      catalog: catalog ?? undefined,
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
      stacksExpandable,
      victoryObjectives,
      escapeHexes,
      selectedCombatAttackerIds,
      selectedCombatAttackCount,
      selectedCombatAttackMemberLabels,
      selectedCombatAttackGroupCount,
      selectedCombatAttackLabel,
      selectedCombatAttackStrength,
      selectedCombatTarget,
      selectedCombatTargetIdForRender,
      selectedInspectorDefender,
      selectedInspectorOnion,
      selectedInspectorLabel,
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
