import { resetMovementSpent } from '#shared/unitMovement'
import { getUnitRamCapacity } from '#shared/unitMovement'
import logger from '#server/logger'
import type { TurnPhase, GameState, EventEnvelope } from '#shared/types/index'
import type { MatchRecord } from '#server/db/adapter'
import { TURN_PHASES, phaseActor } from '#server/engine/phases'

function getWeaponTypeFromId(weaponId: string): 'main' | 'secondary' | 'ap' | 'missile' | null {
  if (weaponId === 'main') return 'main'
  if (weaponId.startsWith('secondary_')) return 'secondary'
  if (weaponId.startsWith('ap_')) return 'ap'
  if (weaponId.startsWith('missile_')) return 'missile'
  return null
}

function refreshOnionWeaponsForNewTurn(state: GameState): void {
  for (const onion of Object.values(state.onions)) {
    onion.ramsRemaining = getUnitRamCapacity(onion.typeId)
    for (const weapon of onion.weapons) {
      if (weapon.state === 'spent') {
        weapon.state = 'ready'

        const weaponType = getWeaponTypeFromId(weapon.typeId)
        if (weaponType === 'missile') {
          const missileOnion = onion as typeof onion & { missiles?: number }
          if (missileOnion.missiles !== undefined) {
            missileOnion.missiles += 1
          }
        } else if (weaponType) {
          const batteryOnion = onion as typeof onion & {
            batteries?: { main: number; secondary: number; ap: number }
          }
          if (batteryOnion.batteries) {
            batteryOnion.batteries[weaponType] = (batteryOnion.batteries[weaponType] ?? 0) + 1
          }
        }
      }
    }
  }
}

/**
 * Advance the game phase and auto-process engine-only phases.
 *
 * Pure function that takes a snapshot of match state and returns the new state
 * after phase advancement. Handles automatic DEFENDER_RECOVERY processing.
 *
 * @param match - Current match state snapshot
 * @returns New phase, turn number, game state, and events generated
 */
export function advancePhaseWithEvents(match: Pick<MatchRecord, 'phase' | 'turnNumber' | 'state' | 'events'>): {
  phase: TurnPhase;
  turnNumber: number;
  state: GameState;
  newEvents: EventEnvelope[];
} {
  logger.info({ phase: match.phase, turnNumber: match.turnNumber }, 'Advancing phase in engine');
  logger.debug({ match }, 'advancePhaseWithEvents input match');
  const newEvents: EventEnvelope[] = [];
  let seq = (match.events.at(-1)?.seq ?? 0) + 1;
  const timestamp = new Date().toISOString();
  const state = structuredClone(match.state) as GameState;
  let turnNumber = match.turnNumber;

  const fromPhase = match.phase;
  const nextIdx = (TURN_PHASES.indexOf(fromPhase) + 1) % TURN_PHASES.length;
  if (nextIdx === 0) turnNumber++;
  let phase = TURN_PHASES[nextIdx];
  newEvents.push({ seq: seq++, type: 'PHASE_CHANGED', timestamp, phase: fromPhase, from: fromPhase, to: phase, turnNumber });

  if (phase === 'ONION_MOVE') {
    resetMovementSpent(state);
    refreshOnionWeaponsForNewTurn(state);
    // Reset defender weapons for the new turn
    for (const unit of Object.values(state.defenders)) {
      if (unit.weapons) {
        for (const weapon of unit.weapons) {
          if (weapon.state === 'spent') {
            weapon.state = 'ready'
          }
        }
      }
    }
    for (const [unitId, unit] of Object.entries(state.defenders)) {
      const prevStatus = unit.state;
      if (unit.state === 'disabled') unit.state = 'recovering';
      if (unit.state !== prevStatus) {
          newEvents.push({ seq: seq++, type: 'UNIT_STATUS_CHANGED', timestamp, phase: phase, unitId, from: prevStatus, to: unit.state });
      }
    }
  }

  // Auto-advance through DEFENDER_RECOVERY: process unit status transitions then continue
  if (phaseActor(phase) === 'engine') {
    const engineFrom = phase;
    for (const [unitId, unit] of Object.entries(state.defenders)) {
      const prevStatus = unit.state;
      if (unit.state === 'recovering') unit.state = 'operational';
      if (unit.state !== prevStatus) {
        newEvents.push({ seq: seq++, type: 'UNIT_STATUS_CHANGED', timestamp, phase: engineFrom, unitId, from: prevStatus, to: unit.state });
      }
    }
    const engineNextIdx = (TURN_PHASES.indexOf(engineFrom) + 1) % TURN_PHASES.length;
    if (engineNextIdx === 0) turnNumber++;
    phase = TURN_PHASES[engineNextIdx];
    newEvents.push({ seq: seq++, type: 'PHASE_CHANGED', timestamp, phase: engineFrom, from: engineFrom, to: phase, turnNumber });
  }

  const result = { phase, turnNumber, state, newEvents };
  logger.debug({ result }, 'advancePhaseWithEvents result');
  return result;
}
