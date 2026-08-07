import { describe, expect, it } from 'vitest'

import {
	createSessionCatalog,
	getRequiredSessionUnitType,
	getSessionUnitType,
	getSessionWeaponDefense,
	getSessionWeaponType,
	isSessionUnitTypeStackable,
} from '#web/lib/sessionCatalog'
import type { SessionInitPayload } from '#shared/types/index'

const catalog = {
	unitTypes: {
		stacked: { typeId: 'stacked', stackable: true },
		single: { typeId: 'single', stackable: false },
	},
	weaponTypes: {
		cannon: { typeId: 'cannon', defense: 3 },
	},
} as unknown as SessionInitPayload

describe('session catalog access', () => {
	it('reads definitions from the session payload', () => {
		expect(getSessionUnitType(catalog, 'stacked')).toEqual(catalog.unitTypes.stacked)
		expect(getSessionWeaponType(catalog, 'cannon')).toEqual(catalog.weaponTypes.cannon)
		expect(getSessionWeaponDefense(catalog, 'cannon')).toBe(3)
		expect(isSessionUnitTypeStackable(catalog, 'stacked')).toBe(true)
		expect(isSessionUnitTypeStackable(catalog, 'single')).toBe(false)
		expect(isSessionUnitTypeStackable(catalog, 'missing')).toBe(false)
	})

	it('preserves required lookup failures', () => {
		expect(getRequiredSessionUnitType(catalog, 'stacked')).toEqual(catalog.unitTypes.stacked)
		expect(() => getRequiredSessionUnitType(catalog, 'missing')).toThrow('Unknown unit type: missing')
		expect(() => getSessionWeaponType(catalog, 'missing')).toThrow('Unknown weapon type: missing')
		expect(() => getSessionWeaponDefense(catalog, 'stacked')).toThrow('Unknown weapon type: stacked')
	})

	it('can wrap the separate static catalogs without changing them', () => {
		expect(createSessionCatalog(catalog.unitTypes, catalog.weaponTypes)).toEqual(catalog)
	})
})
