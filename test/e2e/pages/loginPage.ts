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
		await this.signIn(runtime, player, `/game/${gameId}?liveRefreshQuietWindowMs=50`)
		await expect(this.page.getByTestId('app-ready').or(this.page.getByTestId('game-aborted'))).toBeAttached()
	}
}