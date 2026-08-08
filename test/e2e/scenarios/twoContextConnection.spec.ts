import { expect, test } from '@playwright/test'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'

test('Onion and Defender contexts reach the same runtime with isolated storage', async ({ browser }) => {
	const runtime = readPlaywrightRuntime()
	const onion = await browser.newContext()
	const defender = await browser.newContext()

	try {
		const onionPage = await onion.newPage()
		const defenderPage = await defender.newPage()

		await Promise.all([
			onionPage.goto(runtime.webUrl, { waitUntil: 'domcontentloaded' }),
			defenderPage.goto(runtime.webUrl, { waitUntil: 'domcontentloaded' }),
		])

		await Promise.all([
			expect(onionPage.getByRole('heading', { name: 'Open a live game session' })).toBeVisible(),
			expect(defenderPage.getByRole('heading', { name: 'Open a live game session' })).toBeVisible(),
		])

		await onion.addCookies([{ name: 'e2e-session', value: 'onion', url: runtime.webUrl }])
		await onionPage.evaluate(() => localStorage.setItem('e2e-session', 'onion'))

		expect(await defender.cookies(runtime.webUrl)).not.toContainEqual(expect.objectContaining({ name: 'e2e-session' }))
		expect(await defenderPage.evaluate(() => localStorage.getItem('e2e-session'))).toBeNull()

		await defender.addCookies([{ name: 'e2e-session', value: 'defender', url: runtime.webUrl }])
		await defenderPage.evaluate(() => localStorage.setItem('e2e-session', 'defender'))

		expect(await onion.cookies(runtime.webUrl)).toContainEqual(expect.objectContaining({ name: 'e2e-session', value: 'onion' }))
		expect(await onionPage.evaluate(() => localStorage.getItem('e2e-session'))).toBe('onion')
	} finally {
		await Promise.all([onion.close(), defender.close()])
	}
})