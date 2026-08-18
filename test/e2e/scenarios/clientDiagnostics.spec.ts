import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { LoginPage } from '../pages/loginPage.js'

test('reports a client session-ready diagnostic after loading the authoritative game state', async ({ browser, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const context = await browser.newContext()

	try {
		const page = await context.newPage()
		const diagnosticResponse = page.waitForResponse((response) => (
			response.url() === `${runtime.engineUrl}/games/${twoPlayerGame.gameId}/client-diagnostics`
			&& response.request().method() === 'POST'
		))

		await new LoginPage(page).connect(runtime, twoPlayerGame.onion, twoPlayerGame.gameId)

		const response = await diagnosticResponse
		expect(response.status(), await response.text()).toBe(202)
		expect(response.request().postDataJSON()).toMatchObject({
			code: 'CLIENT_SESSION_READY',
			message: 'Client loaded an authoritative game snapshot',
			snapshot: { gameId: twoPlayerGame.gameId },
			client: { build: 'web-client' },
		})
	} finally {
		await context.close()
	}
})

test('aborts both browser sessions after one client reports an invalid snapshot without retrying', async ({ browser, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const observerContext = await browser.newContext()
	const invalidClientContext = await browser.newContext()

	try {
		const observerPage = await observerContext.newPage()
		await new LoginPage(observerPage).connect(runtime, twoPlayerGame.defender, twoPlayerGame.gameId)

		const invalidClientPage = await invalidClientContext.newPage()
		let stateRequestCount = 0
		await invalidClientPage.route(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}`, async (route) => {
			stateRequestCount += 1
			const response = await route.fetch()
			const body = await response.json() as {
				state: { defenders: Record<string, Record<string, unknown>> }
			}
			const template = Object.values(body.state.defenders)[0]
			if (template === undefined) {
				throw new Error('Expected the scenario to contain a defender for the invalid snapshot test')
			}
			const position = template.position as { q: number; r: number }
			body.state.defenders['invalid-little-pigs-1'] = {
				...template,
				unitId: 'invalid-little-pigs-1',
				typeId: 'LittlePigs',
				position,
			}
			body.state.defenders['invalid-little-pigs-2'] = {
				...template,
				unitId: 'invalid-little-pigs-2',
				typeId: 'LittlePigs',
				position,
			}
			await route.fulfill({ response, body: JSON.stringify(body) })
		})

		const diagnosticResponse = invalidClientPage.waitForResponse((response) => (
			response.url() === `${runtime.engineUrl}/games/${twoPlayerGame.gameId}/client-diagnostics`
			&& response.request().method() === 'POST'
			&& response.request().postDataJSON()?.code === 'SNAPSHOT_INVALID'
		))

		await invalidClientPage.goto(`${runtime.webUrl}/?gameId=${twoPlayerGame.gameId}&liveRefreshQuietWindowMs=50`, {
			waitUntil: 'domcontentloaded',
		})
		await invalidClientPage.getByLabel('API base URL').fill(runtime.engineUrl)
		await invalidClientPage.getByLabel('Username').fill(twoPlayerGame.onion.username)
		await invalidClientPage.getByLabel('Password').fill(twoPlayerGame.onion.password)
		await invalidClientPage.getByLabel('Game ID').fill(String(twoPlayerGame.gameId))
		await invalidClientPage.getByRole('button', { name: 'Load Game' }).click()

		const response = await diagnosticResponse
		expect(response.status(), await response.text()).toBe(202)
		expect(response.request().postDataJSON()).toMatchObject({
			code: 'SNAPSHOT_INVALID',
			refreshAttempt: 0,
		})
		await expect(invalidClientPage.getByTestId('game-aborted')).toBeVisible()
		await expect(observerPage.getByTestId('game-aborted')).toBeVisible()
		expect(stateRequestCount).toBe(1)
	} finally {
		await invalidClientContext.close()
		await observerContext.close()
	}
})