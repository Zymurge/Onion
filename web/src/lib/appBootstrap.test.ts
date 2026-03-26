import { describe, expect, it } from 'vitest'

import { resolveWebRuntimeConfig } from './appBootstrap'

describe('resolveWebRuntimeConfig', () => {
	it('prefers query gameId and trims env base url', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: ' http://localhost:3000 ',
					VITE_ONION_GAME_ID: 'env-game',
				},
				'?gameId=query-game',
				),
		).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			gameId: 'query-game',
		})
	})

	it('falls back to env game id and disables empty values', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: '   ',
					VITE_ONION_GAME_ID: 'env-game',
				},
				'',
				),
		).toEqual({
			apiBaseUrl: null,
			gameId: 'env-game',
		})
	})
})