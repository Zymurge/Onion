import { describe, expect, it } from 'vitest'

import { UnitWeapons } from '#shared/unitWeapons'
import type { Weapon } from '#shared/types/index'

function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
	return {
		id: 'main-1',
		typeId: 'TheOnion.main',
		weaponClass: 'main',
		state: 'ready',
		friendlyName: 'Main Weapon',
		...overrides,
	}
}

describe('UnitWeapons', () => {
	it('counts weapons by class and state', () => {
		const weapons = new UnitWeapons([
			makeWeapon(),
			makeWeapon({ id: 'secondary-1', typeId: 'TheOnion.secondary_1', weaponClass: 'secondary' }),
			makeWeapon({ id: 'missile-1', typeId: 'TheOnion.missile_1', weaponClass: 'missile', ammo: 1 }),
			makeWeapon({ id: 'missile-2', typeId: 'TheOnion.missile_2', weaponClass: 'missile', ammo: 0, state: 'spent' }),
		])

		expect(weapons.countByWeaponClass()).toEqual({ main: 1, secondary: 1, ap: 0, missile: 2 })
		expect(weapons.countByWeaponClass('ready')).toEqual({ main: 1, secondary: 1, ap: 0, missile: 1 })
	})

	it('returns ready weapons and finds instances', () => {
		const missile = makeWeapon({ id: 'missile-1', weaponClass: 'missile', ammo: 1 })
		const weapons = new UnitWeapons([makeWeapon(), { ...missile, state: 'spent' }])

		expect(weapons.getReadyWeapons()).toHaveLength(1)
		expect(weapons.findById('missile-1')).toEqual({ ...missile, state: 'spent' })
		expect(weapons.findByWeaponClass('main')).toHaveLength(1)
	})

	it('consumes finite ammo and spends the weapon at zero', () => {
		const missile = makeWeapon({ id: 'missile-1', weaponClass: 'missile', ammo: 2 })
		const weapons = new UnitWeapons([missile])

		expect(weapons.consumeAmmo('missile-1')).toBe(true)
		expect(missile.ammo).toBe(1)
		expect(missile.state).toBe('ready')
		expect(weapons.consumeAmmo('missile-1')).toBe(true)
		expect(missile.ammo).toBe(0)
		expect(missile.state).toBe('spent')
		expect(weapons.consumeAmmo('missile-1')).toBe(false)
	})

	it('spends, recharges, and destroys weapon instances', () => {
		const weapon = makeWeapon()
		const weapons = new UnitWeapons([weapon])

		expect(weapons.spend('main-1')).toBe(true)
		expect(weapon.state).toBe('spent')
		expect(weapons.recharge('main-1')).toBe(true)
		expect(weapon.state).toBe('ready')
		expect(weapons.destroy('main-1')).toBe(true)
		expect(weapon.state).toBe('destroyed')
	})

	it('does not expose a zero-ammo ready weapon as available', () => {
		const missile = makeWeapon({ id: 'missile-1', weaponClass: 'missile', ammo: 0 })
		const weapons = new UnitWeapons([missile])

		expect(weapons.getReadyWeapons()).toEqual([])
		expect(weapons.consumeAmmo('missile-1')).toBe(false)
		expect(missile).toEqual({ ...missile, ammo: 0, state: 'ready' })
	})

	it.todo('AMMO-001 preserves omitted maxAmmo as unlimited in the normalized weapon catalog')
	it.todo('AMMO-002 accepts positive integer maxAmmo values in the normalized weapon catalog')
	it.todo('AMMO-003 rejects zero, negative, fractional, and non-numeric maxAmmo values')
	it.todo('AMMO-004 rejects runtime and unknown ammo-shaped weapon catalog fields')
})
