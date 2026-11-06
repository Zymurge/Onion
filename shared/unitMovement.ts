import type { GameState, PlayerRole, TurnPhase, UnitStatus } from './types/index.js'
import { onionMovementAllowance } from './movementAllowance.js'
import { canCrossRidgelineByTerrainRule } from './movementRules.js'
import { getRulesContext, type RulesContext } from './rulesContext.js'

function getDefinition(unitType: string, rules?: RulesContext) {
	return getRulesContext(rules).getUnitDefinition(unitType)
}

function getClassRule(unitType: string, rules?: RulesContext) {
	const definition = getDefinition(unitType, rules)
	return definition === undefined ? undefined : getRulesContext(rules).getUnitClassRule(definition.unitClass)
}

/** Returns whether the unit class may cross the legacy ridgeline terrain. */
export function canUnitCrossRidgeline(unitType: string, rules?: RulesContext): boolean {
	return canCrossRidgelineByTerrainRule(unitType, rules)
}

/** Returns the maximum number of rams a unit class may initiate. */
export function getUnitRamCapacity(unitType: string, rules?: RulesContext): number {
	return getClassRule(unitType, rules)?.ram.attacker.capacity ?? 0
}

/** Returns whether the unit class may perform a second move. */
export function canUnitSecondMove(unitType: string, rules?: RulesContext): boolean {
	return getClassRule(unitType, rules)?.secondMove.allowed === true
}

/** Returns whether the unit class is immobile. */
export function isUnitImmobile(unitType: string, rules?: RulesContext): boolean {
	return getClassRule(unitType, rules)?.mobility === 'immobile'
}

/** Returns the movement allowance for a unit in the requested phase. */
export function getUnitMovementAllowance(unitType: string, phase: TurnPhase, treads?: number, side?: PlayerRole, rules?: RulesContext): number {
	const definition = getDefinition(unitType, rules)
	const isOnionClass = definition?.unitClass === 'Onion'

	if (side === 'onion') {
		if (phase !== 'ONION_MOVE') {
			return 0
		}

		return isOnionClass ? onionMovementAllowance(treads ?? 0) : definition?.movement ?? 0
	}

	if (side === 'defender') {
		if (phase === 'GEV_SECOND_MOVE') {
			return getClassRule(unitType, rules)?.secondMove.allowance ?? 0
		}

		if (phase !== 'DEFENDER_MOVE') {
			return 0
		}

		return definition?.movement ?? 0
	}

	if (isOnionClass) {
		if (phase !== 'ONION_MOVE') {
			return 0
		}

		return onionMovementAllowance(treads ?? 0)
	}

	if (phase === 'GEV_SECOND_MOVE') {
		return getClassRule(unitType, rules)?.secondMove.allowance ?? 0
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
		if (unit.state === 'destroyed') {
			continue
		}

		unit.movementSpent = {}
	}
}