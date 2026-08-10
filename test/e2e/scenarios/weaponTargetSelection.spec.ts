import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { BattlefieldPage } from '../pages/battlefieldPage.js'
import { LoginPage } from '../pages/loginPage.js'

test.use({ twoPlayerScenarioId: 'e2e-combat-01' })

test('Defender selects the intended Onion weapon target and Onion sees the result', async ({ browser, twoPlayerGame }) => {
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

		await onionBattlefield.waitForAuthoritativePhase('Onion Movement')
		await onionBattlefield.beginTurn()
		await onionBattlefield.advancePhase('Start Combat')
		await onionBattlefield.advancePhase('End Turn')
		await defenderBattlefield.waitForAuthoritativePhase('Defender Movement')
		await defenderBattlefield.beginTurn()
		await defenderBattlefield.advancePhase('Start Combat')
		await onionBattlefield.waitForAuthoritativePhase('Defender Combat')
		await defenderBattlefield.selectCombatUnit('puss-1')
		await defenderBattlefield.selectCombatTarget('weapon:main')
		await defenderBattlefield.expectCombatTargetSelected('weapon:main')

		const toast = await defenderBattlefield.resolveCombat()
		await expect(toast).toContainText('Combat resolved on Main Battery')
		await expect(toast).toContainText('Destroyed weapon: Main Battery')
		await onionBattlefield.expectInactiveResult('Fire on Main Battery: destroyed')
		await onionBattlefield.expectInactiveDetail('Battery destroyed: Main Battery')
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})