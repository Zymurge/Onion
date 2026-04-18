import type { TargetRules, Weapon } from './types/index.js'
import type { UnitDefinition, UnitType } from './engineTypes.js'

function makeWeapon(
  id: string,
  name: string,
  attack: number,
  range: number,
  defense: number,
  individuallyTargetable = false,
  targetRules?: TargetRules,
  friendlyNameTemplate?: string,
): Weapon {
  return { id, name, attack, range, defense, status: 'ready', individuallyTargetable, targetRules, friendlyNameTemplate }
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

const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  Puss: {
    name: 'Puss',
    type: 'Puss',
    friendlyNameTemplate: 'Puss {{ordinal}}',
    movement: 3,
    defense: 3,
    cost: 1,
    abilities: { maxStacks: 1, isArmor: true, ramProfile: { treadLoss: 1, destroyOnRollAtMost: 4 } },
    weapons: [makeWeapon('main', 'Main Gun', 4, 2, 3)],
  },
  BigBadWolf: {
    name: 'Big Bad Wolf',
    type: 'BigBadWolf',
    friendlyNameTemplate: 'Big Bad Wolf {{ordinal}}',
    movement: 4,
    defense: 4,
    cost: 1,
    abilities: { maxStacks: 1, isArmor: true, secondMove: true, secondMoveAllowance: 3, ramProfile: { treadLoss: 1, destroyOnRollAtMost: 4 } },
    weapons: [makeWeapon('main', 'Cannon', 2, 2, 4)],
  },
  Witch: {
    name: 'Witch',
    type: 'Witch',
    friendlyNameTemplate: 'Witch {{ordinal}}',
    movement: 2,
    defense: 2,
    cost: 1,
    abilities: { maxStacks: 1, isArmor: true, ramProfile: { treadLoss: 1, destroyOnRollAtMost: 4 } },
    weapons: [makeWeapon('main', 'Missile Launcher', 3, 4, 2)],
  },
  LordFarquaad: {
    name: 'Lord Farquaad',
    type: 'LordFarquaad',
    friendlyNameTemplate: 'Lord Farquaad {{ordinal}}',
    movement: 0,
    defense: 0,
    cost: 2,
    abilities: { maxStacks: 1, immobile: true, ramProfile: { treadLoss: 1, destroyOnRollAtMost: 4 } },
    weapons: [makeWeapon('main', 'Howitzer', 6, 8, 0)],
  },
  Pinocchio: {
    name: 'Pinocchio',
    type: 'Pinocchio',
    friendlyNameTemplate: 'Pinocchio {{ordinal}}',
    movement: 2,
    defense: 3,
    cost: 0.5,
    abilities: { maxStacks: 1, isArmor: true, ramProfile: { treadLoss: 1, destroyOnRollAtMost: 4 } },
    weapons: [makeWeapon('main', 'Light Gun', 2, 2, 3)],
  },
  Dragon: {
    name: 'Dragon',
    type: 'Dragon',
    friendlyNameTemplate: 'Dragon {{ordinal}}',
    movement: 5,
    defense: 3,
    cost: 2,
    abilities: { maxStacks: 1, isArmor: true, ramProfile: { treadLoss: 2, destroyOnRollAtMost: 4 } },
    weapons: [
      makeWeapon('main_1', 'Heavy Gun A', 6, 3, 3),
      makeWeapon('main_2', 'Heavy Gun B', 6, 3, 3),
    ],
  },
  LittlePigs: {
    name: 'Little Pigs',
    type: 'LittlePigs',
    friendlyNameTemplate: 'Little Pigs {{ordinal}}',
    movement: 1,
    defense: 1,
    cost: 1,
    abilities: {
      maxStacks: 3,
      ramProfile: { treadLoss: 0, destroyOnRollAtMost: 4 },
      terrainRules: {
        ridgeline: { canCross: true, canAccessCover: true },
      },
    },
    weapons: [makeWeapon('rifle', 'Rifle', 1, 1, 1)],
  },
  Castle: {
    name: 'Castle',
    type: 'Castle',
    friendlyNameTemplate: 'Castle {{ordinal}}',
    movement: 0,
    defense: 0,
    abilities: { maxStacks: 1, ramProfile: { treadLoss: 1, destroyOnRollAtMost: 4 } },
    weapons: [],
  },
  TheOnion: {
    name: 'The Onion',
    type: 'TheOnion',
    friendlyNameTemplate: 'The Onion {{ordinal}}',
    movement: 3,
    defense: 0,
    abilities: {
      maxStacks: 1,
      canRam: true,
      ramCapacity: 2,
      terrainRules: {
        ridgeline: { canCross: true },
      },
    },
    weapons: [
      makeWeapon('main', 'Main Battery', 4, 3, 4, true, undefined, 'Main Battery'),
      makeWeapon('secondary_1', 'Secondary Battery', 3, 2, 3, true, undefined, 'Secondary Battery {{ordinal}}'),
      makeWeapon('secondary_2', 'Secondary Battery', 3, 2, 3, true, undefined, 'Secondary Battery {{ordinal}}'),
      makeWeapon('secondary_3', 'Secondary Battery', 3, 2, 3, true, undefined, 'Secondary Battery {{ordinal}}'),
      makeWeapon('secondary_4', 'Secondary Battery', 3, 2, 3, true, undefined, 'Secondary Battery {{ordinal}}'),
      makeWeapon('ap_1', 'AP Gun', 1, 1, 1, true, { allowedTargetUnitTypes: ['LittlePigs', 'Castle'] }, 'AP Gun {{ordinal}}'),
      makeWeapon('ap_2', 'AP Gun', 1, 1, 1, true, { allowedTargetUnitTypes: ['LittlePigs', 'Castle'] }, 'AP Gun {{ordinal}}'),
      makeWeapon('ap_3', 'AP Gun', 1, 1, 1, true, { allowedTargetUnitTypes: ['LittlePigs', 'Castle'] }, 'AP Gun {{ordinal}}'),
      makeWeapon('ap_4', 'AP Gun', 1, 1, 1, true, { allowedTargetUnitTypes: ['LittlePigs', 'Castle'] }, 'AP Gun {{ordinal}}'),
      makeWeapon('ap_5', 'AP Gun', 1, 1, 1, true, { allowedTargetUnitTypes: ['LittlePigs', 'Castle'] }, 'AP Gun {{ordinal}}'),
      makeWeapon('ap_6', 'AP Gun', 1, 1, 1, true, { allowedTargetUnitTypes: ['LittlePigs', 'Castle'] }, 'AP Gun {{ordinal}}'),
      makeWeapon('ap_7', 'AP Gun', 1, 1, 1, true, { allowedTargetUnitTypes: ['LittlePigs', 'Castle'] }, 'AP Gun {{ordinal}}'),
      makeWeapon('ap_8', 'AP Gun', 1, 1, 1, true, { allowedTargetUnitTypes: ['LittlePigs', 'Castle'] }, 'AP Gun {{ordinal}}'),
      makeWeapon('missile_1', 'Missile', 6, 5, 3, true, undefined, 'Missile {{ordinal}}'),
      makeWeapon('missile_2', 'Missile', 6, 5, 3, true, undefined, 'Missile {{ordinal}}'),
    ],
  },
}

export function getAllUnitDefinitions(): Record<UnitType, UnitDefinition> {
  return { ...UNIT_DEFINITIONS }
}