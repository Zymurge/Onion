import { calculateCrtOddsBand } from '../../shared/combatCalculator.js'

export function calculatePreviewCombatOdds(attackStrength: number, defenseStrength: number): string {
  return calculateCrtOddsBand(attackStrength, defenseStrength)
}