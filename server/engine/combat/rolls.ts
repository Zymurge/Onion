import { calculateCrtOddsBand } from '#shared/combatCalculator'
import type { CombatResult, CombatRoll } from './types.js'

// CRT[odds][roll - 1]: rows = odds column, columns = die 1-6.
const CRT: Record<string, CombatResult[]> = {
  '1:3': ['NE', 'NE', 'NE', 'NE', 'NE', 'NE'],
  '1:2': ['NE', 'NE', 'NE', 'NE', 'D', 'X'],
  '1:1': ['NE', 'NE', 'D', 'D', 'X', 'X'],
  '2:1': ['NE', 'D', 'D', 'X', 'X', 'X'],
  '3:1': ['D', 'D', 'X', 'X', 'X', 'X'],
  '4:1': ['D', 'X', 'X', 'X', 'X', 'X'],
  '5:1': ['X', 'X', 'X', 'X', 'X', 'X'],
}

/**
 * Roll on the Combat Results Table.
 *
 * @param attackStrength Total attack strength.
 * @param defenseValue Target defense value.
 * @param roll Optional fixed roll for testing (1-6).
 */
export function rollCombat(
  attackStrength: number,
  defenseValue: number,
  roll?: number,
): CombatRoll {
  const odds = calculateCrtOddsBand(attackStrength, defenseValue)
  const d6 = roll ?? (Math.floor(Math.random() * 6) + 1)
  const result = CRT[odds][d6 - 1]
  return { roll: d6, result, odds }
}

/**
 * Calculate the engine's normalized combat odds ratio.
 *
 * This delegates to the shared CRT odds rule so engine callers use the same
 * band calculation as the server and web combat previews.
 */
export function calculateEngineCombatOdds(attackStrength: number, defenseValue: number): string {
  return calculateCrtOddsBand(attackStrength, defenseValue)
}