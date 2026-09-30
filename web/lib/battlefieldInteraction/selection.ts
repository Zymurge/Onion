import type { TurnPhase } from '../../../shared/types/index'
import type { ServerGameSnapshot } from '../gameClient'
import { buildWebStackSourceState, projectWebStackSourceStateToUnitIds } from '../stackSelection'
import { isWeaponSelectionId, resolveSelectionOwnerUnitId } from '../selectionIds'
import type { SessionCatalog } from '../sessionCatalog'

export function isCombatSnapshotPhase(phase: TurnPhase | null): boolean {
	return phase === 'ONION_COMBAT' || phase === 'DEFENDER_COMBAT'
}

export function buildSelectedBoardUnitIds(selectedUnitIds: string[] | null): string[] {
	return (selectedUnitIds ?? []).filter((selectionId) => !isWeaponSelectionId(selectionId))
}

export function isSelectionPresentInSnapshot(selectionId: string, snapshot: ServerGameSnapshot): boolean {
	const state = snapshot.authoritativeState
	if (state === undefined) {
		return false
	}

	if (isWeaponSelectionId(selectionId)) {
		const weaponId = selectionId.replace(/^weapon:/, '')
		return Object.values(state.onions).some((onion) => onion.weapons.some((weapon) => weapon.id === weaponId))
	}

	const unitId = resolveSelectionOwnerUnitId(selectionId)
	return state.onions[unitId] !== undefined || state.defenders[unitId] !== undefined
}

export function getSnapshotSelectionKey(snapshot: ServerGameSnapshot): string {
	const state = snapshot.authoritativeState
	if (state === undefined) {
		return `${snapshot.phase}:${snapshot.lastEventSeq}:missing`
	}

	const defenderIds = Object.keys(state.defenders).sort().join(',')
	const weaponIds = Object.values(state.onions)
		.flatMap((onion) => onion.weapons.map((weapon) => weapon.id))
		.sort()
		.join(',')
	return `${snapshot.phase}:${snapshot.lastEventSeq}:${defenderIds}:${weaponIds}`
}

export function buildVisibleStackSourceState(
	snapshot: ServerGameSnapshot | null,
	phase: TurnPhase | null,
	catalog: SessionCatalog | null,
) {
	if (snapshot?.authoritativeState === undefined) {
		return undefined
	}

	const sourceState = buildWebStackSourceState(snapshot.authoritativeState, catalog ?? undefined)
	const defenders = Object.values(sourceState.defenders ?? {}).filter((defender) => {
		const defenderCleanupStarted = phase === 'DEFENDER_MOVE'
			|| phase === 'DEFENDER_COMBAT'
			|| phase === 'GEV_SECOND_MOVE'
		return !defenderCleanupStarted || defender.state !== 'destroyed'
	})

	return projectWebStackSourceStateToUnitIds(
		sourceState,
		new Set(defenders.map((defender) => defender.unitId)),
	)
}
