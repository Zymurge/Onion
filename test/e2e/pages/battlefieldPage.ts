import { expect, type Locator, type Page } from '@playwright/test'

export class BattlefieldPage {
	constructor(private readonly page: Page) {}

	async beginTurn(): Promise<void> {
		const button = this.page.getByRole('button', { name: 'Begin turn' })
		await expect(button).toBeVisible()
		await button.click()
	}

	async attemptOnionRam(destination: { q: number; r: number }): Promise<Locator> {
		await this.page.getByTestId('combat-unit-onion-1').click()
		await this.page.getByTestId(`hex-cell-${destination.q}-${destination.r}`).click({ button: 'right' })
		await expect(this.page.getByTestId('ram-confirmation-view')).toBeVisible()
		await this.page.getByRole('button', { name: 'Attempt ram' }).click()

		const toast = this.page.getByTestId('ram-resolution-toast')
		await expect(toast).toBeVisible()
		return toast
	}

	async expectDestroyed(unitId: string): Promise<void> {
		await expect(this.page.getByTestId(`hex-unit-${unitId}`)).toHaveCount(0)
	}

	async expectInactiveResult(summary: string): Promise<void> {
		await expect(this.page.getByTestId('inactive-event-stream').getByText(summary, { exact: true })).toBeVisible()
	}
}