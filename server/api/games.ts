import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { createGameRouteContext, type GameRouteOptions } from '#server/api/gameRoutes/context'
import { registerLifecycleRoutes } from '#server/api/gameRoutes/lifecycleRoutes'
import { registerLobbyRoutes } from '#server/api/gameRoutes/lobbyRoutes'
import { registerStateRoutes } from '#server/api/gameRoutes/stateRoutes'
import { registerActionRoutes } from '#server/api/gameRoutes/actionRoutes'
import { registerWebSocketRoutes } from '#server/api/gameRoutes/websocketRoutes'
import { registerDiagnosticRoutes } from '#server/api/gameRoutes/diagnosticRoutes'
import { registerEventRoutes } from '#server/api/gameRoutes/eventRoutes'

/**
 * Game management routes for creating, joining, and playing matches.
 *
 * Provides REST endpoints for the full game lifecycle including match creation,
 * player joining, state queries, action submission, and event polling.
 * All operations require authentication via Bearer token.
 *
 * @param app - Fastify application instance
 * @param opts - Plugin options containing the database adapter
 */
export const gameRoutes: FastifyPluginAsync<GameRouteOptions> = async (app: FastifyInstance, opts) => {
  const routeContext = createGameRouteContext(opts)
  await registerLifecycleRoutes(app, routeContext)
  await registerLobbyRoutes(app, routeContext)
  await registerStateRoutes(app, routeContext)
  await registerWebSocketRoutes(app, routeContext)
  await registerDiagnosticRoutes(app, routeContext)
  await registerActionRoutes(app, routeContext)
  await registerEventRoutes(app, routeContext)
}
