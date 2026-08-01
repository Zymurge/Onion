import type {
	SessionInitPayload,
	UnitType,
	UnitTypeCatalog,
	WeaponType,
	WeaponTypeCatalog,
} from '../../shared/types/index.js'

export type SessionCatalog = SessionInitPayload

export function getSessionUnitType(catalog: SessionCatalog, typeId: UnitType) {
	return catalog.unitTypes[typeId]
}

export function getRequiredSessionUnitType(catalog: SessionCatalog, typeId: UnitType) {
	const unitType = getSessionUnitType(catalog, typeId)
	if (unitType === undefined) {
		throw new Error(`Unknown unit type: ${typeId}`)
	}

	return unitType
}

export function getSessionWeaponType(catalog: SessionCatalog, typeId: string): WeaponType {
	const weaponType = catalog.weaponTypes[typeId]
	if (weaponType === undefined) {
		throw new Error(`Unknown weapon type: ${typeId}`)
	}

	return weaponType
}

export function getSessionWeaponDefense(catalog: SessionCatalog, typeId: string): number {
	const defense = getSessionWeaponType(catalog, typeId).defense
	if (defense === undefined) {
		throw new Error(`Weapon type has no defense value: ${typeId}`)
	}

	return defense
}

export function isSessionUnitTypeStackable(catalog: SessionCatalog, typeId: string | null | undefined): boolean {
	if (typeId === null || typeId === undefined) {
		return false
	}

	return getSessionUnitType(catalog, typeId)?.stackable === true
}

export function createSessionCatalog(unitTypes: UnitTypeCatalog, weaponTypes: WeaponTypeCatalog): SessionCatalog {
	return { unitTypes, weaponTypes }
}
