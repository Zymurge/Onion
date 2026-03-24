export type Mode = 'fire' | 'combined' | 'end-phase'
export type UnitStatus = 'operational' | 'disabled' | 'recovering' | 'destroyed'

export type BattlefieldUnit = {
  id: string
  type: string
  status: UnitStatus
  q: number
  r: number
  move: number
  weapons: string
  attack: string
  actionableModes: Mode[]
}

export type TimelineEvent = {
  seq: number
  type: string
  summary: string
  timestamp: string
  tone?: 'normal' | 'alert'
}

export type TerrainHex = {
  q: number
  r: number
  t: number
}

export const battlefieldModes: Array<{ id: Mode; label: string; helper: string }> = [
  { id: 'fire', label: 'Fire Unit', helper: 'Pick one attacker and one target.' },
  { id: 'combined', label: 'Combined Fire', helper: 'Build a volley from eligible defenders.' },
  { id: 'end-phase', label: 'End Phase', helper: 'Pass control to the next phase when ready.' },
]

export const scenarioMap = {
  width: 15,
  height: 22,
  hexes: [
    { q: 1, r: 0, t: 1 },
    { q: 2, r: 0, t: 1 },
    { q: 3, r: 1, t: 1 },
    { q: 4, r: 1, t: 1 },
    { q: 5, r: 2, t: 1 },
    { q: 3, r: 8, t: 2 },
    { q: 4, r: 8, t: 2 },
    { q: 7, r: 5, t: 3 },
  ] satisfies TerrainHex[],
}

export const onion = {
  id: 'onion-1',
  type: 'TheOnion',
  q: 0,
  r: 10,
  status: 'operational',
  treads: 33,
  movesAllowed: 5,
  movesUsed: 2,
  rams: 2,
  weapons: 'main: destroyed, secondary_2: ready, ap_1: ready, missile_2: ready',
} as const

export const defenders: BattlefieldUnit[] = [
  {
    id: 'wolf-1',
    type: 'BigBadWolf',
    status: 'operational',
    q: 5,
    r: 6,
    move: 4,
    weapons: 'main: ready',
    attack: '4 / rng 2',
    actionableModes: ['fire', 'combined'],
  },
  {
    id: 'wolf-2',
    type: 'BigBadWolf',
    status: 'operational',
    q: 6,
    r: 6,
    move: 4,
    weapons: 'main: ready',
    attack: '4 / rng 2',
    actionableModes: ['fire', 'combined'],
  },
  {
    id: 'puss-1',
    type: 'Puss',
    status: 'operational',
    q: 6,
    r: 4,
    move: 3,
    weapons: 'main: ready',
    attack: '4 / rng 2',
    actionableModes: ['fire', 'combined'],
  },
  {
    id: 'witch-1',
    type: 'Witch',
    status: 'disabled',
    q: 7,
    r: 3,
    move: 0,
    weapons: 'main: disabled',
    attack: '3 / rng 4',
    actionableModes: [],
  },
  {
    id: 'pigs-1',
    type: 'LittlePigs',
    status: 'operational',
    q: 4,
    r: 7,
    move: 2,
    weapons: 'rifle: ready',
    attack: '1 / rng 1',
    actionableModes: ['fire', 'combined'],
  },
  {
    id: 'pigs-2',
    type: 'LittlePigs',
    status: 'operational',
    q: 5,
    r: 7,
    move: 2,
    weapons: 'rifle: spent',
    attack: '1 / rng 1',
    actionableModes: [],
  },
]

export const recentEvents: TimelineEvent[] = [
  {
    seq: 45,
    type: 'FIRE_RESOLVED',
    summary: 'pigs-2 spent its rifle into Onion tread stack for 1 tread damage.',
    timestamp: '10:43:12',
  },
  {
    seq: 46,
    type: 'DEFENDER_STATUS',
    summary: 'witch-1 remains disabled and cannot fire this phase.',
    timestamp: '10:43:27',
    tone: 'alert',
  },
  {
    seq: 47,
    type: 'TURN_CONTEXT',
    summary: 'Defender combat is active. Eligible attackers are highlighted.',
    timestamp: '10:43:39',
  },
]

export function terrainCode(terrain: number | undefined): string {
  switch (terrain) {
    case 1:
      return 'RD'
    case 2:
      return 'CR'
    case 3:
      return 'CP'
    default:
      return ''
  }
}

export function unitCode(unitType: string): string {
  switch (unitType) {
    case 'TheOnion':
      return 'ON'
    case 'BigBadWolf':
      return 'BW'
    case 'LittlePigs':
      return 'LP'
    case 'Puss':
      return 'PU'
    case 'Witch':
      return 'WI'
    default:
      return '??'
  }
}

export function statusTone(status: UnitStatus): string {
  switch (status) {
    case 'operational':
      return 'ready'
    case 'disabled':
      return 'dim'
    case 'recovering':
      return 'recovering'
    case 'destroyed':
      return 'destroyed'
  }
}
