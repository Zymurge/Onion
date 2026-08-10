import { expect, test } from '../fixtures/twoPlayerGame.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import { BattlefieldPage } from '../pages/battlefieldPage.js'
import { LoginPage } from '../pages/loginPage.js'

test.use({ twoPlayerScenarioId: 'e2e-colocation-01' })

test('co-located stack and adjacent units render consistently for active and inactive players', async ({ browser, request, twoPlayerGame }) => {
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
		await Promise.all([
			onionBattlefield.waitForAuthoritativePhase('Onion Movement'),
			defenderBattlefield.waitForAuthoritativePhase('Onion Movement'),
		])
		const endMovementResponse = await request.post(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/actions`, {
			headers: { authorization: `Bearer ${twoPlayerGame.onion.token}` },
			data: { type: 'END_PHASE' },
		})
		expect(endMovementResponse.ok(), await endMovementResponse.text()).toBe(true)
		await Promise.all([
			onionBattlefield.waitForAuthoritativePhase('Onion Combat'),
			defenderBattlefield.waitForAuthoritativePhase('Onion Combat'),
		])
		await onionBattlefield.beginTurn()
		const endCombatResponse = await request.post(`${runtime.engineUrl}/games/${twoPlayerGame.gameId}/actions`, {
			headers: { authorization: `Bearer ${twoPlayerGame.onion.token}` },
			data: { type: 'END_PHASE' },
		})
		expect(endCombatResponse.ok(), await endCombatResponse.text()).toBe(true)
		await Promise.all([
			onionBattlefield.waitForAuthoritativePhase('Defender Movement'),
			defenderBattlefield.waitForAuthoritativePhase('Defender Movement'),
		])

		const renderOptions = {
			cellKeys: ['3-2', '4-2', '2-3'],
			stackAnchorId: 'pigs-1',
			stackMemberIds: ['pigs-1', 'pigs-2', 'pigs-3'],
			unitIds: ['pigs-1', 'puss-1', 'wolf-1'],
		}
		const [onionState, defenderState] = await Promise.all([
			onionBattlefield.readCoLocationRenderState(renderOptions),
			defenderBattlefield.readCoLocationRenderState(renderOptions),
		])

		expect(defenderState).toEqual(onionState)
		expect(onionState.cells['3-2']).toContain('hex-cell-shared-occupancy')
		expect(onionState.cells['4-2']).toContain('hex-cell-occupied')
		expect(onionState.cells['2-3']).toContain('hex-cell-occupied')
		expect(onionState.markers['pigs-1']?.text).toContain('Little Pigs group 1')
		expect(onionState.stack.memberMarkerCounts).toEqual({ 'pigs-1': 1, 'pigs-2': 0, 'pigs-3': 0 })
		expect(onionState.stack.expanded).toBe('false')
		expect(onionState.stack.selected).toBe('false')
	} finally {
		await Promise.all([onionContext.close(), defenderContext.close()])
	}
})