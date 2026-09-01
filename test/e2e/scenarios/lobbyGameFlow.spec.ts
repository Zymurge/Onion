import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { LoginPage } from '../pages/loginPage.js'

test('players discover and join a waiting game through the lobby', async ({ browser, openTwoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const onionContext = await browser.newContext()
	const defenderContext = await browser.newContext()

	try {
		const onionPage = await onionContext.newPage()
		const defenderPage = await defenderContext.newPage()

		await new LoginPage(onionPage).signIn(runtime, openTwoPlayerGame.onion, '/user/dashboard')
		await expect(onionPage.getByRole('heading', { name: /Welcome back/ })).toBeVisible()
		await expect(onionPage.getByText(`Game ${openTwoPlayerGame.gameId} · Waiting for opponent`)).toBeVisible()

		await new LoginPage(defenderPage).signIn(runtime, openTwoPlayerGame.defender, '/games')
		await expect(defenderPage.getByRole('heading', { name: 'Find a game' })).toBeVisible()

		const openGame = defenderPage.locator('.dashboard-game-row').filter({ hasText: `Game ${openTwoPlayerGame.gameId}` })
		await expect(openGame).toContainText('The Siege of Shrek\'s Swamp')
		await openGame.getByRole('button', { name: 'Join Game' }).click()

		await expect(defenderPage).toHaveURL(`${runtime.webUrl}/game/${openTwoPlayerGame.gameId}`)
		await expect(defenderPage.getByTestId('app-ready')).toBeAttached()
		await expect(defenderPage.getByText('Defender', { exact: true })).toBeVisible()

		await defenderPage.goto(`${runtime.webUrl}/games`, { waitUntil: 'domcontentloaded' })
		await expect(defenderPage.getByRole('heading', { name: 'Find a game' })).toBeVisible()
		await expect(defenderPage.locator('.dashboard-game-row').filter({ hasText: `Game ${openTwoPlayerGame.gameId}` })).toHaveCount(0)
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})
