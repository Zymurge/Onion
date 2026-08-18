import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { BattlefieldPage } from '../pages/battlefieldPage.js'
import { LoginPage } from '../pages/loginPage.js'

test.use({ twoPlayerScenarioId: 'e2e-failed-ram-01' })

test('failed ram keeps survived state and follow-up movement controls synchronized', async ({ browser, twoPlayerGame }) => {
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
		const expectedResult = 'Ram on Puss 1: survived'

		await expect(toast).toHaveCount(1)
		await expect(toast).toContainText(expectedResult)
		await expect(toast).toContainText('DestroyedNo')
		await defenderBattlefield.expectInactiveResult(expectedResult)

		await expect(onionPage.getByTestId('hex-unit-puss-1')).toHaveCount(1)
		await expect(defenderPage.getByTestId('hex-unit-puss-1')).toHaveCount(1)
		await expect(onionPage.getByTestId('hex-unit-puss-1')).not.toHaveClass(/tone-destroyed/)
		await expect(defenderPage.getByTestId('hex-unit-puss-1')).not.toHaveClass(/tone-destroyed/)
		await onionBattlefield.expectUnitMoveReady('onion-1', true)
		await expect(onionPage.getByTestId('hex-unit-onion-1')).toHaveAttribute('data-selected', 'false')
		await expect(defenderPage.getByTestId('hex-unit-onion-1')).toHaveAttribute('data-selected', 'false')
		await expect(onionPage.getByTestId('combat-unit-onion-1')).toContainText('Rams remaining 1')
		await expect(defenderPage.getByTestId('combat-unit-onion-1')).toContainText('Rams remaining 1')
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})