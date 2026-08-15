import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { BattlefieldPage } from '../pages/battlefieldPage.js'
import { LoginPage } from '../pages/loginPage.js'

test.use({ twoPlayerScenarioId: 'e2e-combat-01' })

test('Onion resolves grouped-target fire and Defender sees the authoritative result', async ({ browser, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const onionContext = await browser.newContext()
	const defenderContext = await browser.newContext()

	try {
		const onionPage = await onionContext.newPage()
		const defenderPage = await defenderContext.newPage()
		const onionBattlefield = new BattlefieldPage(onionPage)

		await Promise.all([
			new LoginPage(onionPage).connect(runtime, twoPlayerGame.onion, twoPlayerGame.gameId),
			new LoginPage(defenderPage).connect(runtime, twoPlayerGame.defender, twoPlayerGame.gameId),
		])

		await onionBattlefield.advancePhase('Start Combat')
		await onionBattlefield.waitForAuthoritativePhase('Onion Combat')
		await onionBattlefield.beginTurn()
		await onionBattlefield.selectCombatWeapon('main')
		await onionBattlefield.selectCombatTargetByName('Little Pigs group 1')
		await onionBattlefield.expectCombatTargetSelectedByName('Little Pigs group 1')

		const toast = await onionBattlefield.resolveCombat()
		await expect(toast).toContainText('Combat resolved on Little Pigs group 1')
		await expect(toast).toContainText('Outcome')
		await expect(defenderPage.getByTestId('inactive-event-stream')).toContainText('Target: Little Pigs group 1')
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})