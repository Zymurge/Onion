import type { ServerGameSnapshot } from '../gameClient'
import type { GameSessionViewState } from '../gameSessionTypes'
import type { GameState, TurnPhase } from '../../../shared/types/index'
import { validateStackRosterConsistency } from '../../../shared/stackRoster/index.js'
import { isSessionUnitTypeStackable } from '../sessionCatalog'

/** Human-readable labels for all supported turn phases. */
export const turnPhaseLabels: Record<TurnPhase, string> = {
	ONION_MOVE: 'Onion Movement',
	ONION_COMBAT: 'Onion Combat',
	DEFENDER_RECOVERY: 'Defender Recovery',
	DEFENDER_MOVE: 'Defender Movement',
	DEFENDER_COMBAT: 'Defender Combat',
	GEV_SECOND_MOVE: 'GEV Second Move',
}

const turnPhases = new Set<TurnPhase>(Object.keys(turnPhaseLabels) as TurnPhase[])
const unitStates = new Set(['operational', 'disabled', 'recovering', 'destroyed'])
const weaponStates = new Set(['ready', 'spent', 'destroyed'])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

function snapshotDiagnosticContext(snapshot: ServerGameSnapshot): string {
	const rawSnapshot = snapshot as unknown as Record<string, unknown>
	const gameId = typeof rawSnapshot.gameId === 'number' ? rawSnapshot.gameId : 'unknown'
	const phase = typeof rawSnapshot.phase === 'string' ? rawSnapshot.phase : 'unknown'
	const eventSeq = typeof rawSnapshot.lastEventSeq === 'number' ? rawSnapshot.lastEventSeq : 'unknown'
	const scenario = typeof rawSnapshot.scenarioName === 'string' ? rawSnapshot.scenarioName : 'unknown'
	return `gameId=${gameId}, scenario=${scenario}, phase=${phase}, lastEventSeq=${eventSeq}`
}

function describeSnapshotError(snapshot: ServerGameSnapshot, issue: string): string {
	return `Loaded game snapshot is invalid: ${issue} (${snapshotDiagnosticContext(snapshot)}). Refresh the game and report this diagnostic if it persists.`
}

function validateUnitMap(
	mapValue: unknown,
	mapName: 'onions' | 'defenders',
	snapshot: ServerGameSnapshot,
): string | null {
	if (!isRecord(mapValue)) {
		return describeSnapshotError(snapshot, `authoritativeState.${mapName} must be a unit map`)
	}

	for (const [mapUnitId, unitValue] of Object.entries(mapValue)) {
		if (!isRecord(unitValue)) {
			return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} must be a unit record`)
		}

		if (unitValue.unitId !== mapUnitId || typeof unitValue.unitId !== 'string' || unitValue.unitId.length === 0) {
			return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} has an invalid unitId`)
		}
		if (typeof unitValue.typeId !== 'string' || unitValue.typeId.length === 0) {
			return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} is missing typeId`)
		}
		if (unitValue.side !== mapName.slice(0, -1)) {
			return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} has side=${String(unitValue.side)}, expected ${mapName.slice(0, -1)}`)
		}
		if (typeof unitValue.state !== 'string' || !unitStates.has(unitValue.state)) {
			return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} has invalid state=${String(unitValue.state)}`)
		}
		if (!isRecord(unitValue.position) || !isFiniteNumber(unitValue.position.q) || !isFiniteNumber(unitValue.position.r)) {
			return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} is missing a valid position`)
		}
		if (typeof unitValue.friendlyName !== 'string' || unitValue.friendlyName.length === 0) {
			return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} is missing friendlyName`)
		}
		if (!Array.isArray(unitValue.weapons)) {
			return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId} is missing weapons data`)
		}
		for (const [weaponIndex, weaponValue] of unitValue.weapons.entries()) {
			if (!isRecord(weaponValue)) {
				return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId}.weapons[${weaponIndex}] must be a weapon record`)
			}
			if (typeof weaponValue.id !== 'string' || weaponValue.id.length === 0 || typeof weaponValue.typeId !== 'string' || weaponValue.typeId.length === 0) {
				return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId}.weapons[${weaponIndex}] is missing id or typeId`)
			}
			if (typeof weaponValue.state !== 'string' || !weaponStates.has(weaponValue.state)) {
				return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId}.weapons[${weaponIndex}] has invalid state=${String(weaponValue.state)}`)
			}
			if (typeof weaponValue.friendlyName !== 'string' || weaponValue.friendlyName.length === 0) {
				return describeSnapshotError(snapshot, `authoritativeState.${mapName}.${mapUnitId}.weapons[${weaponIndex}] is missing friendlyName`)
			}
		}
	}

	return null
}

/** Validates the loaded client snapshot before display projection. */
export function validateBattlefieldSnapshot(snapshot: ServerGameSnapshot): string | null {
	const rawSnapshot = snapshot as unknown as Record<string, unknown>
	const authoritativeState = rawSnapshot.authoritativeState

	if (typeof rawSnapshot.gameId !== 'number' || !Number.isInteger(rawSnapshot.gameId)) {
		return describeSnapshotError(snapshot, 'gameId is missing or invalid')
	}
	if (typeof rawSnapshot.scenarioName !== 'string' || rawSnapshot.scenarioName.length === 0) {
		return describeSnapshotError(snapshot, 'scenarioName is missing or invalid')
	}
	if (typeof rawSnapshot.phase !== 'string' || !turnPhases.has(rawSnapshot.phase as TurnPhase)) {
		return describeSnapshotError(snapshot, `phase is missing or invalid: ${String(rawSnapshot.phase)}`)
	}
	if (typeof rawSnapshot.lastEventSeq !== 'number' || !Number.isInteger(rawSnapshot.lastEventSeq) || rawSnapshot.lastEventSeq < 0) {
		return describeSnapshotError(snapshot, 'lastEventSeq is missing or invalid')
	}
	if (!isRecord(authoritativeState)) {
		return describeSnapshotError(snapshot, 'authoritativeState is missing')
	}

	if (!isFiniteNumber(authoritativeState.turn) || !Number.isInteger(authoritativeState.turn) || authoritativeState.turn < 1) {
		return describeSnapshotError(snapshot, 'authoritativeState.turn is missing or invalid')
	}

	const onionMapError = validateUnitMap(authoritativeState.onions, 'onions', snapshot)
	if (onionMapError !== null) {
		return onionMapError
	}
	if (Object.keys(authoritativeState.onions as object).length === 0) {
		return describeSnapshotError(snapshot, 'authoritativeState.onions contains no Onion units')
	}
	const defenderMapError = validateUnitMap(authoritativeState.defenders, 'defenders', snapshot)
	if (defenderMapError !== null) {
		return defenderMapError
	}

	const scenarioMap = rawSnapshot.scenarioMap
	if (!isRecord(scenarioMap)) {
		return describeSnapshotError(snapshot, 'scenarioMap is missing')
	}
	if (!isFiniteNumber(scenarioMap.width) || !isFiniteNumber(scenarioMap.height) || scenarioMap.width <= 0 || scenarioMap.height <= 0) {
		return describeSnapshotError(snapshot, 'scenarioMap width and height are missing or invalid')
	}
	if (!Array.isArray(scenarioMap.cells) || !Array.isArray(scenarioMap.hexes)) {
		return describeSnapshotError(snapshot, 'scenarioMap cells and hexes are missing')
	}
	for (const [cellIndex, cell] of scenarioMap.cells.entries()) {
		if (!isRecord(cell) || !isFiniteNumber(cell.q) || !isFiniteNumber(cell.r)) {
			return describeSnapshotError(snapshot, `scenarioMap.cells[${cellIndex}] is missing valid q/r coordinates`)
		}
	}
	for (const [hexIndex, hex] of scenarioMap.hexes.entries()) {
		if (!isRecord(hex) || !isFiniteNumber(hex.q) || !isFiniteNumber(hex.r) || !isFiniteNumber(hex.t)) {
			return describeSnapshotError(snapshot, `scenarioMap.hexes[${hexIndex}] is missing valid q/r/t coordinates`)
		}
	}
	if (!Array.isArray(rawSnapshot.victoryObjectives)) {
		return describeSnapshotError(snapshot, 'victoryObjectives are missing')
	}
	for (const [objectiveIndex, objective] of rawSnapshot.victoryObjectives.entries()) {
		if (!isRecord(objective) || typeof objective.id !== 'string' || objective.id.length === 0 || typeof objective.label !== 'string' || objective.label.length === 0) {
			return describeSnapshotError(snapshot, `victoryObjectives[${objectiveIndex}] is missing id or label`)
		}
	}

	return null
}

function hasImplicitStackedDefenders(authoritativeState: GameState, catalog: GameSessionViewState['catalog']): boolean {
	const stackableUnitCountsByPosition = new Map<string, number>()

	for (const defender of Object.values(authoritativeState.defenders)) {
		if (catalog === null || catalog === undefined || !isSessionUnitTypeStackable(catalog, defender.typeId)) {
			continue
		}

		const groupKey = `${defender.typeId}:${defender.position.q},${defender.position.r}`
		const nextCount = (stackableUnitCountsByPosition.get(groupKey) ?? 0) + 1
		stackableUnitCountsByPosition.set(groupKey, nextCount)
		if (nextCount > 1) {
			return true
		}
	}

	return false
}

/** Validates canonical stack-roster projection data for the display model. */
export function assertCanonicalStackProjection(authoritativeState: GameState, catalog: GameSessionViewState['catalog']): { error: string | null } {
	const stackRoster = authoritativeState.stackRoster
	const stackableDefenderIds = Object.values(authoritativeState.defenders)
		.filter((defender) => catalog !== null && catalog !== undefined && isSessionUnitTypeStackable(catalog, defender.typeId))
		.map((defender) => defender.unitId)
	const stackRosterGroupKeys = Object.keys(stackRoster?.groupsById ?? {})
	if (hasImplicitStackedDefenders(authoritativeState, catalog) && stackRoster === undefined) {
		return {
			error: `Loaded game snapshot is missing canonical stackRoster data for stacked defenders (stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=${stackRosterGroupKeys.join(', ') || 'none'})`,
		}
	}

	if (stackRoster !== undefined) {
		if (stackRoster.groupsById === undefined || stackRoster.groupsById === null || typeof stackRoster.groupsById !== 'object') {
			return {
				error: `Loaded game snapshot is missing canonical stackRoster groupsById data (stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=none)`,
			}
		}
		for (const [groupId, group] of Object.entries(stackRoster.groupsById)) {
			if (!Array.isArray(group.unitIds)) {
				return {
					error: `Loaded game snapshot has invalid stack roster group shape for ${groupId} (stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=${Object.keys(stackRoster.groupsById).join(', ') || 'none'})`,
				}
			}
		}
	}

	const consistencyIssues = catalog === null || catalog === undefined
		? validateStackRosterConsistency(authoritativeState.defenders, stackRoster)
		: validateStackRosterConsistency(authoritativeState.defenders, stackRoster, (unitType) => isSessionUnitTypeStackable(catalog, unitType))
	if (consistencyIssues.length > 0) {
		return {
			error: `Loaded game snapshot has invalid stack roster: ${consistencyIssues.map((issue) => issue.message).join('; ')} (stackableDefenders=${stackableDefenderIds.join(', ') || 'none'}, stackRosterGroups=${stackRosterGroupKeys.join(', ') || 'none'})`,
		}
	}
	return { error: null }
}
