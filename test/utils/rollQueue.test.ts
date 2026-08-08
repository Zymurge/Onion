import { describe, expect, it } from 'vitest'
import { createRollQueue } from './rollQueue.js'

describe('createRollQueue', () => {
	it('returns declared rolls in consumption order', () => {
		const queue = createRollQueue([3, 1, 6])

		expect(queue.next()).toBe(3)
		expect(queue.next()).toBe(1)
		expect(queue.next()).toBe(6)
	})

	it('reports how many rolls remain as they are consumed', () => {
		const queue = createRollQueue([4, 2])

		expect(queue.remaining).toBe(2)
		queue.next()
		expect(queue.remaining).toBe(1)
		queue.next()
		expect(queue.remaining).toBe(0)
	})

	it('fails loudly once the declared sequence is exhausted', () => {
		const queue = createRollQueue([5])

		queue.next()

		expect(() => queue.next()).toThrow(/exhausted after 1 roll/)
	})

	it('rejects a queue containing an out-of-range roll', () => {
		expect(() => createRollQueue([1, 7])).toThrow(/integer between 1 and 6/)
		expect(() => createRollQueue([0])).toThrow(/integer between 1 and 6/)
	})

	it('rejects a queue containing a non-integer roll', () => {
		expect(() => createRollQueue([3.5])).toThrow(/integer between 1 and 6/)
	})

	it('keeps separately created queues independent', () => {
		const first = createRollQueue([1, 2])
		const second = createRollQueue([6, 5])

		expect(first.next()).toBe(1)
		expect(second.next()).toBe(6)
		expect(first.remaining).toBe(1)
		expect(second.remaining).toBe(1)
	})
})
