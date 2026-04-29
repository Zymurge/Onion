# Onion Web UI Specification

## Purpose

Define the current UI behavior and implementation constraints for the Onion web client.

## Architecture

- React + TypeScript SPA in `web/`.
- Backend remains the source of truth for game rules, turn phases, and action validation.
- Shared domain contracts are reused from the backend/shared layer where possible.
- Client rendering is based on authoritative server state, not optimistic local simulation.

## Contract Baseline

Primary backend endpoints used by the web client:

1. `GET /scenarios`
2. `GET /scenarios/{id}`
3. `POST /auth/register`
4. `POST /auth/login`
5. `POST /games`
6. `POST /games/{id}/join`
7. `GET /games/{id}`
8. `POST /games/{id}/actions`
9. `GET /games/{id}/events?after={seq}`

## Authoritative State

- `GameState`, `phase`, `turnNumber`, and `eventSeq` come from server snapshots and events.
- Unit roster, unit positions, and unit status on the connected battlefield view come from authoritative game state.
- Terrain, dimensions, and coordinate bounds on the hex board come from the active scenario map snapshot.

## Local UI State

- Selected map unit or hex.
- Draft action form fields.
- Panel visibility and layout preferences.
- Loading and submission state.
- API error surfaces.

## Selection and Layout

- Selection state uses stable unit ids.
- Map occupants, rail items, and hex cells expose stable `data-testid` hooks keyed by unit id or coordinate.
- The right rail is the default inspector drawer in every phase.
- Any unselected unit can be opened in the right rail for inspection, regardless of owner.
- Destroyed Swamp units remain inspectable and should not be removed from the map state when destroyed.
- During combat, the right rail may show inspection together with targeting and confirmation, but inactive players remain inspection-only.
- Server-derived game state is never mutated in place; the UI reconciles from snapshots and events.

## Interaction Routing Contract

The interaction model is defined as routing, not ad hoc branching inside components.

- Components should emit semantic interaction requests such as `map primary-click on unit`, `rail primary-click on attacker entry`, or `map secondary-click on hex`.
- A shared routing policy resolves each request into one UI intent.
- Components and thin handlers should execute the returned intent, not re-decide role, activity, or phase-specific behavior locally.
- Inactive-player interaction is inspection-only and remains client-local.
- Committed actions remain backend-authoritative; routing may prepare or dispatch a command, but it does not mutate authoritative game state directly.
- The routing layer must emit debug-level tracing for each routed interaction, including request shape, resolved intent, and any guard or disable reason used in the decision.

### Routing Dimensions

Each routed interaction is resolved from these dimensions:

1. Viewer activity: `active` or `inactive`.
2. Viewer role: `onion` or `defender`.
3. Phase mode: `movement`, `combat`, or `locked/non-actionable`.
4. Surface: `map`, `left-rail`, `right-rail`, or `header/control`.
5. Gesture: `primary`, `primary-additive`, or `secondary`.
6. Subject relation: `self`, `opponent`, `neutral/system`, or `background`.
7. Subject capability: attacker-eligible, target-eligible, move-eligible, inspectable-only, or not actionable.

The long-term goal is to keep those dimensions in one pure policy boundary and keep UI components unaware of the full matrix.

### Base Matrix

These rows apply regardless of whether the viewer is Onion or defender unless a later role-specific rule overrides them.

| Viewer activity | Phase mode | Surface / gesture / subject | Routed behavior |
| --- | --- | --- | --- |
| Inactive | Any | Primary click on any inspectable unit, weapon, stack, or subsystem entry | Inspect subject in the right rail |
| Inactive | Any | Primary-additive click on any inspectable subject | Same as primary; no multi-select semantics |
| Inactive | Any | Secondary click anywhere | No-op |
| Inactive | Any | Primary click on background | Clear local inspection |
| Active | Movement | Primary click on self move-eligible source | Select mover |
| Active | Movement | Primary click on self non-eligible source | Inspect subject only |
| Active | Movement | Primary click on opponent or neutral subject | Inspect subject only |
| Active | Movement | Primary click on background | Clear local selection, overlays, and inspection |
| Active | Movement | Secondary click on reachable destination hex | Submit move, including any ram prompt branch |
| Active | Movement | Secondary click on non-reachable hex | No-op or local illegal-move feedback only |
| Active | Combat | Primary click on self attacker-eligible source | Select attacker source |
| Active | Combat | Primary-additive click on self attacker-eligible source | Toggle attacker membership |
| Active | Combat | Primary click on legal target | Select combat target |
| Active | Combat | Primary click on inspectable but illegal target | Inspect subject only |
| Active | Combat | Primary click on background | Clear local combat prep state and inspection |
| Active | Combat | Secondary click on map or rail subject | No direct combat action; confirmation stays explicit in the right rail |

### Role-Specific Combat Rules

The matrix needs a role dimension, but the intent is to keep it narrow. Most rows should branch on `self` vs `opponent`, not on hard-coded `onion` vs `defender` checks. Role-specific behavior is limited to source and target availability.

| Viewer role | Viewer activity | Combat subject | Routed behavior |
| --- | --- | --- | --- |
| Onion | Active | Onion weapons in the left rail | Select or toggle attackers |
| Onion | Active | Defender unit or stack on map/right rail | Select target if legal, otherwise inspect |
| Onion | Active | Onion body on the map during combat | Inspect only; it is not an attacker source in Onion combat |
| Defender | Active | Defender unit or stack on map/left rail | Select or toggle attackers |
| Defender | Active | Right-rail stack member controls | Toggle stack members within the current attacker group |
| Defender | Active | Onion body on the map | Select treads if legal, otherwise inspect Onion |
| Defender | Active | Onion subsystem in the right rail | Select subsystem target if legal |
| Onion or Defender | Inactive | Any inspectable subject | Inspect only |
| Onion or Defender | Inactive | Right-rail stack member controls | Not shown; inactive players see only the grouped stack summary |

### Surface Notes

- Map and rail clicks should route through the same policy vocabulary. The map and rails may expose different subjects, but they should not own separate active/inactive rules.
- The left rail is a source-selection surface, not a target-selection surface.
- The right rail is an inspection and confirmation surface. During active combat it may also expose target-selection and stack-member toggles.
- Right-rail stack-member toggles are active-player controls only. Inactive players should never see per-member combat toggles for a stack.
- Expanded stack presentation in the right rail implies active-player subgroup editing. If a group is expanded, clicks inside that view already carry subgroup-selection intent and should not be reinterpreted as inspection.
- The board should not need embedded role checks beyond subject normalization such as `self`, `opponent`, `background`, or `neutral/system`.

### Intent Vocabulary

The routing layer should resolve to a small set of intent types:

- `inspect-subject`
- `select-actor`
- `toggle-actor`
- `select-target`
- `clear-local-selection`
- `submit-move`
- `show-illegal-local-feedback`
- `noop`

Intent handlers may call existing interaction-hook methods, but the policy decision about which intent to fire should happen before those handlers run.

For expanded right-rail stack editing, member clicks should resolve to `toggle-actor` with specialized request context such as `surface=right-rail-stack-editor` and `selectionScope=current-stack`. A separate `toggle-stack-member` intent is not required.

## Board Model

- The battlefield board uses the same axial coordinate system as the rules engine.
- The map may be a bounded axial region and is revealed through scrolling.
- Board positions are addressed with axial `q`/`r` coordinates only.
- Range, reachability, selection, and combat overlays are derived from the same board geometry used by the renderer.
- The Swamp (HQ) is rendered as a selectable, attackable, and rammable unit with a unique icon (custom swamp image preferred; fallback to placeholder if unavailable).
- The Swamp renders on top of the authored terrain for its hex rather than replacing it with clear terrain
- The Swamp remains on the map when destroyed, switches to a destroyed visual state, and stays selectable for inspection.
- The Swamp appears in the right rail and inspector panels, and its status, objective details, and completion state are surfaced in passive toasts and event streams.
- Victory objectives are scenario-defined, each objective can be shown individually in the inspector, and the match ends when all required objectives are complete. Inspector presentation is TBD.
- Escape hex objectives do not become active until Onion turn 2
- Victory feedback distinguishes objective completion from overall match end state.
- Zoom is supported through mouse wheel and a floating slider overlay in the lower-left corner.
- Zoom preserves the current map center and scroll position.

## Movement UI

- A unit is eligible to move if it is operational and has at least 1 movement allowance remaining in the current phase.
- During a movement phase, eligible units are highlighted and selectable.
- The selected unit’s hex is distinctly highlighted.
- Left-click selects a unit; clicking empty map space deselects.
- When an eligible unit is selected, its reachable hexes are shown with a subtle green overlay.
- Right-clicking a reachable hex moves the selected unit and submits the move.
- If an Onion move would traverse an occupied defender hex and rams remain, the UI asks whether to attempt the ram before submitting.
- Declining that prompt submits the move without a ram attempt.
- If the selected unit is not eligible to move, no move radius and no illegal-move bubble are shown.
- The illegal-move bubble is shown only for eligible current-player units and uses the generic message `Illegal move`.
- The bubble auto-dismisses after 3 seconds or on click.
- Only one unit can be selected at a time.

## Combat UI

### Attacker Selection

- The left rail is used for attacker selection during combat.
- In Onion combat, the rail shows Onion weapons eligible to attack.
- In Defender combat, the rail shows defender units eligible to attack.
- Onion combat board clicks do not add attackers; weapon selection comes from the rail.
- Defender combat may select attacker sources from either the map or the left rail, but both surfaces must route through the same selection policy.

---

### Inactive Events Stream (Right Rail)

- The right rail must always display the inactive events stream during non-active phases, updating in real time from server events.
- The stream is visually distinct, non-blocking, and accessible, with clear summaries and error overlays.
- All event summaries are concise and derived defensively from event payload data, with additional details exposed on hover or keyboard focus.
- The stream must handle both polling and WebSocket updates, with robust error and reconnection handling.
- All errors (API, network, parsing) must be surfaced as dismissible overlays, not as blocking modals or content shifts.
- The stream is ordered chronologically and filters out events already surfaced in the main action area, showing only those relevant to the inactive player or phase.
- Users can scroll through the event stream, inspect additional details by hovering or focusing an entry, and dismiss error overlays.
- When the phase changes and the local player becomes inactive again, the stream opens empty and only future opponent actions appear.
- Show a spinner or placeholder when loading, and a friendly message when no inactive events are present.
- All event summaries and controls must be keyboard-navigable and screen-reader friendly.
- The stream updates in real time as new events arrive, with smooth transitions and no jarring UI shifts.
- All UI behaviors must be covered by regression tests, including event arrival, error handling, and accessibility.
- Destroyed defender units remain visible for context, are greyed out, sorted to the bottom of the defender list, and cannot be selected as attackers.

### Targeting and Confirmation

- Selecting attackers shows a combat range overlay on the map.
- The range overlay is orange.
- The right rail shows the valid target list and confirmation view while attacker selection is active.
- Only legal targets are shown after range and target-rule filtering.
- If no valid targets exist, the UI shows an empty-state message instead of illegal options.
- Combat resolution requires explicit confirmation.

### Combat Results

- Combat results are shown in a toast notification with full details.
- The toast auto-dismisses after 10 seconds or can be manually dismissed.
- After combat resolves, destroyed units are removed and disabled units remain visible but greyed out.

### Map Coloring Standard

- **Green:** Actionable.
- **Red:** Inactionable for the active player.
- **Yellow:** Operational, but not actionable, for the non-active player.
- **Grey:** Disabled or destroyed.
- This standard applies consistently across combat for both Onion and defender views.

## Phase Visibility Matrix

Unit colors are determined by the active side in the current phase.

| Phase | Active side units | Inactive side units |
| --- | --- | --- |
| Move phases (`ONION_MOVE`, `DEFENDER_MOVE`, `GEV_SECOND_MOVE`) | Green if move-eligible, red if ineligible, grey if disabled/destroyed | Yellow if operational, grey if disabled/destroyed |
| Combat phases (`ONION_COMBAT`, `DEFENDER_COMBAT`) | Green if attack-eligible, red if ineligible, grey if disabled/destroyed | Yellow if operational, grey if disabled/destroyed |

- Onion and defender clients see the same phase-relative colors.
- The active side owns the green/red/grey states.
- The inactive side is yellow unless it is disabled or destroyed.
- Any inactive player's units can be inspected.

### Selection and Eligibility Rules

- Only the active player can assign their own attackers.
- Ctrl-click toggles membership in the current attacker group.
- Left-clicking non-unit map space clears the current group and overlays.
- Disabled or ineligible attackers and targets remain visible but are not selectable.

## Interaction Routing Implementation Direction

The interaction-routing refactor should minimize embedded checks like `if activeRole === ...` or `if viewerRole === ...` inside surface components and thin event handlers.

### Design Goal

- Keep components mostly declarative.
- Keep interaction state client-local.
- Route to explicit intents from one policy boundary.
- Reuse existing state builders and command builders instead of duplicating role-specific UI logic.

### Recommended Structure

1. Add a pure routing module, for example `web/lib/interactionRouting.ts`.
2. Normalize surface events into one request shape before any role-specific handling.
3. Resolve that request into one intent from the shared matrix.
4. Execute the intent in thin handlers that call existing interaction-hook methods or command builders.
5. Keep role-specific differences in subject normalization and legality metadata, not scattered through UI components.
6. Add router-level debug logging as part of the initial routing module so click-to-intent behavior is inspectable during migration.

### Suggested Routing Inputs

- viewer role
- viewer activity
- phase mode
- surface
- gesture
- subject kind
- subject id
- subject relation (`self`, `opponent`, `neutral/system`, `background`)
- subject capability flags such as `moveEligible`, `attackerEligible`, `targetEligible`, `inspectable`
- interaction mode flags such as `isExpandedStackEditor` when the surface itself implies subgroup-edit intent

### Suggested Migration Steps

1. Freeze the routing vocabulary and add pure tests for the matrix before changing behavior.
2. Introduce the routing module and move the map click policy into it first, because that surface currently carries the most mixed role and active/inactive logic.
3. Migrate left-rail source selection to the same router.
4. Migrate right-rail target selection and stack toggles to the same router.
5. Replace component-local branching with intent execution calls.
6. Delete obsolete per-surface role/activity branches only after the new routing tests and orchestration tests are green.

### Testing Strategy

- Add pure routing tests that cover the matrix directly.
- Keep a smaller set of orchestration tests that verify the router is wired correctly through the map and rails.
- Prefer one pure routing test per matrix row over repeating the same role/activity permutations in many component tests.

### Open Judgment Calls

- Background clicks should clear the current inspection target.
- Clicking an illegal but inspectable combat subject should inspect it.
- Right-rail stack-member toggles are active-player only; inactive players see only the grouped stack representation.

### Resolved Routing Notes

- Right-rail stack-member clicks use `toggle-actor`, not a dedicated stack-member intent.
- Expanded group presentation already implies active-player subgroup editing, so that surface state can be treated as pre-normalized intent context.

## Turn Handoff Contract (Three-Phase State Machine)

### Frontend State Boundary

- Server snapshot is the authoritative backend game state and comes only from session sync.
- Interaction state owns local selection, targeting, prompts, and dismissal state.
- Derived view state is computed from the snapshot plus interaction state and stays pure.
- Sync state owns connection status, refresh bookkeeping, and event sequencing.

The Onion web client implements a three-phase contract for turn handoff and acknowledgement:

1. **Inactive Phase**: The player is not active. The right rail displays the inactive event stream. All board and control interactions are locked.

2. **Acknowledgement Phase**: When the server advances to a new turn for the player, the UI enters an explicit acknowledgement gate:
  The event stream and the "Begin Turn" button are visually highlighted.
  Only the "Begin Turn" button is interactable; all other controls remain locked.
  The player must click "Begin Turn" to proceed.

3. **Active Phase**: After acknowledgement, the player can interact with the board and controls as normal for their turn.

Transitions are tracked in the UI shell using session snapshot data plus `acknowledgedActiveTurnKey` (last acknowledged turn). There is no separate snapshot-shaped turn-gate model; acknowledgement remains a small UI-shell concern.

All UI behaviors are covered by regression tests, including the acknowledgement gate and visual/interactive state.

---

## Turn UI

- The header shows the current turn and phase.
- The phase advancement control lives in the header and uses a context-aware label.
- Phase labels map as follows:
  - `ONION_MOVE` -> `Start Combat`
  - `ONION_COMBAT` -> `End Turn`
  - `DEFENDER_MOVE` -> `Start Combat`
  - `DEFENDER_COMBAT` -> `Begin Secondary Move`
  - `GEV_SECOND_MOVE` -> `End Turn`
  - `DEFENDER_RECOVERY` -> no button
- Game end uses a dedicated result overlay with outcome and next actions.

## Error Handling

- User-facing errors show a friendly message and machine-readable details.
- Expandable diagnostics include `code`, `detailCode`, and `currentPhase`.
- Failed drafts are preserved where it is safe to retry.

## Testing

- Unit tests focus on selectors and payload builders.
- Component tests focus on App orchestration and interaction states.
- Integration tests focus on UI and API wiring.
- Connected game-screen tests must prove that the defender roster, selected-unit inspector, and hex-board bounds come from authoritative game state and scenario map data.

## Combat Event Display

- The inactive event stream renders resolved combat outcomes, not raw CRT letters.
- Combat summaries and detail lines should use the target-specific semantic result produced by the engine.
- UI copy should prefer friendly names for units and weapons whenever the event payload provides them.
- When a follow-up event changes the final state, the stream should reflect the final resolved effect rather than the intermediate table letter.

## Open Issues / Future State

1. Spectator mode is needed for this track, or post-1.0.
2. Responsive/mobile pass remains deferred until desktop gameplay is stable.
3. Design token baseline and brand direction remain undecided.
