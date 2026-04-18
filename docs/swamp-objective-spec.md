# Swamp Objective (HQ) Spec

## Overview

The Swamp (HQ) is a new, first-class defender unit type representing the primary objective for the Onion scenario. It is a selectable, attackable, and rammable unit with no movement or weapons. The Swamp is always present in scenarios that require an objective, and its destruction and the Onion's escape are tracked as separate victory conditions.

## Unit Definition

- **Type:** Swamp
- **Friendly Name:** The Swamp
- **Movement:** 0 (Immobile)
- **Weapons:** None
- **Defense:** 0 (Any "X" result destroys it)
- **Ram Profile:** Rammable (define tread loss and destroy-on-roll as for Castle)
- **Selectable:** Yes (appears as a unit on the map, not just a background feature)
- **Icon:** Custom swamp image preferred; fallback to placeholder if unavailable

## Victory Conditions

- **Partial Victory:** The Onion destroys The Swamp (status: destroyed)
- **Total Victory:** The Onion destroys The Swamp and then escapes off the map (specific edge/zone to be defined)
- **Defender Victory:** The Onion is immobilized or destroyed before achieving both objectives

## Combat & Ramming

- The Swamp can be targeted by any weapon or ram that can target defender units
- Any "X" result destroys The Swamp (no disabled state)
- Ramming follows standard rules for rammable objectives
- All combat and ram events for The Swamp emit UNIT_STATUS_CHANGED and are surfaced in the event stream

## UI/UX Requirements

- The Swamp is rendered as a selectable unit on the map, with a unique icon
- The right rail and inspector panels show The Swamp's status and friendly name
- Combat and ram results involving The Swamp are surfaced in passive toasts and event streams
- Victory feedback distinguishes between partial and total victory
- Rules and scenario copy consistently refer to the objective as "The Swamp"

## Implementation Notes

- Add Swamp to unit definitions and target rules
- Update combat, ramming, and event emission logic to treat Swamp as a standard unit
- Extend victory logic to support partial and total win states
- Update UI to render The Swamp as a selectable unit with a unique icon
- Update rules and scenario docs to reflect the new objective and victory conditions
- Add regression tests for Swamp combat, ramming, and both victory states

---

# Open Questions

- What map edge(s) or zone(s) count as escape for total victory?
- Should The Swamp have any special terrain or stacking rules?
- Is a custom swamp icon available, or should a placeholder be used initially?
