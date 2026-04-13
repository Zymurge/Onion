import { calculateOdds as sharedCalculateOdds } from '../../shared/combatCalculator.js'

export function calculateCombatOdds(attackStrength: number, defenseStrength: number): string {
  return sharedCalculateOdds(attackStrength, defenseStrength)
}