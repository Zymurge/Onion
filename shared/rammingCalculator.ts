import { getAllUnitDefinitions } from './unitDefinitions.js'

export type RammingResult = {
	treadCost: number
	destroyed: boolean
}

export type RammingOutcome = RammingResult & {
	effect: 'destroyed' | 'survived'
	roll: number
}

const UNIT_DEFINITIONS = getAllUnitDefinitions()

export function calculateRamming(unitType: string, roll?: number): RammingResult {
	const outcome = resolveRammingOutcome(unitType, roll)
	return {
		treadCost: outcome.treadCost,
		destroyed: outcome.destroyed,
	}
}

export function resolveRammingOutcome(unitType: string, roll?: number): RammingOutcome {
	const definition = UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]
	const ramProfile = definition?.abilities.ramProfile

	if (definition === undefined || ramProfile === undefined) {
		throw new Error(`Unit type '${unitType}' does not define a ram profile`)
	}

	const d6 = roll ?? (Math.floor(Math.random() * 6) + 1)
	const destroyed = d6 <= (ramProfile.destroyOnRollAtMost ?? 0)
	return {
		treadCost: ramProfile.treadLoss ?? 0,
		destroyed,
		effect: destroyed ? 'destroyed' : 'survived',
		roll: d6,
	}
}