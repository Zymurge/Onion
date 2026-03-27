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

export type BattlefieldOnionView = {
  id: string
  type: string
  q: number
  r: number
  status: string
  treads: number
  movesAllowed: number
  movesUsed: number
  rams: number
  weapons: string
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