import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGameRouteContext } from '#server/api/gameRoutes/context'
import type { DbAdapter } from '#server/db/adapter'
import type { RollSource } from '#server/engine/index'
import type { WebSocket } from 'ws'

const makeRollSource = (): RollSource => ({ next: () => 1 })

const makeSocket = () => ({
  readyState: 1,
  send: vi.fn(),
}) as unknown as WebSocket

afterEach(() => {
  vi.useRealTimers()
})

describe('createGameRouteContext', () => {
  it('caches deterministic roll sources per game', () => {
    const ramRolls = vi.fn(makeRollSource)
    const combatRolls = vi.fn(makeRollSource)
    const context = createGameRouteContext({
      db: {} as DbAdapter,
      scenariosDir: 'scenarios',
      presenceDisconnectGraceMs: 100,
      createRamRolls: ramRolls,
      createCombatRolls: combatRolls,
    })

    expect(context.ramRollsForGame(1, 'scenario-a')).toBe(context.ramRollsForGame(1, 'scenario-b'))
    expect(context.combatRollsForGame(1)).toBe(context.combatRollsForGame(1))
    expect(ramRolls).toHaveBeenCalledOnce()
    expect(ramRolls).toHaveBeenCalledWith('scenario-a')
    expect(combatRolls).toHaveBeenCalledOnce()
  })

  it('tracks player presence and broadcasts live events', async () => {
    const context = createGameRouteContext({
      db: {} as DbAdapter,
      scenariosDir: 'scenarios',
      presenceDisconnectGraceMs: 100,
    })
    const socket = makeSocket()
    const match = { players: { onion: 'onion-user', defender: 'defender-user' } }

    await context.addLiveConnection(7, 'onion-user', socket, match)

    expect(context.getPlayerPresence(7, match)).toEqual({ onion: 'connected', defender: null })
    context.broadcastGameEvents(7, [{ seq: 1, type: 'UNIT_MOVED', timestamp: 'test' }])
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('UNIT_MOVED'))

    context.removeLiveConnection(7, socket)
    expect(context.getPlayerPresence(7, match)).toEqual({ onion: null, defender: null })
  })

  it('waits for the configured grace period before broadcasting a disconnect', async () => {
    vi.useFakeTimers()
    const match = { players: { onion: 'onion-user', defender: 'defender-user' } }
    const findMatch = vi.fn().mockResolvedValue(match)
    const context = createGameRouteContext({
      db: { findMatch } as unknown as DbAdapter,
      scenariosDir: 'scenarios',
      presenceDisconnectGraceMs: 100,
    })
    const observer = makeSocket()
    const onionSocket = makeSocket()

    await context.addLiveConnection(7, 'defender-user', observer, match)
    await context.addLiveConnection(7, 'onion-user', onionSocket, match)
    vi.mocked(observer.send).mockClear()

    context.removeLiveConnection(7, onionSocket)
    expect(observer.send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(99)
    expect(observer.send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(findMatch).toHaveBeenCalledWith(7)
    expect(observer.send).toHaveBeenCalledWith(expect.stringContaining('"onion":null'))

    context.removeLiveConnection(7, observer)
  })

  it('cancels a pending disconnect when the player reconnects during the grace period', async () => {
    vi.useFakeTimers()
    const match = { players: { onion: 'onion-user', defender: 'defender-user' } }
    const findMatch = vi.fn().mockResolvedValue(match)
    const context = createGameRouteContext({
      db: { findMatch } as unknown as DbAdapter,
      scenariosDir: 'scenarios',
      presenceDisconnectGraceMs: 100,
    })
    const observer = makeSocket()
    const firstOnionSocket = makeSocket()
    const secondOnionSocket = makeSocket()

    await context.addLiveConnection(7, 'defender-user', observer, match)
    await context.addLiveConnection(7, 'onion-user', firstOnionSocket, match)
    vi.mocked(observer.send).mockClear()

    context.removeLiveConnection(7, firstOnionSocket)
    await vi.advanceTimersByTimeAsync(50)
    await context.addLiveConnection(7, 'onion-user', secondOnionSocket, match)
    await vi.advanceTimersByTimeAsync(50)

    expect(findMatch).not.toHaveBeenCalled()
    expect(observer.send).toHaveBeenCalledWith(expect.stringContaining('"onion":"connected"'))
    expect(observer.send).not.toHaveBeenCalledWith(expect.stringContaining('"onion":null'))

    context.removeLiveConnection(7, secondOnionSocket)
    context.removeLiveConnection(7, observer)
  })
})
