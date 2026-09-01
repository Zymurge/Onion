import { useMemo } from 'react'
import type { ServerGameSnapshot } from './gameClient'
import {
  buildCombatRangeSources,
  buildLiveDefenders,
  buildLiveOnions,
  buildScenarioMap,
  formatLiveConnectionStatus,
  getPhaseAdvanceLabel,
  getPhaseOwner,
} from './battlefieldViewBuilders'
import { buildWebStackSourceState, countSelectedBattlefieldStackGroups, resolveBattlefieldStackMemberIds, resolveBattlefieldStacksExpandable } from './stackSelection'
import { resolveBattlefieldFriendlyName } from './battlefieldNaming'
import { getBattlefieldWeaponAttack, isBattlefieldUnitCombatReady, isBattlefieldWeaponReady, parseWeaponStats, resolveBattlefieldWeaponName } from './weaponStats'
import { isWeaponSelectionId, resolveSelectionOwnerUnitId, stripWeaponSelectionId } from './selectionIds'
import { buildCombatRangeHexKeys } from './combatRange'
import { buildCombatTargetOptions } from './combatPreview'
import { buildRightRailStackSelectionViewModel } from './rightRailSelection'
import type { GameSessionViewState } from './gameSessionTypes'
import type { SessionBinding } from './sessionBinding'
import type { GameState, TurnPhase } from '../../shared/types/index'
import { getSessionUnitType, isSessionUnitTypeStackable } from './sessionCatalog'
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

const turnPhases = new Set<TurnPhase>(Object.keys(turnPhaseLabels) as TurnPhase[])
const unitStates = new Set(['operational', 'disabled', 'recovering', 'destroyed'])
const weaponStates = new Set(['ready', 'spent', 'destroyed'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function snapshotDiagnosticContext(snapshot: ServerGameSnapshot): string {
  const rawSnapshot = snapshot as unknown as Record<string, unknown>
  const gameId = typeof rawSnapshot.gameId === 'number' ? rawSnapshot.gameId : 'unknown'
  const phase = typeof rawSnapshot.phase === 'string' ? rawSnapshot.phase : 'unknown'
  const eventSeq = typeof rawSnapshot.lastEventSeq === 'number' ? rawSnapshot.lastEventSeq : 'unknown'
  const scenario = typeof rawSnapshot.scenarioName === 'string' ? rawSnapshot.scenarioName : 'unknown'
  return `gameId=${gameId}, scenario=${scenario}, phase=${phase}, lastEventSeq=${eventSeq}`
}

function describeSnapshotError(snapshot: ServerGameSnapshot, issue: string): string {
  return `Loaded game snapshot is invalid: ${issue} (${snapshotDiagnosticContext(snapshot)}). Refresh the game and report this diagnostic if it persists.`
}

function validateUnitMap(
  mapValue: unknown,
  mapName: 'onions' | 'defenders',
  snapshot: ServerGameSnapshot,
): string | null {
  if (!isRecord(mapValue)) {
    return describeSnapshotError(snapshot, `authoritativeState.${mapName} must be a unit map`)
  }

  for (const [mapUnitId, unitValue] of Object.entries(mapValue)) {
    if (!isRecord(unitValue)) {
      return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} must be a unit record`)
    }

    if (unitValue.unitId !== mapUnitId || typeof unitValue.unitId !== 'string' || unitValue.unitId.length === 0) {
      return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} has an invalid unitId`)
    }
    if (typeof unitValue.typeId !== 'string' || unitValue.typeId.length === 0) {
      return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} is missing typeId`)
    }
    if (unitValue.side !== mapName.slice(0, -1)) {
      return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} has side=${String(unitValue.side)}, expected ${mapName.slice(0, -1)}`)
    }
    if (typeof unitValue.state !== 'string' || !unitStates.has(unitValue.state)) {
      return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} has invalid state=${String(unitValue.state)}`)
    }
    if (!isRecord(unitValue.position) || !isFiniteNumber(unitValue.position.q) || !isFiniteNumber(unitValue.position.r)) {
      return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} is missing a valid position`)
    }
    if (typeof unitValue.friendlyName !== 'string' || unitValue.friendlyName.length === 0) {
      return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} is missing friendlyName`)
    }
    if (!Array.isArray(unitValue.weapons)) {
      return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} is missing weapons data`)
    }
    for (const [weaponIndex, weaponValue] of unitValue.weapons.entries()) {
      if (!isRecord(weaponValue)) {
        return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId}.weapons[${weaponIndex}] must be a weapon record`)
      }
      if (typeof weaponValue.id !== 'string' || weaponValue.id.length === 0 || typeof weaponValue.typeId !== 'string' || weaponValue.typeId.length === 0) {
        return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId}.weapons[${weaponIndex}] is missing id or typeId`)
      }
      if (typeof weaponValue.state !== 'string' || !weaponStates.has(weaponValue.state)) {
        return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId}.weapons[${weaponIndex}] has invalid state=${String(weaponValue.state)}`)
      }
      if (typeof weaponValue.friendlyName !== 'string' || weaponValue.friendlyName.length === 0) {
        return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId}.weapons[${weaponIndex}] is missing friendlyName`)
      }
    }
  }

  return null
}

export function validateBattlefieldSnapshot(
  snapshot: ServerGameSnapshot,
): string | null {
  const rawSnapshot = snapshot as unknown as Record<string, unknown>
  const authoritativeState = rawSnapshot.authoritativeState

  if (typeof rawSnapshot.gameId !== 'number' || !Number.isInteger(rawSnapshot.gameId)) {
    return describeSnapshotError(snapshot, 'gameId is missing or invalid')
  }
  if (typeof rawSnapshot.scenarioName !== 'string' || rawSnapshot.scenarioName.length === 0) {
    return describeSnapshotError(snapshot, 'scenarioName is missing or invalid')
  }
  if (typeof rawSnapshot.phase !== 'string' || !turnPhases.has(rawSnapshot.phase as TurnPhase)) {
    return describeSnapshotError(snapshot, `phase is missing or invalid: ${String(rawSnapshot.phase)}`)
  }
  if (typeof rawSnapshot.lastEventSeq !== 'number' || !Number.isInteger(rawSnapshot.lastEventSeq) || rawSnapshot.lastEventSeq < 0) {
    return describeSnapshotError(snapshot, 'lastEventSeq is missing or invalid')
  }
  if (!isRecord(authoritativeState)) {
    return describeSnapshotError(snapshot, 'authoritativeState is missing')
  }

  if (!isFiniteNumber(authoritativeState.turn) || !Number.isInteger(authoritativeState.turn) || authoritativeState.turn < 1) {
    return describeSnapshotError(snapshot, 'authoritativeState.turn is missing or invalid')
  }

  const onionMapError = validateUnitMap(authoritativeState.onions, 'onions', snapshot)
  if (onionMapError !== null) {
    return onionMapError
  }
  if (Object.keys(authoritativeState.onions as object).length === 0) {
    return describeSnapshotError(snapshot, 'authoritativeState.onions contains no Onion units')
  }
  const defenderMapError = validateUnitMap(authoritativeState.defenders, 'defenders', snapshot)
  if (defenderMapError !== null) {
    return defenderMapError
  }

  const scenarioMap = rawSnapshot.scenarioMap
  if (!isRecord(scenarioMap)) {
    return describeSnapshotError(snapshot, 'scenarioMap is missing')
  }
  if (!isFiniteNumber(scenarioMap.width) || !isFiniteNumber(scenarioMap.height) || scenarioMap.width <= 0 || scenarioMap.height <= 0) {
    return describeSnapshotError(snapshot, 'scenarioMap width and height are missing or invalid')
  }
  if (!Array.isArray(scenarioMap.cells) || !Array.isArray(scenarioMap.hexes)) {
    return describeSnapshotError(snapshot, 'scenarioMap cells and hexes are missing')
  }
  for (const [cellIndex, cell] of scenarioMap.cells.entries()) {
    if (!isRecord(cell) || !isFiniteNumber(cell.q) || !isFiniteNumber(cell.r)) {
      return describeSnapshotError(snapshot, `scenarioMap.cells[${cellIndex}] is missing valid q/r coordinates`)
    }
  }
  for (const [hexIndex, hex] of scenarioMap.hexes.entries()) {
    if (!isRecord(hex) || !isFiniteNumber(hex.q) || !isFiniteNumber(hex.r) || !isFiniteNumber(hex.t)) {
      return describeSnapshotError(snapshot, `scenarioMap.hexes[${hexIndex}] is missing valid q/r/t coordinates`)
    }
  }
  if (!Array.isArray(rawSnapshot.victoryObjectives)) {
    return describeSnapshotError(snapshot, 'victoryObjectives are missing')
  }
  for (const [objectiveIndex, objective] of rawSnapshot.victoryObjectives.entries()) {
    if (!isRecord(objective) || typeof objective.id !== 'string' || objective.id.length === 0 || typeof objective.label !== 'string' || objective.label.length === 0) {
      return describeSnapshotError(snapshot, `victoryObjectives[${objectiveIndex}] is missing id or label`)
    }
  }

  return null
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
    let error: string | null = clientSnapshot === null ? null : validateBattlefieldSnapshot(clientSnapshot)
    if (error === null && authoritativeState !== null) {
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
    const stackSourceState = authoritativeState === null || hasValidationError ? null : buildWebStackSourceState(authoritativeState, catalog ?? undefined)
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
    const displayedScenarioMap = hasValidationError ? null : buildScenarioMap(clientSnapshot)
    const victoryObjectives = clientSnapshot?.victoryObjectives ?? []
    const escapeHexes = clientSnapshot?.escapeHexes ?? []

    const displayedDefenders = authoritativeState === null || hasValidationError || clientSnapshot === null
      ? []
      : buildLiveDefenders(clientSnapshot, activePhase, activeTurnActive)
    const displayedOnions = clientSnapshot === null || hasValidationError ? [] : buildLiveOnions(clientSnapshot, activePhase)
    const selectedOnionId = activeSelectedUnitIds.map(resolveSelectionOwnerUnitId).find((unitId) => displayedOnions.some((onion) => onion.unitId === unitId))
    const displayedOnion = displayedOnions.find((onion) => onion.unitId === selectedOnionId) ?? displayedOnions[0] ?? null
    const stackNaming = hasValidationError ? null : authoritativeState?.stackNaming ?? null
    const onionWeapons = parseWeaponStats(displayedOnion?.weapons ?? '')
    const readyWeaponDetails = displayedOnion?.weapons.filter(isBattlefieldWeaponReady) ?? []
    const readyDefenderUnitIds = new Set(
      displayedDefenders
        .filter(isBattlefieldUnitCombatReady)
        .map((unit) => unit.unitId),
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
      ? (displayedOnion?.weapons ?? [])
        .filter((weapon) => isBattlefieldWeaponReady(weapon) && selectedCombatAttackerIds.includes(weapon.id))
        .reduce((total, weapon) => total + getBattlefieldWeaponAttack(weapon, catalog ?? undefined), 0)
      : (() => {
        const selectedUnitIdSet = new Set(selectedAttackSelectionIds.map(resolveSelectionOwnerUnitId))

        return displayedDefenders
          .filter((unit) => selectedUnitIdSet.has(unit.unitId))
          .reduce((total, unit) => total + (catalog === null ? 0 : getSessionUnitType(catalog, unit.typeId).weapons.reduce((unitTotal, weapon) => unitTotal + weapon.attack, 0)), 0)
      })()
    const selectedCombatAttackMemberLabels = hasValidationError
      ? []
      : activeCombatRole === 'onion'
      ? selectedCombatAttackerIds
        .map((weaponId) => displayedOnion?.weapons.find((weapon) => weapon.id === weaponId) ?? null)
        .filter((weapon): weapon is NonNullable<typeof weapon> => weapon !== null)
        .map((weapon) => resolveBattlefieldWeaponName(weapon, catalog ?? undefined))
      : selectedCombatAttackerIds
        .map((unitId) => displayedDefenders.find((unit) => unit.unitId === unitId) ?? null)
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
    const selectedInspectorOnion = selectedInspectorUnitId !== null && selectedInspectorUnitId === displayedOnion?.unitId ? displayedOnion : null
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
        : displayedDefenders.find((unit) => unit.unitId === selectedInspectorUnitId) ?? null
    const selectedInspectorLabel = selectedInspectorOnion !== null
      ? resolveBattlefieldFriendlyName(selectedInspectorOnion, stackNaming ?? undefined, stackRoster, catalog ?? undefined)
      : selectedInspectorDefender !== null
        ? resolveBattlefieldFriendlyName(selectedInspectorDefender, stackNaming ?? undefined, stackRoster, catalog ?? undefined)
        : null
    const combatRangeSources = !isCombatPhase || displayedScenarioMap === null
      ? []
      : buildCombatRangeSources(activePhase, activeCombatRole, activeCombatRole === 'defender' ? selectedCombatSelectionIds : activeSelectedUnitIds, displayedDefenders, displayedOnion, catalog ?? undefined)
    const combatRangeHexKeys = buildCombatRangeHexKeys(combatRangeSources, displayedScenarioMap ?? undefined)
    const selectedCombatAttackRange = combatRangeSources.length > 0
      ? Math.min(...combatRangeSources.map((source) => source.range))
      : 0
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
    const selectedCombatTarget = selectedCombatTargetId === null
      ? null
      : combatTargetOptions.find((target) => target.id === selectedCombatTargetId && target.isDisabled !== true) ?? null
    const selectedCombatTargetIdForRender = selectedCombatTarget?.id ?? null
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
      displayedOnions,
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
      selectedCombatAttackRange,
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
