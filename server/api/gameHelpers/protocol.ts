import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { CommandSchema } from '#shared/protocolSchemas'
import type { SessionInitPayload } from '#shared/types/index'
import type { WebSocketClientMessage, WebSocketServerErrorMessage, WebSocketServerEventMessage, WebSocketServerPresenceMessage, WebSocketServerSessionInitMessage, WebSocketServerSnapshotMessage } from '#shared/websocketProtocol'

/**
 * Builds the static catalog payload sent before a WebSocket game snapshot.
 *
 * @returns Unit and weapon definitions without live unit state.
 */
export function buildSessionInitPayload(): SessionInitPayload {
  return {
    unitTypes: getUnitTypeCatalog(),
    weaponTypes: getWeaponTypeCatalog(),
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