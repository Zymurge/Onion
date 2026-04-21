export type MoveResolutionEvent = {
	type: string
	[key: string]: unknown
}

function getStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function getNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined
}

export type RamResolution = {
	actionType: 'MOVE'
	unitId: string
	rammedUnitId: string
	rammedUnitFriendlyName: string
	destroyedUnitId: string
	treadDamage?: number
	details: string[]
}

export function formatRamResolutionTitle(resolution: RamResolution): string {
	const result = resolution.destroyedUnitId ? 'destroyed' : 'survived'
	return `Ram on ${resolution.rammedUnitFriendlyName}: ${result}`
}

function buildRamResolutionItem(options: {
	moveUnitId: string
	unitId: string
	unitFriendlyName: string
	destroyed: boolean
	roll?: number
	treadDamage?: number
}): RamResolution {
	const details = [`Target: ${options.unitFriendlyName}`, `Result: ${options.destroyed ? 'destroyed' : 'survived'}`]

	if (options.roll !== undefined) {
		details.push(`Roll: ${options.roll}`)
	}

	if (options.treadDamage !== undefined) {
		details.push(`Tread loss: ${options.treadDamage}`)
	}

	return {
		actionType: 'MOVE',
		unitId: options.moveUnitId,
		rammedUnitId: options.unitId,
		rammedUnitFriendlyName: options.unitFriendlyName,
		destroyedUnitId: options.destroyed ? options.unitId : '',
		treadDamage: options.treadDamage,
		details,
	}
}

export function buildRamResolution(events: ReadonlyArray<MoveResolutionEvent>): RamResolution[] | undefined {
	const moveEvent = events.find((event) => event.type === 'MOVE_RESOLVED')
	if (moveEvent === undefined) {
		return undefined
	}

	const moveUnitId = typeof moveEvent.unitId === 'string' ? moveEvent.unitId : 'unknown'
	const rammedUnitResults = Array.isArray(moveEvent.rammedUnitResults) ? moveEvent.rammedUnitResults : []
	const rammedUnitIds = getStringArray(moveEvent.rammedUnitIds)
	const rammedUnitFriendlyNames = getStringArray(moveEvent.rammedUnitFriendlyNames)
	const destroyedUnitIds = new Set(getStringArray(moveEvent.destroyedUnitIds))
	const destroyedUnitFriendlyNames = getStringArray(moveEvent.destroyedUnitFriendlyNames)

	if (rammedUnitResults.length > 0) {
		return rammedUnitResults.map((ramResult, index) => {
			const typedRamResult = ramResult as {
				unitId?: unknown
				unitFriendlyName?: unknown
				outcome?: { effect?: unknown; roll?: unknown; treadCost?: unknown }
			}
			const unitId = typeof typedRamResult.unitId === 'string' ? typedRamResult.unitId : `rammed-${index}`
			const unitFriendlyName = typeof typedRamResult.unitFriendlyName === 'string' && typedRamResult.unitFriendlyName.trim().length > 0
				? typedRamResult.unitFriendlyName
				: unitId
			const effect = typeof typedRamResult.outcome?.effect === 'string' ? typedRamResult.outcome.effect : undefined
			const roll = getNumber(typedRamResult.outcome?.roll)
			const treadDamage = getNumber(typedRamResult.outcome?.treadCost)

			return buildRamResolutionItem({
				moveUnitId,
				unitId,
				unitFriendlyName,
				destroyed: effect === 'destroyed',
				roll,
				treadDamage,
			})
		})
	}

	const targetUnitIds = rammedUnitIds.length > 0 ? rammedUnitIds : getStringArray(moveEvent.destroyedUnitIds)
	const targetNames = rammedUnitIds.length > 0 ? rammedUnitFriendlyNames : destroyedUnitFriendlyNames
	const singleTreadDamage = targetUnitIds.length === 1 ? getNumber(moveEvent.treadDamage) : undefined

	if (targetUnitIds.length === 0) {
		return [buildRamResolutionItem({
			moveUnitId,
			unitId: 'unknown',
			unitFriendlyName: 'unknown',
			destroyed: false,
			treadDamage: singleTreadDamage,
		})]
	}

	return targetUnitIds.map((unitId, index) => {
		const unitFriendlyName = targetNames[index] ?? unitId
		const destroyed = destroyedUnitIds.has(unitId)

		return buildRamResolutionItem({
			moveUnitId,
			unitId,
			unitFriendlyName,
			destroyed,
			treadDamage: targetUnitIds.length === 1 ? singleTreadDamage : undefined,
		})
	})
}