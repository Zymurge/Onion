import {
	buildStackGroupKey,
	createStackNamingEngine,
	type StackNamingSnapshot,
} from '../stackNaming/index.js'
import type { DefenderMap, StackRosterState } from '../types/index.js'
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

/** Remove missing defender members while preserving the persisted group shape. */
export function expandStackRosterGroups(
	stackRoster: StackRosterState | undefined,
	defenders: DefenderMap | undefined,
): StackRosterState {
	const defenderLookup = buildDefenderLookup(defenders)
	const groupsById = Object.fromEntries(
		Object.entries(stackRoster?.groupsById ?? {}).map(([groupId, group]) => {
			const unitIds = resolveGroupUnitIds(group).filter((unitId) => defenderLookup[unitId] !== undefined)

			return [
				groupId,
				{
					groupName: group.groupName,
					unitType: group.unitType,
					position: group.position,
					unitIds,
				},
			]
		}),
	)

	return { groupsById }
}

/** Retire one group without mutating the input roster. */
export function retireStackRosterGroup(stackRoster: StackRosterState | undefined, groupId: string): StackRosterState {
	const groupsById = { ...(stackRoster?.groupsById ?? {}) }
	delete groupsById[groupId]
	return { groupsById }
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

	const mergedUnitIds = [...resolveGroupUnitIds(targetGroup)]
	const seenIds = new Set(mergedUnitIds)

	for (const sourceGroupId of sourceGroupIds) {
		const sourceGroup = groupsById[sourceGroupId]
		if (sourceGroup === undefined) {
			continue
		}

		for (const unitId of resolveGroupUnitIds(sourceGroup)) {
			if (!seenIds.has(unitId)) {
				seenIds.add(unitId)
				mergedUnitIds.push(unitId)
			}
		}

		delete groupsById[sourceGroupId]
	}

	groupsById[targetGroupId] = {
		...targetGroup,
		unitIds: mergedUnitIds,
	}

	return { groupsById }
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
	if (remainingUnitIds.length === 0) {
		delete groupsById[input.groupId]
	} else {
		groupsById[input.groupId] = {
			...sourceGroup,
			unitIds: remainingUnitIds,
		}
	}

	groupsById[input.newGroupId] = {
		groupName: input.newGroupName,
		unitType: sourceGroup.unitType,
		position: input.newPosition ?? sourceGroup.position,
		unitIds: sourceUnitIds.filter((unitId) => movedIdSet.has(unitId)),
	}

	return { groupsById }
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

	const remainingUnitIds = sourceUnitIds.filter((unitId) => !movedIdSet.has(unitId))
	if (remainingUnitIds.length > 0 && (remainingUnitIds.length > 1 || isStackRosterUnitType(sourceGroup.unitType))) {
		groupsById[input.sourceGroupId] = {
			...sourceGroup,
			unitIds: remainingUnitIds,
		}
	} else {
		delete groupsById[input.sourceGroupId]
	}

	const destinationGroup = groupsById[input.destinationGroupId]
	const movedUnitIds = [...movedIdSet]
	if (destinationGroup !== undefined) {
		const destinationUnitIds = [...new Set([...destinationGroup.unitIds, ...movedUnitIds])]
		groupsById[input.destinationGroupId] = {
			...destinationGroup,
			position: input.destinationPosition,
			unitIds: destinationUnitIds,
		}
	} else if (movedUnitIds.length > 1) {
		groupsById[input.destinationGroupId] = {
			groupName: input.destinationGroupName,
			unitType: sourceGroup.unitType,
			position: input.destinationPosition,
			unitIds: movedUnitIds,
		}
	}

	return { groupsById }
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

	const destinationGroupId = buildStackGroupKey(input.unitType, input.destinationPosition)
	const destinationSourceOverlap = Object.values(groupsById).some((group) => {
		return group.unitType === input.unitType
			&& group.position.q === input.destinationPosition.q
			&& group.position.r === input.destinationPosition.r
			&& resolveGroupUnitIds(group).some((unitId) => movedIdSet.has(unitId))
	})
	if (destinationSourceOverlap) {
		return { groupsById }
	}

	for (const [groupId, group] of Object.entries(groupsById)) {
		const groupUnitIds = resolveGroupUnitIds(group)
		if (groupUnitIds.every((unitId) => !movedIdSet.has(unitId))) {
			continue
		}

		const remainingUnitIds = groupUnitIds.filter((unitId) => !movedIdSet.has(unitId))
		if (remainingUnitIds.length > 0 && (remainingUnitIds.length > 1 || isStackRosterUnitType(group.unitType))) {
			groupsById[groupId] = {
				...group,
				unitIds: remainingUnitIds,
			}
		} else {
			delete groupsById[groupId]
		}
	}

	const destinationGroup = groupsById[destinationGroupId]
	const destinationUnitIds = [
		...new Set([
			...(destinationGroup ? resolveGroupUnitIds(destinationGroup) : []),
			...input.movedUnitIds,
		]),
	]

	if (destinationUnitIds.length > 1 || isStackRosterUnitType(input.unitType)) {
		groupsById[destinationGroupId] = {
			...(destinationGroup ?? {
				groupName: input.destinationGroupName,
				unitType: input.unitType,
				position: input.destinationPosition,
			}),
			groupName: input.destinationGroupName,
			unitType: input.unitType,
			position: input.destinationPosition,
			unitIds: destinationUnitIds,
		}
	} else {
		delete groupsById[destinationGroupId]
	}

	return { groupsById }
}

function pruneBareGroupNames(snapshot: StackNamingSnapshot): StackNamingSnapshot {
	return {
		...snapshot,
		usedGroupNames: snapshot.usedGroupNames.filter((name) => !/\sgroup$/i.test(name)),
	}
}

/** Reconcile a move with canonical roster membership and stack naming. */
export function reconcileStackRosterMoveLifecycle(input: ReconcileStackRosterMoveLifecycleInput): ReconcileStackRosterMoveLifecycleResult {
	const rosterIndex = buildStackRosterIndex(input.stackRoster, input.defenders)
	const movedUnitIds = [...new Set(input.movedUnitIds ?? [input.movedUnitId])]
	const movedUnitIdSet = new Set(movedUnitIds)
	const sourceGroup = rosterIndex.getUnitGroup(input.movedUnitId)
	const destinationGroupId = buildStackGroupKey(input.unitType, input.destinationPosition)
	const destinationGroup = rosterIndex.groupsById[destinationGroupId] ?? null
	const sourceGroupUnitCount = sourceGroup?.unitIds?.length ?? sourceGroup?.units?.length ?? 0
	const sourceRemainingUnitCount = sourceGroup?.unitIds.filter((unitId) => !movedUnitIdSet.has(unitId)).length ?? 0
	const destinationGroupUnitCount = destinationGroup?.unitIds?.length ?? destinationGroup?.units?.length ?? 0
	const destinationResultUnitCount = destinationGroupUnitCount + movedUnitIds.length
	const isStackableDestination = isStackRosterUnitType(input.unitType)
	const persistedDestinationName = destinationGroup === null
		? undefined
		: input.stackNaming?.groupsInUse.find((entry) => entry.groupKey === destinationGroupId)?.groupName
	const movesWholeSourceGroup = sourceGroup !== null
		&& sourceGroup.unitIds.length > 0
		&& sourceGroup.unitIds.every((unitId) => movedUnitIdSet.has(unitId))

	const namingEngine = createStackNamingEngine(input.stackNaming)
	if (!movesWholeSourceGroup && sourceGroup !== null && sourceGroupUnitCount > 1 && !/\sgroup\s+\d+$/i.test(sourceGroup.groupName)) {
		namingEngine.resolveGroupName(
			`${sourceGroup.groupKey}:source-reserve`,
			sourceGroup.unitType,
			sourceGroup.units?.[0]?.unitId ?? input.movedUnitId,
			undefined,
			sourceGroupUnitCount,
		)
	}

	const shouldAllocateFreshDestinationName =
		isStackableDestination
		&& persistedDestinationName === undefined
		&& destinationGroupUnitCount <= 1
		&& (
			destinationGroup?.groupName === undefined
			|| sourceGroup?.groupName !== destinationGroup.groupName
			|| sourceRemainingUnitCount > 1
		)
		&& !movesWholeSourceGroup

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
			: destinationGroup?.groupName !== undefined
				? 'destination-roster-group'
				: sourceGroup?.groupName !== undefined
					? 'source-roster-group'
					: input.movedUnitFriendlyName !== undefined
						? 'defender-friendly-name'
						: 'unit-type-fallback'

	const destinationGroupName = input.stackNaming?.groupsInUse.find((entry) => entry.groupKey === destinationGroupId)?.groupName
		?? allocatedDestinationName
		?? destinationGroup?.groupName
		?? (movesWholeSourceGroup ? sourceGroup?.groupName : undefined)
		?? input.movedUnitFriendlyName
		?? input.unitType

	const stackRoster = relocateStackRosterUnits(input.stackRoster, {
		movedUnitIds,
		unitType: input.unitType,
		destinationPosition: input.destinationPosition,
		destinationGroupName,
	})

	const stackNaming = pruneBareGroupNames(refreshStackRosterNamingSnapshot(stackRoster, input.stackNaming, input.defenders))

	return {
		stackRoster,
		stackNaming,
		destinationGroupId,
		destinationGroupName,
		selectedNameSource,
	}
}