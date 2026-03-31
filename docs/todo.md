# Onion Project TODO (Epic Level)

This document tracks major upcoming work and epics. Add new items as they arise;
break down into features/tasks as needed.


## Epics / Major Work

- [ ] Improve error handling (UI and backend)
- [ ] Transition to WebSocket for live updates
- [ ] JWT authentication (migrate to @fastify/jwt)
- [ ] Game lobby for creation and joining (self-service matchmaking)
- [ ] Stacked unit management: UI and logic for selecting, splitting, and combining units in a stack; support for independent and combined moves and combat actions

## Features / Work Items

- [ ] Distinguish move error messages: show specific reasons such as 'out of range', 'blocked by terrain', or 'can't stack units' instead of generic 'Illegal move'.
- [ ] Refactor movement resolution to read per-unit terrain rules from the shared unit definitions instead of hardcoded terrain checks.
- [ ] Add a standalone shared ramming calculator that consumes the same unit capability data and resolves tread loss or destruction outcomes.
- [ ] Unify combat math in a shared calculator used by both engine and web UI, including odds ratio and future terrain/stacking modifiers. This is shared rules logic only; base defense remains owned by the unit/weapon model and is out of scope.
- [x] Audit defense source of truth for units and weapons so defense is defined once in the unit/weapon model and only derived for effective combat situations.
- [x] Reuse the left-rail step badge area to show the selected group's combined attack value while units are selected or deselected.
- [x] Combat phase one: attacker selection, targeting, and result presentation.
  - [x] Step one: attacker selection and orange range preview from the left rail.
    - [x] Support dynamic attacker lists by role: Onion shows available weapons; defender shows available units.
    - [x] Support ctrl-left click and sidebar selection for one or more eligible attackers.
    - [x] Render orange attack-range overlays, including intersection highlighting for combined attackers.
  - [ ] Step two: target confirmation.
    - [x] Allow defenders to be targeted directly on the map.
    - [x] Show a right-rail list of valid targets for the active attacker group. It should be filtered to only those within combined range.
    - [x] Support onion-system targets through the right rail even when they have no individual map location per system.
    - [x] Reuse a shared confirmation view that shows attack:defense ratio and relevant modifiers.
    - [x] Keep map selection and rail selection in sync when a target is chosen.
  - [ ] Step three: Unify combat math in a shared calculator used by both engine and web UI, including odds ratio and future terrain/stacking modifiers. This is shared rules logic only; base defense remains owned by the unit/weapon model and is out of scope.
    - [x] Define the shared combat calculation contract: inputs, outputs, and which side is authoritative.
    - [x] Add per-terrain capability and ram profile fields to unit descriptions so combat and movement rules stay data-driven.
    - [x] Extract a pure shared calculator for odds and defense modifiers.
    - [x] Add tests around the shared rules and remove duplicate local calculations.
    - [ ] Move backend combat validation/execution to that shared calculator.
    - [ ] Move the web confirmation/preview UI to the same calculator.
  - [ ] Step four: combat results toast, then board reconciliation after dismissal.
    - [ ] Add regression tests for selection rules, range overlays, confirmation flow, and post-combat board updates.
