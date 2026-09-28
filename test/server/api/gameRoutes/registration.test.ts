import type { FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { registerLifecycleRoutes } from '#server/api/gameRoutes/lifecycleRoutes'
import { registerLobbyRoutes } from '#server/api/gameRoutes/lobbyRoutes'
import { registerStateRoutes } from '#server/api/gameRoutes/stateRoutes'
import type { GameRouteContext } from '#server/api/gameRoutes/context'

function makeRouteRecorder() {
  const routes: string[] = []
  const app = {
    post: vi.fn((path: string) => routes.push(`POST ${path}`)),
    get: vi.fn((path: string) => routes.push(`GET ${path}`)),
    patch: vi.fn((path: string) => routes.push(`PATCH ${path}`)),
    delete: vi.fn((path: string) => routes.push(`DELETE ${path}`)),
  }

  return { app: app as unknown as FastifyInstance, routes }
}

const routeContext = {} as GameRouteContext

describe('game route registration modules', () => {
  it('registers lifecycle routes in create, join, and start order', async () => {
    const recorder = makeRouteRecorder()

    await registerLifecycleRoutes(recorder.app, routeContext)

    expect(recorder.routes).toEqual([
      'POST /',
      'POST /:id/join',
      'POST /:id/start',
    ])
  })

  it('registers lobby routes before the parameterized state route', async () => {
    const lobby = makeRouteRecorder()
    const state = makeRouteRecorder()

    await registerLobbyRoutes(lobby.app, routeContext)
    await registerStateRoutes(state.app, routeContext)

    expect(lobby.routes).toEqual([
      'GET /',
      'GET /history',
      'PATCH /:id/archive',
      'PATCH /:id/restore',
      'DELETE /:id',
      'GET /open',
    ])
    expect(state.routes).toEqual(['GET /:id'])
  })
})
