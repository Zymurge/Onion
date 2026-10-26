import {
	buildCombatRangeSources,
	buildLiveDefenders,
	buildLiveOnions,
	buildScenarioMap,
	formatLiveConnectionStatus,
	getPhaseAdvanceLabel,
	getPhaseOwner,
} from '../battlefieldViewBuilders'
import {
	buildWebStackSourceState,
	countSelectedBattlefieldStackGroups,
	projectWebStackSourceStateToUnitIds,
	resolveBattlefieldStackMemberIds,
	resolveBattlefieldStacksExpandable,
} from '../stackSelection'
import { resolveBattlefieldFriendlyName } from '../battlefieldNaming'
import {
	getBattlefieldWeaponAttack,
	isBattlefieldUnitCombatReady,
	isBattlefieldWeaponReady,
	parseWeaponStats,
	resolveBattlefieldWeaponName,
} from '../weaponStats'
import { getUnitAttackStrength } from '../stackReadiness'
import { buildBattlefieldActionEligibility } from '../actionEligibility/projection'
import { formatEligibilityReason } from '../actionEligibility/reasons'
import { buildWeaponSelectionId, isWeaponSelectionId, resolveSelectionOwnerUnitId, stripWeaponSelectionId } from '../selectionIds'
import { buildCombatRangeHexKeys } from '../combatRange'
import { buildCombatTargetOptions } from '../combatPreview'
import { buildRightRailStackSelectionViewModel } from '../rightRailSelection'
import { buildBattlefieldRosterIndex } from '../battlefieldGroupProjection'


import { buildCombatMoveHandoffSnapshot } from './snapshotHandoff'
import { assertCanonicalStackProjection, turnPhaseLabels, validateBattlefieldSnapshot } from './snapshotValidation'
import type { RightRailStackPanelViewModel, UseBattlefieldDisplayStateOptions } from './types'

/** Builds the complete pure battlefield display model from session and interaction state. */
export function buildBattlefieldDisplayModel({
	combatBaseSnapshot,
	interactionState,
	sessionState,
	activeSessionBinding,
	screenLocked = false,
}: UseBattlefieldDisplayStateOptions) {
	const currentSessionSnapshot = sessionState.snapshot
	const previousSessionSnapshot = sessionState.previousSnapshot ?? null
	const handoffSnapshot = buildCombatMoveHandoffSnapshot(screenLocked, currentSessionSnapshot, previousSessionSnapshot)
	const clientSnapshot = handoffSnapshot ?? combatBaseSnapshot ?? currentSessionSnapshot
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
	const activeSelectedUnitIds = selectedUnitIds ?? []
	const headerHasSnapshot = clientSnapshot !== null
	const activeTurnNumber = clientSnapshot?.turnNumber ?? null
	const activeScenarioName = clientSnapshot?.scenarioName ?? null
	const activeRole = clientSession?.role ?? null
	const activeGameId = clientSnapshot?.gameId ?? activeGameIdProp ?? null
	const activePhaseOwner = getPhaseOwner(activePhase)
	const lifecycleActive = clientSnapshot?.status === undefined || clientSnapshot.status === 'active'
	const activeTurnActive = lifecycleActive && headerHasSnapshot && activeRole !== null && activePhaseOwner === activeRole
	const phaseAdvanceLabel = clientSnapshot?.status === 'completed' || clientSnapshot?.status === 'archived' || clientSnapshot?.winner === 'onion' || clientSnapshot?.winner === 'defender'
		? null
		: getPhaseAdvanceLabel(activePhase, activeRole)
	const shellPhase = activePhase ?? 'DEFENDER_MOVE'
	const activePhaseLabel = clientSnapshot?.status === 'completed' || clientSnapshot?.status === 'archived' || clientSnapshot?.winner === 'onion' || clientSnapshot?.winner === 'defender'
		? 'GAME OVER'
		: activePhase === null ? 'WAITING' : turnPhaseLabels[activePhase]
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
		: buildLiveDefenders(clientSnapshot, activePhase, activeTurnActive, handoffSnapshot !== null)
	const defenderRoster = authoritativeState === null || hasValidationError || clientSnapshot === null
		? []
		: buildLiveDefenders(clientSnapshot, activePhase, activeTurnActive, true)
	const visibleStackSourceState = projectWebStackSourceStateToUnitIds(
		stackSourceState,
		new Set(displayedDefenders.map((unit) => unit.unitId)),
	)
	const selectedStackUnitIds = selectedBoardUnitId === null || hasValidationError
		? []
		: resolveBattlefieldStackMemberIds(visibleStackSourceState, selectedBoardUnitId, catalog ?? undefined)
	const displayedOnions = clientSnapshot === null || hasValidationError ? [] : buildLiveOnions(clientSnapshot, activePhase)
	const selectedOnionId = activeSelectedUnitIds.map(resolveSelectionOwnerUnitId).find((unitId) => displayedOnions.some((onion) => onion.unitId === unitId))
	const displayedOnion = displayedOnions.find((onion) => onion.unitId === selectedOnionId) ?? displayedOnions[0] ?? null
	const stackNaming = hasValidationError ? null : authoritativeState?.stackNaming ?? null
	const onionWeapons = parseWeaponStats(displayedOnion?.weapons ?? '')
	const displayedWeaponDetails = displayedOnion?.weapons ?? []
	const readyDefenderUnitIds = new Set(
		displayedDefenders
			.filter(isBattlefieldUnitCombatReady)
			.map((unit) => unit.unitId),
	)
	const selectedCombatSelectionIds = hasValidationError || !isCombatPhase
		? []
		: activeCombatRole === 'defender' && activeTurnActive
			? Array.from(new Set(activeSelectedUnitIds.filter((selectionId) => readyDefenderUnitIds.has(resolveSelectionOwnerUnitId(selectionId)))))
			: activeSelectedUnitIds
	const stackRoster = hasValidationError || visibleStackSourceState?.stackRoster === undefined
		? undefined
		: visibleStackSourceState.stackRoster as import('../../../shared/types/index').StackRosterState
	const stackRosterIndex = stackRoster === undefined
		? undefined
		: buildBattlefieldRosterIndex(displayedDefenders, stackRoster)
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
				.reduce((total, unit) => total + getUnitAttackStrength(unit, catalog ?? undefined), 0)
		})()
	const selectedCombatAttackMemberLabels = hasValidationError
		? []
		: Array.from(new Set(activeCombatRole === 'onion'
			? selectedCombatAttackerIds
				.map((weaponId) => displayedOnion?.weapons.find((weapon) => weapon.id === weaponId) ?? null)
				.filter((weapon): weapon is NonNullable<typeof weapon> => weapon !== null)
				.map((weapon) => resolveBattlefieldWeaponName(weapon, catalog ?? undefined))
			: selectedCombatAttackerIds
				.map((unitId) => displayedDefenders.find((unit) => unit.unitId === unitId) ?? null)
				.filter((unit): unit is NonNullable<typeof unit> => unit !== null)
				.map((unit) => resolveBattlefieldFriendlyName(unit, stackNaming ?? undefined, stackRosterIndex, catalog ?? undefined))))
	const selectedCombatAttackGroupCount = !isCombatPhase
		? 0
		: activeCombatRole === 'defender'
			? countSelectedBattlefieldStackGroups(visibleStackSourceState, selectedCombatSelectionIds, catalog ?? undefined)
			: selectedCombatAttackerIds.length > 0 ? 1 : 0
	const selectedCombatAttackLabel = selectedCombatAttackStrength > 0 ? `Attack ${selectedCombatAttackStrength}` : 'Attack 0'
	const selectedCombatAttackCount = selectedCombatAttackerIds.length
	const selectedInspectorUnitId = (() => {
		const selectionId = activeSelectedUnitIds.find((candidateSelectionId) => !isWeaponSelectionId(candidateSelectionId)) ?? null
		return selectionId === null ? null : resolveSelectionOwnerUnitId(selectionId)
	})()
	const selectedInspectorOnion = selectedInspectorUnitId !== null && selectedInspectorUnitId === displayedOnion?.unitId ? displayedOnion : null
	const rightRailStackSelection = hasValidationError || visibleStackSourceState === null || visibleStackSourceState === undefined
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
			state: visibleStackSourceState,
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
			: defenderRoster.find((unit) => unit.unitId === selectedInspectorUnitId) ?? null
	const selectedInspectorLabel = selectedInspectorOnion !== null
		? resolveBattlefieldFriendlyName(selectedInspectorOnion, stackNaming ?? undefined, stackRosterIndex, catalog ?? undefined)
		: selectedInspectorDefender !== null
			? resolveBattlefieldFriendlyName(selectedInspectorDefender, stackNaming ?? undefined, stackRosterIndex, catalog ?? undefined)
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
	const buildEligibilityTargetOptions = (selectedIds: ReadonlyArray<string>, selectedAttackStrength: number) => {
		if (!isCombatPhase || activeCombatRole === null) {
			return []
		}

		const rangeSources = buildCombatRangeSources(
			activePhase,
			activeCombatRole,
			selectedIds,
			displayedDefenders,
			displayedOnion,
			catalog ?? undefined,
		)

		return buildCombatTargetOptions({
			activeCombatRole,
			combatRangeHexKeys: buildCombatRangeHexKeys(rangeSources, displayedScenarioMap ?? undefined),
			displayedDefenders,
			displayedOnion,
			stackRoster: stackRoster ?? null,
			stackNaming,
			selectedUnitIds: selectedIds,
			selectedAttackStrength,
			selectedAttackGroupCount: 1,
			displayedScenarioMap,
			catalog: catalog ?? undefined,
		})
	}
	const targetOptionsByDefenderId = Object.fromEntries(displayedDefenders.map((unit) => [
		unit.unitId,
		activeCombatRole === 'defender'
			? buildEligibilityTargetOptions([unit.unitId], getUnitAttackStrength(unit, catalog ?? undefined))
			: [],
	]))
	const targetOptionsByWeaponId = displayedOnion === null
		? {}
		: Object.fromEntries(displayedOnion.weapons.map((weapon) => [
			weapon.id,
			activeCombatRole === 'onion'
				? buildEligibilityTargetOptions([buildWeaponSelectionId(weapon.id)], getBattlefieldWeaponAttack(weapon, catalog ?? undefined))
				: [],
		]))
	const actionEligibility = buildBattlefieldActionEligibility({
		phase: activePhase,
		viewerRole: activeRole,
		defenders: displayedDefenders,
		onion: displayedOnion,
		targetOptionsByDefenderId,
		targetOptionsByWeaponId,
	})
	const combatTargetIds = new Set(combatTargetOptions.map((target) => target.id))
	const selectedCombatTarget = selectedCombatTargetId === null
		? null
		: combatTargetOptions.find((target) => target.id === selectedCombatTargetId && target.isUnavailable !== true) ?? null
	const selectedCombatTargetIdForRender = selectedCombatTarget?.id ?? null
	const readyWeaponDetails = displayedOnion === null
		? []
		: displayedWeaponDetails.map((weapon) => {
			const weaponEligibility = actionEligibility.onionCombatByWeaponId[weapon.id]?.eligibility
			return {
				...weapon,
				disabledReason: activeCombatRole === 'onion' && isCombatPhase && weaponEligibility !== undefined && !weaponEligibility.eligible
					? formatEligibilityReason(weaponEligibility.reason)
					: undefined,
			}
		})
	const combatUnitAvailabilityReasons = Object.fromEntries(displayedDefenders.map((unit) => {
		const unitEligibility = actionEligibility.defenderCombatByUnitId[unit.unitId]?.eligibility
		return [
			unit.unitId,
			activeCombatRole === 'defender' && isCombatPhase && unitEligibility !== undefined && !unitEligibility.eligible
				? formatEligibilityReason(unitEligibility.reason)
				: undefined,
		]
	}))
	const connectionStatus = sessionState.liveConnection
	const connectionLabel = formatLiveConnectionStatus(connectionStatus)
	const lastUpdatedAt = sessionState.lastUpdatedAt ?? lastRefreshAt

	return {
		error,
		activeCombatRole,
		activeGameId,
		activeMode,
		actionEligibility,
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
		defenderRoster,
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
		combatUnitAvailabilityReasons,
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
}
