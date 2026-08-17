import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { BattlefieldPage } from '../pages/battlefieldPage.js'
import { LoginPage } from '../pages/loginPage.js'

test.use({ twoPlayerScenarioId: 'e2e-ram-01' })

test('planner actionability follows authoritative movement remaining state', async ({ browser, twoPlayerGame }) => {
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
		await onionBattlefield.expectUnitMoveReady('onion-1', true)

		for (let moveNumber = 0; moveNumber < 4; moveNumber += 1) {
			const moveReady = await onionPage.getByTestId('hex-unit-onion-1').evaluate((unit) => unit.classList.contains('hex-unit-stack-move-ready'))
			if (!moveReady) {
				break
			}
			await onionBattlefield.moveOnionToFirstReachableHex()
		}

		await expect(onionPage.getByTestId('combat-unit-onion-1')).toContainText('Moves 0')
		await expect(defenderPage.getByTestId('combat-unit-onion-1')).toContainText('Moves 0')
		await onionBattlefield.expectUnitMoveReady('onion-1', false)
		await expect(onionPage.locator('.hex-cell-reachable')).toHaveCount(0)
		await expect(defenderPage.locator('.hex-cell-reachable')).toHaveCount(0)
		await expect(defenderPage.getByTestId('hex-unit-onion-1')).toHaveClass(/hex-unit-stack-onion/)
		await defenderBattlefield.expectUnitMoveReady('onion-1', false)
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})