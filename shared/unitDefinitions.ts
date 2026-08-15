import catalogConfig from './config/unitCatalog.json' with { type: 'json' }
import type {
  UnitType,
  UnitTypeBase,
  UnitTypeCatalog,
  WeaponType,
  WeaponTypeCatalog,
} from './types/index.js'

type ExternalWeaponType = Omit<WeaponType, 'typeId'>
type ExternalUnitType = Omit<UnitTypeBase, 'typeId' | 'stackable' | 'weapons'> & {
  weaponTypeIds: ReadonlyArray<string>
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
    if (!isRecord(unitType)) {
      throw new Error(`Invalid unit catalog unit type: ${unitTypeId}`)
    }

    const allowedFields = new Set([
      'name', 'friendlyNameTemplate', 'movement', 'defense', 'cost', 'abilities',
      'weaponTypeIds', 'targetRules', 'treads', 'treadsPerMove', 'ramsPerTurn', 'squads',
    ])
    const unknownField = Object.keys(unitType).find((field) => !allowedFields.has(field))
    if (unknownField !== undefined) {
      throw new Error(`Unknown field ${unknownField} in unit type configuration: ${unitTypeId}`)
    }

    if (typeof unitType.name !== 'string' || typeof unitType.movement !== 'number' || typeof unitType.defense !== 'number') {
      throw new Error(`Invalid unit catalog attributes for unit type: ${unitTypeId}`)
    }

    if (!isRecord(unitType.abilities) || typeof unitType.abilities.maxStacks !== 'number' || !Number.isInteger(unitType.abilities.maxStacks) || unitType.abilities.maxStacks < 1) {
      throw new Error(`Invalid abilities for unit type: ${unitTypeId}`)
    }

    if (!Array.isArray(unitType.weaponTypeIds) || unitType.weaponTypeIds.some((weaponTypeId) => typeof weaponTypeId !== 'string')) {
      throw new Error(`Invalid weapon references for unit type: ${unitTypeId}`)
    }

    for (const field of ['treads', 'treadsPerMove', 'ramsPerTurn', 'squads']) {
      if (field in unitType && typeof unitType[field] !== 'number') {
        throw new Error(`Invalid ${field} for unit type: ${unitTypeId}`)
      }
    }
  }

  for (const [weaponTypeId, weaponType] of Object.entries(value.weaponTypes)) {
    if (!isRecord(weaponType) || typeof weaponType.name !== 'string' || typeof weaponType.attack !== 'number' || typeof weaponType.range !== 'number') {
      throw new Error(`Invalid unit catalog weapon type: ${weaponTypeId}`)
    }

    const allowedFields = new Set([
      'name', 'weaponClass', 'attack', 'range', 'defense', 'individuallyTargetable',
      'targetRules', 'friendlyNameTemplate', 'maxAmmo',
    ])
    const unknownField = Object.keys(weaponType).find((field) => !allowedFields.has(field))
    if (unknownField !== undefined) {
      throw new Error(`Unknown field ${unknownField} in weapon type configuration: ${weaponTypeId}`)
    }

    if (!['main', 'secondary', 'ap', 'missile'].includes(weaponType.weaponClass as string)) {
      throw new Error(`Invalid weapon class for weapon type: ${weaponTypeId}`)
    }

    if ('maxAmmo' in weaponType && (typeof weaponType.maxAmmo !== 'number' || !Number.isInteger(weaponType.maxAmmo) || weaponType.maxAmmo <= 0)) {
      throw new Error(`Invalid maxAmmo for weapon type: ${weaponTypeId}`)
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

export function parseUnitCatalog(value: unknown): { unitTypes: UnitTypeCatalog; weaponTypes: WeaponTypeCatalog } {
  assertCatalogConfig(value)

  const weaponTypes: WeaponTypeCatalog = Object.fromEntries(
    Object.entries(value.weaponTypes).map(([typeId, weaponType]) => [typeId, { ...weaponType, typeId }]),
  ) as WeaponTypeCatalog

  const unitTypes: UnitTypeCatalog = Object.fromEntries(
    Object.entries(value.unitTypes).map(([typeId, definition]) => {
      const { weaponTypeIds, ...unitTypeAttributes } = definition
      return [typeId, {
        ...unitTypeAttributes,
        typeId,
        stackable: definition.abilities.maxStacks > 1,
        weapons: weaponTypeIds.map((weaponTypeId) => weaponTypes[weaponTypeId]),
      }]
    }),
  ) as UnitTypeCatalog

  return { unitTypes, weaponTypes }
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

const { unitTypes: UNIT_TYPE_CATALOG, weaponTypes: WEAPON_TYPE_CATALOG } = parseUnitCatalog(catalogConfig)

const DEFAULT_ONION_UNIT_TYPE = Object.values(UNIT_TYPE_CATALOG).find((definition) => definition.treads !== undefined)
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

export function getUnitDefinition(typeId: UnitType): UnitTypeCatalog[UnitType] | undefined {
  return UNIT_TYPE_CATALOG[typeId]
}

export function getRequiredUnitDefinition(typeId: UnitType): UnitTypeCatalog[UnitType] {
  const definition = getUnitDefinition(typeId)
  if (definition === undefined) {
    throw new Error(`Unknown unit type: ${typeId}`)
  }

  return definition
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