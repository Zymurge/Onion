export type TreadsCombatTarget = {
  kind: 'treads'
  onionId: string
}

const TREADS_TARGET_PATTERN = /^([^:]+):treads$/

export function parseCombatTargetId(targetId: string): TreadsCombatTarget | null {
  const match = TREADS_TARGET_PATTERN.exec(targetId)
  if (match === null) {
    return null
  }

  const onionId = match[1]
  if (onionId.trim().length === 0 || onionId !== onionId.trim()) {
    return null
  }

  return { kind: 'treads', onionId }
}

export function formatCombatTargetId(target: TreadsCombatTarget): string {
  if (target.onionId.trim().length === 0 || target.onionId !== target.onionId.trim() || target.onionId.includes(':')) {
    throw new Error(`Invalid Onion ID '${target.onionId}' for treads target`)
  }

  return `${target.onionId}:treads`
}
