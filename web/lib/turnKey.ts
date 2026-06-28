export function buildAcknowledgementTurnKey(params: {
	activeGameId: number | null
	currentTurnNumber: number | null
	sessionRole: 'onion' | 'defender' | null
	sessionTurnActive: boolean
}): string | null {
	const { activeGameId, currentTurnNumber, sessionRole, sessionTurnActive } = params

	if (!sessionTurnActive || activeGameId === null || currentTurnNumber === null || sessionRole === null) {
		return null
	}

	return `${activeGameId}:${currentTurnNumber}:${sessionRole}`
}