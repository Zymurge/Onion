import { expect, test } from '../fixtures/twoPlayerGame.js'
import type { WebSocketRoute } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { BattlefieldPage } from '../pages/battlefieldPage.js'
import { LoginPage } from '../pages/loginPage.js'

test.use({ twoPlayerScenarioId: 'e2e-ram-01' })

test('surfaces a rejected move without changing either player view', async ({ browser, request, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const onionContext = await browser.newContext()
	const defenderContext = await browser.newContext()
	let rejectedActionCount = 0

	try {
		const startResponse = await request.post(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/start`, {
			headers: { authorization: `Bearer ${twoPlayerGame.onion.token}` },
			data: {},
		})
		expect(startResponse.ok(), await startResponse.text()).toBe(true)

		const onionPage = await onionContext.newPage()
		const defenderPage = await defenderContext.newPage()
		const onionBattlefield = new BattlefieldPage(onionPage)
		const defenderBattlefield = new BattlefieldPage(defenderPage)

		await Promise.all([
			new LoginPage(onionPage).signIn(runtime, twoPlayerGame.onion, `/game/${twoPlayerGame.gameId}`),
			new LoginPage(defenderPage).signIn(runtime, twoPlayerGame.defender, `/game/${twoPlayerGame.gameId}`),
		])
		await Promise.all([
			onionBattlefield.waitForAuthoritativePhase('Onion Movement'),
			defenderBattlefield.waitForAuthoritativePhase('Onion Movement'),
		])

		await onionBattlefield.beginTurn()
		const onionEventSeq = await onionBattlefield.getSnapshotEventSeq()
		const defenderEventSeq = await defenderBattlefield.getSnapshotEventSeq()

		await onionPage.route(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/actions`, async (route) => {
			rejectedActionCount += 1
			await route.fulfill({
				status: 422,
				contentType: 'application/json',
				body: JSON.stringify({
					ok: false,
					error: 'Move rejected by the server for error-path coverage',
					code: 'MOVE_INVALID',
					detailCode: 'DESTINATION_BLOCKED',
					currentPhase: 'ONION_MOVE',
				}),
			})
		})

		await onionPage.getByTestId('combat-unit-onion-1').click()
		const destination = onionPage.locator('.hex-cell-reachable').first()
		await expect(destination).toBeVisible()
		await destination.click({ button: 'right' })

		await expect(onionPage.getByRole('alert')).toContainText('Failed to submit action: Error: Move rejected by the server for error-path coverage')
		await expect.poll(() => rejectedActionCount).toBe(1)
		await expect.poll(() => onionBattlefield.getSnapshotEventSeq()).toBe(onionEventSeq)
		await expect.poll(() => defenderBattlefield.getSnapshotEventSeq()).toBe(defenderEventSeq)
		await expect(onionPage.getByTestId('ram-resolution-toast')).toHaveCount(0)
		await expect(onionPage.getByTestId('combat-resolution-toast')).toHaveCount(0)
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})

test('surfaces a gameplay network failure without applying a move', async ({ browser, request, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const context = await browser.newContext()
	let failedActionCount = 0

	try {
		const startResponse = await request.post(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/start`, {
			headers: { authorization: `Bearer ${twoPlayerGame.onion.token}` },
			data: {},
		})
		expect(startResponse.ok(), await startResponse.text()).toBe(true)

		const page = await context.newPage()
		const battlefield = new BattlefieldPage(page)
		await new LoginPage(page).signIn(runtime, twoPlayerGame.onion, `/game/${twoPlayerGame.gameId}`)
		await battlefield.waitForAuthoritativePhase('Onion Movement')
		await battlefield.beginTurn()
		const eventSeq = await battlefield.getSnapshotEventSeq()

		await page.route(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/actions`, async (route) => {
			failedActionCount += 1
			await route.abort('failed')
		})

		await page.getByTestId('combat-unit-onion-1').click()
		const destination = page.locator('.hex-cell-reachable').first()
		await expect(destination).toBeVisible()
		await destination.click({ button: 'right' })

		await expect(page.getByRole('alert')).toContainText('Failed to submit action:')
		await expect.poll(() => failedActionCount).toBe(1)
		await expect.poll(() => battlefield.getSnapshotEventSeq()).toBe(eventSeq)
		await expect(page.getByTestId('ram-resolution-toast')).toHaveCount(0)
		await expect(page.getByTestId('combat-resolution-toast')).toHaveCount(0)
	} finally {
		await context.close()
	}
})

test('reports a live WebSocket disconnect in the browser', async ({ browser, request, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const context = await browser.newContext()
	let webSocketRoute: WebSocketRoute | null = null

	try {
		const startResponse = await request.post(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/start`, {
			headers: { authorization: `Bearer ${twoPlayerGame.onion.token}` },
			data: {},
		})
		expect(startResponse.ok(), await startResponse.text()).toBe(true)

		const page = await context.newPage()
		await page.routeWebSocket(
			(url) => url.pathname === `/games/${twoPlayerGame.gameId}/ws`,
			(route) => {
				route.connectToServer()
				webSocketRoute = route
			},
		)
		await new LoginPage(page).signIn(runtime, twoPlayerGame.onion, `/game/${twoPlayerGame.gameId}`)
		await expect(page.locator('.connection-status-connected')).toHaveText('Connected')

		const connectedWebSocketRoute = webSocketRoute as WebSocketRoute | null
		if (connectedWebSocketRoute === null) {
			throw new Error('Expected the gameplay WebSocket route to be connected')
		}
		await connectedWebSocketRoute.close()

		await expect(page.locator('.connection-status-disconnected')).toHaveText('Disconnected')
	} finally {
		await context.close()
	}
})

test('logs unexpected action failures with correlation context', async ({ request, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const startResponse = await request.post(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/start`, {
		headers: { authorization: `Bearer ${twoPlayerGame.onion.token}` },
		data: {},
	})
	expect(startResponse.ok(), await startResponse.text()).toBe(true)

	const response = await request.post(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/actions`, {
		headers: { authorization: `Bearer ${twoPlayerGame.onion.token}` },
		data: {
			type: 'FIRE',
			attackers: null,
			targetId: 'onion-1',
			onionId: 'onion-1',
		},
	})

	expect(response.status()).toBe(500)
	expect((await response.json()).code).toBe('INTERNAL_ERROR')

	const readEngineLog = () => readFile(`${runtime.logDir}/engine.log`, 'utf8')
	await expect.poll(readEngineLog).toMatch(/"requestId":"[^"]+"/)
	await expect.poll(readEngineLog).toContain(`"gameId":${twoPlayerGame.gameId}`)
	await expect.poll(readEngineLog).toContain(`"userId":"${twoPlayerGame.onion.userId}"`)
	await expect.poll(readEngineLog).toContain('"commandType":"FIRE"')
	await expect.poll(readEngineLog).toContain('"phase":"ONION_MOVE"')
	await expect.poll(readEngineLog).toContain('"errorName":"TypeError"')
	await expect.poll(readEngineLog).toContain('"errorMessage":"')
})
