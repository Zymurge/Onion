import { describe, expect, it } from 'vitest'
import { waitForAuthoritativeSnapshotAdvance } from './battlefieldPage.js'

describe('BattlefieldPage synchronization helpers', () => {
	it('waits for a strictly newer authoritative snapshot sequence', async () => {
		const snapshotSequences = [4, 4, 5]
		let reads = 0

		await waitForAuthoritativeSnapshotAdvance(
			async () => snapshotSequences[reads++] ?? 5,
			4,
			'waiting for the snapshot to advance',
		)

		expect(reads).toBe(3)
	})
})