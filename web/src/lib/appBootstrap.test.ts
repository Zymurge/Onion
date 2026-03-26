import { describe, expect, it } from 'vitest'

import { resolveWebRuntimeConfig } from './appBootstrap'

describe('resolveWebRuntimeConfig', () => {
	it('prefers query gameId and trims env base url', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: ' http://localhost:3000 ',
				},
				'?gameId=123',
				),
		).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			gameId: 123,
		})
	})

	it('returns null game id when none is provided', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: '   ',
				},
				'',
				),
		).toEqual({
			apiBaseUrl: null,
			gameId: null,
		})
	})
})