import type { TerrainType } from './engineTypes.js'
import type { CombatStaticRules, CombatTerrainRule } from './combatCalculator.js'
import { getAllUnitDefinitions } from './unitDefinitions.js'

const TERRAIN_RULES: Readonly<Record<TerrainType, CombatTerrainRule>> = {
	clear: { terrainType: 'clear' },
	ridgeline: { terrainType: 'ridgeline', defenseBonus: 1 },
	crater: { terrainType: 'crater' },
}

export const ONION_STATIC_RULES: CombatStaticRules = {
	unitDefinitions: getAllUnitDefinitions(),
	terrainRules: TERRAIN_RULES,
}

export function getStaticRules(): CombatStaticRules {
	return ONION_STATIC_RULES
}