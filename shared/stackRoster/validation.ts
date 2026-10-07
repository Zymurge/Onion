import type { DefenderMap, StackRosterState } from '../types/index.js'
import { buildDefenderLookup, isStackRosterUnitType, isValidPosition, resolveGroupUnitIds } from './helpers.js'
import type { StackRosterConsistencyIssue, StackRosterValidationIssue } from './types.js'

/** Validate the structural shape of a persisted stack roster. */
export function validateStackRoster(
	stackRoster: StackRosterState | undefined,
	defenders: DefenderMap | undefined,
): StackRosterValidationIssue[] {
	const issues: StackRosterValidationIssue[] = []
	const seenUnitIds = new Set<string>()
	const defenderLookup = buildDefenderLookup(defenders)

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

		const groupUnitIds = resolveGroupUnitIds(group)
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

			if (defenderLookup[unitId] === undefined) {
				issues.push({ code: 'EMPTY_UNIT_ID', message: `Group ${groupId} references missing canonical unit ${unitId}`, groupId, unitId })
			}
		}
	}

	return issues
}

/** Validate roster membership against the live defender map. */
export function validateStackRosterConsistency(
	defenders: DefenderMap | undefined,
	stackRoster: StackRosterState | undefined,
	isStackable: (unitType: string) => boolean = isStackRosterUnitType,
): StackRosterConsistencyIssue[] {
	const issues: StackRosterConsistencyIssue[] = []
	const seenMemberIds = new Map<string, string>()
	const groupedUnitIds = new Set<string>()

	for (const [groupId, group] of Object.entries(stackRoster?.groupsById ?? {})) {
		if (!isStackable(group.unitType)) {
			issues.push({
				code: 'NON_STACKABLE_GROUP',
				message: `Group ${groupId} has non-stackable unit type ${group.unitType}`,
				groupId,
			})
		}

		for (const unitId of resolveGroupUnitIds(group)) {
			groupedUnitIds.add(unitId)
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

			if (defender.typeId !== group.unitType) {
				issues.push({
					code: 'GROUP_MEMBER_TYPE_MISMATCH',
					message: `Group ${groupId} expects ${group.unitType} but ${unitId} is ${defender.typeId}`,
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

	for (const [defenderKey, defender] of Object.entries(defenders ?? {})) {
		const defenderId = defender.unitId ?? defenderKey
		if (!isStackRosterUnitType(defender.typeId)) {
			continue
		}

		if (groupedUnitIds.has(defenderId)) {
			continue
		}

		issues.push({
			code: 'STACKABLE_DEFENDER_MISSING_GROUP',
			message: `Defender ${defenderId} with stackable type ${defender.typeId} is missing from stack roster groups`,
			groupId: defenderId,
			unitId: defenderId,
		})
	}

	return issues
}