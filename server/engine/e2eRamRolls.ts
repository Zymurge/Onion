import type { RollSource } from './movement.js'

const MIN_ROLL = 1
const MAX_ROLL = 6

/** Parses the explicit E2E-only roll sequence and returns a fresh queue for each game. */
export function createE2ERamRollsFactory(raw: string | undefined): (() => RollSource) | undefined {
  const configured = raw?.trim()
  if (!configured) {
    return undefined
  }

  const rolls = configured.split(',').map((value, index) => {
    const roll = Number(value.trim())
    if (!Number.isInteger(roll) || roll < MIN_ROLL || roll > MAX_ROLL) {
      throw new Error(`E2E_RAM_ROLLS entry at index ${index} must be an integer between ${MIN_ROLL} and ${MAX_ROLL}, received ${value.trim()}`)
    }
    return roll
  })

  return () => {
    const queue = [...rolls]
    return {
      next(): number {
        const roll = queue.shift()
        if (roll === undefined) {
          throw new Error(`E2E_RAM_ROLLS exhausted after ${rolls.length} roll(s)`)
        }
        return roll
      },
    }
  }
}