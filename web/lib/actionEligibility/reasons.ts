import type { CombatEligibilityReason } from './combat'
import type { MovementEligibilityReason } from './movement'
import type { Weapon } from '../../../shared/types/index.js'

export type EligibilityReason = MovementEligibilityReason | CombatEligibilityReason
export type CombatWeaponDetail = Weapon & { disabledReason?: string }

const eligibilityReasonLabels: Record<EligibilityReason, string> = {
  destroyed: 'Destroyed',
  disabled: 'Disabled',
  recovering: 'Recovering',
  'wrong-phase': 'Not available in this phase',
  'not-your-turn': 'Not your turn',
  'no-movement-remaining': 'No movement remaining',
  'no-attack-capabilities': 'No attack capabilities',
  'out-of-ammo': 'Out of ammo',
  'attacks-spent': 'Fired this turn',
  'no-target-in-range': 'Out of range',
}

export function formatEligibilityReason(reason: EligibilityReason): string {
  return eligibilityReasonLabels[reason]
}
