import type { TerrainType } from './types/index.js'
import type { CombatStaticRules, CombatTerrainRule } from './combatCalculator.js'
import { getUnitTypeCatalog } from './unitDefinitions.js'

const TERRAIN_RULES: Readonly<Record<TerrainType, CombatTerrainRule>> = {
	clear: { terrainType: 'clear' },
	ridgeline: { terrainType: 'ridgeline', defenseBonus: 1 },
	crater: { terrainType: 'crater' },
}

export const ONION_STATIC_RULES: CombatStaticRules = {
	unitTypes: getUnitTypeCatalog(),
	terrainRules: TERRAIN_RULES,
}

export function getStaticRules(): CombatStaticRules {
	return ONION_STATIC_RULES
}