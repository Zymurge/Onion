# Onion Web UI Specification (v0.1)

**Status: Completed (April 2026)**

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

1. The web battlefield board uses the same canonical axial coordinate system as the rules engine.
2. The board is not required to be rectangular. The map may be a bounded axial region that extends beyond the viewport and is revealed through scrolling.
3. Board positions are addressed with axial `q`/`r` coordinates. Any edge treatment, clipping, or visual shaping is presentation-only and must not introduce a second runtime coordinate system.
4. Range, reachability, and selection overlays must be derived from the same axial board geometry used by the renderer so the displayed hex map and all overlay previews stay aligned.
5. Scenario creation may use a centered origin, generated axial bounds, or another shape rule, but the runtime board model stays axial.

6. **Zoom Controls:**
  - The map supports smooth zooming via mouse wheel and a floating zoom slider overlay (lower left).
  - The minimum zoom ensures the entire map fits in the viewport; the maximum allows close inspection.
  - The zoom slider is always visible as an overlay and does not affect map layout or scrollbars.
  - Zooming preserves the current map center and scroll position.

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

## Selection Contract

1. Selection state on the web surface must be exposed with stable unit ids.
2. Rail controls may expose `aria-pressed` when the selected state is represented by a button, but the shared test contract is `data-selected="true"` on the selected rail item and matching map occupant.
3. Rail controls, map occupants, and hex cells must expose stable `data-testid` hooks keyed by unit id or coordinate so tests can pair a rail selection with the same unit on the board.
4. Tests should assert selection and deselection by id and selection state, not by user-facing narration text.

## Right Rail Drawer

1. The right rail is the default unit inspector drawer in every phase.
2. Any unit that is not currently selected can be opened in the right rail for inspection, regardless of owner.
3. Inspection shows the unit's stats, status, and other read-only details.
4. When combat attacker selection is active, the right rail temporarily switches to the targeting list and confirmation view for that selection.
5. When no unit is selected and no combat targeting is active, the right rail may remain collapsed.

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
3. The phase advancement control lives in the header and uses a context-aware label based on the current phase and role.
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

- Left-clicking on any unit selects it, displaying its details in the right rail inspector and deselecting any previously selected unit.
- Left-clicking on any empty hex or non-unit area of the hexmap deselects the current selection and removes all move overlays.

**Inspector Drawer:**

- Any unselected unit on the map or in a rail can be opened in the right rail for inspection in any phase.
- Inspecting a unit does not change the current selection unless the user explicitly selects it.
- The inspector is the default right-rail content unless combat targeting is active.

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
- Destroyed defender units remain visible for context, but they are greyed out, sorted to the bottom of the defender list, and cannot be selected into attacker groups.
- Players can select one or more eligible attackers (units or weapons) using the dynamic list and ctrl+left-click on the map or in the sidebar.
- All attacks are group-based, whether one or many attackers are chosen.
- The list of available attackers is dynamic:
  - Onion player: shows available weapons (main, secondary, AP, missiles).
  - Defender: shows eligible units.
- Selecting any attacker (or group) displays a range overlay on the map, similar to movement, but with an orange tint.
- The range overlay must be computed from the same axial board geometry described above so it matches the rendered map.
- For groups, the highlighted area is the intersection of all selected attackers’ ranges—only hexes all can reach are shown.
- The attacker selector must also enforce weapon and unit targeting rules before showing a target as selectable.
- The UI target list should only include targets allowed by the selected weapon(s) and by the target unit’s own restriction metadata, after range filtering is applied.
- For the current AP rule, the selector must offer AP targets only for Little Pigs and the Castle.

**Step 2: Target Confirmation**

- Right-clicking an eligible target hex or target list item (within the highlighted range and allowed by target rules) opens a confirmation popup.
- The popup displays:
  - Attack:Defense ratio
  - All relevant combat modifiers and stats (e.g., terrain, stacking, special abilities)
  - Acknowledge/confirm button to commit the attack
- If no legal target remains after applying weapon/unit target rules, the UI must show a clear empty-state message rather than offering an illegal target.

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

## Phase Advancement Control and MOVE Phase UI (2026-04-05)

### Context-Aware Phase Advancement Button

- The UI presents a context-aware button for phase advancement, with the label and presence determined by the current phase and player role.
- The button is always visible to the active player, even if they have not used all available moves, allowing them to proceed to the next phase at any time.
- The button mapping is as follows:

  | Phase                | Owner     | Button Label           | Visible? |
  |----------------------|-----------|------------------------|----------|
  | ONION_MOVE           | onion     | Start Combat           | Yes      |
  | ONION_COMBAT         | onion     | End Turn               | Yes      |
  | DEFENDER_MOVE        | defender  | Start Combat           | Yes      |
  | DEFENDER_COMBAT      | defender  | Begin Secondary Move   | Yes      |
  | GEV_SECOND_MOVE      | defender  | End Turn               | Yes      |
  | DEFENDER_RECOVERY    | defender  | —                      | No/??    |

- The dispatched action remains `{ type: 'end-phase' }`, but the UI adapts the label and tooltip for clarity.
- The phase-to-label mapping should be centralized in a helper for maintainability.

### MOVE Phase UI Redesign

#### General Principles

- The MOVE phase is focused on unit movement; only actionable units should be visually prominent and selectable.
- The UI should minimize distractions and focus the player on movement decisions.

#### Defender MOVE

- **Left Rail:**
  - Show only the list of defender units that can move (omit Onion entirely).
  - Each defender card displays unit type, ID, remaining movement allowance, and status.
  - Allow selection of a unit to highlight it on the map and enable movement.
  - Optionally, group or visually separate units that are out of moves or disabled.
- **Right Rail:**
  - Shows inspector details for any unselected unit that the user opens from the map or rail.
  - May show contextual help only when no unit is being inspected.
- **Map:**
  - Highlight the selected unit and its possible destinations.
  - Clicking a destination moves the unit.
  - Disabled units are visually distinct (dimmed, grayed out).
- **Phase Advancement:**
  - The "Start Combat" button is always visible, allowing the player to proceed to combat at any time, even if not all moves are used.

#### Onion MOVE

- **Left Rail:**
  - Show only the Onion card (since only the Onion moves in this phase).
  - Display Onion’s remaining moves, treads, and status.
  - Omit defenders entirely.
- **Right Rail:**
  - Shows inspector details for any unselected unit that the user opens from the map or rail.
  - May show contextual help only when no unit is being inspected.
- **Map:**
  - Highlight Onion and its possible destinations.
  - Clicking a destination moves the Onion.
- **Phase Advancement:**
  - The "Start Combat" button is always visible, allowing the player to proceed to combat at any time.

#### Secondary Move (GEV_SECOND_MOVE) Phase UI

- The UI treatment for the Secondary Move phase is identical to the primary MOVE phase:
  - **Left Rail:** Only show defender units eligible for a secondary move (e.g., GEVs or any future unit types with second moves).
  - **Right Rail:** Same as MOVE—show inspector details for any unselected unit, with contextual help only when nothing is being inspected.
  - **Map:** Highlight eligible units and their possible destinations.
  - **Phase Advancement:** The "End Turn" button is always visible, allowing the player to proceed at any time.
- The only difference is in the underlying logic that determines which units are eligible for a secondary move (e.g., only GEVs, or other types as rules evolve).

#### Additional UX Notes

- If no units can move, show a clear message (“No units available to move”).
- Use tooltips or hover states to explain why a unit cannot move (e.g., “Disabled”, “No moves left”).
- Provide a prominent, always-visible "Start Combat" button during MOVE phases.
- Remove Onion from defender’s left rail and defenders from Onion’s left rail.
- Use the right rail as the inspector drawer in MOVE; it remains available for any unselected unit in the phase.
- Focus the UI on actionable units and movement, minimizing clutter.
- Hovering over an opponent's unit will provide a pop-up with their stats

#### Combat Phase UI (Consistency & Targeting List)

- The left rail is always for attacker selection (Onion weapons or defender units).
- The right rail is the default inspector drawer, but when an attacker (or group) is selected it switches to the targeting list and confirmation view for that selection.
- The map visually reflects both attacker and target selections, with overlays for range and eligibility.

##### Onion Combat Phase

- **Left Rail:**
  - List all Onion weapons eligible to attack (grouped by type if needed).
  - Allow multi-select (ctrl/cmd-click) for combined attacks.
  - Show weapon stats and status.
- **Right Rail:**
  - Shows the targeting list and confirmation view while at least one weapon is selected.
  - Otherwise acts as the inspector drawer for any unselected unit.
  - Lists all valid targets for the current attacker selection, with target stats and modifiers.
  - Selecting a target highlights it on the map and enables confirmation.
- **Map:**
  - Highlights range overlays for selected weapons.
  - Highlights valid targets within range.
  - Clicking a target on the map also selects it in the right rail (and vice versa).
- **Confirmation:**
  - Once attackers and a target are selected, show a confirmation view (in the right rail or as a modal) with attack/defense breakdown and a “Resolve Combat” button.

##### Defender Combat Phase

- **Left Rail:**
  - List all defender units eligible to attack.
  - Allow multi-select for group attacks.
  - Show unit stats and status.
- **Right Rail:**
  - Shows the targeting list and confirmation view while at least one unit is selected.
  - Otherwise acts as the inspector drawer for any unselected unit.
  - Lists all valid Onion targets for the current attacker selection, with target stats and modifiers.
- **Map:**
  - Highlights range overlays for selected units.
  - Highlights valid targets.
  - Map and right rail selections are synchronized.
- **Confirmation:**
  - As above, show a confirmation view with attack/defense breakdown and a “Resolve Combat” button.

##### Targeting List UX

- The right rail is the canonical targeting list while attacker selection is active.
- Only shows targets that are legal for the current attacker selection.
- If no valid targets, show a clear message (“No valid targets in range”).
- Map and right rail are always in sync: selecting a target in one highlights it in the other.

##### Additional Consistency Points

- Always use the same layout: left = attackers, right (drawer) = targets, map = visual context.
- Use consistent selection/deselection and multi-select patterns.
- Always require explicit confirmation before resolving combat.
- Disabled or ineligible attackers/targets are visible but clearly marked and not selectable.

##### Phase Advancement Control Placement

- The context-aware phase advancement control (e.g., "Start Combat", "End Turn") is placed in the header, near the current phase indicator, for maximum visibility and consistency.
- This keeps phase context and control together, reducing confusion and improving discoverability.
