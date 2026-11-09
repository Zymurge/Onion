import type { CombatStaticRules } from './combatCalculator.js'
import { getUnitTypeCatalog } from './unitDefinitions.js'

export const ONION_STATIC_RULES: CombatStaticRules = {
	unitTypes: getUnitTypeCatalog(),
}

export function getStaticRules(): CombatStaticRules {
	return ONION_STATIC_RULES
}