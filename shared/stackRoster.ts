import { buildStackGroupKey } from './stackNaming.js'
import { getAllUnitDefinitions } from './unitDefinitions.js'
import type { HexPos, StackRosterGroupState, StackRosterState, StackRosterUnitState } from './types/index.js'

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
	return typeof group.groupName === 'string'
		&& typeof group.unitType === 'string'
		&& typeof group.position === 'object'
		&& group.position !== null
		&& Array.isArray(group.units)
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

		if (group.units.length === 0) {
			issues.push({ code: 'EMPTY_GROUP', message: `Group ${groupId} must contain at least one unit`, groupId })
			continue
		}

		for (const unit of group.units) {
			if (unit.id.trim().length === 0) {
				issues.push({ code: 'EMPTY_UNIT_ID', message: `Group ${groupId} contains a unit with an empty id`, groupId, unitId: unit.id })
			}

			if (seenUnitIds.has(unit.id)) {
				issues.push({ code: 'DUPLICATE_UNIT_ID', message: `Unit id ${unit.id} appears more than once in the roster`, groupId, unitId: unit.id })
			} else {
				seenUnitIds.add(unit.id)
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
		if (normalizedGroup.units.some((unit) => unit === null || typeof unit !== 'object' || typeof unit.id !== 'string' || typeof unit.status !== 'string')) {
			throw new Error(`Invalid stack roster unit shape for ${groupId}`)
		}

		const groupKey = buildStackGroupKey(normalizedGroup.unitType, normalizedGroup.position)
		const units = normalizedGroup.units.map((unit) => {
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
			unitIds: units.map((unit) => unit.id),
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