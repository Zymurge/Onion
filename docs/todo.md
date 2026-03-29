# Onion Project TODO (Epic Level)

This document tracks major upcoming work and epics. Add new items as they arise;
break down into features/tasks as needed.


## Epics / Major Work

- Improve error handling (UI and backend)
- Transition to WebSocket for live updates
- JWT authentication (migrate to @fastify/jwt)
- Game lobby for creation and joining (self-service matchmaking)
- Stacked unit management: UI and logic for selecting, splitting, and combining units in a stack; support for independent and combined moves and combat actions

## Features / Work Items

- (Add new features or tasks here as they come up)
- Distinguish move error messages: show specific reasons such as 'out of range', 'blocked by terrain', or 'can't stack units' instead of generic 'Illegal move'.
- Combat phase one: attacker selection, targeting, and result presentation.
	- Step one: attacker selection and orange range preview from the left rail.
	- Support dynamic attacker lists by role: Onion shows available weapons; defender shows available units.
	- Support ctrl-left click and sidebar selection for one or more eligible attackers.
	- Render orange attack-range overlays, including intersection highlighting for combined attackers.
	- Step two: right-click target confirmation with attack:defense ratio and relevant modifiers.
	- Step three: combat results toast, then board reconciliation after dismissal.
	- Add regression tests for selection rules, range overlays, confirmation flow, and post-combat board updates.
