import { getRulesContext, type RulesContext } from './rulesContext.js'

/** Basic tread-cost and destruction result for a ramming attempt. */
export type RammingResult = {
	treadCost: number
	destroyed: boolean
}

/** Ramming result including the resolved effect and die roll. */
export type RammingOutcome = RammingResult & {
	effect: 'destroyed' | 'survived'
	roll: number
}

/** Calculates the tread cost and destruction result for a ramming attempt. */
export function calculateRamming(unitType: string, roll?: number, rules?: RulesContext): RammingResult {
	const outcome = resolveRammingOutcome(unitType, roll, rules)
	return {
		treadCost: outcome.treadCost,
		destroyed: outcome.destroyed,
	}
}

/** Resolves a ramming attempt using the target unit class and supplied rules context. */
export function resolveRammingOutcome(unitType: string, roll?: number, rules?: RulesContext): RammingOutcome {
	const context = getRulesContext(rules)
	const definition = context.getUnitDefinition(unitType)
	const ramProfile = definition === undefined
		? undefined
		: context.getUnitClassRule(definition.unitClass).ram.rammedTarget

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