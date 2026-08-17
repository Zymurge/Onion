import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { BattlefieldPage } from '../pages/battlefieldPage.js'
import { LoginPage } from '../pages/loginPage.js'

test.use({ twoPlayerScenarioId: 'e2e-combat-01' })

test('authoritative phase refresh clears grouped target and stack selections', async ({ browser, request, twoPlayerGame }) => {
	const runtime = readPlaywrightRuntime()
	const onionContext = await browser.newContext()
	const defenderContext = await browser.newContext()
	const endPhase = async (token: string) => {
		const response = await request.post(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/actions`, {
			headers: { authorization: `Bearer ${token}` },
			data: { type: 'END_PHASE' },
		})
		expect(response.ok(), await response.text()).toBe(true)
	}

	try {
		const onionPage = await onionContext.newPage()
		const defenderPage = await defenderContext.newPage()
		const onionBattlefield = new BattlefieldPage(onionPage)
		const defenderBattlefield = new BattlefieldPage(defenderPage)

		await Promise.all([
			new LoginPage(onionPage).connect(runtime, twoPlayerGame.onion, twoPlayerGame.gameId),
			new LoginPage(defenderPage).connect(runtime, twoPlayerGame.defender, twoPlayerGame.gameId),
		])

		await test.step('select grouped target after Onion combat refresh', async () => {
			await test.step('commit Onion combat phase', () => endPhase(twoPlayerGame.onion.token))
			await test.step('observe Onion combat phase', () => Promise.all([
				onionBattlefield.waitForAuthoritativePhase('Onion Combat'),
				defenderBattlefield.waitForAuthoritativePhase('Onion Combat'),
			]))
			await test.step('acknowledge Onion turn', () => onionBattlefield.beginTurn())
			await test.step('select Onion weapon', () => onionBattlefield.selectCombatWeapon('main'))
			await test.step('select grouped target', () => onionBattlefield.selectCombatTargetByName('Little Pigs group 1'))
			await test.step('observe grouped target selection', () => onionBattlefield.expectCombatTargetSelectedByName('Little Pigs group 1'))
		})
		await endPhase(twoPlayerGame.onion.token)
		await Promise.all([
			onionBattlefield.waitForAuthoritativePhase('Defender Movement'),
			defenderBattlefield.waitForAuthoritativePhase('Defender Movement'),
		])
		await onionBattlefield.expectCombatSelectionCleared()
		await defenderBattlefield.expectCombatSelectionCleared()

		await defenderBattlefield.beginTurn()
		await defenderBattlefield.selectCombatUnit('pigs-1')
		await endPhase(twoPlayerGame.defender.token)
		await Promise.all([
			defenderBattlefield.waitForAuthoritativePhase('Defender Combat'),
			onionBattlefield.waitForAuthoritativePhase('Defender Combat'),
		])
		await defenderBattlefield.expectStackSelectionCleared('pigs-1')
		await onionBattlefield.expectStackSelectionCleared('pigs-1')
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})