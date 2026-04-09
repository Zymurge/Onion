import { createGame, joinGame, loginUser, type CreateOrJoinGameResponse } from './api/client.js'
import { createSessionStore, type SessionStore } from './session/store.js'

type TestGameBootstrapOptions = {
	baseUrl?: string
	firstUsername?: string
	firstPassword?: string
	secondUsername?: string
	secondPassword?: string
	scenarioId?: string
	role?: 'onion' | 'defender'
	session?: SessionStore
	login?: typeof loginUser
	create?: typeof createGame
	join?: typeof joinGame
}

function unwrapResult<T>(label: string, result: { ok: true; data: T } | { ok: false; message: string }): T {
	if (result.ok) {
		return result.data
	}

	throw new Error(`${label}: ${result.message}`)
}

function applyAuth(session: SessionStore, username: string, userId: string, token: string): void {
	session.username = username
	session.userId = userId
	session.token = token
}

export async function bootstrapTestGame(options: TestGameBootstrapOptions = {}): Promise<number> {
	const session = options.session ?? createSessionStore()
	const baseUrl = options.baseUrl ?? session.baseUrl ?? 'http://localhost:3000'
	const login = options.login ?? loginUser
	const create = options.create ?? createGame
	const join = options.join ?? joinGame
	const firstUsername = options.firstUsername ?? 'user1'
	const firstPassword = options.firstPassword ?? 'user1P4ss'
	const secondUsername = options.secondUsername ?? 'user2'
	const secondPassword = options.secondPassword ?? 'user2P4ss'
	const scenarioId = options.scenarioId ?? 'swamp-siege-01'
	const role = options.role ?? 'onion'

	session.baseUrl = baseUrl

	{
		const auth = unwrapResult('login user1', await login(session, firstUsername, firstPassword))
		applyAuth(session, firstUsername, auth.userId, auth.token)
	}
	const createdGame = unwrapResult<CreateOrJoinGameResponse>('create game', await create(session, scenarioId, role))
	session.gameId = String(createdGame.gameId)

	{
		const auth = unwrapResult('login user2', await login(session, secondUsername, secondPassword))
		applyAuth(session, secondUsername, auth.userId, auth.token)
	}
	unwrapResult('join game', await join(session, String(createdGame.gameId)))

	return createdGame.gameId
}