import { loadConfig, type ServerEnvironment } from '#server/config/loadConfig'

export function resolveScenariosDir(env: ServerEnvironment = process.env): string {
  return loadConfig(env).scenariosDir
}
