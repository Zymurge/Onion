import { buildStackGroupKey } from '../stackNaming/index.js'
import type { DefenderMap, StackRosterState } from '../types/index.js'
import {
	buildDefenderLookup,
	getStaticSquadCount,
	normalizeStackRosterGroup,
	resolveGroupUnitIds,
} from './helpers.js'
import type { StackRosterGroupView, StackRosterIndex, StackRosterUnitView } from './types.js'

/** Build derived group and unit views without changing the persisted roster. */
export function buildStackRosterIndex(
	stackRoster: StackRosterState | undefined,
	defenders: DefenderMap | undefined,
): StackRosterIndex {
	const groupsById: Record<string, StackRosterGroupView> = {}
	const derivedUnitsById: Record<string, StackRosterUnitView> = {}
	const groupIdsByUnitId = new Map<string, string>()
	const defenderLookup = buildDefenderLookup(defenders)

	for (const [groupId, group] of Object.entries(stackRoster?.groupsById ?? {})) {
		const normalizedGroup = normalizeStackRosterGroup(groupId, group)
		const groupUnitIds = resolveGroupUnitIds(normalizedGroup)
		const groupKey = buildStackGroupKey(normalizedGroup.unitType, normalizedGroup.position)
		const units = groupUnitIds.map((unitId) => {
			const unit = defenderLookup[unitId]
			if (unit === undefined) {
				throw new Error(`Missing defender for grouped unit ${unitId}`)
			}

			if (
				unit === null
				|| typeof unit !== 'object'
				|| typeof unit.state !== 'string'
				|| typeof unit.unitId !== 'string'
			) {
				throw new Error(`Invalid stack roster unit shape for ${groupId}`)
			}

			const unitView: StackRosterUnitView = {
				unitId: unit.unitId,
				state: unit.state,
				friendlyName: unit.friendlyName,
				weapons: unit.weapons,
				squads: getStaticSquadCount(normalizedGroup.unitType),
				groupId,
				groupKey,
				unitType: normalizedGroup.unitType,
				position: normalizedGroup.position,
			}

			derivedUnitsById[unit.unitId] = unitView
			groupIdsByUnitId.set(unit.unitId, groupId)
			return unitView
		})

		groupsById[groupId] = {
			...normalizedGroup,
			groupId,
			groupKey,
			unitIds: groupUnitIds,
			units,
		}
	}

	return {
		groupsById,
		derivedUnitsById,
		getGroupUnits(groupId: string) {
			return groupsById[groupId]?.units ?? []
		},
		getUnitGroup(unitId: string) {
			const groupId = groupIdsByUnitId.get(unitId)
			if (groupId === undefined) {
				return null
			}

			return groupsById[groupId] ?? null
		},
	}
}