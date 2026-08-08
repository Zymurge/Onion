import { test as base } from '@playwright/test'
import {
	createGame as createGameRequest,
	joinGame as joinGameRequest,
	registerUser as registerUserRequest,
	type AuthResponse,
	type CreateOrJoinGameResponse,
} from '#server/cli/api/client'
import { createSessionStore, type SessionRole, type SessionStore } from '#server/cli/session/store'
import {
	createArtifactRegistryClient,
	type ArtifactRegistryClient,
} from '../support/artifactRegistry.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import type { ApiResult } from '#shared/apiProtocol'

export type TwoPlayerIdentity = {
	username: string
	password: string
	userId: string
	token: string
	role: SessionRole
}

export type TwoPlayerGame = {
	gameId: number
	scenarioId: string
	onion: TwoPlayerIdentity
	defender: TwoPlayerIdentity
}

export type PlayerCredentials = {
	username: string
	password: string
}

export type TwoPlayerGameBootstrapOptions = {
	baseUrl?: string
	scenarioId?: string
	onion?: PlayerCredentials
	defender?: PlayerCredentials
	artifactRegistry?: ArtifactRegistryClient
	sessionFactory?: () => SessionStore
	registerUser?: typeof registerUserRequest
	createGame?: typeof createGameRequest
	joinGame?: typeof joinGameRequest
	runId?: string
}

export type TwoPlayerWorkerFixtures = {
	twoPlayerScenarioId: string
	twoPlayerGame: TwoPlayerGame
}

function uniqueRunId(): string {
	return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultCredentials(role: SessionRole, runId: string): PlayerCredentials {
	return {
		username: `e2e-${role}-${runId}`,
		password: `OnionE2E-${role}-${runId}`,
	}
}

function unwrapResult<T>(label: string, result: ApiResult<T>): T {
	if (result.ok) {
		return result.data
	}

	throw new Error(`${label}: ${result.message}`)
}

function applyAuth(session: SessionStore, credentials: PlayerCredentials, auth: AuthResponse, role: SessionRole): void {
	session.username = credentials.username
	session.userId = auth.userId
	session.token = auth.token
	session.role = role
}

function createSession(baseUrl: string, sessionFactory: () => SessionStore): SessionStore {
	const session = sessionFactory()
	session.baseUrl = baseUrl
	return session
}

/** Creates two isolated users and one shared game, registering every artifact as it is created. */
export async function bootstrapTwoPlayerGame(options: TwoPlayerGameBootstrapOptions = {}): Promise<TwoPlayerGame> {
	const baseUrl = options.baseUrl ?? readPlaywrightRuntime().engineUrl
	const scenarioId = options.scenarioId ?? 'swamp-siege-01'
	const runId = options.runId ?? uniqueRunId()
	const onion = options.onion ?? defaultCredentials('onion', runId)
	const defender = options.defender ?? defaultCredentials('defender', runId)
	const artifactRegistry = options.artifactRegistry ?? createArtifactRegistryClient()
	const sessionFactory = options.sessionFactory ?? createSessionStore
	const registerUser = options.registerUser ?? registerUserRequest
	const createGame = options.createGame ?? createGameRequest
	const joinGame = options.joinGame ?? joinGameRequest

	const onionSession = createSession(baseUrl, sessionFactory)
	const onionAuth = unwrapResult('register Onion user', await registerUser(onionSession, onion.username, onion.password))
	await artifactRegistry.registerUserId(onionAuth.userId)
	applyAuth(onionSession, onion, onionAuth, 'onion')

	const defenderSession = createSession(baseUrl, sessionFactory)
	const defenderAuth = unwrapResult('register Defender user', await registerUser(defenderSession, defender.username, defender.password))
	await artifactRegistry.registerUserId(defenderAuth.userId)
	applyAuth(defenderSession, defender, defenderAuth, 'defender')

	const createdGame = unwrapResult<CreateOrJoinGameResponse>('create game', await createGame(onionSession, scenarioId, 'onion'))
	await artifactRegistry.registerGameId(createdGame.gameId)

	unwrapResult('join game', await joinGame(defenderSession, String(createdGame.gameId)))

	return {
		gameId: createdGame.gameId,
		scenarioId,
		onion: { ...onion, ...onionAuth, role: 'onion' },
		defender: { ...defender, ...defenderAuth, role: 'defender' },
	}
}

/** Worker-scoped setup keeps one match available to a sequential two-player scenario file. */
export const test = base.extend<{}, TwoPlayerWorkerFixtures>({
	twoPlayerScenarioId: ['swamp-siege-01', { option: true, scope: 'worker' }],
	twoPlayerGame: [
		async ({ twoPlayerScenarioId }, use) => {
			await use(await bootstrapTwoPlayerGame({ scenarioId: twoPlayerScenarioId }))
		},
		{ scope: 'worker' },
	],
})

export { expect } from '@playwright/test'