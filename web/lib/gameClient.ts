import type { EventEnvelope, GameState, TurnPhase } from '../../shared/types/index'
import type { VictoryEscapeHex, VictoryObjectiveState } from '../../shared/apiProtocol'
import type { GameRequestTransport } from './gameSessionTypes'
import type { RamResolution } from './moveResolution'

export type { RamResolution } from './moveResolution'

export type ScenarioMapSnapshot = {
	width: number
	height: number
	cells: Array<{ q: number; r: number }>
	hexes: Array<{ q: number; r: number; t: number }>
}

export type GamePhase = 'onion' | 'defender'

export type ActionMode = 'fire' | 'combined' | 'end-phase'

export type CombatResolution = {
	actionType: 'FIRE'
	attackers: string[]
	attackerFriendlyNames?: string[]
	targetId: string
	targetFriendlyName?: string
	outcome: 'NE' | 'D' | 'X'
	outcomeLabel: 'Hit' | 'Miss'
	roll?: number
	odds?: string
	details: string[]
}

export type ServerGameSnapshot = {
	gameId: number
	phase: TurnPhase
	winner?: 'onion' | 'defender' | null
	scenarioName?: string
	turnNumber?: number
	lastEventSeq: number
	authoritativeState?: GameState
	movementRemainingByUnit?: Record<string, number>
	scenarioMap?: ScenarioMapSnapshot
	victoryObjectives?: VictoryObjectiveState[]
	escapeHexes?: VictoryEscapeHex[]
	combatResolution?: CombatResolution
	ramResolution?: RamResolution[]
}

// Transitional compatibility alias for older local fixtures.
// Authoritative transport and session seams must use ServerGameSnapshot instead.
export type GameSnapshot = ServerGameSnapshot & {
	selectedUnitId?: string | null
	mode?: ActionMode
}

export type GameSessionContext = {
	role: 'onion' | 'defender'
}

export type StackActionSelection = {
	anchorUnitId: string
	availableUnitIds: string[]
	selectedUnitIds: string[]
}

export type GameStateEnvelope = {
	snapshot: ServerGameSnapshot
	session: GameSessionContext
}

export type GameAction =
	| { type: 'select-unit'; unitId: string }
	| { type: 'set-mode'; mode: ActionMode }
	| { type: 'MOVE'; unitId: string; to: { q: number; r: number }; attemptRam?: boolean }
	| { type: 'MOVE_STACK'; selection: StackActionSelection; to: { q: number; r: number }; attemptRam?: boolean }
	| { type: 'FIRE'; attackers: string[]; targetId: string }
	| { type: 'FIRE_STACK'; attackers: string[]; targetId: string; selection: StackActionSelection }
	| { type: 'end-phase' }
	| { type: 'refresh' }

export type GameEvent = EventEnvelope & {
	summary?: string
}

export type GameClientError = {
	kind: 'transport' | 'not-found' | 'invalid-action'
	message: string
}

export type GameClientTransport = GameRequestTransport & {
	pollEvents?(gameId: number, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
}

export type GameClient = {
	getState(gameId: number): Promise<GameStateEnvelope>
	submitAction(gameId: number, action: GameAction): Promise<ServerGameSnapshot>
	pollEvents(gameId: number, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
}

export class GameClientSeamError extends Error {
	kind: GameClientError['kind']

	constructor(kind: GameClientError['kind'], message: string, cause?: unknown) {
		super(message)
		this.name = 'GameClientSeamError'
		this.kind = kind
		this.cause = cause
	}
}

function normalizeTransportError(error: unknown): GameClientSeamError {
	if (error instanceof GameClientSeamError) {
		return error
	}

	const message = error instanceof Error ? error.message : 'Unexpected transport failure'
	return new GameClientSeamError('transport', message, error)
}

export function createGameClient(transport: GameClientTransport): GameClient {
	return {
		async getState(gameId: number) {
			try {
				return await transport.getState(gameId)
			} catch (error) {
				throw normalizeTransportError(error)
			}
		},
		async submitAction(gameId: number, action: GameAction) {
			try {
				return await transport.submitAction(gameId, action)
			} catch (error) {
				throw normalizeTransportError(error)
			}
		},
		async pollEvents(gameId: number, afterSeq: number) {
			if (transport.pollEvents === undefined) {
				return []
			}

			try {
				return await transport.pollEvents(gameId, afterSeq)
			} catch (error) {
				throw normalizeTransportError(error)
			}
		},
	}
}
