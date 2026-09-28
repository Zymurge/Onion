const GAME_ID_RE = /^\d+$/

/**
 * Parses a positive decimal game id without accepting signs, fractions, or unsafe integers.
 *
 * @param rawId Route parameter text received from the API.
 * @returns A safe positive numeric id, or null for invalid input.
 */
export function parseGameId(rawId: string): number | null {
  if (!GAME_ID_RE.test(rawId)) return null
  const parsed = Number(rawId)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}