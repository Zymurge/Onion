import {
	createStackNamingEngine,
} from '../stackNaming/index.js'
import type { DefenderMap, StackRosterGroupState, StackRosterState } from '../types/index.js'
import { buildDefenderLookup, isStackRosterUnitType, resolveGroupUnitIds } from './helpers.js'
import { buildStackRosterIndex } from './indexing.js'
import { refreshStackRosterNamingSnapshot } from './naming.js'
import type {
	MoveStackRosterGroupInput,
	ReconcileStackRosterMoveLifecycleInput,
	ReconcileStackRosterMoveLifecycleResult,
	RelocateStackRosterUnitsInput,
	SplitStackRosterGroupInput,
} from './types.js'

const GROUP_ID_PATTERN = /^group-(\d+)$/

function getNextGroupOrdinal(stackRoster: StackRosterState | undefined): number {
	const configuredOrdinal = stackRoster?.nextGroupOrdinal ?? 1
	let highestActiveOrdinal = 0

	for (const groupId of Object.keys(stackRoster?.groupsById ?? {})) {
		const match = GROUP_ID_PATTERN.exec(groupId)
		if (match !== null) {
			highestActiveOrdinal = Math.max(highestActiveOrdinal, Number(match[1]))
		}
	}

	return Math.max(
		Number.isSafeInteger(configuredOrdinal) && configuredOrdinal > 0 ? configuredOrdinal : 1,
		highestActiveOrdinal + 1,
	)
}

function allocateGroupId(
	groupsById: Record<string, StackRosterGroupState>,
	nextGroupOrdinal: number,
): { groupId: string; nextGroupOrdinal: number } {
	let ordinal = nextGroupOrdinal
	while (groupsById[`group-${ordinal}`] !== undefined) {
		ordinal += 1
	}

	return {
		groupId: `group-${ordinal}`,
		nextGroupOrdinal: ordinal + 1,
	}
}

function groupOrdinal(groupId: string): number {
	const match = GROUP_ID_PATTERN.exec(groupId)
	return match === null ? Number.MAX_SAFE_INTEGER : Number(match[1])
}

function lowestGroupId(groupIds: ReadonlyArray<string>): string {
	return [...groupIds].sort((left, right) => groupOrdinal(left) - groupOrdinal(right) || left.localeCompare(right))[0]
}

function buildRosterState(
	groupsById: Record<string, StackRosterGroupState>,
	nextGroupOrdinal: number,
): StackRosterState {
	return { groupsById, nextGroupOrdinal }
}

function usableGroupName(groupName: string | undefined): string | undefined {
	return groupName?.trim().length === 0 ? undefined : groupName
}

function applyGroupNameForSize(
	group: Omit<StackRosterGroupState, 'unitIds'>,
	unitIds: ReadonlyArray<string>,
	groupName?: string,
): StackRosterGroupState {
	const nextGroup = {
		...group,
		unitIds: [...unitIds],
	}
	const resolvedGroupName = unitIds.length > 1
		? usableGroupName(groupName) ?? usableGroupName(group.groupName)
		: undefined

	if (resolvedGroupName === undefined) {
		delete nextGroup.groupName
	} else {
		nextGroup.groupName = resolvedGroupName
	}

	return nextGroup
}

function setGroupIfValid(
	groupsById: Record<string, StackRosterGroupState>,
	groupId: string,
	group: Omit<StackRosterGroupState, 'unitIds'>,
	unitIds: ReadonlyArray<string>,
	groupName?: string,
): void {
	if (unitIds.length > 1) {
		groupsById[groupId] = applyGroupNameForSize(group, unitIds, groupName)
	}
}

/** Remove missing defender members while preserving the persisted group shape. */
export function expandStackRosterGroups(
	stackRoster: StackRosterState | undefined,
	defenders: DefenderMap | undefined,
): StackRosterState {
	const defenderLookup = buildDefenderLookup(defenders)
	const groupsById = Object.fromEntries(
		Object.entries(stackRoster?.groupsById ?? {}).flatMap(([groupId, group]) => {
			const unitIds = resolveGroupUnitIds(group).filter((unitId) => defenderLookup[unitId] !== undefined)
			return unitIds.length > 1
				? [[groupId, applyGroupNameForSize(group, unitIds)] as const]
				: []
		}),
	)

	return buildRosterState(groupsById, getNextGroupOrdinal(stackRoster))
}

/** Retire one group without mutating the input roster. */
export function retireStackRosterGroup(stackRoster: StackRosterState | undefined, groupId: string): StackRosterState {
	const groupsById = { ...(stackRoster?.groupsById ?? {}) }
	delete groupsById[groupId]
	return buildRosterState(groupsById, getNextGroupOrdinal(stackRoster))
}

/** Merge source groups into an existing target group. */
export function mergeStackRosterGroups(
	stackRoster: StackRosterState | undefined,
	targetGroupId: string,
	sourceGroupIds: string[],
): StackRosterState {
	const groupsById = { ...(stackRoster?.groupsById ?? {}) }
	const targetGroup = groupsById[targetGroupId]
	if (targetGroup === undefined) {
		throw new Error(`Cannot merge into missing target group ${targetGroupId}`)
	}

	const mergeGroupIds = [targetGroupId, ...sourceGroupIds.filter((groupId) => groupId !== targetGroupId && groupsById[groupId] !== undefined)]
	const survivorGroupId = lowestGroupId(mergeGroupIds)
	const survivorGroup = groupsById[survivorGroupId]
	if (survivorGroup === undefined) {
		throw new Error(`Cannot merge missing group ${survivorGroupId}`)
	}

	const mergedUnitIds = [...resolveGroupUnitIds(targetGroup)]
	const seenIds = new Set(mergedUnitIds)
	const inputGroupNames = [targetGroup.groupName]

	for (const sourceGroupId of mergeGroupIds.slice(1)) {
		const sourceGroup = groupsById[sourceGroupId]
		if (sourceGroup === undefined) {
			continue
		}
		inputGroupNames.push(sourceGroup.groupName)

		for (const unitId of resolveGroupUnitIds(sourceGroup)) {
			if (!seenIds.has(unitId)) {
				seenIds.add(unitId)
				mergedUnitIds.push(unitId)
			}
		}
	}

	for (const groupId of mergeGroupIds) {
		delete groupsById[groupId]
	}

	setGroupIfValid(
		groupsById,
		survivorGroupId,
		{ ...survivorGroup, position: targetGroup.position },
		mergedUnitIds,
		inputGroupNames.map(usableGroupName).find((groupName) => groupName !== undefined),
	)

	return buildRosterState(groupsById, getNextGroupOrdinal(stackRoster))
}

/** Split selected members into a new roster group. */
export function splitStackRosterGroup(
	stackRoster: StackRosterState | undefined,
	input: SplitStackRosterGroupInput,
): StackRosterState {
	const groupsById = { ...(stackRoster?.groupsById ?? {}) }
	const sourceGroup = groupsById[input.groupId]
	if (sourceGroup === undefined) {
		throw new Error(`Cannot split missing group ${input.groupId}`)
	}

	const movedIdSet = new Set(input.movedUnitIds)
	if (movedIdSet.size === 0) {
		throw new Error('Cannot split group without moved members')
	}

	const sourceUnitIds = resolveGroupUnitIds(sourceGroup)
	for (const movedUnitId of movedIdSet) {
		if (!sourceUnitIds.includes(movedUnitId)) {
			throw new Error(`Cannot split missing group member ${movedUnitId}`)
		}
	}

	const remainingUnitIds = sourceUnitIds.filter((unitId) => !movedIdSet.has(unitId))
	const nextGroupOrdinal = getNextGroupOrdinal(stackRoster)
	delete groupsById[input.groupId]

	if (remainingUnitIds.length > 1) {
		groupsById[input.groupId] = applyGroupNameForSize(sourceGroup, remainingUnitIds)
	}

	if (remainingUnitIds.length === 0) {
		setGroupIfValid(
			groupsById,
			input.groupId,
			{ ...sourceGroup, position: input.newPosition ?? sourceGroup.position },
			sourceUnitIds,
			input.newGroupName ?? sourceGroup.groupName,
		)
		return buildRosterState(groupsById, nextGroupOrdinal)
	}

	const allocated = allocateGroupId(groupsById, nextGroupOrdinal)
	setGroupIfValid(groupsById, allocated.groupId, {
		unitType: sourceGroup.unitType,
		position: input.newPosition ?? sourceGroup.position,
	}, sourceUnitIds.filter((unitId) => movedIdSet.has(unitId)), input.newGroupName)

	return buildRosterState(groupsById, allocated.nextGroupOrdinal)
}

/** Move selected members between canonical roster groups. */
export function moveStackRosterGroup(
	stackRoster: StackRosterState | undefined,
	input: MoveStackRosterGroupInput,
): StackRosterState {
	const groupsById = { ...(stackRoster?.groupsById ?? {}) }
	const sourceGroup = groupsById[input.sourceGroupId]
	if (sourceGroup === undefined) {
		throw new Error(`Cannot move from missing group ${input.sourceGroupId}`)
	}

	const movedIdSet = new Set(input.movedUnitIds)
	if (movedIdSet.size === 0) {
		throw new Error('Cannot move group without moved members')
	}

	const sourceUnitIds = resolveGroupUnitIds(sourceGroup)
	for (const movedUnitId of movedIdSet) {
		if (!sourceUnitIds.includes(movedUnitId)) {
			throw new Error(`Cannot move missing group member ${movedUnitId}`)
		}
	}

	const movedUnitIds = sourceUnitIds.filter((unitId) => movedIdSet.has(unitId))
	const remainingUnitIds = sourceUnitIds.filter((unitId) => !movedIdSet.has(unitId))
	const destinationGroup = groupsById[input.destinationGroupId]
	const destinationUnitIds = [...new Set([...(input.destinationUnitIds ?? []), ...movedUnitIds])]
	const nextGroupOrdinal = getNextGroupOrdinal(stackRoster)

	if (remainingUnitIds.length === 0 && destinationGroup === undefined) {
		groupsById[input.sourceGroupId] = applyGroupNameForSize({
			...sourceGroup,
			position: input.destinationPosition,
		}, destinationUnitIds, input.destinationGroupName ?? sourceGroup.groupName)
		return buildRosterState(groupsById, nextGroupOrdinal)
	}

	delete groupsById[input.sourceGroupId]
	if (remainingUnitIds.length > 1) {
		groupsById[input.sourceGroupId] = applyGroupNameForSize(sourceGroup, remainingUnitIds)
	}

	if (destinationGroup !== undefined) {
		const destinationUnitIds = [...new Set([...destinationGroup.unitIds, ...movedUnitIds])]
		const mergedGroupIds = remainingUnitIds.length === 0
			? [input.destinationGroupId, input.sourceGroupId]
			: [input.destinationGroupId]
		const survivorGroupId = lowestGroupId(mergedGroupIds)
		delete groupsById[input.destinationGroupId]
		if (remainingUnitIds.length === 0) {
			delete groupsById[input.sourceGroupId]
		}
		setGroupIfValid(groupsById, survivorGroupId, {
			...destinationGroup,
			position: input.destinationPosition,
		}, destinationUnitIds, input.destinationGroupName ?? (remainingUnitIds.length === 0 ? sourceGroup.groupName : undefined))
		return buildRosterState(groupsById, nextGroupOrdinal)
	}

	const allocated = allocateGroupId(groupsById, nextGroupOrdinal)
	setGroupIfValid(groupsById, allocated.groupId, {
		unitType: sourceGroup.unitType,
		position: input.destinationPosition,
	}, destinationUnitIds, input.destinationGroupName ?? (remainingUnitIds.length === 0 ? sourceGroup.groupName : undefined))

	return buildRosterState(groupsById, movedUnitIds.length > 1 ? allocated.nextGroupOrdinal : nextGroupOrdinal)
}

/** Relocate selected units, preserving singleton stackable groups. */
export function relocateStackRosterUnits(
	stackRoster: StackRosterState | undefined,
	input: RelocateStackRosterUnitsInput,
): StackRosterState {
	const groupsById = { ...(stackRoster?.groupsById ?? {}) }
	const movedIdSet = new Set(input.movedUnitIds)
	if (movedIdSet.size === 0) {
		throw new Error('Cannot relocate units without moved members')
	}

	const destinationEntry = Object.entries(groupsById).find(([groupId, group]) => groupId !== findSourceGroupId(groupsById, movedIdSet)
		&& group.unitType === input.unitType
		&& group.position.q === input.destinationPosition.q
		&& group.position.r === input.destinationPosition.r)
	const sourceGroupId = findSourceGroupId(groupsById, movedIdSet)
	const destinationSourceOverlap = sourceGroupId !== null
		&& groupsById[sourceGroupId]?.position.q === input.destinationPosition.q
		&& groupsById[sourceGroupId]?.position.r === input.destinationPosition.r
	if (destinationSourceOverlap) {
		return buildRosterState(groupsById, getNextGroupOrdinal(stackRoster))
	}

	if (sourceGroupId !== null && [...movedIdSet].every((unitId) => groupsById[sourceGroupId]?.unitIds.includes(unitId))) {
		return moveStackRosterGroup(stackRoster, {
			sourceGroupId,
			destinationGroupId: destinationEntry?.[0] ?? 'unassigned-destination',
			destinationPosition: input.destinationPosition,
			destinationGroupName: input.destinationGroupName,
			destinationUnitIds: input.destinationUnitIds,
			movedUnitIds: [...movedIdSet],
		})
	}

	const destinationGroupId = destinationEntry?.[0]
	if (destinationGroupId !== undefined) {
		const destinationGroup = groupsById[destinationGroupId]
		const destinationUnitIds = [...new Set([...resolveGroupUnitIds(destinationGroup), ...input.movedUnitIds])]
		groupsById[destinationGroupId] = applyGroupNameForSize({
			...destinationGroup,
			position: input.destinationPosition,
		}, destinationUnitIds, input.destinationGroupName)
		return buildRosterState(groupsById, getNextGroupOrdinal(stackRoster))
	}

	const destinationUnitIds = [...new Set([...(input.destinationUnitIds ?? []), ...input.movedUnitIds])]
	if (destinationUnitIds.length <= 1 || !isStackRosterUnitType(input.unitType)) {
		return buildRosterState(groupsById, getNextGroupOrdinal(stackRoster))
	}

	const allocated = allocateGroupId(groupsById, getNextGroupOrdinal(stackRoster))
	setGroupIfValid(groupsById, allocated.groupId, {
		unitType: input.unitType,
		position: input.destinationPosition,
	}, destinationUnitIds, input.destinationGroupName)
	return buildRosterState(groupsById, allocated.nextGroupOrdinal)
}

function findSourceGroupId(
	groupsById: Record<string, StackRosterGroupState>,
	movedIdSet: ReadonlySet<string>,
): string | null {
	return Object.entries(groupsById).find(([, group]) => resolveGroupUnitIds(group).some((unitId) => movedIdSet.has(unitId)))?.[0] ?? null
}

/** Reconcile a move with canonical roster membership and stack naming. */
export function reconcileStackRosterMoveLifecycle(input: ReconcileStackRosterMoveLifecycleInput): ReconcileStackRosterMoveLifecycleResult {
	const rosterIndex = buildStackRosterIndex(input.stackRoster, input.defenders)
	const movedUnitIds = [...new Set(input.movedUnitIds ?? [input.movedUnitId])]
	const movedUnitIdSet = new Set(movedUnitIds)
	const sourceGroup = rosterIndex.getUnitGroup(input.movedUnitId)
	const destinationSingletonUnitIds = Object.values(input.defenders ?? {})
		.filter((unit) => unit.state !== 'destroyed'
			&& unit.typeId === input.unitType
			&& unit.position.q === input.destinationPosition.q
			&& unit.position.r === input.destinationPosition.r
			&& !movedUnitIdSet.has(unit.unitId)
			&& rosterIndex.getUnitGroup(unit.unitId) === null)
		.map((unit) => unit.unitId)
	const destinationEntry = Object.entries(rosterIndex.groupsById).find(([groupId, group]) => groupId !== sourceGroup?.groupId
		&& group.unitType === input.unitType
		&& group.position.q === input.destinationPosition.q
		&& group.position.r === input.destinationPosition.r)
	const destinationGroup = destinationEntry?.[1] ?? null
	const sourceGroupUnitCount = sourceGroup?.unitIds?.length ?? sourceGroup?.units?.length ?? 0
	const destinationGroupUnitCount = destinationGroup?.unitIds?.length ?? destinationGroup?.units?.length ?? destinationSingletonUnitIds.length
	const destinationResultUnitCount = destinationGroupUnitCount + movedUnitIds.length
	const isStackableDestination = isStackRosterUnitType(input.unitType)
	const movesWholeSourceGroup = sourceGroup !== null
		&& sourceGroup.unitIds.length > 0
		&& sourceGroup.unitIds.every((unitId) => movedUnitIdSet.has(unitId))
	const destinationGroupId = destinationEntry?.[0]
		?? (movesWholeSourceGroup ? sourceGroup.groupId : `group-${getNextGroupOrdinal(input.stackRoster)}`)
	const persistedDestinationName = destinationGroup === null || destinationGroupUnitCount <= 1
		? undefined
		: input.stackNaming?.groupsInUse.find((entry) => entry.groupId === destinationGroupId)?.groupName
	const destinationRosterName = destinationGroupUnitCount > 1 ? destinationGroup?.groupName : undefined
	const sourceRosterName = movesWholeSourceGroup && sourceGroupUnitCount > 1 ? sourceGroup?.groupName : undefined

	const namingEngine = createStackNamingEngine(input.stackNaming === undefined
		? undefined
		: {
			...input.stackNaming,
			groupsInUse: input.stackNaming.groupsInUse.filter((entry) => {
				const group = rosterIndex.groupsById[entry.groupId]
				return group !== undefined && group.unitIds.length > 1
			}),
		})
	const shouldAllocateFreshDestinationName =
		isStackableDestination
		&& destinationResultUnitCount > 1
		&& persistedDestinationName === undefined
		&& destinationGroupUnitCount <= 1
		&& destinationRosterName === undefined
		&& sourceRosterName === undefined

	const allocatedDestinationName = shouldAllocateFreshDestinationName
		? namingEngine.resolveGroupName(
			destinationGroupId,
			input.unitType,
			input.movedUnitId,
			input.movedUnitFriendlyName,
			destinationResultUnitCount,
		)
		: undefined

	const selectedNameSource: ReconcileStackRosterMoveLifecycleResult['selectedNameSource'] = persistedDestinationName !== undefined
		? 'persisted-stack-naming'
		: allocatedDestinationName !== undefined
			? 'allocated-destination-group'
			: destinationRosterName !== undefined
				? 'destination-roster-group'
				: sourceRosterName !== undefined
					? 'source-roster-group'
					: input.movedUnitFriendlyName !== undefined
						? 'defender-friendly-name'
						: 'unit-type-fallback'

	const regroupedGroupName = persistedDestinationName
		?? allocatedDestinationName
		?? destinationRosterName
		?? sourceRosterName
	const destinationGroupName = destinationResultUnitCount > 1
		? regroupedGroupName ?? input.movedUnitFriendlyName ?? input.unitType
		: input.movedUnitFriendlyName ?? input.unitType

	const stackRoster = relocateStackRosterUnits(input.stackRoster, {
		destinationUnitIds: destinationSingletonUnitIds,
		movedUnitIds,
		unitType: input.unitType,
		destinationPosition: input.destinationPosition,
		destinationGroupName,
	})

	const stackNaming = refreshStackRosterNamingSnapshot(stackRoster, input.stackNaming, input.defenders)
	const resolvedDestinationGroupId = Object.entries(stackRoster.groupsById).find(([, group]) => {
		return movedUnitIds.every((unitId) => group.unitIds.includes(unitId))
	})?.[0] ?? destinationGroupId

	return {
		stackRoster,
		stackNaming,
		destinationGroupId: resolvedDestinationGroupId,
		destinationGroupName,
		selectedNameSource,
	}
}