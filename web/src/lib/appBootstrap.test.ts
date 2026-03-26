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
				'/gameid/456',
				),
		).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			gameId: 123,
		})
	})

	it('accepts a rest-like game id path when the query string is absent', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: 'http://localhost:3000',
				},
				'',
				'/gameid/42',
				),
		).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			gameId: 42,
		})
	})

	it('ignores malformed path ids', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: 'http://localhost:3000',
				},
				'',
				'/gameid/not-a-number',
				),
		).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			gameId: null,
		})
	})

	it('returns null game id when none is provided', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: '   ',
				},
				'',
				'/',
				),
		).toEqual({
			apiBaseUrl: null,
			gameId: null,
		})
	})
})