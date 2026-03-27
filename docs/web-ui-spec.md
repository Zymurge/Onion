# Onion Web UI Specification (v0.1)

## Purpose

Define the architecture, scope, implementation phases, reuse strategy, and quality gates for the first production web UI for Onion.

This document captures the team-aligned direction before coding begins.

## Architecture Direction (Locked)

1. Build a React + TypeScript SPA in a dedicated `web/` folder.
2. Keep Fastify backend as the source of truth for game rules, turn phases, and action validation.
3. Share domain contracts from `src/types/index.ts` directly with the web client where possible.
4. Extract transport/API logic currently in the CLI into a shared SDK module, then consume it from both CLI and web.
5. Favor deterministic server-state rendering over optimistic local simulation.

## Non-Goals (Initial)

1. No gameplay rule logic in the web client.
2. No custom transport protocol.
3. No full websocket requirement in first vertical slice (polling/manual refresh is acceptable first).
4. No redesign of core backend APIs before initial UI is functional.
5. No tablet/mobile UX commitment in initial implementation (desktop-only first).

## Source Interfaces and Contract Baseline

Primary backend integration contract:

1. `GET /scenarios` (returns id, name, displayName, description)
2. `GET /scenarios/{id}` (returns full scenario including displayName)
3. `POST /auth/register`
4. `POST /auth/login`
5. `POST /games`
6. `POST /games/{id}/join`
7. `GET /games/{id}`
8. `POST /games/{id}/actions`
9. `GET /games/{id}/events?after={seq}`

References:

1. `docs/api-contract.md`
2. `src/types/index.ts`
3. `src/cli/api/client.ts`

## Reuse Strategy

## Reuse Scope

1. Request/response typing and API error normalization.
2. Event sequence handling (`eventSeq`, incremental fetch after sequence number).
3. Domain naming and command payload shapes.
4. Display semantics for unit/weapon effective status (operational vs disabled/recovering/destroyed).

## Extraction Plan

1. Introduce shared package/module (proposal): `src/shared/api/`.
2. Move generic fetch helpers + endpoint wrappers from CLI API client into shared module.
3. Keep CLI session concerns (`SessionStore`) in CLI layer.
4. Add web session/auth adapter in web layer.

## Validation Rule

Shared SDK migration is considered complete when:

1. CLI compiles and runs using shared SDK.
2. Web client can perform auth + game fetch using same SDK.

## Implementation Phases

## Phase 0: Product + UX Definition

**Status: Complete**

Deliverables:

1. This UI spec.
2. Core screen layout spec.
3. Interaction/state model for game screen.
4. Error message strategy and command affordance map.

Exit Criteria:

1. Team agrees on MVP screen inventory and action flows.
2. Open questions tracked and assigned.

## Phase 1: Vertical Slice (Playable Snapshot)

Deliverables:

1. Web scaffold (`web/`) with React + TypeScript.
2. Auth pages (register/login).
3. Scenario listing and game create/join/load.
4. Desktop game screen with summary panels and manual refresh.
5. Action submission controls for `MOVE`, `FIRE_*`, and `END_PHASE`.

**Status: In Progress (Partial)**

Exit Criteria:

1. Single-player test flow works end to end against running backend.
2. Two-browser manual game observation works (refresh-based).

## Phase 2: Core Battle UX

Deliverables:

1. Interactive map and unit selection model.
2. Context-sensitive action composer by phase/role.
3. Strong error presentation using `code` + `detailCode`.
4. Event panel with sequence-aware refresh.

Exit Criteria:

1. Full turn can be played from web UI without falling back to CLI.
2. Critical command error states are understandable and recoverable.

## Phase 3: Live Updates and Collaboration Quality

Deliverables:

1. Polling loop using `GET /events?after=`.
2. Optional websocket transport adapter (additive).
3. Session reconnect and stale-state handling.

Exit Criteria:

1. UI remains consistent across two clients during active play.
2. No event duplication or out-of-order render regressions in normal operation.

## Phase 4: Hardening and Production Readiness

Deliverables:

1. Accessibility pass (keyboard + semantics + contrast).
2. Responsive/mobile pass (only after desktop gameplay learnings are captured).
3. Performance pass for rendering and event throughput.
4. Final QA checklist and release docs.

Exit Criteria:

1. Regression tests green.
2. Production acceptance criteria signed off.

## State Model (Web)

## Server State (Authoritative)

1. `GameState`, `phase`, `turnNumber`, `eventSeq`.
2. Event stream envelopes.

## Local UI State (Ephemeral)

1. Selected map unit/hex.
2. Draft action form fields.
3. Panel visibility and layout preferences.
4. Loading/submission statuses and API error surfaces.

## Rule

Never mutate server-derived game state as if it were authoritative. Always reconcile from response snapshots and event deltas.

## Action Affordance Matrix (Initial)

**Status: Complete**

1. During non-active role turn: action controls lowlighted/disabled, read-only explanation shown.
2. During active phase: show only legal command entry points for that role/phase.
3. For `END_PHASE`: always visible when caller has active role and game not over.
4. For fire actions: enforce complete required inputs before enabling submit.
5. In each action mode, units that can act are visually highlighted and listed with pertinent stats.

## Turn and Endgame Presentation

**Status: Complete**

1. Turn ownership is communicated primarily by control affordance:
   1. Your turn: controls and actionable units highlighted.
   2. Opponent turn: controls lowlighted/disabled.
2. The header should show the current player role from session context.
3. At game end, show a dedicated result overlay with outcome and next actions.

## Error Handling UX Baseline

1. Show user-friendly message + machine details.
2. Include code metadata in expandable diagnostics:
   1. `code`
   2. `detailCode`
   3. `currentPhase`
3. Preserve failed action draft state where safe for quick correction/retry.

## Testing Strategy

The canonical layer map lives in [testing-strategy.md](testing-strategy.md). For the web UI, keep unit tests focused on selectors and payload builders, component tests focused on App orchestration and interaction states, integration tests focused on UI + API wiring, and E2E limited to full user journeys.

## Open Questions

1. Should first map release support click-to-move only, or text coordinate fallback in the same view?
2. Is websocket support required for Phase 2, or explicitly deferred to Phase 3?
3. Do we need spectator mode in this track, or post-1.0 web milestone?
4. Preferred design token baseline and brand style direction for final visual pass?
