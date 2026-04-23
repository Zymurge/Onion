import { buildStackGroupKey } from './stackNaming.js'
import type { HexPos, StackRosterGroupState, StackRosterState, StackRosterUnitState } from './types/index.js'

export { buildStackGroupKey } from './stackNaming.js'

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
		const groupKey = buildStackGroupKey(group.unitType, group.position)
		const units = group.units.map((unit) => {
			const unitView: StackRosterUnitView = {
				...unit,
				groupId,
				groupKey,
				unitType: group.unitType,
				position: group.position,
			}

			unitsById[unit.id] = unitView
			return unitView
		})

		groupsById[groupId] = {
			...group,
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