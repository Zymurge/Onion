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