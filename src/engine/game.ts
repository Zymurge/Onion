import type { TurnPhase, GameState, EventEnvelope } from '../types/index.js';
import type { MatchRecord } from '../db/adapter.js';
import { TURN_PHASES, phaseActor } from './phases.js';

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
  const newEvents: EventEnvelope[] = [];
  let seq = (match.events.at(-1)?.seq ?? 0) + 1;
  const timestamp = new Date().toISOString();
  const state: GameState = structuredClone(match.state);
  let turnNumber = match.turnNumber;

  const fromPhase = match.phase;
  const nextIdx = (TURN_PHASES.indexOf(fromPhase) + 1) % TURN_PHASES.length;
  if (nextIdx === 0) turnNumber++;
  let phase = TURN_PHASES[nextIdx];
  newEvents.push({ seq: seq++, type: 'PHASE_CHANGED', timestamp, from: fromPhase, to: phase, turnNumber });

  // Auto-advance through DEFENDER_RECOVERY: process unit status transitions then continue
  if (phaseActor(phase) === 'engine') {
    for (const [unitId, unit] of Object.entries(state.defenders)) {
      const prevStatus = unit.status;
      if (unit.status === 'recovering') unit.status = 'operational';
      else if (unit.status === 'disabled') unit.status = 'recovering';
      if (unit.status !== prevStatus) {
        newEvents.push({ seq: seq++, type: 'UNIT_STATUS_CHANGED', timestamp, unitId, from: prevStatus, to: unit.status });
      }
    }
    const engineFrom = phase;
    const engineNextIdx = (TURN_PHASES.indexOf(engineFrom) + 1) % TURN_PHASES.length;
    if (engineNextIdx === 0) turnNumber++;
    phase = TURN_PHASES[engineNextIdx];
    newEvents.push({ seq: seq++, type: 'PHASE_CHANGED', timestamp, from: engineFrom, to: phase, turnNumber });
  }

  return { phase, turnNumber, state, newEvents };
}
