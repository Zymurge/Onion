export function calculateCombatOdds(attackStrength: number, defenseStrength: number): string {
  if (defenseStrength <= 0) {
    return '5:1'
  }

  const ratio = attackStrength / defenseStrength

  if (ratio >= 5) return '5:1'
  if (ratio >= 4) return '4:1'
  if (ratio >= 3) return '3:1'
  if (ratio >= 2) return '2:1'
  if (ratio >= 1) return '1:1'
  if (ratio >= 0.5) return '1:2'
  return '1:3'
}