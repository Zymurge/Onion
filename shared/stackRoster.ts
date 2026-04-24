import { buildStackGroupKey } from './stackNaming.js'
import { getAllUnitDefinitions } from './unitDefinitions.js'
import type { DefenderUnit, HexPos, StackRosterGroupState, StackRosterState, StackRosterUnitState } from './types/index.js'

export { buildStackGroupKey } from './stackNaming.js'

const UNIT_DEFINITIONS = getAllUnitDefinitions()

type StackRosterSourceUnit = {
	id: string
	type: string
	position: HexPos
	status: StackRosterUnitState['status']
	friendlyName?: string
	squads?: number
	weapons?: StackRosterUnitState['weapons']
	targetRules?: StackRosterUnitState['targetRules']
}

export type StackRosterValidationIssue = {
	code:
		| 'EMPTY_GROUP'
		| 'EMPTY_UNIT_ID'
		| 'EMPTY_GROUP_NAME'
		| 'EMPTY_UNIT_TYPE'
		| 'INVALID_POSITION'
		| 'DUPLICATE_UNIT_ID'
	message: string
	groupId: string
	unitId?: string
}

export type StackRosterConsistencyIssue = {
	code:
		| 'GROUP_MEMBER_NOT_FOUND'
		| 'GROUP_MEMBER_TYPE_MISMATCH'
		| 'GROUP_MEMBER_POSITION_MISMATCH'
		| 'MEMBER_IN_MULTIPLE_GROUPS'
		| 'NON_STACKABLE_GROUP'
	message: string
	groupId: string
	unitId?: string
}

export type SplitStackRosterGroupInput = {
	groupId: string
	newGroupId: string
	newGroupName: string
	movedUnitIds: string[]
	newPosition?: HexPos
}

export type StackRosterUnitView = StackRosterUnitState & {
	groupId: string
	groupKey: string
	unitType: string
	position: HexPos
}

export type StackRosterGroupView = StackRosterGroupState & {
	groupId: string
	groupKey: string
	unitIds: string[]
	units: StackRosterUnitView[]
}

export type StackRosterIndex = {
	groupsById: Record<string, StackRosterGroupView>
	unitsById: Record<string, StackRosterUnitView>
	getGroupUnits(groupId: string): StackRosterUnitView[]
	getUnitGroup(unitId: string): StackRosterGroupView | null
}

type StackRosterGroupBuilder = {
	groupId: string
	groupName: string
	unitType: string
	position: HexPos
	units: Array<Omit<StackRosterUnitState, 'squads'>>
}

function isStackRosterGroupState(candidate: unknown): candidate is StackRosterGroupState {
	if (candidate === null || typeof candidate !== 'object') {
		return false
	}

	const group = candidate as StackRosterGroupState
	const hasUnits = Array.isArray(group.units)
	const hasUnitIds = Array.isArray(group.unitIds)
	return typeof group.groupName === 'string'
		&& typeof group.unitType === 'string'
		&& typeof group.position === 'object'
		&& group.position !== null
		&& (hasUnits || hasUnitIds)
}

function normalizeStackRosterGroup(groupId: string, candidate: unknown): StackRosterGroupState {
	if (!isStackRosterGroupState(candidate)) {
		throw new Error(`Invalid stack roster group shape for ${groupId}`)
	}

	return candidate
}

function isStackRosterUnitType(unitType: string): boolean {
	return (UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]?.abilities.maxStacks ?? 1) > 1
}

function resolveGroupUnitIds(group: StackRosterGroupState): string[] {
	if (Array.isArray(group.unitIds)) {
		return [...group.unitIds]
	}

	return (group.units ?? []).map((unit) => unit.id)
}

function buildRosterGroupsFromUnits(units: ReadonlyArray<StackRosterSourceUnit>): StackRosterGroupBuilder[] {
	const groupedUnits = new Map<string, StackRosterGroupBuilder>()

	for (const unit of units) {
		if (!isStackRosterUnitType(unit.type)) {
			continue
		}

		const groupId = buildStackGroupKey(unit.type, unit.position)
		const existingGroup = groupedUnits.get(groupId)
		const nextUnits = existingGroup?.units ?? []
		groupedUnits.set(groupId, {
			groupId,
			groupName: existingGroup?.groupName ?? unit.friendlyName ?? unit.type,
			unitType: unit.type,
			position: unit.position,
			units: [
				...nextUnits,
				{
					id: unit.id,
					status: unit.status,
					friendlyName: unit.friendlyName ?? unit.id,
					weapons: unit.weapons,
					targetRules: unit.targetRules,
				},
			],
		})
	}

	return [...groupedUnits.values()]
}

export function buildStackRosterFromUnits(units: ReadonlyArray<StackRosterSourceUnit>): StackRosterState {
	const groupsById: Record<string, StackRosterGroupState> = {}

	for (const group of buildRosterGroupsFromUnits(units)) {
		groupsById[group.groupId] = {
			groupName: group.groupName,
			unitType: group.unitType,
			position: group.position,
			units: group.units,
		}
	}

	return { groupsById }
}

function isValidPosition(position: HexPos): boolean {
	return Number.isFinite(position.q) && Number.isFinite(position.r)
}

export function validateStackRoster(stackRoster: StackRosterState | undefined): StackRosterValidationIssue[] {
	const issues: StackRosterValidationIssue[] = []
	const seenUnitIds = new Set<string>()

	for (const [groupId, group] of Object.entries(stackRoster?.groupsById ?? {})) {
		if (group.groupName.trim().length === 0) {
			issues.push({ code: 'EMPTY_GROUP_NAME', message: `Group ${groupId} must have a non-empty groupName`, groupId })
		}

		if (group.unitType.trim().length === 0) {
			issues.push({ code: 'EMPTY_UNIT_TYPE', message: `Group ${groupId} must have a non-empty unitType`, groupId })
		}

		if (!isValidPosition(group.position)) {
			issues.push({ code: 'INVALID_POSITION', message: `Group ${groupId} must have a valid position`, groupId })
		}

		const groupUnitIds = Array.isArray(group.unitIds)
			? group.unitIds
			: (group.units ?? []).map((unit) => unit.id)

		if (groupUnitIds.length === 0) {
			issues.push({ code: 'EMPTY_GROUP', message: `Group ${groupId} must contain at least one unit`, groupId })
			continue
		}

		for (const unitId of groupUnitIds) {
			if (unitId.trim().length === 0) {
				issues.push({ code: 'EMPTY_UNIT_ID', message: `Group ${groupId} contains a unit with an empty id`, groupId, unitId })
			}

			if (seenUnitIds.has(unitId)) {
				issues.push({ code: 'DUPLICATE_UNIT_ID', message: `Unit id ${unitId} appears more than once in the roster`, groupId, unitId })
			} else {
				seenUnitIds.add(unitId)
			}
		}
	}

	return issues
}

export function buildStackRosterIndex(stackRoster: StackRosterState | undefined): StackRosterIndex {
	const groupsById: Record<string, StackRosterGroupView> = {}
	const unitsById: Record<string, StackRosterUnitView> = {}

	for (const [groupId, group] of Object.entries(stackRoster?.groupsById ?? {})) {
		const normalizedGroup = normalizeStackRosterGroup(groupId, group)
		const normalizedUnits = normalizedGroup.units ?? []
		if (normalizedUnits.some((unit) => unit === null || typeof unit !== 'object' || typeof unit.id !== 'string' || typeof unit.status !== 'string')) {
			throw new Error(`Invalid stack roster unit shape for ${groupId}`)
		}

		const groupKey = buildStackGroupKey(normalizedGroup.unitType, normalizedGroup.position)
		const units = normalizedUnits.map((unit) => {
			const unitView: StackRosterUnitView = {
				...unit,
				groupId,
				groupKey,
				unitType: normalizedGroup.unitType,
				position: normalizedGroup.position,
			}

			unitsById[unit.id] = unitView
			return unitView
		})

		groupsById[groupId] = {
			...normalizedGroup,
			groupId,
			groupKey,
			unitIds: normalizedGroup.unitIds ?? units.map((unit) => unit.id),
			units,
		}
	}

	return {
		groupsById,
		unitsById,
		getGroupUnits(groupId: string) {
			return groupsById[groupId]?.units ?? []
		},
		getUnitGroup(unitId: string) {
			const unit = unitsById[unitId]
			if (unit === undefined) {
				return null
			}

			return groupsById[unit.groupId] ?? null
		},
	}
}

export function validateStackRosterConsistency(
	defenders: Record<string, DefenderUnit> | undefined,
	stackRoster: StackRosterState | undefined,
): StackRosterConsistencyIssue[] {
	const issues: StackRosterConsistencyIssue[] = []
	const seenMemberIds = new Map<string, string>()

	for (const [groupId, group] of Object.entries(stackRoster?.groupsById ?? {})) {
		if (!isStackRosterUnitType(group.unitType)) {
			issues.push({
				code: 'NON_STACKABLE_GROUP',
				message: `Group ${groupId} has non-stackable unit type ${group.unitType}`,
				groupId,
			})
		}

		for (const unitId of resolveGroupUnitIds(group)) {
			const priorGroupId = seenMemberIds.get(unitId)
			if (priorGroupId !== undefined && priorGroupId !== groupId) {
				issues.push({
					code: 'MEMBER_IN_MULTIPLE_GROUPS',
					message: `Unit ${unitId} appears in both ${priorGroupId} and ${groupId}`,
					groupId,
					unitId,
				})
			} else {
				seenMemberIds.set(unitId, groupId)
			}

			const defender = defenders?.[unitId]
			if (defender === undefined) {
				issues.push({
					code: 'GROUP_MEMBER_NOT_FOUND',
					message: `Group ${groupId} references missing defender ${unitId}`,
					groupId,
					unitId,
				})
				continue
			}

			if (defender.type !== group.unitType) {
				issues.push({
					code: 'GROUP_MEMBER_TYPE_MISMATCH',
					message: `Group ${groupId} expects ${group.unitType} but ${unitId} is ${defender.type}`,
					groupId,
					unitId,
				})
			}

			if (defender.position.q !== group.position.q || defender.position.r !== group.position.r) {
				issues.push({
					code: 'GROUP_MEMBER_POSITION_MISMATCH',
					message: `Group ${groupId} position does not match defender ${unitId}`,
					groupId,
					unitId,
				})
			}
		}
	}

	return issues
}

export function expandStackRosterGroups(
	defenders: Record<string, DefenderUnit> | undefined,
	stackRoster: StackRosterState | undefined,
): StackRosterState {
	const groupsById = Object.fromEntries(
		Object.entries(stackRoster?.groupsById ?? {}).map(([groupId, group]) => {
			const unitIds = resolveGroupUnitIds(group).filter((unitId) => defenders?.[unitId] !== undefined)
			const units = unitIds.map((unitId) => {
				const defender = defenders?.[unitId] as DefenderUnit
				return {
					id: unitId,
					status: defender.status,
					friendlyName: defender.friendlyName ?? unitId,
					weapons: defender.weapons,
					targetRules: defender.targetRules,
				}
			})

			return [
				groupId,
				{
					groupId,
					groupName: group.groupName,
					unitType: group.unitType,
					position: group.position,
					unitIds,
					units,
				},
			]
		}),
	)

	return { groupsById }
}

export function retireStackRosterGroup(stackRoster: StackRosterState | undefined, groupId: string): StackRosterState {
	const groupsById = { ...(stackRoster?.groupsById ?? {}) }
	delete groupsById[groupId]
	return { groupsById }
}

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
		units: undefined,
	}

	return { groupsById }
}

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
			units: undefined,
		}
	}

	groupsById[input.newGroupId] = {
		groupId: input.newGroupId,
		groupName: input.newGroupName,
		unitType: sourceGroup.unitType,
		position: input.newPosition ?? sourceGroup.position,
		unitIds: sourceUnitIds.filter((unitId) => movedIdSet.has(unitId)),
		units: undefined,
	}

	return { groupsById }
}
