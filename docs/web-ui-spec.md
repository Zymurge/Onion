# Onion Web UI Specification (v0.1)

## Purpose

Define the architecture, scope, implementation phases, reuse strategy, and quality
gates for the first production web UI for Onion.

This document captures the team-aligned direction before coding begins.

## Architecture Direction (Locked)

1. Build a React + TypeScript SPA in a dedicated `web/` folder.
2. Keep Fastify backend as the source of truth for game rules, turn phases, and
   action validation.
3. Share domain contracts from `src/types/index.ts` directly with the web client
   where possible.
4. Extract transport/API logic currently in the CLI into a shared SDK module, then
   consume it from both CLI and web.
5. Favor deterministic server-state rendering over optimistic local simulation.

## Non-Goals (Initial)

1. No gameplay rule logic in the web client.
2. No custom transport protocol.
3. No full websocket requirement in first vertical slice (polling/manual refresh
   is acceptable first).
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
2. Move generic fetch helpers + endpoint wrappers from CLI API client into shared
   module.
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

## Board Model (Web)

1. The web battlefield board is an odd-r offset hex grid rendered in row-major order.
2. Board positions are addressed with integer `q`/`r` coordinates, where `q` is the column index and `r` is the row index.
3. Visual placement staggers odd-numbered rows to the right; this is a presentation detail and does not change the stored board coordinates.
4. Range, reachability, and selection overlays must be derived from the same board geometry model used by the renderer so that the displayed hex map and all overlay previews stay aligned.
5. Do not treat the web board coordinates as axial movement coordinates unless a helper explicitly converts between the two representations.

## Server State (Authoritative)

1. `GameState`, `phase`, `turnNumber`, `eventSeq`.
2. Event stream envelopes.
3. The connected battlefield view must derive unit roster,
   unit positions, and unit status from the loaded game
   state's `state` payload.
4. The connected hex board must derive terrain,
   dimensions, and coordinate bounds from the loaded
   scenario map snapshot for the active game.

## Local UI State (Ephemeral)

1. Selected map unit/hex.
2. Draft action form fields.
3. Panel visibility and layout preferences.
4. Loading/submission statuses and API error surfaces.

## Rule

Never mutate server-derived game state as if it were authoritative. Always reconcile
from response snapshots and event deltas.

Connected rendering must not fall back to `web/src/mockBattlefield.ts` for map terrain,
unit roster, unit positions, or unit status once authoritative game data has loaded.

## Action Affordance Matrix (Initial)

**Status: Complete**

1. During non-active role turn: action controls lowlighted/disabled, read-only
   explanation shown.
2. During active phase: show only legal command entry points for that role/phase.
3. For `END_PHASE`: always visible when caller has active role and game not over.
4. For fire actions: enforce complete required inputs before enabling submit.
5. In each action mode, units that can act are visually highlighted and listed with
   pertinent stats.

## Turn and Endgame Presentation

**Status: Complete**

1. Turn ownership is communicated primarily by control affordance:
   1. Your turn: controls and actionable units highlighted.
   2. Opponent turn: controls lowlighted/disabled.
2. The header should show the current player role from session context.
3. At game end, show a dedicated result overlay with outcome and next actions.

## Move Mechanics (UI Interaction Spec)

**Eligibility:**

- A unit is eligible to move if it is operational and has at least 1 movement allowance remaining in the current phase.

**Unit Highlighting:**

- During the player’s movement phase, all eligible units are visually highlighted. The highlight may be applied to the unit icon or the entire hex it occupies.
- The currently selected unit’s hex is distinctly highlighted to indicate selection.

**Selection & Deselection:**

- Left-clicking on any unit selects it, displaying its details in the right rail and deselecting any previously selected unit.
- Left-clicking on any empty hex or non-unit area of the hexmap deselects the current selection and removes all move overlays.

**Move Radius & Action:**

- When a unit with remaining movement allowance is selected, all hexes within its movement range are highlighted with a subtle green overlay, visually distinct from the selected hex.
- Right-clicking on a highlighted (in-range) hex instantly moves the selected unit to that hex, submits the move event, and refreshes the UI with the unit deselected.
- Selecting a unit with no move eligibility displays its stats but does not highlight any move radius.

**Error Feedback:**

- The error bubble for an illegal move is only shown when the selected unit is owned by the current player, the selected unit is eligible to move (operational, has movement allowance, and it is the correct movement phase), and the player right-clicks an ineligible (out-of-range, blocked, or overstacked) hex.
- If the selected unit is not eligible (wrong player, wrong phase, disabled, or out of movement), no error bubble is shown.
- The error bubble should eventually report a specific reason: 'out of range', 'blocked by terrain', or 'can't stack units', as appropriate. For now, a generic “Illegal move” message is shown.
- The error bubble remains visible for 3 seconds or until dismissed by clicking anywhere.

**Other Behaviors:**

- Only one unit can be selected at a time.
- All move overlays and highlights are cleared when no unit is selected.
- Movement is instant; no confirmation dialog is required.
- Game state is stable during the player’s movement phase; no external changes are expected.

## Combat UI Interaction Spec

**Step 1: Attacker Selection and Range Preview**

- Phase one uses a left-rail attacker-selection flow rather than a separate action composer.
- In defender combat, the attacker list shows all eligible defender units.
- In Onion combat, the attacker list shows all eligible Onion weapons.
- In Onion combat, board clicks do not add attackers; the weapon list is the only selection source.
- Players can select one or more eligible attackers (units or weapons) using the dynamic list and ctrl+left-click on the map or in the sidebar.
- All attacks are group-based, whether one or many attackers are chosen.
- The list of available attackers is dynamic:
  - Onion player: shows available weapons (main, secondary, AP, missiles).
  - Defender: shows eligible units.
- Selecting any attacker (or group) displays a range overlay on the map, similar to movement, but with an orange tint.
- The range overlay must be computed in the web board model described above so it matches the rendered hex geometry.
- For groups, the highlighted area is the intersection of all selected attackers’ ranges—only hexes all can reach are shown.

**Step 2: Target Confirmation**

- Right-clicking an eligible target hex (within the highlighted range) opens a confirmation popup.
- The popup displays:
  - Attack:Defense ratio
  - All relevant combat modifiers and stats (e.g., terrain, stacking, special abilities)
  - Acknowledge/confirm button to commit the attack

**Step 3: Combat Results**

- After confirmation, combat results are shown in a toast notification with full details (dice, modifiers, outcome).
- The toast auto-dismisses after 10 seconds or can be manually dismissed by clicking.
- Once dismissed, the board updates to reflect the outcome:
  - Destroyed units are removed
  - Disabled units are greyed out or otherwise visually marked

**Selection and Eligibility Rules**

- Only the active player can select and assign their own eligible attackers.
- Selection/deselection rules mirror movement: only one group can be selected at a time.
- Ctrl-click toggles membership in the current selection group without clearing the rest.
- Left-clicking any non-unit area of the game clears the current group and removes all overlays.

## Error Handling UX Baseline

1. Show user-friendly message + machine details.
2. Include code metadata in expandable diagnostics:
   1. `code`
   2. `detailCode`
   3. `currentPhase`
3. Preserve failed action draft state where safe for quick correction/retry.

## Testing Strategy

The canonical layer map lives in [testing-strategy.md](testing-strategy.md).
For the web UI, keep unit tests focused on selectors and payload builders,
component tests focused on App orchestration and interaction states,
integration tests focused on UI + API wiring, and E2E limited to full user
journeys.

For the connected game screen specifically, add red-first component tests that
prove App renders the defender roster, selected-unit inspector, and hex-board
bounds from authoritative game state and scenario map data rather than from
`mockBattlefield`.

## Open Questions

1. Should first map release support click-to-move only, or text coordinate fallback
   in the same view?
2. Is websocket support required for Phase 2, or explicitly deferred to Phase 3?
3. Do we need spectator mode in this track, or post-1.0 web milestone?
4. Preferred design token baseline and brand style direction for final visual pass?
