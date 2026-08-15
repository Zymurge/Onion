import type { Weapon, WeaponClass, WeaponState } from './types/index.js'

export type WeaponClassCounts = Record<WeaponClass, number>

function emptyCounts(): WeaponClassCounts {
	return { main: 0, secondary: 0, ap: 0, missile: 0 }
}

export class UnitWeapons {
	private readonly weapons: ReadonlyArray<Weapon>

	constructor(weapons: ReadonlyArray<Weapon>) {
		this.weapons = weapons
	}

	countByWeaponClass(state?: WeaponState): WeaponClassCounts {
		return this.weapons.reduce((counts, weapon) => {
			if (state === undefined || weapon.state === state) {
				counts[weapon.weaponClass] += 1
			}
			return counts
		}, emptyCounts())
	}

	getReadyWeapons(): Weapon[] {
		return this.weapons.filter((weapon) => weapon.state === 'ready' && (weapon.ammo === undefined || weapon.ammo > 0))
	}

	findByWeaponClass(weaponClass: WeaponClass): Weapon[] {
		return this.weapons.filter((weapon) => weapon.weaponClass === weaponClass)
	}

	findById(weaponId: string): Weapon | undefined {
		return this.weapons.find((weapon) => weapon.id === weaponId)
	}

	consumeAmmo(weaponId: string, amount = 1): boolean {
		if (!Number.isInteger(amount) || amount <= 0) {
			return false
		}

		const weapon = this.findById(weaponId)
		if (weapon === undefined || weapon.state !== 'ready' || weapon.ammo === undefined || weapon.ammo < amount) {
			return false
		}

		weapon.ammo -= amount
		if (weapon.ammo === 0) {
			weapon.state = 'spent'
		}
		return true
	}

	spend(weaponId: string): boolean {
		const weapon = this.findById(weaponId)
		if (weapon === undefined || weapon.state !== 'ready') {
			return false
		}

		weapon.state = 'spent'
		return true
	}

	spendAll(): void {
		for (const weapon of this.getReadyWeapons()) {
			this.spend(weapon.id)
		}
	}

	recharge(weaponId: string): boolean {
		const weapon = this.findById(weaponId)
		if (weapon === undefined || weapon.state !== 'spent' || (weapon.ammo !== undefined && weapon.ammo <= 0)) {
			return false
		}

		weapon.state = 'ready'
		return true
	}

	rechargeSpent(): void {
		for (const weapon of this.weapons) {
			if (weapon.state === 'spent' && (weapon.ammo === undefined || weapon.ammo > 0)) {
				weapon.state = 'ready'
			}
		}
	}

	destroy(weaponId: string): boolean {
		const weapon = this.findById(weaponId)
		if (weapon === undefined) {
			return false
		}

		weapon.state = 'destroyed'
		return true
	}
}

export function getWeaponClassCounts(weapons: ReadonlyArray<Weapon>, state?: WeaponState): WeaponClassCounts {
	return new UnitWeapons(weapons).countByWeaponClass(state)
}