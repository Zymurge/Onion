// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLobbyPolling } from '#web/lib/useLobbyPolling'

function response(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: 'OK',
		text: async () => JSON.stringify(body),
	} as Response
}

describe('useLobbyPolling', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	it('queues a refresh requested while the current list request is in flight', async () => {
		let listRequestCount = 0
		let resolveInitialList: ((value: Response) => void) | undefined
		const initialList = new Promise<Response>((resolve) => {
			resolveInitialList = resolve
		})
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			if (String(input).endsWith('/config')) {
				return response({ lobbyPollIntervalMs: 3000 })
			}

			listRequestCount += 1
			if (listRequestCount === 1) {
				return initialList
			}

			return response({ games: ['fresh'] })
		})

		const { result } = renderHook(() => useLobbyPolling<string>({
			apiBaseUrl: 'http://localhost:3000',
			token: 'token-1',
			path: 'games',
			errorMessage: 'Unable to load games.',
		}))

		await waitFor(() => expect(listRequestCount).toBe(1))
		act(() => {
			void result.current.refresh()
		})
		resolveInitialList!(response({ games: ['stale'] }))

		await waitFor(() => expect(result.current.games).toEqual(['fresh']))
		expect(listRequestCount).toBe(2)
	})
})