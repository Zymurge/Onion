import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { BattlefieldPage } from '../pages/battlefieldPage.js'
import { LoginPage } from '../pages/loginPage.js'

test.use({ twoPlayerScenarioId: 'e2e-ram-01' })

test('Onion and Defender see the same destroyed ram result', async ({ browser, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const onionContext = await browser.newContext()
	const defenderContext = await browser.newContext()

	try {
		const onionPage = await onionContext.newPage()
		const defenderPage = await defenderContext.newPage()
		const onionBattlefield = new BattlefieldPage(onionPage)
		const defenderBattlefield = new BattlefieldPage(defenderPage)

		await Promise.all([
			new LoginPage(onionPage).connect(runtime, twoPlayerGame.onion, twoPlayerGame.gameId),
			new LoginPage(defenderPage).connect(runtime, twoPlayerGame.defender, twoPlayerGame.gameId),
		])

		await onionBattlefield.beginTurn()
		const toast = await onionBattlefield.attemptOnionRam({ q: 0, r: 2 })
		const expectedResult = 'Ram on Puss 1: destroyed'

		await expect(toast).toContainText(expectedResult)
		await expect(toast).toContainText('DestroyedYes')
		await onionBattlefield.expectDestroyed('puss-1')
		await defenderBattlefield.expectInactiveResult(expectedResult)
		await defenderBattlefield.expectDestroyed('puss-1')
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})