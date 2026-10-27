import {
	createStackNamingEngine,
	refreshStackNamingSnapshotFromRoster,
	type StackNamingSnapshot,
	type StackNamingSourceUnit,
} from '../stackNaming/index.js'
import type { DefenderMap, HexPos, StackRosterGroupState, StackRosterState } from '../types/index.js'
import {
	buildDefenderLookup,
	getStaticSquadCount,
	isStackRosterUnitType,
	resolveGroupUnitIds,
} from './helpers.js'
import type { StackRosterRules, StackRosterSourceUnit } from './types.js'

/** Convert persisted roster membership and defenders into naming inputs. */
export function buildStackRosterNamingSourceUnits(
	stackRoster: StackRosterState | undefined,
	defenders: DefenderMap | undefined,
	rules?: StackRosterRules,
): StackNamingSourceUnit[] {
	const defenderLookup = buildDefenderLookup(defenders)
	const sourceUnits: StackNamingSourceUnit[] = []

	for (const group of Object.values(stackRoster?.groupsById ?? {})) {
		for (const unitId of resolveGroupUnitIds(group)) {
			const unit = defenderLookup[unitId]
			if (unit === undefined) {
				throw new Error(`Missing defender for grouped unit ${unitId}`)
			}

			if (unit === null || typeof unit !== 'object' || typeof unit.state !== 'string') {
				throw new Error(`Invalid stack roster unit shape for ${group.groupName}`)
			}

			sourceUnits.push({
				unitId: unit.unitId,
				typeId: group.unitType,
				position: group.position,
				state: unit.state,
				friendlyName: unit.friendlyName,
				squads: getStaticSquadCount(group.unitType, rules),
			})
		}
	}

	return sourceUnits
}

/** Refresh stack naming from canonical roster groups and live defenders. */
export function refreshStackRosterNamingSnapshot(
	stackRoster: StackRosterState | undefined,
	seed: StackNamingSnapshot | undefined = undefined,
	defenders: DefenderMap | undefined = undefined,
	rules?: StackRosterRules,
): StackNamingSnapshot {
	return refreshStackNamingSnapshotFromRoster(seed, stackRoster, buildStackRosterNamingSourceUnits(stackRoster, defenders, rules))
}

/** Canonicalize persisted group names against the naming snapshot. */
export function canonicalizeStackRoster(
	stackRoster: StackRosterState,
	seed: StackNamingSnapshot | undefined,
	defenders: DefenderMap | undefined,
	rules?: StackRosterRules,
): { stackRoster: StackRosterState; stackNaming: StackNamingSnapshot } {
	const stackNaming = refreshStackRosterNamingSnapshot(stackRoster, seed, defenders, rules)
	const groupNamesById = new Map(stackNaming.groupsInUse.map((group) => [group.groupId, group.groupName]))
	const groupsById = Object.fromEntries(
		Object.entries(stackRoster.groupsById).map(([groupId, group]) => {
			const canonicalGroup = {
				...group,
				groupName: groupNamesById.get(groupId) ?? group.groupName,
			}
			if (group.unitIds.length <= 1) {
				delete canonicalGroup.groupName
			}
			return [groupId, canonicalGroup]
		}),
	)

	return { stackRoster: { groupsById, nextGroupOrdinal: stackRoster.nextGroupOrdinal }, stackNaming }
}

type StackRosterGroupBuilder = {
	firstUnitFriendlyName?: string
	firstUnitId: string
	unitType: string
	position: HexPos
	unitIds: string[]
}

function buildRosterGroupsFromUnits(units: ReadonlyArray<StackRosterSourceUnit>): StackRosterGroupBuilder[] {
	const groupedUnits = new Map<string, StackRosterGroupBuilder>()

	for (const unit of units) {
		if (!isStackRosterUnitType(unit.typeId)) {
			continue
		}

		const positionKey = `${unit.typeId}:${unit.position.q},${unit.position.r}`
		const existingGroup = groupedUnits.get(positionKey)
		const nextUnitIds = existingGroup?.unitIds ?? []
		groupedUnits.set(positionKey, {
			firstUnitFriendlyName: existingGroup?.firstUnitFriendlyName ?? unit.friendlyName,
			firstUnitId: existingGroup?.firstUnitId ?? unit.unitId,
			unitType: unit.typeId,
			position: unit.position,
			unitIds: [...nextUnitIds, unit.unitId],
		})
	}

	return [...groupedUnits.values()]
}

/** Build the persisted roster shape from live defender records. */
export function buildStackRosterFromUnits(units: ReadonlyArray<StackRosterSourceUnit>): StackRosterState {
	const groupsById: Record<string, StackRosterGroupState> = {}
	const namingEngine = createStackNamingEngine()
	let nextGroupOrdinal = 1

	for (const group of buildRosterGroupsFromUnits(units)) {
		if (group.unitIds.length <= 1) {
			continue
		}

		const groupId = `group-${nextGroupOrdinal}`
		nextGroupOrdinal += 1
		const groupRecord: StackRosterGroupState = {
			unitType: group.unitType,
			position: group.position,
			unitIds: group.unitIds,
		}
		groupRecord.groupName = namingEngine.resolveGroupName(
			groupId,
			group.unitType,
			group.firstUnitId,
			group.firstUnitFriendlyName,
			group.unitIds.length,
		)
		groupsById[groupId] = groupRecord
	}

	return { groupsById, nextGroupOrdinal }
}