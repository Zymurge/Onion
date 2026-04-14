import { getAllUnitDefinitions } from './unitDefinitions.js'

export type RammingResult = {
	treadCost: number
	destroyed: boolean
}

const UNIT_DEFINITIONS = getAllUnitDefinitions()

export function calculateRamming(unitType: string, roll?: number): RammingResult {
	const definition = UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]
	const ramProfile = definition?.abilities.ramProfile

	if (definition === undefined || ramProfile === undefined) {
		throw new Error(`Unit type '${unitType}' does not define a ram profile`)
	}

	const d6 = roll ?? (Math.floor(Math.random() * 6) + 1)
	return {
		treadCost: ramProfile.treadLoss ?? 0,
		destroyed: d6 <= (ramProfile.destroyOnRollAtMost ?? 0),
	}
}