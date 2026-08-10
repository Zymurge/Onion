import { expect, type Locator, type Page } from '@playwright/test'

export class BattlefieldPage {
	constructor(private readonly page: Page) {}

	private get syncProbe(): Locator {
		return this.page.getByTestId('session-sync-probe')
	}

	async getSnapshotEventSeq(): Promise<number> {
		const value = await this.syncProbe.getAttribute('data-snapshot-event-seq')
		if (value === null) {
			throw new Error('Session sync probe does not have an authoritative snapshot sequence')
		}

		return Number(value)
	}

	async waitForAuthoritativePhase(label: string): Promise<void> {
		await expect(this.page.locator('.phase-chip-state')).toHaveText(label, { timeout: 8_000 })
	}

	async beginTurn(): Promise<void> {
		const button = this.page.getByRole('button', { name: 'Begin turn' })
		await expect(button).toBeVisible({ timeout: 8_000 })
		await button.click({ timeout: 8_000 })
		await expect(this.page.getByRole('button', { name: 'Dismiss inactive event stream' })).toHaveCount(0, { timeout: 8_000 })
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

	async advancePhase(label: string): Promise<number> {
		const previousEventSeq = await this.getSnapshotEventSeq()
		const button = this.page.getByRole('button', { name: label, exact: true })
		await expect(button).toBeVisible()
		await button.click()
		await expect.poll(async () => this.getSnapshotEventSeq(), {
			message: `waiting for ${label} to update the authoritative snapshot`,
		}).toBeGreaterThan(previousEventSeq)

		return this.getSnapshotEventSeq()
	}

	async expectPhase(label: string): Promise<void> {
		await expect(this.page.locator('.phase-chip-state')).toHaveText(label)
	}

	async selectCombatUnit(unitId: string): Promise<void> {
		await this.page.getByTestId(`combat-unit-${unitId}`).click()
	}

	async selectCombatWeapon(weaponId: string): Promise<void> {
		await this.page.getByTestId(`combat-weapon-${weaponId}`).click()
	}

	async selectCombatTarget(targetId: string): Promise<void> {
		await this.page.getByTestId(`combat-target-${targetId}`).click()
	}

	async selectCombatTargetByName(name: string): Promise<void> {
		await this.page.getByTestId('combat-target-list').getByRole('button', { name: new RegExp(`^${name}`) }).click({ timeout: 8_000 })
	}

	async expectCombatTargetSelectedByName(name: string): Promise<void> {
		await expect(this.page.getByTestId('combat-target-list').getByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-pressed', 'true', { timeout: 8_000 })
	}

	async expectCombatTargetSelected(targetId: string): Promise<void> {
		await expect(this.page.getByTestId(`combat-target-${targetId}`)).toHaveAttribute('data-selected', 'true', { timeout: 8_000 })
	}

	async expectCombatSelectionCleared(): Promise<void> {
		await expect(this.page.getByTestId('combat-target-list')).toHaveCount(0)
	}

	async expectStackSelectionCleared(unitId: string): Promise<void> {
		await expect(this.page.getByTestId(`combat-unit-${unitId}`)).toHaveAttribute('data-selected', 'false')
	}

	async resolveCombat(): Promise<Locator> {
		await this.page.getByRole('button', { name: 'Resolve combat', exact: true }).click()
		const toast = this.page.getByTestId('combat-resolution-toast')
		await expect(toast).toBeVisible()
		return toast
	}

	async expectInactiveDetail(detail: string): Promise<void> {
		await expect(this.page.getByTestId('inactive-event-stream').locator(`[title*="${detail}"]`)).toBeVisible()
	}
}