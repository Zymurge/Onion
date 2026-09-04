import type { FastifyPluginAsync } from 'fastify'

export type RuntimeConfig = {
  lobbyPollIntervalMs: number
}

export const runtimeConfigRoutes: FastifyPluginAsync<{ config: RuntimeConfig }> = async (app, { config }) => {
  app.get('/', async (_req, reply) => {
    return reply.send({
      lobbyPollIntervalMs: config.lobbyPollIntervalMs,
    })
  })
}
