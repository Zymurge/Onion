import { calculateOdds as sharedCalculateOdds } from '../../../src/shared/combatCalculator.js'

export function calculateCombatOdds(attackStrength: number, defenseStrength: number): string {
  return sharedCalculateOdds(attackStrength, defenseStrength)
}