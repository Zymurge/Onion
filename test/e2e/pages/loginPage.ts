import { expect, type Page } from '@playwright/test'
import type { PlaywrightRuntime } from '../runtime/playwrightEnvironment.js'
import type { TwoPlayerIdentity } from '../fixtures/twoPlayerGame.js'

export class LoginPage {
	constructor(private readonly page: Page) {}

	async signIn(runtime: PlaywrightRuntime, player: TwoPlayerIdentity, returnTo: string): Promise<void> {
		await this.page.goto(`${runtime.webUrl}/user/login?returnTo=${encodeURIComponent(returnTo)}`, {
			waitUntil: 'domcontentloaded',
		})
		await this.page.getByLabel('Username').fill(player.username)
		await this.page.getByLabel('Password').fill(player.password)
		await this.page.getByRole('button', { name: 'Sign In' }).click()
		await expect(this.page).toHaveURL(`${runtime.webUrl}${returnTo}`)
	}

	async connect(runtime: PlaywrightRuntime, player: TwoPlayerIdentity, gameId: number): Promise<void> {
		await this.page.goto(`${runtime.webUrl}/?gameId=${gameId}&liveRefreshQuietWindowMs=50`, {
			waitUntil: 'domcontentloaded',
		})
		await this.page.getByLabel('API base URL').fill(runtime.engineUrl)
		await this.page.getByLabel('Username').fill(player.username)
		await this.page.getByLabel('Password').fill(player.password)
		await this.page.getByLabel('Game ID').fill(String(gameId))
		await this.page.getByRole('button', { name: 'Load Game' }).click()
		await expect(this.page.getByTestId('app-ready')).toBeAttached()
	}
}