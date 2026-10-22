# Web UI Battlefield and Combat Specification

## Purpose

Define the battlefield presentation, movement interaction, combat preparation,
objective display, and visual state rules.

## Board Model

- The board uses the rules engine's axial coordinate system.
- The map may be a bounded axial region revealed through scrolling.
- Positions use axial `q`/`r` coordinates only.
- Range, reachability, selection, and combat overlays use the same board
  geometry as the renderer.
- Zoom supports mouse wheel and a floating lower-left slider overlay while
  preserving map center and scroll position.

## Swamp and Objectives

- The Swamp (HQ) is selectable, attackable, and rammable, with a unique icon
  and a placeholder fallback if the custom image is unavailable.
- The Swamp renders above authored terrain without replacing that terrain.
- A destroyed Swamp remains on the map, changes visual state, and remains
  selectable for inspection.
- The Swamp appears in the right rail and inspector. Status, objective details,
  and completion state appear in passive toasts and event streams.
- Objectives are scenario-defined and individually inspectable. The match ends
  when all required objectives are complete.
- Scenario briefing rendering follows the shared
  [scenario briefing presentation contract](../web-ui-spec.md#scenario-briefing-presentation).
- Escape hex objectives do not activate until Onion turn 2.
- Victory feedback distinguishes objective completion from overall match end.

## Movement UI

- Movement eligibility is projected for `ONION_MOVE`, `DEFENDER_MOVE`, and
  `GEV_SECOND_MOVE`. A unit is eligible only when its role matches the active
  phase and viewer, it is operational and mobile, and it has at least 1
  movement allowance remaining.
- Only the active user's eligible units are highlighted and selectable. An
  inactive viewer may inspect the same units but does not receive actionable
  highlights.
- The selected unit's hex is distinctly highlighted and reachable hexes use a
  subtle green overlay.
- Left-click selects a unit; empty map space deselects.
- Right-clicking a reachable hex submits the move.
- If an Onion move traverses an occupied defender hex and rams remain, the UI
  asks whether to attempt the ram. Declining submits the move without a ram.
- An ineligible selected unit shows neither a move radius nor an illegal-move
  bubble.
- The illegal-move bubble appears only for eligible current-player units, uses
  `Illegal move`, and dismisses after 3 seconds or on click.
- Only one unit can be selected at a time.

## Combat UI

### Attacker Selection

- The left rail is used for attacker selection.
- In `DEFENDER_COMBAT`, a Defender unit is eligible only when it has at least
  one ready attack capability and at least one legal target in range.
- In `ONION_COMBAT`, eligibility is evaluated per weapon. A weapon is eligible
  only when it is usable and has at least one legal target in range; the Onion
  unit and its map representation are actionable when any weapon is eligible.
- The left rail shows only actionable highlights for the active user's
  eligible sources. Spent, out-of-range, disabled, destroyed, weaponless, and
  inactive sources remain inspectable without actionable styling.
- Onion board clicks do not add attackers; Onion weapon selection comes from
  the rail.
- Defender combat may select attacker sources from the map or left rail, but
  both surfaces use the same routing policy.

### Targeting and Confirmation

- Selecting attackers shows an orange combat-range overlay.
- The right rail shows legal targets and confirmation while attacker selection
  is active.
- Target lists apply range and target-rule filtering; illegal targets are not
  presented.
- No legal targets produces an empty-state message.
- Combat resolution requires explicit confirmation.

### Combat Results

- Combat results appear in a detailed toast.
- The toast dismisses after 10 seconds or by user action.
- Destroyed Defender records are retained for roster and Inspector history;
  they are not all kept on the active map after combat. See the phase visibility
  table below.

## Unit State and Map Visibility

Sprite asset lookup, map positioning, Inspector sizing, and hatch rendering are
owned by the [unit-presentation specification](unit-presentation-spec.md).
Map unit identity comes from the resolved sprite key; movement/range overlays
and selected-target outlines are separate from the sprite.

| View | Destroyed Defender presentation |
| --- | --- |
| Map before Defender cleanup (`ONION_MOVE`, `ONION_COMBAT`) | May remain visible with the destroyed state overlay. |
| Map after cleanup starts (`DEFENDER_MOVE`, `DEFENDER_COMBAT`, `GEV_SECOND_MOVE`) | Omitted from the active map projection; destroyed Swamp remains visible. |
| Left-rail roster and Inspector | Retained, sorted below operational entries, inspectable, and not eligible as an attacker. |
| Server/API Defender state | Individual destroyed records remain in `state.defenders`; destroyed members are pruned from stack-roster membership when entering `DEFENDER_MOVE`. |

Disabled and destroyed map states use different full-hex hatch treatments, with
destroyed taking precedence when both states share a hex. The left rail uses
matching state treatments. Eligibility is not expressed by the old
green/red/yellow unit-rectangle scheme.

## Selection and Eligibility

- Only the active player assigns their own attackers.
- Battlefield highlights and left-rail action styling consume the same
  `BattlefieldActionEligibility` projection. The board and rail consume this
  derived result; neither surface recomputes unit, group, member, or weapon
  eligibility independently.
- An expandable Defender group is actionable when at least one projected
  member is eligible. Expanded members use their own projected eligibility;
  a group with no eligible members is not actionable.
- Eligibility is recomputed from the current snapshot, phase, viewer role, and
  legal target set. When any of those inputs changes, stale actionable
  highlights are removed rather than retained from the previous projection.
- Defender stack membership and group selection come from `stackRoster`, not
  from co-location. Active Defender stack-member editing is defined in the
  [interaction-routing specification](interaction-routing-spec.md).
- Disabled or destroyed units remain inspectable but cannot be selected as
  attackers.
- When a projection record is unavailable, the rail may retain its existing
  human-readable availability reason as a presentation fallback.
- Selecting a legal combat target does not submit an attack; resolution still
  requires explicit confirmation.
