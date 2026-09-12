import { describe, expect, it } from 'vitest'

import {
	idleLiveEventSource,
	idleSessionController,
	idleSessionState,
} from '#web/lib/appIdleSessionFallbacks'

describe('idle session fallbacks', () => {
	it('exposes an explicit empty session state', () => {
		expect(idleSessionState).toEqual({
			status: 'idle',
			catalog: null,
			snapshot: null,
			session: null,
			liveConnection: 'idle',
			lastAppliedEventSeq: null,
			lastAppliedEventType: null,
			lastUpdatedAt: null,
			error: null,
		})
	})

	it('provides a no-op live event source', () => {
		const listener = () => {}
		const unsubscribe = idleLiveEventSource.subscribe(listener)

		expect(unsubscribe()).toBeUndefined()
		expect(idleLiveEventSource.connect(123)).toBeUndefined()
		expect(idleLiveEventSource.disconnect(123)).toBeUndefined()
		expect(idleLiveEventSource.getConnectionState(123)).toBe('idle')
	})

	it('provides a no-op controller that satisfies the session contract', async () => {
		const listener = () => {}
		const unsubscribe = idleSessionController.subscribe(listener)

		expect(idleSessionController.getSnapshot()).toBe(idleSessionState)
		expect(unsubscribe()).toBeUndefined()
		await expect(idleSessionController.load()).resolves.toBeUndefined()
		await expect(idleSessionController.refresh()).resolves.toBeUndefined()
		await expect(idleSessionController.submitAction({ type: 'refresh' })).resolves.toBeNull()
		expect(idleSessionController.abort('ignored')).toBeUndefined()
		expect(idleSessionController.dispose()).toBeUndefined()
	})
})