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
	rammedUnitIds: string[]
	destroyedUnitIds: string[]
	treadDamage?: number
	details: string[]
}

export function formatRamResolutionTitle(resolution: RamResolution): string {
	if (resolution.destroyedUnitIds.length > 0 && resolution.treadDamage !== undefined && resolution.treadDamage > 0) {
		return `Ram resolved: ${resolution.destroyedUnitIds.length} destroyed, Onion lost ${resolution.treadDamage} tread${resolution.treadDamage === 1 ? '' : 's'}`
	}

	if (resolution.destroyedUnitIds.length > 0) {
		return `Ram resolved: ${resolution.destroyedUnitIds.length} destroyed`
	}

	if (resolution.treadDamage !== undefined && resolution.treadDamage > 0) {
		return `Ram resolved: target survived, Onion lost ${resolution.treadDamage} tread${resolution.treadDamage === 1 ? '' : 's'}`
	}

	return 'Ram resolved'
}

export function buildRamResolution(events: ReadonlyArray<MoveResolutionEvent>): RamResolution | undefined {
	const moveEvent = events.find((event) => event.type === 'MOVE_RESOLVED')
	if (moveEvent === undefined) {
		return undefined
	}

	const rammedUnitIds = getStringArray(moveEvent.rammedUnitIds)
	const destroyedUnitIds = getStringArray(moveEvent.destroyedUnitIds)
	const details: string[] = []

	if (rammedUnitIds.length > 0) {
		details.push(`Rammed units: ${rammedUnitIds.join(', ')}`)
	}

	for (const event of events) {
		switch (event.type) {
			case 'ONION_TREADS_LOST':
				if (typeof event.amount === 'number' && typeof event.remaining === 'number') {
					details.push(`Treads lost: ${event.amount} (remaining ${event.remaining})`)
				}
				break
			case 'UNIT_STATUS_CHANGED':
				if (typeof event.unitId === 'string' && typeof event.from === 'string' && typeof event.to === 'string') {
					details.push(`Destroyed unit: ${event.unitId} ${event.from} → ${event.to}`)
				}
				break
		}
	}

	return {
		actionType: 'MOVE',
		unitId: typeof moveEvent.unitId === 'string' ? moveEvent.unitId : 'unknown',
		rammedUnitIds,
		destroyedUnitIds,
		treadDamage: getNumber(moveEvent.treadDamage),
		details,
	}
}