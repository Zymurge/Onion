import { describe, expect, it } from 'vitest'

import { CommandSchema } from '#shared/protocolSchemas'

describe('CommandSchema', () => {
	it('accepts the supported command shapes', () => {
		expect(CommandSchema.safeParse({ type: 'END_PHASE' }).success).toBe(true)
		expect(CommandSchema.safeParse({
			type: 'MOVE',
			movers: ['wolf-1'],
			to: { q: 2, r: -1 },
			attemptRam: true,
		}).success).toBe(true)
		expect(CommandSchema.safeParse({
			type: 'FIRE',
			attackers: ['wolf-1'],
			targetId: 'onion-1',
			onionId: 'onion-1',
		}).success).toBe(true)
	})

	it('rejects malformed discriminated payloads and unknown fields', () => {
		expect(CommandSchema.safeParse({ type: 'MOVE', movers: 'wolf-1', to: { q: 2, r: -1 } }).success).toBe(false)
		expect(CommandSchema.safeParse({ type: 'FIRE', attackers: ['wolf-1'], targetId: 'onion-1' }).success).toBe(false)
		expect(CommandSchema.safeParse({ type: 'END_PHASE', phase: 'ONION_MOVE' }).success).toBe(false)
		expect(CommandSchema.safeParse({ type: 'MOVE', movers: [], to: { q: 2, r: -1 } }).success).toBe(true)
	})
})