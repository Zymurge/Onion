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
		await Promise.all([
			defenderBattlefield.waitForAuthoritativePhase('Defender Combat'),
			onionBattlefield.waitForAuthoritativePhase('Defender Combat'),
		])
		await defenderBattlefield.selectCombatUnit('puss-1')
		await defenderBattlefield.selectCombatTarget('weapon:main')
		await defenderBattlefield.expectCombatTargetSelected('weapon:main')

		const toast = await defenderBattlefield.resolveCombat()
		await expect(toast).toContainText('Combat resolved on Main Weapon')
		await expect(toast).toContainText('Destroyed weapon: Main Weapon')
		await defenderBattlefield.dismissCombatResolution()
		await onionBattlefield.expectInactiveResult('Fire on Main Weapon: destroyed')
		await onionBattlefield.expectInactiveDetail('Weapon destroyed: Main Weapon')
		await onionBattlefield.expectUnitCombatReady('puss-1', false)
		await defenderBattlefield.expectUnitCombatReady('puss-1', false)
		await onionBattlefield.inspectUnit('puss-1')
		await onionBattlefield.expectInspectorSubject('puss-1', 'Puss 1')
		await expect(onionPage.getByTestId('battlefield-inspector')).toContainText('Status')
		await expect(onionPage.getByTestId('battlefield-inspector')).toContainText('operational')
		await expect(onionPage.getByTestId('combat-target-list')).toHaveCount(0)
		await expect(defenderPage.getByTestId('combat-target-list')).toHaveCount(0)
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})