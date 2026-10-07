import type { GameState, PlayerRole, TurnPhase, UnitStatus } from './types/index.js'
import { onionMovementAllowance } from './movementAllowance.js'
import { canCrossRidgelineByTerrainRule } from './movementRules.js'
import { getRulesContext, type RulesContext } from './rulesContext.js'

function getDefinition(unitType: string, rules?: RulesContext) {
	return getRulesContext(rules).getUnitDefinition(unitType)
}

export function canUnitCrossRidgeline(unitType: string, rules?: RulesContext): boolean {
	return canCrossRidgelineByTerrainRule(unitType, rules)
}

export function getUnitRamCapacity(unitType: string, rules?: RulesContext): number {
	return getDefinition(unitType, rules)?.abilities.ramCapacity ?? 2
}

export function canUnitSecondMove(unitType: string, rules?: RulesContext): boolean {
	return getDefinition(unitType, rules)?.abilities.secondMove === true
}

export function isUnitImmobile(unitType: string, rules?: RulesContext): boolean {
	return getDefinition(unitType, rules)?.abilities.immobile === true
}

export function getUnitMovementAllowance(unitType: string, phase: TurnPhase, treads?: number, side?: PlayerRole, rules?: RulesContext): number {
	const definition = getDefinition(unitType, rules)

	if (side === 'onion') {
		if (phase !== 'ONION_MOVE') {
			return 0
		}

		return unitType === 'TheOnion' ? onionMovementAllowance(treads ?? 0) : definition?.movement ?? 0
	}

	if (side === 'defender') {
		if (phase === 'GEV_SECOND_MOVE') {
			return canUnitSecondMove(unitType, rules) ? definition?.abilities.secondMoveAllowance ?? 0 : 0
		}

		if (phase !== 'DEFENDER_MOVE') {
			return 0
		}

		return definition?.movement ?? 0
	}

	if (unitType === 'TheOnion') {
		if (phase !== 'ONION_MOVE') {
			return 0
		}

		return onionMovementAllowance(treads ?? 0)
	}

	if (phase === 'GEV_SECOND_MOVE') {
		return canUnitSecondMove(unitType, rules) ? definition?.abilities.secondMoveAllowance ?? 0 : 0
	}

	if (phase !== 'DEFENDER_MOVE') {
		return 0
	}

	return definition?.movement ?? 0
}

export function getUnitMovementSpent(unit: Pick<UnitStatus, 'movementSpent'> | null | undefined, phase: TurnPhase): number {
	return unit?.movementSpent?.[phase] ?? 0
}

export function getRemainingUnitMovementAllowance(
	unit: Pick<UnitStatus, 'typeId' | 'movementSpent' | 'side'> & { treads?: number } | null | undefined,
	phase: TurnPhase,
	rules?: RulesContext,
): number {
	if (unit === null || unit === undefined) {
		return 0
	}

	return Math.max(
		getUnitMovementAllowance(unit.typeId, phase, unit.treads, unit.side, rules) - getUnitMovementSpent(unit, phase),
		0,
	)
}

export function spendUnitMovement(unit: UnitStatus, phase: TurnPhase, spent: number): void {
	if (spent <= 0) {
		return
	}

	unit.movementSpent ??= {}
	unit.movementSpent[phase] = (unit.movementSpent[phase] ?? 0) + spent
}

export function resetMovementSpent(state: GameState): void {
	for (const unit of [...Object.values(state.onions), ...Object.values(state.defenders)]) {
		unit.movementSpent = {}
	}
}