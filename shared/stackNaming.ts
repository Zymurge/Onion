import { buildFriendlyName, getAllUnitDefinitions } from './unitDefinitions.js'

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

const UNIT_DEFINITIONS = getAllUnitDefinitions()

function getUnitFriendlyNameTemplate(unitType: string): string | undefined {
	return UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]?.friendlyNameTemplate
}

function stripOrdinalSuffix(name: string): string {
	return name.replace(/\s+\d+$/, '')
}

function createUniqueName(baseName: string, usedNames: Set<string>): string {
	const trimmedBaseName = baseName.trim()
	if (!usedNames.has(trimmedBaseName)) {
		usedNames.add(trimmedBaseName)
		return trimmedBaseName
	}

	let suffix = 2
	let candidate = `${trimmedBaseName} ${suffix}`
	while (usedNames.has(candidate)) {
		suffix += 1
		candidate = `${trimmedBaseName} ${suffix}`
	}

	usedNames.add(candidate)
	return candidate
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

export class StackNamingEngine {
	private readonly usedGroupNames: Set<string>
	private readonly groupsInUse: Map<string, StackNamingGroupRecord>

	constructor(seed?: StackNamingSeed) {
		this.usedGroupNames = new Set(seed?.usedGroupNames ?? [])
		this.groupsInUse = new Map((seed?.groupsInUse ?? []).map((record) => [record.groupKey, record]))
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

export function createStackNamingEngine(seed?: StackNamingSeed): StackNamingEngine {
	return new StackNamingEngine(seed)
}