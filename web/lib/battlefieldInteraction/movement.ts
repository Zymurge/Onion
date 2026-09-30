import { findMovePath, type MoveMapSnapshot } from '../../../shared/movePlanner'
import { getRemainingUnitMovementAllowance } from '../../../shared/unitMovement'
import type { ServerGameSnapshot } from '../gameClient'
import { getAuthoritativeOnion } from '../stackSelection'
import type { RamPrompt } from './types'

export function buildMoveMapSnapshot(snapshot: ServerGameSnapshot, movingUnitId: string): MoveMapSnapshot | null {
	const authoritativeState = snapshot.authoritativeState
	const scenarioMap = snapshot.scenarioMap

	if (authoritativeState === undefined || scenarioMap === undefined) {
		return null
	}

	const occupiedHexes: NonNullable<MoveMapSnapshot['occupiedHexes']> = [
		...Object.values(authoritativeState.onions)
			.filter((unit) => unit.unitId !== movingUnitId && unit.state !== 'destroyed')
			.map((unit) => ({ q: unit.position.q, r: unit.position.r, role: 'onion' as const, unitType: unit.typeId })),
		...Object.values(authoritativeState.defenders)
			.filter((unit) => unit.unitId !== movingUnitId && unit.state !== 'destroyed')
			.map((unit) => ({ q: unit.position.q, r: unit.position.r, role: 'defender' as const, unitType: unit.typeId })),
	]

	return {
		width: scenarioMap.width,
		height: scenarioMap.height,
		cells: scenarioMap.cells,
		hexes: scenarioMap.hexes,
		occupiedHexes,
	}
}

export function buildRamPrompt(snapshot: ServerGameSnapshot | null, unitId: string, to: { q: number; r: number }): RamPrompt | null {
	if (snapshot === null || snapshot.authoritativeState === undefined || snapshot.scenarioMap === undefined) {
		return null
	}

	if (snapshot.phase !== 'ONION_MOVE') {
		return null
	}

	const onion = snapshot.authoritativeState.onions[unitId] ?? getAuthoritativeOnion(snapshot.authoritativeState)
	if (unitId !== onion.unitId || onion.state !== 'operational') {
		return null
	}

	if (onion.ramsRemaining === 0) {
		return null
	}

	const movementAllowance = getRemainingUnitMovementAllowance(onion, snapshot.phase)
	const moveMap = buildMoveMapSnapshot(snapshot, unitId)
	if (moveMap === null) {
		return null
	}

	const pathResult = findMovePath({
		map: moveMap,
		from: onion.position,
		to,
		movementAllowance,
		movingRole: 'onion',
		movingUnitType: onion.typeId,
		incomingSquads: 1,
	})

	if (!pathResult.found) {
		return null
	}

	const occupiedLookup = new Set(moveMap.occupiedHexes?.map((occupant) => `${occupant.q},${occupant.r}`) ?? [])
	const rammedStep = pathResult.path.find((step) => occupiedLookup.has(`${step.q},${step.r}`))
	if (rammedStep === undefined) {
		return null
	}

	const targetDefender = Object.values(snapshot.authoritativeState.defenders).find((unit) => unit.position.q === rammedStep.q && unit.position.r === rammedStep.r && unit.state !== 'destroyed')
	const targetLabel = targetDefender?.typeId ?? 'occupied hex'

	return {
		unitId,
		to,
		targetLabel,
	}
}
