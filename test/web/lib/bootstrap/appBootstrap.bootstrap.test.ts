import { describe, expect, it } from 'vitest'

import { resolveWebRuntimeConfig } from '#web/lib/appBootstrap'

describe('appBootstrap bootstrap', () => {
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
			liveRefreshQuietWindowMs: 2000,
			clientLogLevel: 'info',
		})
	})

	it('accepts a rest-like game id path when the query string is absent', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: 'http://localhost:3000',
				},
				'',
				'/game/42',
				),
		).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			gameId: 42,
			liveRefreshQuietWindowMs: 2000,
			clientLogLevel: 'info',
		})
	})

	it('still accepts the older gameid path form', () => {
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
			liveRefreshQuietWindowMs: 2000,
			clientLogLevel: 'info',
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
			liveRefreshQuietWindowMs: 2000,
			clientLogLevel: 'info',
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
			liveRefreshQuietWindowMs: 2000,
			clientLogLevel: 'info',
		})
	})

	it('accepts an explicit quiet window override', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: 'http://localhost:3000',
					VITE_ONION_LIVE_REFRESH_QUIET_WINDOW_MS: '750',
				},
				'?liveRefreshQuietWindowMs=250',
				'/',
			),
		).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			gameId: null,
			liveRefreshQuietWindowMs: 250,
			clientLogLevel: 'info',
		})
	})

	it('accepts an explicit client log level override', () => {
		expect(
			resolveWebRuntimeConfig(
				{
					VITE_ONION_API_URL: 'http://localhost:3000',
					VITE_ONION_LOG_LEVEL: 'warn',
				},
				'?logLevel=debug',
				'/',
			),
		).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			gameId: null,
			liveRefreshQuietWindowMs: 2000,
			clientLogLevel: 'debug',
		})
	})
})