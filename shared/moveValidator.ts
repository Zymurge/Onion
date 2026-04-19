import type { Command, GameState, HexPos, TurnPhase } from './types/index.js'
import { calculateRamming } from './rammingCalculator.js'
import { findMovePath, type MoveMapSnapshot } from './movePlanner.js'
import {
	getStopOnOccupiedHexFailure,
	getTerrainMoveCost,
	type MoveOccupant,
} from './movementRules.js'
import {
	canUnitSecondMove,
	getRemainingUnitMovementAllowance,
	getUnitRamCapacity,
	isUnitImmobile,
} from './unitMovement.js'
import type { UnitStatus } from './types/index.js'

export type MoveValidationCode =
	| 'WRONG_PHASE'
	| 'UNIT_NOT_FOUND'
	| 'UNIT_NOT_OPERATIONAL'
	| 'UNIT_IMMOBILE'
	| 'NO_MOVEMENT_ALLOWANCE'
	| 'NO_PATH'
	| 'HEX_OCCUPIED'
	| 'RAM_LIMIT_EXCEEDED'
	| 'SECOND_MOVE_NOT_ALLOWED'

export type MoveValidationDetailCode =
	| 'occupied-by-onion'
	| 'occupied'
	| 'mixed-stack'
	| 'stack-limit'
	| 'prohibited-terrain'

export interface MoveCapabilities {
	canRam: boolean
	hasTreads: boolean
	canSecondMove: boolean
}

export interface MovePlan {
	unitId: string
	from: HexPos
	to: HexPos
	path: HexPos[]
	cost: number
	movementAllowance: number
	rammedUnitIds: string[]
	ramCapacityUsed: number
	treadCost: number
	capabilities: MoveCapabilities
}

export type MoveValidationResult =
	| ({ valid: true } & MovePlan)
	| { valid: false; code: MoveValidationCode; detailCode?: MoveValidationDetailCode; error: string }

export interface MoveValidationState extends GameState {
	currentPhase: TurnPhase
	turn: number
	movementSpent?: Record<string, number>
	ramsThisTurn?: number
}

type ResolvedUnit = {
	unit: {
		id?: string
		type: string
		position: HexPos
		status: UnitStatus
		squads?: number
	}
	role: 'onion' | 'defender'
}

function resolveUnit(state: MoveValidationState, unitId: string): ResolvedUnit | null {
	if (state.onion.id === unitId) {
		return {
			unit: {
				...state.onion,
				type: state.onion.type ?? 'TheOnion',
				status: state.onion.status ?? 'operational',
			},
			role: 'onion',
		}
	}

	const defenderEntry = state.defenders[unitId] ?? Object.values(state.defenders).find((unit) => unit.id === unitId)
	if (defenderEntry) {
		return { unit: defenderEntry, role: 'defender' }
	}

	return null
}

function getOccupantsAt(state: MoveValidationState, destination: HexPos, movingUnitId: string): MoveOccupant[] {
	const occupants: MoveOccupant[] = []

	if (
		state.onion.id !== movingUnitId &&
		state.onion.status !== 'destroyed' &&
		state.onion.position.q === destination.q &&
		state.onion.position.r === destination.r
	) {
		occupants.push({
			q: destination.q,
			r: destination.r,
			role: 'onion',
			unitType: state.onion.type ?? 'TheOnion',
			squads: 1,
		})
	}

	for (const [defenderId, defender] of Object.entries(state.defenders)) {
		if (defenderId === movingUnitId || defender.id === movingUnitId) continue
		if (defender.status === 'destroyed') continue
		if (defender.position.q !== destination.q || defender.position.r !== destination.r) continue

		occupants.push({
			q: defender.position.q,
			r: defender.position.r,
			role: 'defender',
			unitType: defender.type,
			squads: defender.squads,
		})
	}

	return occupants
}

function getTerrainAt(map: MoveMapSnapshot, destination: HexPos): 'clear' | 'ridgeline' | 'crater' {
	const hex = map.hexes.find((candidate) => candidate.q === destination.q && candidate.r === destination.r)
	if (!hex) {
		return 'clear'
	}

	if (hex.t === 1) return 'ridgeline'
	if (hex.t === 2) return 'crater'
	return 'clear'
}

function getMoveFailureMessage(code: MoveValidationCode, detailCode?: MoveValidationDetailCode): string {
	if (code === 'WRONG_PHASE') return 'Unit cannot move in the current phase'
	if (code === 'UNIT_NOT_FOUND') return 'Unit not found'
	if (code === 'UNIT_NOT_OPERATIONAL') return 'Unit is not operational'
	if (code === 'UNIT_IMMOBILE') return 'Unit is immobile'
	if (code === 'NO_MOVEMENT_ALLOWANCE') return 'Unit has no movement allowance'
	if (code === 'SECOND_MOVE_NOT_ALLOWED') return 'Unit cannot perform a second move'
	if (code === 'RAM_LIMIT_EXCEEDED') return 'Move would exceed ram capacity'
	if (code === 'NO_PATH') {
		if (detailCode === 'prohibited-terrain') return 'Destination terrain is impassable for this unit'
		return 'No valid path to destination'
	}
	if (detailCode === 'stack-limit') return 'Little Pigs stack limit exceeded'
	if (detailCode === 'mixed-stack') return 'Little Pigs can only stack with other Little Pigs'
	if (detailCode === 'occupied-by-onion') return 'Destination hex is occupied by the Onion'
	if (detailCode === 'occupied') return 'Destination hex is occupied'
	return 'Move is not legal'
}

function getCapabilities(unitType: string): MoveCapabilities {
	return {
		canRam: unitType === 'TheOnion',
		hasTreads: unitType === 'TheOnion',
		canSecondMove: canUnitSecondMove(unitType),
	}
}

function collectRammedUnits(state: MoveValidationState, path: HexPos[], movingUnitId: string): Array<{ unitId: string; unitType: string }> {
	const rammedUnits: Array<{ unitId: string; unitType: string }> = []

	for (const position of path) {
		for (const [defenderId, defender] of Object.entries(state.defenders)) {
			if (defenderId === movingUnitId || defender.id === movingUnitId) continue
			if (defender.status === 'destroyed') continue
			if (defender.position.q !== position.q || defender.position.r !== position.r) continue

			rammedUnits.push({ unitId: defender.id ?? defenderId, unitType: defender.type })
		}
	}

	return rammedUnits
}

export function validateMove(
	map: MoveMapSnapshot,
	state: MoveValidationState,
	command: Extract<Command, { type: 'MOVE' }>,
): MoveValidationResult {
	const resolved = resolveUnit(state, command.unitId)
	if (!resolved) {
		return { valid: false, code: 'UNIT_NOT_FOUND', error: getMoveFailureMessage('UNIT_NOT_FOUND') }
	}

	const { unit, role } = resolved
	const unitType = unit.type
	const unitId = unit.id ?? command.unitId
	const incomingSquads = unit.squads ?? 1
	if (unit.status !== 'operational') {
		return { valid: false, code: 'UNIT_NOT_OPERATIONAL', error: getMoveFailureMessage('UNIT_NOT_OPERATIONAL') }
	}
	if (isUnitImmobile(unitType)) {
		return { valid: false, code: 'UNIT_IMMOBILE', error: getMoveFailureMessage('UNIT_IMMOBILE') }
	}

	const capabilities = getCapabilities(unitType)

	if (role === 'onion') {
		if (state.currentPhase !== 'ONION_MOVE') {
			return { valid: false, code: 'WRONG_PHASE', error: getMoveFailureMessage('WRONG_PHASE') }
		}
	} else if (state.currentPhase === 'GEV_SECOND_MOVE') {
		if (!capabilities.canSecondMove) {
			return { valid: false, code: 'SECOND_MOVE_NOT_ALLOWED', error: getMoveFailureMessage('SECOND_MOVE_NOT_ALLOWED') }
		}
	} else if (state.currentPhase !== 'DEFENDER_MOVE') {
		return { valid: false, code: 'WRONG_PHASE', error: getMoveFailureMessage('WRONG_PHASE') }
	}

	const movementAllowance = getRemainingUnitMovementAllowance(
		unitType,
		state.currentPhase,
		state,
		unitId,
		capabilities.hasTreads ? state.onion.treads : undefined,
	)

	if (movementAllowance === 0) {
		return { valid: false, code: 'NO_MOVEMENT_ALLOWANCE', error: getMoveFailureMessage('NO_MOVEMENT_ALLOWANCE') }
	}

	const occupants = getOccupantsAt(state, command.to, command.unitId)
	const stopFailure = getStopOnOccupiedHexFailure({
		movingRole: role,
		movingUnitType: unitType,
		occupants,
		incomingSquads,
	})

	if (stopFailure) {
		return {
			valid: false,
			code: 'HEX_OCCUPIED',
			detailCode: stopFailure,
			error: getMoveFailureMessage('HEX_OCCUPIED', stopFailure),
		}
	}

	const destinationTerrain = getTerrainAt(map, command.to)
	if (getTerrainMoveCost(unitType, destinationTerrain) === null) {
		return {
			valid: false,
			code: 'NO_PATH',
			detailCode: 'prohibited-terrain',
			error: getMoveFailureMessage('NO_PATH', 'prohibited-terrain'),
		}
	}

	const pathResult = findMovePath({
		map,
		from: unit.position,
		to: command.to,
		movementAllowance,
		movingRole: role,
		movingUnitType: unitType,
		incomingSquads,
	})

	if (!pathResult.found) {
		return { valid: false, code: 'NO_PATH', error: getMoveFailureMessage('NO_PATH') }
	}

	const attemptRam = command.attemptRam !== false
	const rammedUnits = capabilities.canRam && attemptRam ? collectRammedUnits(state, pathResult.path, command.unitId) : []
	const ramCapacityUsed = rammedUnits.length
	const ramCapacityLimit = getUnitRamCapacity(unitType)

	if (capabilities.canRam && (state.ramsThisTurn ?? 0) + ramCapacityUsed > ramCapacityLimit) {
		return {
			valid: false,
			code: 'RAM_LIMIT_EXCEEDED',
			error: getMoveFailureMessage('RAM_LIMIT_EXCEEDED'),
		}
	}

	const treadCost = capabilities.hasTreads
		? rammedUnits.reduce((total, rammedUnit) => total + calculateRamming(rammedUnit.unitType, 6).treadCost, 0)
		: 0

	return {
		valid: true,
		unitId,
		from: unit.position,
		to: command.to,
		path: pathResult.path,
		cost: pathResult.cost,
		movementAllowance,
		rammedUnitIds: rammedUnits.map((rammedUnit) => rammedUnit.unitId),
		ramCapacityUsed,
		treadCost,
		capabilities,
	}
}