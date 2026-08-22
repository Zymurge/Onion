import { describe, expect, it, vi } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	ARTIFACT_MANIFEST_VERSION,
	createEmptyArtifactManifest,
	readArtifactManifest,
	type ArtifactManifest,
	writeArtifactManifest,
} from '../runtime/artifactRegistry.js'
import type { ArtifactRegistryClient } from '../support/artifactRegistry.js'
import { createArtifactRegistryClient } from '../support/artifactRegistry.js'
import { PLAYWRIGHT_RUNTIME_ENV } from '../runtime/playwrightEnvironment.js'
import { bootstrapTwoPlayerGame } from './twoPlayerGame.js'
import type { SessionStore } from '#server/cli/session/store'
function createSession(): SessionStore {
	return {
		baseUrl: null,
		token: null,
		userId: null,
		username: null,
		gameId: null,
		role: null,
		lastEventSeq: null,
		scenarioId: null,
		phase: null,
		turnNumber: null,
		winner: null,
		gameState: null,
		scenario: null,
		events: [],
	}
}

describe('bootstrapTwoPlayerGame', () => {
	it('creates both players, shares one game, and registers every artifact', async () => {
		const calls: string[] = []
		const registryCalls: string[] = []
		const artifactRegistry: ArtifactRegistryClient = {
			registerUserId: vi.fn(async (userId: string): Promise<ArtifactManifest> => {
				registryCalls.push(`user:${userId}`)
				return createEmptyArtifactManifest()
			}),
			registerGameId: vi.fn(async (gameId: number): Promise<ArtifactManifest> => {
				registryCalls.push(`game:${gameId}`)
				return createEmptyArtifactManifest()
			}),
		}

		const game = await bootstrapTwoPlayerGame({
			baseUrl: 'http://engine.test',
			runId: 'fixed-run',
			onion: { username: 'onion-player', password: 'onion-pass' },
			defender: { username: 'defender-player', password: 'defender-pass' },
			artifactRegistry,
			sessionFactory: createSession,
			registerUser: async (_session, username, password) => {
				calls.push(`register:${username}:${password}`)
				return { ok: true, status: 201, data: { userId: `${username}-id`, token: `${username}-token` } }
			},
			createGame: async (session, scenarioId, role) => {
				calls.push(`create:${session.baseUrl}:${scenarioId}:${role}:${session.userId}`)
				return { ok: true, status: 201, data: { gameId: 314, role } }
			},
			joinGame: async (session, gameId) => {
				calls.push(`join:${gameId}:${session.userId}`)
				return { ok: true, status: 200, data: { gameId: Number(gameId), role: 'defender' } }
			},
		})

		expect(calls).toEqual([
			'register:onion-player:onion-pass',
			'register:defender-player:defender-pass',
			'create:http://engine.test:swamp-siege-01:onion:onion-player-id',
			'join:314:defender-player-id',
		])
		expect(registryCalls).toEqual(['user:onion-player-id', 'user:defender-player-id', 'game:314'])
		expect(game).toEqual({
		gameId: 314,
		scenarioId: 'swamp-siege-01',
		onion: {
			username: 'onion-player',
			password: 'onion-pass',
			userId: 'onion-player-id',
			token: 'onion-player-token',
			role: 'onion',
		},
		defender: {
			username: 'defender-player',
			password: 'defender-pass',
			userId: 'defender-player-id',
			token: 'defender-player-token',
			role: 'defender',
		},
		})
	})

	it('leaves the first user registered when the second user setup fails', async () => {
		const registeredUsers: string[] = []
		const registerUser = async (_session: SessionStore, username: string, password: string) => {
			if (username === 'defender-player') {
				return { ok: false as const, status: 409, body: {}, message: 'username already taken' }
			}

			return { ok: true as const, status: 201, data: { userId: 'onion-player-id', token: 'onion-player-token' } }
		}
		const artifactRegistry: ArtifactRegistryClient = {
			registerUserId: vi.fn(async (userId: string) => {
				registeredUsers.push(userId)
				return createEmptyArtifactManifest()
			}),
			registerGameId: vi.fn(),
		}

		await expect(
			bootstrapTwoPlayerGame({
				baseUrl: 'http://engine.test',
				onion: { username: 'onion-player', password: 'onion-pass' },
				defender: { username: 'defender-player', password: 'defender-pass' },
				artifactRegistry,
				sessionFactory: createSession,
				registerUser,
			}),
		).rejects.toThrow('register Defender user: username already taken')

		expect(registeredUsers).toEqual(['onion-player-id'])
		expect(artifactRegistry.registerGameId).not.toHaveBeenCalled()
	})

	it('registers the game before a join failure so cleanup can remove partial setup', async () => {
		const registryCalls: string[] = []
		const artifactRegistry: ArtifactRegistryClient = {
			registerUserId: vi.fn(async (userId: string) => {
				registryCalls.push(`user:${userId}`)
				return createEmptyArtifactManifest()
			}),
			registerGameId: vi.fn(async (gameId: number) => {
				registryCalls.push(`game:${gameId}`)
				return createEmptyArtifactManifest()
			}),
		}

		await expect(
			bootstrapTwoPlayerGame({
				baseUrl: 'http://engine.test',
				onion: { username: 'onion-player', password: 'onion-pass' },
				defender: { username: 'defender-player', password: 'defender-pass' },
				artifactRegistry,
				sessionFactory: createSession,
				registerUser: async (_session, username, password) => ({
					ok: true as const,
					status: 201,
					data: { userId: `${username}-id`, token: `${username}-token` },
				}),
				createGame: async () => ({ ok: true as const, status: 201, data: { gameId: 314, role: 'onion' as const } }),
				joinGame: async () => ({ ok: false as const, status: 503, body: {}, message: 'join unavailable' }),
			}),
		).rejects.toThrow('join game: join unavailable')

		expect(registryCalls).toEqual(['user:onion-player-id', 'user:defender-player-id', 'game:314'])
	})

	it('keeps duplicate fixture registrations unique in the shared manifest', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'onion-e2e-two-player-'))
		const artifactFile = join(directory, 'artifacts.json')
		await writeArtifactManifest(artifactFile, createEmptyArtifactManifest())
		const artifactRegistry = createArtifactRegistryClient({
			[PLAYWRIGHT_RUNTIME_ENV.webUrl]: 'http://web.test',
			[PLAYWRIGHT_RUNTIME_ENV.engineUrl]: 'http://engine.test',
			[PLAYWRIGHT_RUNTIME_ENV.runtimeFile]: join(directory, 'runtime.json'),
			[PLAYWRIGHT_RUNTIME_ENV.artifactFile]: artifactFile,
			[PLAYWRIGHT_RUNTIME_ENV.logDir]: directory,
		})
		const registerUser = async (_session: SessionStore, username: string, password: string) => ({
			ok: true as const,
			status: 201,
			data: { userId: `${username}-id`, token: `${username}-token` },
		})
		const createGame = async () => ({ ok: true as const, status: 201, data: { gameId: 314, role: 'onion' as const } })
		const joinGame = async () => ({ ok: true as const, status: 200, data: { gameId: 314, role: 'defender' as const } })
		const bootstrapOptions = {
			baseUrl: 'http://engine.test',
			onion: { username: 'onion-player', password: 'onion-pass' },
			defender: { username: 'defender-player', password: 'defender-pass' },
			artifactRegistry,
			sessionFactory: createSession,
			registerUser,
			createGame,
			joinGame,
		}

		await bootstrapTwoPlayerGame(bootstrapOptions)
		await bootstrapTwoPlayerGame(bootstrapOptions)

		expect(await readArtifactManifest(artifactFile)).toEqual({
			version: ARTIFACT_MANIFEST_VERSION,
			gameIds: [314],
			userIds: ['onion-player-id', 'defender-player-id'],
		})
	})
})