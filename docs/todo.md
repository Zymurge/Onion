# Onion Project TODO (Epic Level)

This document tracks major upcoming work and epics. Add new items as they arise;
break down into features/tasks as needed.

## In progress


- [ ] Add a reviewable "Opponent’s Results" stream for the non-active client to surface actions taken by the other side (combat attempts/results, unit destruction, ram outcomes, phase changes).
  - [x] Define the event stream contract: show remote-visible outcomes from persisted events, not the local player's own pending action state.
    - [x] Include combat attempts (even misses), `MOVE_RESOLVED` ram results, `UNIT_STATUS_CHANGED` for destroyed units, and `PHASE_CHANGED` for phase advances.
    - [x] Deduplicate by event seq so reconnects, refreshes, and repeated live hints cannot show the same entry twice.
    - [x] Keep the content compact and reviewable: append one entry per meaningful event, let the user dismiss the stream, and only show new events after dismissal.
    - [x] Skip the active player's own result overlay, since that remains covered by the existing resolution UI.
  - [ ] Implement event stream emission for any new or modified events (backend)
  - [x] Render the "Opponent’s Results" UI as a compact, scrollable right-rail panel with one-line summaries per event.

## Epics / Major Work

- [ ] Improve error handling (UI and backend)
  - [x] Restyle error messages as a dismissable overlay so they do not push the header and main content down.
  - [ ] Distinguish move error messages: show specific reasons such as 'out of range', 'blocked by terrain', or 'can't stack units' instead of generic 'Illegal move'.
- [ ] JWT authentication (migrate to @fastify/jwt)
- [ ] Game lobby for creation and joining (self-service matchmaking)
- [ ] Stacked unit management: UI and logic for selecting, splitting, and combining units in a stack; support for independent and combined moves and combat actions

## Features / Work Items

- [ ] Replace the debug protocol viewer with `@uiw/react-json-view` and add custom expansion shortcuts for deep-dive trees (for example: double-click subtree expand/collapse and expand-all controls).

## Done

- [x] Connect debug screen to API output (next)
- [x] Audit defense source of truth for units and weapons so defense is defined once in the unit/weapon model and only derived for effective combat situations.
- [x] Reuse the left-rail step badge area to show the selected group's combined attack value while units are selected or deselected.
- [x] Combat phase one: attacker selection, targeting, and result presentation.
  - [x] Step one: attacker selection and orange range preview from the left rail.
    - [x] Support dynamic attacker lists by role: Onion shows available weapons; defender shows available units.
    - [x] Support ctrl-left click and sidebar selection for one or more eligible attackers.
    - [x] Render orange attack-range overlays, including intersection highlighting for combined attackers.
  - [x] Step two: target confirmation.
    - [x] Allow defenders to be targeted directly on the map.
    - [x] Show a right-rail list of valid targets for the active attacker group. It should be filtered to only those within combined range.
    - [x] Support onion-system targets through the right rail even when they have no individual map location per system.
    - [x] Reuse a shared confirmation view that shows attack:defense ratio and relevant modifiers.
    - [x] Keep map selection and rail selection in sync when a target is chosen.
  - [x] Step three: Unify combat math in a shared calculator used by both engine and web UI, including odds ratio and future terrain/stacking modifiers. This is shared rules logic only; base defense remains owned by the unit/weapon model and is out of scope.
    - [x] Define the shared combat calculation contract: inputs, outputs, and which side is authoritative.
    - [x] Add per-terrain capability and ram profile fields to unit descriptions so combat and movement rules stay data-driven.
    - [x] Extract a pure shared calculator for odds and defense modifiers.
    - [x] Add tests around the shared rules and remove duplicate local calculations.
    - [x] Move backend combat validation/execution to that shared calculator.
    - [x] Move the web confirmation/preview UI to the same calculator.
  - [x] Step four: combat results toast, then board reconciliation after dismissal.
    - [x] Define the result payload shown in the toast: hit/miss, damage or destroyed units, and any relevant combat modifiers.
    - [x] Render the toast as a transient overlay that does not block reading the current board state.
    - [x] Dismissing the toast should commit the reconciled board state and clear combat selection/preview state.
    - [x] Wire the UI to the API to send the combat command and receive the result.
    - [x] Reconcile the board from authoritative state after combat so destroyed units disappear and overlays/inspector state refresh correctly.
    - [x] Handle stale or rejected combat outcomes cleanly so the UI can recover without leaving the board half-updated.
    - [x] Add regression tests for selection rules, range overlays, confirmation flow, toast dismissal, and post-combat board updates.
- [x] Transition to WebSocket for live updates
  - [x] Define the WS message envelope and event contract for game state updates, actions, and reconnect handling.
  - [x] Add a server-side WS endpoint alongside the existing REST API without removing polling yet.
  - [x] Add a client transport adapter that can subscribe to live updates and fall back to the current HTTP path.
  - [x] Hook the connection status indicator and last update display in the header to the WS connection.
  - [x] Extend backend to fan out every persisted state-change event to all connected WS clients.
    - [x] Broadcast action-derived events after successful persistence for MOVE, FIRE, and END_PHASE.
    - [x] Keep resume/snapshot behavior intact so reconnecting clients can catch up from `afterSeq`.
    - [x] Add tests proving each action path emits the expected live event stream to an active websocket client.
  - [x] Wire the web UI to consume live WS updates for the active match and keep the debug stream visible.
  - [x] Add integration coverage for connect, reconnect, live state refresh, and App/controller wiring behavior through the fake backend harness.
- [x] Place End Phase control in UI and wire to backend
  - [x] Identify all phases where a context-aware phase advancement control should be available to the active player, with a label that matches the next phase or action (e.g., "Start Combat", "End Turn").
  - [x] The control's label and presence are determined by the current phase and role, not a static location.
- [x] UI restructure for pure axial coordinates
  - [x] Define the scenario/map shape contract for a bounded axial region.
  - [x] Add a shared helper that enumerates valid axial cells for the chosen map shape.
  - [x] Update movement and pathfinding bounds checks to use map membership instead of rectangular `q`/`r` limits.
  - [x] Update the web board renderer to iterate the generated axial cell set and size the SVG from the actual rendered cells.
  - [x] Add intentional edge treatment so clipped board boundaries read clearly in the viewport.
  - [x] Update the scenario loader and snapshot shapes to carry the canonical axial board contract.
  - [x] Update existing scenario data to the new axial shape format. (Decision: no compatibility migration is needed; recreate games from the canonical axial contract.)
  - [x] Add regression tests for map membership, overlay alignment, and viewport sizing.
  - [x] Visually mark disabled units clearly in the rail and on the map so combat damage is obvious at a glance.
- [x] In combat phase, show disabled units as disabled in the attacker list and prevent them from being selected or used to fire.
- [x] Refactor movement resolution to read per-unit terrain rules from the shared unit definitions instead of hardcoded terrain checks.
- [x] Reorganize backend tests into the same layer-and-purpose folders used by the web test tree.
- [x] Consolidate shared pure tests under one directory and normalize aliases/import paths as part of that cleanup.
- [x] Normalize imports across all server code so shared and server modules use aliases consistently.
- [x] Improve debug folding so protocol entries preserve full detail instead of collapsing the fetched response payloads.
- [x] Shared rules platform consolidation
  - [x] Externalize unit and weapon definitions so types, stats, and target rules can move to a shared data file or schema later.
  - [x] Collapse the current split between movement profiles, pathfinding, and stacking rules so terrain entry, cover, and occupancy checks all come from the same unit/terrain definition model.
  - [x] Add a standalone shared ramming calculator that consumes the same unit capability data and resolves tread loss or destruction outcomes.
- [x] Add more robust server-side logging that includes event details for MOVE and FIRE outcomes.
- [x] Decompose two large files into modules via the obvious responsibility boundaries in order to improve agent effectiveness: server/api/games.ts and web/App.tsx
