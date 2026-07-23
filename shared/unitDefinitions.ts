import catalogConfig from './config/unitCatalog.json' with { type: 'json' }
import type {
  DefenderUnitType,
  OnionUnitType,
  PlayerRole,
  TargetRules,
  UnitAbilities,
  UnitType,
  UnitTypeBase,
  UnitTypeCatalog,
  Weapon,
  WeaponType,
  WeaponTypeCatalog,
} from './types/index.js'

type ExternalWeaponType = Omit<WeaponType, 'typeId'>
type ExternalUnitType = Omit<UnitTypeBase, 'typeId' | 'role' | 'stackable' | 'weapons'> & {
  role: PlayerRole
  weaponTypeIds: ReadonlyArray<string>
  treads?: number
  treadsPerMove?: number
  ramsPerTurn?: number
}

type UnitCatalogConfig = {
  unitTypes: Record<string, ExternalUnitType>
  weaponTypes: Record<string, ExternalWeaponType>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertCatalogConfig(value: unknown): asserts value is UnitCatalogConfig {
  if (!isRecord(value) || !isRecord(value.unitTypes) || !isRecord(value.weaponTypes)) {
    throw new Error('Invalid unit catalog: unitTypes and weaponTypes must be objects')
  }

  for (const [unitTypeId, unitType] of Object.entries(value.unitTypes)) {
    if (!isRecord(unitType) || unitType.role !== 'onion' && unitType.role !== 'defender') {
      throw new Error(`Invalid unit catalog unit type: ${unitTypeId}`)
    }

    if (typeof unitType.name !== 'string' || typeof unitType.movement !== 'number' || typeof unitType.defense !== 'number') {
      throw new Error(`Invalid unit catalog attributes for unit type: ${unitTypeId}`)
    }

    if (!Array.isArray(unitType.weaponTypeIds) || unitType.weaponTypeIds.some((weaponTypeId) => typeof weaponTypeId !== 'string')) {
      throw new Error(`Invalid weapon references for unit type: ${unitTypeId}`)
    }

    for (const field of ['id', 'unitId', 'type', 'state', 'status']) {
      if (field in unitType) {
        throw new Error(`Dynamic field ${field} is not allowed in unit type configuration: ${unitTypeId}`)
      }
    }
  }

  for (const [weaponTypeId, weaponType] of Object.entries(value.weaponTypes)) {
    if (!isRecord(weaponType) || typeof weaponType.name !== 'string' || typeof weaponType.attack !== 'number' || typeof weaponType.range !== 'number') {
      throw new Error(`Invalid unit catalog weapon type: ${weaponTypeId}`)
    }

    if (!['main', 'secondary', 'ap', 'missile'].includes(weaponType.weaponClass as string)) {
      throw new Error(`Invalid weapon class for weapon type: ${weaponTypeId}`)
    }

    for (const field of ['id', 'unitId', 'state', 'status']) {
      if (field in weaponType) {
        throw new Error(`Dynamic field ${field} is not allowed in weapon type configuration: ${weaponTypeId}`)
      }
    }
  }

  for (const [unitTypeId, unitType] of Object.entries(value.unitTypes)) {
    const configuredUnitType = unitType as ExternalUnitType
    for (const weaponTypeId of configuredUnitType.weaponTypeIds) {
      if (!Object.hasOwn(value.weaponTypes, weaponTypeId)) {
        throw new Error(`Unit type ${unitTypeId} references missing weapon type: ${weaponTypeId}`)
      }
    }
  }
}

const FRIENDLY_NAME_TEMPLATE_TOKEN = /\{\{\s*ordinal\s*\}\}/g
const FRIENDLY_NAME_ORDINAL_RE = /(?:[-_](\d+))$/

function extractOrdinalFromId(id: string): number | null {
  const match = id.match(FRIENDLY_NAME_ORDINAL_RE)
  if (!match) {
    return null
  }

  const ordinal = Number(match[1])
  return Number.isFinite(ordinal) ? ordinal : null
}

export function buildFriendlyName(template: string, id: string): string {
  const ordinal = extractOrdinalFromId(id)
  return template.replace(FRIENDLY_NAME_TEMPLATE_TOKEN, ordinal === null ? '' : String(ordinal)).replace(/\s+/g, ' ').trim()
}

assertCatalogConfig(catalogConfig)

const WEAPON_TYPE_CATALOG: WeaponTypeCatalog = Object.fromEntries(
  Object.entries(catalogConfig.weaponTypes).map(([typeId, weaponType]) => [typeId, { ...weaponType, typeId }]),
) as WeaponTypeCatalog

const UNIT_TYPE_CATALOG: UnitTypeCatalog = Object.fromEntries(
  Object.entries(catalogConfig.unitTypes).map(([typeId, definition]) => {
    const { weaponTypeIds, ...unitTypeAttributes } = definition
    const weapons = weaponTypeIds.map((weaponTypeId) => WEAPON_TYPE_CATALOG[weaponTypeId])
    const base = {
      ...unitTypeAttributes,
      typeId,
      stackable: definition.abilities.maxStacks > 1,
      weapons,
    }

    if (definition.role === 'onion') {
      return [typeId, base as OnionUnitType]
    }

    return [typeId, base as DefenderUnitType]
  }),
) as UnitTypeCatalog

const DEFAULT_ONION_UNIT_TYPE = Object.values(UNIT_TYPE_CATALOG).find((definition) => definition.role === 'onion')
if (DEFAULT_ONION_UNIT_TYPE === undefined) {
  throw new Error('Unit catalog must define an onion unit type')
}

export const DEFAULT_ONION_UNIT_TYPE_ID = DEFAULT_ONION_UNIT_TYPE.typeId

export function getUnitTypeCatalog(): UnitTypeCatalog {
  return UNIT_TYPE_CATALOG
}

export function getWeaponTypeCatalog(): WeaponTypeCatalog {
  return WEAPON_TYPE_CATALOG
}

export function getUnitDefinition(typeId: UnitType): UnitTypeBase | undefined {
  return UNIT_TYPE_CATALOG[typeId]
}

export function getAllUnitDefinitions(): UnitTypeCatalog {
  return getUnitTypeCatalog()
}

export function getWeaponType(typeId: string): WeaponType {
  const weaponType = WEAPON_TYPE_CATALOG[typeId]
  if (!weaponType) {
    throw new Error(`Unknown weapon type: ${typeId}`)
  }
  return weaponType
}

export function getWeaponDefense(weaponTypeId: string): number {
  const defense = getWeaponType(weaponTypeId).defense
  if (defense === undefined) {
    throw new Error(`Weapon type has no defense value: ${weaponTypeId}`)
  }
  return defense
}

export function isUnitTypeStackable(unitType: string | null | undefined): boolean {
  if (unitType === null || unitType === undefined) {
    return false
  }

  return UNIT_TYPE_CATALOG[unitType as UnitType]?.stackable === true
}