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
	return 'Ram attempt'
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
		details.push(`Target: ${rammedUnitIds.join(', ')}`)
	} else if (destroyedUnitIds.length > 0) {
		details.push(`Target: ${destroyedUnitIds.join(', ')}`)
	} else {
		details.push('Target: unknown')
	}

	if (destroyedUnitIds.length > 0) {
		details.push('Result: destroyed')
	} else {
		details.push('Result: survived')
	}

	for (const event of events) {
		switch (event.type) {
			case 'ONION_TREADS_LOST':
				if (typeof event.amount === 'number' && typeof event.remaining === 'number') {
					details.push(`Treads lost: ${event.amount} (remaining ${event.remaining})`)
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