import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { LoginPage } from '../pages/loginPage.js'

test('two players complete the lobby lifecycle with dedicated game windows', async ({ browser, openTwoPlayerGame }) => {
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
		const defenderPopupPromise = defenderPage.waitForEvent('popup')
		await openGame.getByRole('button', { name: 'Join Game' }).click()

		const defenderGamePage = await defenderPopupPromise
		await expect(defenderGamePage).toHaveURL(`${runtime.webUrl}/game/${openTwoPlayerGame.gameId}`)
		await expect(defenderGamePage.getByTestId('app-ready')).toBeAttached()
		await expect(defenderGamePage.getByTestId('game-lifecycle-gate')).toContainText('Waiting for the host to start')

		await expect.poll(async () => {
			const row = defenderPage.locator('.dashboard-game-row').filter({ hasText: `Game ${openTwoPlayerGame.gameId}` })
			return row.count()
		}, { message: 'waiting for the joined game to leave open discovery' }).toBe(0)

		await defenderPage.goto(`${runtime.webUrl}/user/dashboard`, { waitUntil: 'domcontentloaded' })
		await expect(defenderPage.getByText(`Game ${openTwoPlayerGame.gameId} · Ready to start`)).toBeVisible()
		await expect(defenderPage.getByText('Ready', { exact: true })).toBeVisible()

		await expect(onionPage.getByText(`Game ${openTwoPlayerGame.gameId} · Ready to start`)).toBeVisible()
		const onionPopupPromise = onionPage.waitForEvent('popup')
		await onionPage.getByRole('button', { name: 'Start Game' }).click()

		const onionGamePage = await onionPopupPromise
		await expect(onionGamePage).toHaveURL(`${runtime.webUrl}/game/${openTwoPlayerGame.gameId}`)
		await expect(onionGamePage.getByTestId('app-ready')).toBeAttached()
		await expect(onionGamePage.locator('.phase-chip-state')).toHaveText('Onion Movement')

		await expect(defenderGamePage.locator('.phase-chip-state')).toHaveText('Onion Movement', { timeout: 8_000 })
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})
