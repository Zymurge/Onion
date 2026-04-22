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

function hasTreadLoss(events: ReadonlyArray<CombatResolutionEvent>): boolean {
	return events.some((event) => event.type === 'ONION_TREADS_LOST')
}

function getOutcomeLabel(outcome: unknown, events: ReadonlyArray<CombatResolutionEvent>): 'Hit' | 'Miss' {
	if (outcome === 'NE') {
		return 'Miss'
	}

	if (outcome === 'D' && hasTreadLoss(events)) {
		return 'Miss'
	}

	return 'Hit'
}

function getPreferredLabel(event: CombatResolutionEvent, friendlyNameKey: string, idKey: string): string | null {
	const friendlyName = event[friendlyNameKey]
	if (typeof friendlyName === 'string' && friendlyName.length > 0) {
		return friendlyName
	}

	const id = event[idKey]
	return typeof id === 'string' && id.length > 0 ? id : null
}

export type CombatResolution = {
	actionType: 'FIRE'
	attackers: string[]
	attackerFriendlyNames?: string[]
	targetId: string
	targetFriendlyName?: string
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
	const attackerFriendlyNames = getStringArray(combatEvent.attackerFriendlyNames)
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
				{
					const weaponName = getPreferredLabel(event, 'weaponFriendlyName', 'weaponId')
					if (weaponName !== null) {
						details.push(`Destroyed weapon: ${weaponName}`)
					}
				}
				break
			case 'UNIT_STATUS_CHANGED':
				if (typeof event.from === 'string' && typeof event.to === 'string') {
					const unitName = getPreferredLabel(event, 'unitFriendlyName', 'unitId')
					if (unitName !== null) {
						details.push(`Status: ${unitName} ${event.from} → ${event.to}`)
					}
				}
				break
			case 'UNIT_SQUADS_LOST':
				if (typeof event.amount === 'number') {
					const unitName = getPreferredLabel(event, 'unitFriendlyName', 'unitId')
					if (unitName !== null) {
						details.push(`Squads lost: ${unitName}: -${event.amount}`)
					}
				}
				break
		}
	}

	return {
		actionType: 'FIRE',
		attackers,
		attackerFriendlyNames: attackerFriendlyNames.length > 0 ? attackerFriendlyNames : undefined,
		targetId,
		targetFriendlyName: typeof combatEvent.targetFriendlyName === 'string' ? combatEvent.targetFriendlyName : undefined,
		outcome,
		outcomeLabel: getOutcomeLabel(outcome, events),
		roll: getNumber(combatEvent.roll),
		odds: typeof combatEvent.odds === 'string' ? combatEvent.odds : undefined,
		details,
	}
}
