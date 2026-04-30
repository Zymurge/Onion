import { buildFriendlyName, getAllUnitDefinitions } from './unitDefinitions.js'
import type { StackRosterState } from './types/index.js'

type StackNamingGroupRecord = {
	groupKey: string
	groupName: string
	unitType: string
}

export type StackNamingSnapshot = {
	groupsInUse: StackNamingGroupRecord[]
	usedGroupNames: string[]
}

export type StackNamingSeed = Partial<StackNamingSnapshot>

export type StackNamingSourceUnit = {
	id: string
	type: string
	position: { q: number; r: number }
	status: string
	squads?: number
	friendlyName?: string
}

const UNIT_DEFINITIONS = getAllUnitDefinitions()

function getUnitFriendlyNameTemplate(unitType: string): string | undefined {
	return UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]?.friendlyNameTemplate
}

function stripOrdinalSuffix(name: string): string {
	return name.replace(/\s+\d+$/, '')
}

export function buildStackGroupKey(unitType: string, position: { q: number; r: number }): string {
	return `${unitType}:${position.q},${position.r}`
}

function createUniqueName(baseName: string, usedNames: Set<string>): string {
	const trimmedBaseName = baseName.trim()
	let suffix = 1
	let candidate = `${trimmedBaseName} ${suffix}`
	while (usedNames.has(candidate)) {
		suffix += 1
		candidate = `${trimmedBaseName} ${suffix}`
	}

	usedNames.add(candidate)
	return candidate
}

function normalizeGroupName(groupName: string): string {
	const trimmedGroupName = groupName.trim()
	const groupMatch = /^(.*\sgroup)(?:\s+(\d+))?$/i.exec(trimmedGroupName)
	if (groupMatch === null) {
		return trimmedGroupName
	}

	return groupMatch[2] === undefined ? `${trimmedGroupName} 1` : trimmedGroupName
}

export function resolveStackUnitName(unitType: string, unitId: string | undefined, friendlyName?: string): string {
	const explicitFriendlyName = friendlyName?.trim()
	if (explicitFriendlyName !== undefined && explicitFriendlyName.length > 0) {
		return explicitFriendlyName
	}

	const template = getUnitFriendlyNameTemplate(unitType)
	if (template !== undefined && unitId !== undefined) {
		return buildFriendlyName(template, unitId)
	}

	return unitId ?? unitType
}

export function resolveStackLabel(
	unitType: string,
	unitId: string | undefined,
	friendlyName?: string,
	stackSize = 1,
): string {
	const unitName = resolveStackUnitName(unitType, unitId, friendlyName)

	if (/\sgroup(?:\s+\d+)?$/i.test(unitName)) {
		return unitName
	}

	if (stackSize > 1) {
		return `${stripOrdinalSuffix(unitName)} group`
	}

	return unitName
}

export function resolveStackLabelFromSnapshot(
	seed: StackNamingSnapshot | undefined,
	groupKey: string,
	unitType: string,
	unitId?: string,
	friendlyName?: string,
	stackSize = 1,
): string {
	return createStackNamingEngine(seed).resolveGroupName(groupKey, unitType, unitId, friendlyName, stackSize)
}

export class StackNamingEngine {
	private readonly usedGroupNames: Set<string>
	private readonly groupsInUse: Map<string, StackNamingGroupRecord>

	constructor(seed?: StackNamingSeed) {
		this.usedGroupNames = new Set((seed?.usedGroupNames ?? []).map(normalizeGroupName))
		this.groupsInUse = new Map(
			(seed?.groupsInUse ?? []).map((record) => [
				record.groupKey,
				{
					...record,
					groupName: normalizeGroupName(record.groupName),
				},
			]),
		)
	}

	resolveUnitName(unitType: string, unitId: string | undefined, friendlyName?: string): string {
		return resolveStackUnitName(unitType, unitId, friendlyName)
	}

	resolveGroupName(groupKey: string, unitType: string, unitId?: string, friendlyName?: string, stackSize = 1): string {
		const existingRecord = this.groupsInUse.get(groupKey)
		if (existingRecord !== undefined) {
			return existingRecord.groupName
		}

		const baseName = resolveStackLabel(unitType, unitId, friendlyName, stackSize)
		const groupName = stackSize > 1 || /\sgroup(?:\s+\d+)?$/i.test(baseName)
			? createUniqueName(baseName, this.usedGroupNames)
			: baseName

		this.groupsInUse.set(groupKey, { groupKey, groupName, unitType })
		return groupName
	}

	releaseGroup(groupKey: string): void {
		this.groupsInUse.delete(groupKey)
	}

	clearMissingGroups(activeGroupKeys: ReadonlyArray<string>): void {
		const activeGroupKeySet = new Set(activeGroupKeys)
		for (const groupKey of this.groupsInUse.keys()) {
			if (!activeGroupKeySet.has(groupKey)) {
				this.groupsInUse.delete(groupKey)
			}
		}
	}

	snapshot(): StackNamingSnapshot {
		return {
			groupsInUse: [...this.groupsInUse.values()],
			usedGroupNames: [...this.usedGroupNames],
		}
	}
}

export function refreshStackNamingSnapshotFromRoster(
	seed: StackNamingSnapshot | undefined,
	stackRoster: StackRosterState | undefined,
	unitsById: ReadonlyArray<StackNamingSourceUnit>,
): StackNamingSnapshot {
	const sourceUnitById = new Map(unitsById.map((unit) => [unit.id, unit]))
	const activeGroupKeys: string[] = []
	const rosterGroupsInUse: StackNamingGroupRecord[] = []
	const rosterUsedGroupNames: string[] = []

	for (const group of Object.values(stackRoster?.groupsById ?? {})) {
		const unitIds = group.unitIds ?? group.units?.map((unit) => unit.id) ?? []
		if (unitIds.length <= 1) {
			continue
		}

		const firstUnit = sourceUnitById.get(unitIds[0])
		if (firstUnit === undefined) {
			continue
		}

		const groupKey = buildStackGroupKey(group.unitType, group.position)
		activeGroupKeys.push(groupKey)
		const authoritativeGroupName = group.groupName.trim().length > 0
			? group.groupName
			: resolveStackLabel(group.unitType, firstUnit.id, firstUnit.friendlyName, unitIds.length)
		rosterGroupsInUse.push({
			groupKey,
			groupName: authoritativeGroupName,
			unitType: group.unitType,
		})
		rosterUsedGroupNames.push(authoritativeGroupName)
	}

	const engine = createStackNamingEngine({
		...seed,
		groupsInUse: [
			...(seed?.groupsInUse ?? []),
			...rosterGroupsInUse,
		],
		usedGroupNames: [
			...(seed?.usedGroupNames ?? []),
			...rosterUsedGroupNames,
		],
	})
	engine.clearMissingGroups(activeGroupKeys)
	return engine.snapshot()
}

export function createStackNamingEngine(seed?: StackNamingSeed): StackNamingEngine {
	return new StackNamingEngine(seed)
}