# Onion Project TODO (Epic Level)

This document tracks major upcoming work and epics. Add new items as they arise;
break down into features/tasks as needed.

## In progress

- [ ] Transition to WebSocket for live updates
  - [x] Define the WS message envelope and event contract for game state updates, actions, and reconnect handling.
  - [x] Add a server-side WS endpoint alongside the existing REST API without removing polling yet.
  - [x] Add a client transport adapter that can subscribe to live updates and fall back to the current HTTP path.
  - [x] Hook the connection status indicator and last update display in the header to the WS connection.
  - [ ] Extend backend to fan out every persisted state-change event to all connected WS clients.
    - [ ] Broadcast action-derived events after successful persistence for MOVE, FIRE, COMBINED_FIRE, FIRE_UNIT, FIRE_WEAPON, and END_PHASE.
    - [ ] Keep resume/snapshot behavior intact so reconnecting clients can catch up from `afterSeq`.
    - [ ] Add tests proving each action path emits the expected live event stream to an active websocket client.
  - [ ] Wire the web UI to consume live WS updates for the active match and keep the debug stream visible.
  - [ ] Add integration coverage for connect, reconnect, and live state refresh behavior.
- [ ] Place End Phase control in UI and wire to backend

## Epics / Major Work

- [ ] Improve error handling (UI and backend)
- [ ] JWT authentication (migrate to @fastify/jwt)
- [ ] Game lobby for creation and joining (self-service matchmaking)
- [ ] Stacked unit management: UI and logic for selecting, splitting, and combining units in a stack; support for independent and combined moves and combat actions
- [ ] Externalize unit and weapon definitions so types, stats, and target rules can move to a shared data file or schema later

## Features / Work Items

- [ ] Distinguish move error messages: show specific reasons such as 'out of range', 'blocked by terrain', or 'can't stack units' instead of generic 'Illegal move'.
- [ ] Refactor movement resolution to read per-unit terrain rules from the shared unit definitions instead of hardcoded terrain checks.
  - [ ] Collapse the current split between movement profiles, pathfinding, and stacking rules so terrain entry, cover, and occupancy checks all come from the same unit/terrain definition model.
- [ ] Add a standalone shared ramming calculator that consumes the same unit capability data and resolves tread loss or destruction outcomes.

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
