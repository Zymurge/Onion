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
- When combat attacker selection is active, the right rail switches from inspection to targeting and confirmation.
- Server-derived game state is never mutated in place; the UI reconciles from snapshots and events.

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
