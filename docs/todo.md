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

- [ ] (Add new features or tasks here as they come up)
- [ ] Distinguish move error messages: show specific reasons such as 'out of range', 'blocked by terrain', or 'can't stack units' instead of generic 'Illegal move'.
- [ ] Combat phase one: attacker selection, targeting, and result presentation.
	- [x] Step one: attacker selection and orange range preview from the left rail.
	- [x] Support dynamic attacker lists by role: Onion shows available weapons; defender shows available units.
	- [x] Support ctrl-left click and sidebar selection for one or more eligible attackers.
	- [x] Render orange attack-range overlays, including intersection highlighting for combined attackers.
	- [ ] Step two: target confirmation.
		- [x] Allow defenders to be targeted directly on the map.
		- [x] Show a right-rail list of valid targets for the active attacker group. It should be filtered to only those within combined range.
		- [x] Support onion-system targets through the right rail even when they have no individual map location per system.
		- [ ] Reuse a shared confirmation view that shows attack:defense ratio and relevant modifiers.
		- [ ] Keep map selection and rail selection in sync when a target is chosen.
	- [ ] Step three: combat results toast, then board reconciliation after dismissal.
	- [ ] Add regression tests for selection rules, range overlays, confirmation flow, and post-combat board updates.