import type { RollSource } from '#server/engine/movement'

const MIN_ROLL = 1
const MAX_ROLL = 6

export type RollQueue = RollSource & {
	readonly remaining: number
}

function assertValidRoll(roll: number, index: number): void {
	if (!Number.isInteger(roll) || roll < MIN_ROLL || roll > MAX_ROLL) {
		throw new Error(`Roll queue entry at index ${index} must be an integer between ${MIN_ROLL} and ${MAX_ROLL}, received ${roll}`)
	}
}

/**
 * A finite, test-only sequence of die rolls for combat and ramming.
 *
 * Values are consumed in order via `next()`. Production engine code never
 * creates or reaches for this queue on its own; callers must pass it in
 * explicitly through the existing `roll` or `ramRolls` injection points, so
 * default gameplay randomness is unaffected unless a test opts in.
 */
export function createRollQueue(rolls: number[]): RollQueue {
	rolls.forEach(assertValidRoll)
	const queue = [...rolls]

	return {
		get remaining(): number {
			return queue.length
		},
		next(): number {
			const roll = queue.shift()
			if (roll === undefined) {
				throw new Error(`Roll queue exhausted after ${rolls.length} roll(s); declare a longer sequence for this scenario`)
			}
			return roll
		},
	}
}
