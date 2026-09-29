import type { ServerGameSnapshot } from '../gameClient'

/** Builds the locked Defender handoff snapshot while destroyed units are acknowledged. */
export function buildCombatMoveHandoffSnapshot(
	screenLocked: boolean,
	currentSessionSnapshot: ServerGameSnapshot | null,
	previousSessionSnapshot: ServerGameSnapshot | null,
): ServerGameSnapshot | null {
	if (!screenLocked
		|| currentSessionSnapshot?.phase !== 'DEFENDER_MOVE'
		|| previousSessionSnapshot?.phase !== 'ONION_COMBAT'
		|| currentSessionSnapshot.gameId !== previousSessionSnapshot.gameId
		|| currentSessionSnapshot.turnNumber !== previousSessionSnapshot.turnNumber
		|| currentSessionSnapshot.authoritativeState === undefined
		|| previousSessionSnapshot.authoritativeState === undefined) {
		return null
	}

	const destroyedDefenders = Object.fromEntries(
		Object.entries(previousSessionSnapshot.authoritativeState.defenders).filter(([unitId, defender]) =>
			defender.state === 'destroyed'
				&& currentSessionSnapshot.authoritativeState?.defenders[unitId] === undefined,
		),
	)
	if (Object.keys(destroyedDefenders).length === 0) {
		return null
	}

	const previousStackRoster = previousSessionSnapshot.authoritativeState.stackRoster
	const currentStackRoster = currentSessionSnapshot.authoritativeState.stackRoster
	const preservedRoster = Object.values(previousStackRoster.groupsById).some((group) =>
		group.unitIds.some((unitId) => destroyedDefenders[unitId] !== undefined),
	)

	return {
		...currentSessionSnapshot,
		authoritativeState: {
			...currentSessionSnapshot.authoritativeState,
			defenders: {
				...currentSessionSnapshot.authoritativeState.defenders,
				...destroyedDefenders,
			},
			stackNaming: preservedRoster
				? previousSessionSnapshot.authoritativeState.stackNaming
				: currentSessionSnapshot.authoritativeState.stackNaming,
			stackRoster: preservedRoster ? previousStackRoster : currentStackRoster,
		},
	}
}
