export type GamePhase = 'onion' | 'defender'

export type ActionMode = 'fire' | 'combined' | 'end-phase'

export type GameSnapshot = {
	gameId: string
	phase: GamePhase
	selectedUnitId: string | null
	mode: ActionMode
	lastEventSeq: number
}

export type GameAction =
	| { type: 'select-unit'; unitId: string }
	| { type: 'set-mode'; mode: ActionMode }
	| { type: 'refresh' }

export type GameEvent = {
	seq: number
	type: string
	summary: string
	timestamp: string
}

export type GameClientError = {
	kind: 'transport' | 'not-found' | 'invalid-action'
	message: string
}

export type GameClientTransport = {
	getState(gameId: string): Promise<GameSnapshot>
	submitAction(gameId: string, action: GameAction): Promise<GameSnapshot>
	pollEvents?(gameId: string, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
}

export type GameClient = {
	getState(gameId: string): Promise<GameSnapshot>
	submitAction(gameId: string, action: GameAction): Promise<GameSnapshot>
	pollEvents(gameId: string, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
}

export function createGameClient(_transport: GameClientTransport): GameClient {
	throw new Error('Game client seam is not implemented yet')
}