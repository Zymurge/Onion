export type CombatResolutionEvent = {
	type: string
	[key: string]: unknown
}

function getStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function getNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined
}

function getOutcomeLabel(outcome: unknown): 'Hit' | 'Miss' {
	return outcome === 'NE' ? 'Miss' : 'Hit'
}

export type CombatResolution = {
	actionType: 'FIRE'
	attackers: string[]
	targetId: string
	outcome: 'NE' | 'D' | 'X'
	outcomeLabel: 'Hit' | 'Miss'
	roll?: number
	odds?: string
	details: string[]
}

export function buildCombatResolution(events: ReadonlyArray<CombatResolutionEvent>): CombatResolution | undefined {
	const combatEvent = events.find((event) => event.type === 'FIRE_RESOLVED')
	if (combatEvent === undefined) {
		return undefined
	}

	const attackers = getStringArray(combatEvent.attackers ?? combatEvent.unitIds)
	const targetId = typeof combatEvent.targetId === 'string' ? combatEvent.targetId : 'unknown'
	const outcome = combatEvent.outcome === 'D' || combatEvent.outcome === 'X' || combatEvent.outcome === 'NE'
		? combatEvent.outcome
		: 'NE'
	const details: string[] = []

	for (const event of events) {
		switch (event.type) {
			case 'ONION_TREADS_LOST':
				if (typeof event.amount === 'number' && typeof event.remaining === 'number') {
					details.push(`Treads lost: ${event.amount} (remaining ${event.remaining})`)
				}
				break
			case 'ONION_BATTERY_DESTROYED':
				if (typeof event.weaponId === 'string') {
					details.push(`Destroyed weapon: ${event.weaponId}`)
				}
				break
			case 'UNIT_STATUS_CHANGED':
				if (typeof event.unitId === 'string' && typeof event.from === 'string' && typeof event.to === 'string') {
					details.push(`Status: ${event.unitId} ${event.from} → ${event.to}`)
				}
				break
			case 'UNIT_SQUADS_LOST':
				if (typeof event.unitId === 'string' && typeof event.amount === 'number') {
					details.push(`Squads lost: ${event.unitId} -${event.amount}`)
				}
				break
		}
	}

	return {
		actionType: 'FIRE',
		attackers,
		targetId,
		outcome,
		outcomeLabel: getOutcomeLabel(outcome),
		roll: getNumber(combatEvent.roll),
		odds: typeof combatEvent.odds === 'string' ? combatEvent.odds : undefined,
		details,
	}
}