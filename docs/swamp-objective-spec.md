# Swamp Objective (HQ) Spec

## Overview

The Swamp (HQ) is a new, first-class defender unit type representing one or more scenario-defined victory objectives for the Onion scenario. It is a selectable, attackable, and rammable unit with no movement or weapons. Scenario authors define which objectives exist, the game marks each one individually when achieved, the inspector can surface their completion state, and the match ends when all required objectives are complete.

## Unit Definition

- **Type:** Swamp
- **Friendly Name:** The Swamp
- **Movement:** 0 (Immobile)
- **Weapons:** None
- **Defense:** 0 (Any "X" result destroys it)
- **Ram Profile:** Rammable
- **Selectable:** Yes (appears as a unit on the map, not just a background feature)
- **Icon:** Custom swamp image preferred; fallback to placeholder if unavailable
- **Destroyed State:** Remains on the map in a destroyed visual state instead of being removed, and stays inspectable after destruction

## Victory Objectives

- Victory objectives are authored in the scenario and resolved independently.
- Each objective has its own completion state and can be represented in the UI inspector.
- The Swamp inspector content includes objective completion state and remains available even after destruction.
- The game ends when all required objectives are complete.
- Escape hex objectives are inactive during Onion turn 1 and become active starting on Onion turn 2.
- For the Swamp scenario, the core objectives are:
  - **Destroy The Swamp**
  - **Escape the Onion off-map after The Swamp is destroyed**
- A future UI design can decide how these objectives are grouped or displayed in the inspector.
- If the Onion is immobilized or destroyed before all objectives are completed, the defender wins.

## Combat & Ramming

- The Swamp can be targeted by any weapon or ram that can target defender units
- Any "X" result destroys The Swamp (no disabled state)
- Ramming follows standard rules for rammable objectives
- All combat and ram events for The Swamp emit UNIT_STATUS_CHANGED and are surfaced in the event stream

## UI/UX Requirements

- The Swamp is rendered as a selectable unit on the map, with a unique icon
- The Swamp sits on top of authored terrain; the underlying terrain remains visible in the board rendering
- The right rail and inspector panels show The Swamp's status, objective details, and friendly name
- Combat and ram results involving The Swamp are surfaced in passive toasts and event streams
- Victory feedback distinguishes objective completion states and overall match end state
- Rules and scenario copy consistently refer to the objective as "The Swamp"
- Destroyed Swamp uses a destroyed image/state but remains selectable for inspection

## Implementation Notes

- Add Swamp to unit definitions and target rules
- Update combat, ramming, and event emission logic to treat Swamp as a standard unit
- Extend victory logic to support partial and total win states
- Model victory as scenario-defined objectives that can be completed individually and then collectively end the match
- Update UI to render The Swamp as a selectable unit with a unique icon
- Update rules and scenario docs to reflect the new objective and victory conditions
- Add regression tests for Swamp combat, ramming, and both victory states

---

## Open Questions

- What map edge(s) or zone(s) count as escape for total victory?
  - Defined in the scenario
- Should The Swamp have any special terrain or stacking rules?
  - Treat the Swamp as a defender unit that cannot be stacked. It can be placed on different terrain types and it would inherit those rules accordingly.
- Is a custom swamp icon available, or should a placeholder be used initially?
  - will need to create both intact and destroyed swamp icons
