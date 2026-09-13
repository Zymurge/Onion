# Web UI Interaction Routing Specification

## Purpose

Define the normalized interaction policy used by map, left-rail, right-rail,
and header controls. Components emit semantic requests; one routing boundary
resolves each request into an intent.

## Routing Contract

- Components emit requests such as map primary-click on unit, rail primary-click
  on attacker entry, or map secondary-click on hex.
- A shared routing policy resolves each request into one UI intent.
- Components and thin handlers execute the returned intent rather than
  re-deciding role, activity, or phase behavior locally.
- Inactive-player interaction is inspection-only and remains client-local.
- Committed actions remain backend-authoritative; routing never mutates
  authoritative game state directly.
- Each routed interaction emits debug-level tracing with request shape,
  resolved intent, and any guard or disable reason.

## Surface Ownership

- Map and rail clicks use the same policy vocabulary rather than separate
  active/inactive rules.
- The left rail is a source-selection surface, not a target-selection surface.
- The right rail is an inspection and confirmation surface. During active
  combat it may also expose target selection and stack-member toggles.
- Right-rail stack-member toggles are active-player controls only. Inactive
  players see the grouped stack representation without member toggles.
- Expanded stack presentation implies active-player subgroup editing; member
  clicks in that view already carry subgroup-selection intent.
- The board normalizes subjects as `self`, `opponent`, `background`, or
  `neutral/system` instead of embedding role checks.

## Normalized Request

Each request includes:

- viewer role: `onion` or `defender`
- viewer activity: `active` or `inactive`
- phase mode: `movement`, `combat`, or `locked`
- surface: `map`, `left-rail`, `right-rail`, or `header/control`
- gesture: `primary`, `primary-additive`, or `secondary`
- subject relation: `self`, `opponent`, `neutral/system`, or `background`
- subject capability flags: `moveEligible`, `attackerEligible`,
  `targetEligible`, and `inspectable`
- interaction flags: `groupExpansionTarget` and `expandedStackEditor`

## Base Matrix

| Viewer activity | Phase mode | Surface / gesture / subject | Routed behavior |
| --- | --- | --- | --- |
| Inactive | Any | Primary on any inspectable unit, weapon, stack, or subsystem | Inspect in right rail |
| Inactive | Any | Primary-additive on inspectable subject | Inspect; no multi-select |
| Inactive | Any | Secondary anywhere | No-op |
| Inactive | Any | Primary on background | Clear local inspection |
| Locked | Any | Primary on background | Clear local selection |
| Locked | Any | Any other click | No-op |
| Active | Movement | Primary on self move-eligible source | Select mover |
| Active | Movement | Primary on self non-eligible source | Inspect only |
| Active | Movement | Primary on opponent or neutral subject | Inspect only |
| Active | Movement | Primary on background | Clear selection, overlays, and inspection |
| Active | Movement | Secondary on reachable destination | Submit move, including ram prompt branch |
| Active | Movement | Secondary on non-reachable hex | No-op or local illegal-move feedback |
| Active | Combat | Primary on self attacker-eligible source | Select attacker source |
| Active | Combat | Primary on collapsed group summary | Expand group |
| Active | Combat | Primary-additive on self attacker-eligible source | Toggle attacker membership |
| Active | Combat | Primary on legal target | Select combat target |
| Active | Combat | Primary on inspectable illegal target | Inspect only |
| Active | Combat | Primary on background | Clear combat preparation and inspection |
| Active | Combat | Secondary on map or rail subject | No direct combat action; confirmation stays explicit |
| Any | Any | Header/control surface | No-op in battlefield router |

## Role-Specific Combat Rules

Most routing branches on `self` versus `opponent`; role-specific behavior is
limited to source and target availability.

| Viewer role | Activity | Subject | Routed behavior |
| --- | --- | --- | --- |
| Onion | Active | Onion weapons in left rail | Select or toggle attackers |
| Onion | Active | Defender unit or stack | Select target if legal, otherwise inspect |
| Onion | Active | Onion body during combat | Inspect only |
| Defender | Active | Defender unit or stack | Select or toggle attackers |
| Defender | Active | Right-rail stack member | Toggle within current attacker group |
| Defender | Active | Onion body | Select treads if legal, otherwise inspect |
| Defender | Active | Onion subsystem | Select subsystem target if legal |
| Either | Inactive | Any inspectable subject | Inspect only |
| Either | Inactive | Right-rail stack members | Not shown; grouped summary only |

## Stack Expansion

Surfaces that render grouped units receive a shared `stacksExpandable` flag:

| Viewer role | Activity | Phase | stacksExpandable |
| --- | --- | --- | --- |
| Defender | Active | Movement | true |
| Defender | Active | Combat | true |
| Defender | Active | Locked | false |
| Defender | Inactive | Any | false |
| Onion | Active | Any | false |
| Onion | Inactive | Any | false |

When false, grouped units remain collapsed. When true, a group expands only
after the group is selected and its members enter toggleable subgroup-edit
state. Onion never sees per-member stack expansion in the left rail.

## Control Vocabulary

Header controls:

- `refresh-session`
- `advance-phase`
- `acknowledge-turn`
- `toggle-debug-diagnostics`

Right-rail controls:

- `confirm-combat`
- `attempt-ram`
- `decline-ram`
- `select-all-stack-members`
- `clear-stack-selection`

The debug popup's Advance Phase button uses the same `advance-phase` control as
the header. These controls remain governed by their owning shell state even
when battlefield interaction is locked.

## Initial State and Surface Rules

- Onion active combat starts with the left-rail weapon list prepopulated.
- Defender active combat starts with the left-rail unit list prepopulated.
- Inactive phases expose viewable units as passive inspection candidates.
- Initial state must not imply a selected actor or target unless the snapshot
  provided one.
- Map and rails use the same policy vocabulary.
- The left rail is a source-selection surface; the right rail is inspection,
  confirmation, target-selection, and active stack-member editing.
- Inactive players never see per-member combat toggles.
- The board normalizes subjects as `self`, `opponent`, `background`, or
  `neutral/system` instead of embedding role checks.

## Intent Vocabulary

The router resolves to:

- `inspect-subject`
- `select-actor`
- `toggle-actor`
- `select-target`
- `clear-local-selection`
- `submit-move`
- `show-illegal-local-feedback`
- `noop`

Expanded right-rail stack member clicks resolve to `toggle-actor` with
`surface=right-rail` and `expandedStackEditor=true`; no separate stack-member
intent is required.

## Combat Target Identity

Target selection is local preparation, but the committed target ID is a shared
protocol value:

- Defender units, defender stacks, and individually targetable Onion weapons
  use authoritative IDs.
- Onion tread selection emits `{onionId}:treads`, such as `onion-1:treads`.
- A bare Onion ID is never emitted for tread selection.
- `weapon:` prefixes are UI-only and must be removed before `FIRE` submission.
- `FIRE_RESOLVED` and `ONION_TREADS_LOST` provide canonical `targetId` and
  `targetFriendlyName`; labels are display data and legality remains backend
  owned.

## Implementation Constraints

- Keep components mostly declarative and keep interaction state client-local.
- Normalize surface events before applying role-specific handling.
- Resolve one intent from the shared matrix, then execute it in a thin handler
  that calls existing interaction hooks or command builders.
- Keep role differences in subject normalization and legality metadata rather
  than scattering role branches through components.
- Cover the matrix with pure routing tests and keep orchestration tests focused
  on verifying that map and rail surfaces are wired to the router.

The historical migration sequence is intentionally kept out of this permanent
contract; implementation history remains available in
[web-ui-spec.md.ref](../web-ui-spec.md.ref).
