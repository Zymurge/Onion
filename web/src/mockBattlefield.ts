import type { Mode, TimelineEvent } from './lib/battlefieldView'

export const battlefieldModes: Array<{ id: Mode; label: string; helper: string }> = [
  { id: 'fire', label: 'Fire Unit', helper: 'Pick one attacker and one target.' },
  { id: 'combined', label: 'Combined Fire', helper: 'Build a volley from eligible defenders.' },
  { id: 'end-phase', label: 'End Phase', helper: 'Pass control to the next phase when ready.' },
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

