import { readFileSync } from 'node:fs'

import { getUnitTypeCatalog, getWeaponTypeCatalog, parseUnitCatalog } from '#shared/unitDefinitions'
import { CommandSchema } from '#shared/protocolSchemas'
import type { SessionInitPayload, UnitTypeCatalog } from '#shared/types/index'
import type { WebSocketClientMessage, WebSocketServerErrorMessage, WebSocketServerEventMessage, WebSocketServerPresenceMessage, WebSocketServerSessionInitMessage, WebSocketServerSnapshotMessage } from '#shared/websocketProtocol'
import type { ScenarioSnapshot } from './scenario.js'
import { resolveScenarioDefinitions } from '#server/engine/scenarioDefinitions'

function readCurrentUnitCatalog(): ReturnType<typeof parseUnitCatalog> {
  const catalogJson = readFileSync(new URL('../../../shared/config/unitCatalog.json', import.meta.url), 'utf8')
  return parseUnitCatalog(JSON.parse(catalogJson))
}

export function applyCurrentMapPresentation(
  sessionUnitTypes: UnitTypeCatalog,
  currentUnitTypes: UnitTypeCatalog,
  scenarioId?: string,
  scenarioUnitTypes?: ScenarioSnapshot['unitTypes'],
): UnitTypeCatalog {
  return Object.fromEntries(
    Object.entries(sessionUnitTypes).map(([unitTypeId, sessionUnitType]) => {
      const scenarioTypePrefix = scenarioId === undefined ? undefined : `${scenarioId}:`
      const derivedTypeId = scenarioTypePrefix !== undefined && unitTypeId.startsWith(scenarioTypePrefix)
        ? unitTypeId.slice(scenarioTypePrefix.length)
        : undefined
      const baseTypeId = derivedTypeId === undefined
        ? unitTypeId
        : scenarioUnitTypes?.[derivedTypeId]?.extends
      const currentUnitType = baseTypeId === undefined ? undefined : currentUnitTypes[baseTypeId]

      if (currentUnitType === undefined) {
        return [unitTypeId, sessionUnitType]
      }

      return [unitTypeId, {
        ...sessionUnitType,
        hexMapScale: currentUnitType.hexMapScale,
        hexMapOffsetX: currentUnitType.hexMapOffsetX,
        hexMapOffsetY: currentUnitType.hexMapOffsetY,
      }]
    }),
  ) as UnitTypeCatalog
}

/**
 * Builds the catalog payload sent before a WebSocket game snapshot.
 *
 * @returns Unit and weapon definitions without live unit state.
 */
export function buildSessionInitPayload(scenarioId?: string, scenarioSnapshot?: ScenarioSnapshot): SessionInitPayload {
  const resolved = scenarioId === undefined
    ? undefined
    : resolveScenarioDefinitions(scenarioId, scenarioSnapshot?.unitTypes)
  const currentCatalog = readCurrentUnitCatalog()
  const sessionUnitTypes = resolved?.unitTypes ?? getUnitTypeCatalog()

  return {
    unitTypes: applyCurrentMapPresentation(
      sessionUnitTypes,
      currentCatalog.unitTypes,
      scenarioId,
      scenarioSnapshot?.unitTypes,
    ),
    weaponTypes: resolved?.weaponTypes ?? getWeaponTypeCatalog(),
  }
}

/**
 * Serializes a validated WebSocket client or server message as JSON text.
 *
 * @param message Protocol message to serialize.
 * @returns JSON text suitable for a WebSocket frame.
 */
export function serializeWsMessage(message: WebSocketClientMessage | WebSocketServerEventMessage | WebSocketServerSessionInitMessage | WebSocketServerSnapshotMessage | WebSocketServerPresenceMessage | WebSocketServerErrorMessage): string {
  return JSON.stringify(message)
}

/**
 * Parses supported client WebSocket envelope shapes and rejects malformed input.
 *
 * @param rawMessage JSON text received from a client.
 * @returns A command/resume envelope, or null when the JSON or envelope shape is invalid.
 */
export function parseWsMessage(rawMessage: string): WebSocketClientMessage | null {
  try {
    const parsed = JSON.parse(rawMessage) as Partial<WebSocketClientMessage> & { kind?: string }
    if (parsed.kind === 'COMMAND') {
      const command = CommandSchema.safeParse(parsed.command)
      if (!command.success || parsed.requestId !== undefined && typeof parsed.requestId !== 'string') {
        return null
      }

      return {
        kind: 'COMMAND',
        command: command.data,
        ...(parsed.requestId === undefined ? {} : { requestId: parsed.requestId }),
      }
    }

    if (parsed.kind === 'RESUME' && typeof parsed.afterSeq === 'number') {
      return parsed as WebSocketClientMessage
    }
  } catch {
    return null
  }

  return null
}