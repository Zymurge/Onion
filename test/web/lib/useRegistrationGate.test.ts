// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRegistrationGate } from '#web/lib/useRegistrationGate'

const requestJson = vi.hoisted(() => vi.fn())

vi.mock('#shared/apiProtocol', () => ({
	requestJson,
}))

describe('useRegistrationGate', () => {
	beforeEach(() => {
		requestJson.mockReset()
	})

	it('registers credentials without requiring a game selection', async () => {
		requestJson.mockResolvedValue({
			ok: true,
			status: 201,
			data: { username: 'Swamp Walker', token: 'test.jwt.token' },
		})

		const { result } = renderHook(() => useRegistrationGate({
			runtimeConfig: { apiBaseUrl: 'http://localhost:3000' } as never,
		}))

		await act(async () => {
			await result.current.submitRegistrationDraft({
				apiBaseUrl: 'http://localhost:3000',
				username: 'Swamp Walker',
				email: 'player@example.com',
				password: 'swamp 1234!',
			})
		})

		expect(requestJson).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3000',
			path: 'auth/register',
			method: 'POST',
			body: {
				username: 'Swamp Walker',
				email: 'player@example.com',
				password: 'swamp 1234!',
			},
		})
		expect(result.current.registeredUsername).toBe('Swamp Walker')
	})

	it('rejects an invalid email before contacting the backend', async () => {
		const { result } = renderHook(() => useRegistrationGate({
			runtimeConfig: { apiBaseUrl: 'http://localhost:3000' } as never,
		}))

		await act(async () => {
			await result.current.submitRegistrationDraft({
				apiBaseUrl: 'http://localhost:3000',
				username: 'Swamp Walker',
				email: 'player.example.com',
				password: 'swamp 1234!',
			})
		})

		expect(requestJson).not.toHaveBeenCalled()
		expect(result.current.registrationError).toBe('Enter a valid email address.')
	})

	it.each([
		['a', 'Username must be 4 to 20 characters long.'],
		['name\n', 'Username must use printable ASCII characters only.'],
		[' name', 'Username cannot start or end with spaces.'],
	])('rejects invalid username %j before contacting the backend', async (username, message) => {
		const { result } = renderHook(() => useRegistrationGate({
			runtimeConfig: { apiBaseUrl: 'http://localhost:3000' } as never,
		}))

		await act(async () => {
			await result.current.submitRegistrationDraft({
				apiBaseUrl: 'http://localhost:3000',
				username,
				email: 'player@example.com',
				password: 'swamp 1234!',
			})
		})

		expect(requestJson).not.toHaveBeenCalled()
		expect(result.current.registrationError).toBe(message)
	})

	it.each([
		['short', '1234567', 'Password must be 8 to 20 characters long.'],
		['control character', 'swamp\n1234', 'Password must use printable ASCII characters only.'],
	])('rejects invalid password %s before contacting the backend', async (_label, password, message) => {
		const { result } = renderHook(() => useRegistrationGate({
			runtimeConfig: { apiBaseUrl: 'http://localhost:3000' } as never,
		}))

		await act(async () => {
			await result.current.submitRegistrationDraft({
				apiBaseUrl: 'http://localhost:3000',
				username: 'Swamp Walker',
				email: 'player@example.com',
				password,
			})
		})

		expect(requestJson).not.toHaveBeenCalled()
		expect(result.current.registrationError).toBe(message)
	})
})
