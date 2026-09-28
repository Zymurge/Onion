import { describe, expect, it, vi } from 'vitest'

import { createGameRouteContext } from '#server/api/gameRoutes/context'
import type { DbAdapter } from '#server/db/adapter'
import type { RollSource } from '#server/engine/index'
import type { WebSocket } from 'ws'

const makeRollSource = (): RollSource => ({ next: () => 1 })

const makeSocket = () => ({
  readyState: 1,
  send: vi.fn(),
}) as unknown as WebSocket

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
})
