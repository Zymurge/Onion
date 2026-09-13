# Web UI Turn and Event Display Specification

## Purpose

Define turn handoff, acknowledgement, phase controls, inactive event display,
and presentation of resolved combat events.

## Turn Handoff State Machine

The client implements three phases:

1. **Inactive:** The player is not active. The right rail displays the inactive
   event stream and board/control interactions are locked.
2. **Acknowledgement:** When the server advances to a new turn for the player,
   the event stream and `Begin Turn` button are highlighted. Only `Begin Turn`
   is interactable.
3. **Active:** After acknowledgement, the player can use the board and controls
   for the turn, subject to phase and role rules.

Transitions use session snapshot data plus `acknowledgedActiveTurnKey`, the last
acknowledged turn. There is no separate snapshot-shaped turn-gate model;
acknowledgement is a UI-shell concern.

## Frontend Boundary

- The server snapshot remains authoritative and comes from session sync.
- Interaction state owns local selection, targeting, prompts, and dismissal.
- Derived view state is pure over snapshot and interaction state.
- Sync state owns connection status, explicit refreshes, retry bookkeeping, and
  event cursors; it does not resolve server races.

## Turn UI

- The header shows current turn and phase.
- Phase advancement is in the header with a context-aware label:
  - `ONION_MOVE` -> `Start Combat`
  - `ONION_COMBAT` -> `End Turn`
  - `DEFENDER_MOVE` -> `Start Combat`
  - `DEFENDER_COMBAT` -> `Begin Secondary Move`
  - `GEV_SECOND_MOVE` -> `End Turn`
  - `DEFENDER_RECOVERY` -> no button
- Game end uses a dedicated result overlay with outcome and next actions.

## Inactive Events Stream

- During non-active phases, the right rail displays the inactive event stream in
  real time from server events.
- The stream is visually distinct, non-blocking, accessible, and provides clear
  summaries and error overlays.
- Summaries are concise and defensively derived from payloads; additional detail
  is available on hover or keyboard focus.
- The stream handles polling and WebSocket updates with reconnection handling.
- Events are chronological and exclude events already surfaced in the main
  action area, showing only those relevant to the inactive player or phase.
- The stream supports scrolling, loading placeholders, and a friendly empty
  state. It opens empty when a phase changes and the local player becomes
  inactive again; only future opponent actions appear.
- Event summaries and controls are keyboard-navigable and screen-reader
  friendly, with smooth updates that do not shift surrounding content.

## Combat Event Display

- The inactive stream renders resolved combat outcomes, not raw CRT letters.
- Summaries and detail lines use target-specific semantic results from the
  engine.
- Friendly unit and weapon names are preferred when event payloads provide
  them.
- If a follow-up event changes the final state, the stream presents the final
  resolved effect rather than the intermediate table letter.
