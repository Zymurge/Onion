# Issue #76: Hexside Terrain Model for Ridges and Streams

**Status:** Design decisions recorded; implementation not approved
**Issue:** [Investigate hexside terrain model for ridges and streams](https://github.com/Zymurge/Onion/issues/76)
**Scope:** Design and impact assessment only. This document does not authorize implementation.

## Summary

The current map model stores terrain on whole hexes. This works for craters but
does not represent a ridge or stream that lies between two hexes. The movement
planner, validator, combat calculator, scenario schema, snapshots, and web map
all currently inherit the whole-hex assumption.

The repository verifies current ridge behavior, while the rules clarified for
this work item define class-based ridge crossing and stream movement effects.
Represent a hexside by its two adjacent endpoint hexes and store it once as an
undirected edge. This work may establish a reusable terrain-rule model for
future terrain such as forests, but forest behavior and scenario placements
are out of scope.

## Evidence And Confidence

### Verified Current Behavior

- [shared/scenarioMap.ts](../../shared/scenarioMap.ts) materializes `cells` and
  whole-hex `hexes`; `ExplicitScenarioMap` has no edge collection.
- [server/engine/scenarioSchema.ts](../../server/engine/scenarioSchema.ts)
  validates terrain entries as `{ q, r, t }`. Compact map schemas currently
  define `hexes`, not `edges`.
- [shared/movePlanner.ts](../../shared/movePlanner.ts) evaluates each neighbor
  step using the destination hex's terrain. `getNeighbors` in
  [shared/axialHex.ts](../../shared/axialHex.ts) returns adjacent coordinates
  without edge identity.
- [shared/moveValidator.ts](../../shared/moveValidator.ts) checks destination
  terrain separately before calling the pathfinder. An edge-based change must
  keep this check consistent with pathfinding.
- [shared/movementRules.ts](../../shared/movementRules.ts) maps `t=1` to
  `ridgeline`. Ridge movement cost and permission currently come from
  per-unit terrain rules; crater terrain is impassable.
- [shared/config/unitCatalog.json](../../shared/config/unitCatalog.json)
  currently attaches `terrainRules`, `isArmor`, and `ramProfile` to individual
  unit definitions. There is no canonical unit-class field or class-level
  movement/ram rule lookup today. Current ridge crossing is allowed for
  `LittlePigs` and `TheOnion`; `LittlePigs` has `movementCost: 1`, while the
  Onion uses the default ridge cost of 2. Other listed unit types have no
  ridge crossing rule.
- [shared/staticRules.ts](../../shared/staticRules.ts) sets a ridgeline defense
  multiplier of 2. [shared/combatCalculator.ts](../../shared/combatCalculator.ts)
  applies it to a target when the target's unit definition permits terrain
  cover. This is current behavior, not a decision about future edge ridges.
- [shared/apiProtocol.ts](../../shared/apiProtocol.ts) defines the game response
  map with canonical `cells` and `hexes`. Web snapshot validation requires
  those fields, and [web/lib/battlefieldViewBuilders.ts](../../web/lib/battlefieldViewBuilders.ts)
  passes them into the view model.
- [web/components/HexMapCell.tsx](../../web/components/HexMapCell.tsx) renders
  `t=1` using a whole-cell ridge image. [web/components/HexMapBoard.css](../../web/components/HexMapBoard.css)
  styles the corresponding whole-hex class.
- `onion-ring-iii.json` contains 14 `t=1` entries and `swamp-siege-01.json`
  contains 5. The scenario schema documentation also describes `t=1` as
  ridgeline.
- The live API move and fire handlers currently build the legacy engine map
  from scenario `hexes` and `cells`. The live movement rules are shared rules;
  the legacy map's deprecated line-of-sight helper is not evidence for the
  intended edge semantics.

### Decisions Recorded For This Work Item

- The canonical edge records both adjacent endpoints, and runtime map snapshots
  carry a required edge array.
- Unit classes and ridge/stream movement behavior are specified below.
- Ridges and streams do not affect fire from or across them; ridges provide no
  defensive bonus.
- All pre-existing games will be deleted before the new snapshot contract is
  enforced. No legacy-game compatibility or translation is required.

## Proposed Canonical Edge Contract

Represent an edge as a terrain kind and two adjacent axial endpoints:

```ts
type ScenarioEdgeTerrain = 'ridge' | 'stream'

type ScenarioTerrainEdge = {
  a: HexPos
  b: HexPos
  type: ScenarioEdgeTerrain
}
```

Treat the edge as **undirected**. Canonicalize endpoint order by ascending `q`,
then ascending `r`, and use the normalized pair for lookup and duplicate
detection. A step from `a` to `b` and a step from `b` to `a` must resolve to the
same edge. Keep authored endpoints explicit; canonicalization is a shared
validation/materialization responsibility, not client-side inference. This
endpoint-pair representation is approved for the plan, and both endpoints are
stored in authored and runtime edge records.

The runtime map and `ScenarioMapSnapshot` always include a required
`edges: ScenarioTerrainEdge[]` property, including an empty array when there
are no edge features. Authored maps may omit `edges` when they define none;
materialization normalizes that authoring form to the required runtime array.

Example (illustrative shape only; not a scenario change):

```json
{
  "edges": [
    { "type": "ridge", "a": { "q": 8, "r": 0 }, "b": { "q": 9, "r": 0 } },
    { "type": "stream", "a": { "q": 9, "r": 0 }, "b": { "q": 9, "r": 1 } },
    { "type": "ridge", "a": { "q": 9, "r": 0 }, "b": { "q": 10, "r": 0 } }
  ]
}
```

The endpoint pair representation is preferred over directed records because a
physical boundary should not need separate entries for its two crossing
directions. A coordinate-plus-side representation is smaller, but requires
side conventions and reverse-side normalization that are less legible in
authored scenario data.

### Validation Requirements

- Require endpoints to be distinct adjacent cells (`hexDistance(a, b) === 1`).
- Require both endpoints to belong to the materialized `cells` set.
- Reject duplicate normalized endpoint pairs, including reversed duplicates.
- Reject conflicting terrain kinds on one edge; do not silently choose one.
- Omitted authored `edges` is allowed when a map defines no edge features;
  materialized maps and runtime snapshots always include the array.
- Keep whole-hex terrain for terrain that genuinely occupies a cell, such as
  craters and potential future forest terrain. Legacy ridge encodings are
  removed; backward translation and migration are out of scope. Pre-existing
  scenarios that define ridges will be updated outside this implementation.

## Rule Decisions

### Current Ridge Catalog Matrix

| Unit type ID | Current ridge catalog data | Current implication |
| --- | --- | --- |
| `LittlePigs` | `canCross: true`, `movementCost: 1`, `canAccessCover: true` | Current whole-hex rule permits entry. The new ridge rule has no crossing cost and provides no defensive bonus. |
| `TheOnion` | `canCross: true` | Current whole-hex rule permits entry; new ridge crossing has no movement cost. |
| `Puss`, `BigBadWolf`, `Witch`, `Pinocchio`, `Dragon` | No ridge terrain rule | Current whole-hex rules do not permit entry; the approved class matrix also blocks these classes from crossing ridges. |
| `Farquaad`, `Swamp` | No ridge terrain rule; both are immobile | Their approved classes are Artillery and Command; immobility currently prevents movement. |

### Required Unit Classes

Add a canonical unit class for every unit definition. Classes are rule
categories, not replacements for unit type IDs. Every type inherits movement
and ram rules from its class; unit-specific properties such as immobility and
second-move eligibility remain explicit where needed.

Approved class assignments:

| Unit type ID | Unit class |
| --- | --- |
| `LittlePigs` | Infantry |
| `Puss`, `Witch`, `Pinocchio` | Light Armor |
| `Dragon` | Heavy Armor |
| `BigBadWolf` | GEV |
| `Swamp` | Command |
| `Farquaad` | Artillery |
| All Onion unit types | Onion |

Represent these as stable class identifiers in the catalog/schema (for
example, `infantry`, `lightArmor`, `heavyArmor`, `gev`, `command`, `artillery`,
and `onion`) while preserving the display labels above. “All Onion unit types”
means unit definitions in the Onion class, not a sprite-only variant.

Current per-unit ram data to consolidate by class:

| Unit class | Current ram behavior to preserve in class rules |
| --- | --- |
| Infantry | Little Pigs rammed-target profile: 0 tread loss; destroyed on roll at most 4. |
| Light Armor | Puss, Witch, and Pinocchio rammed-target profile: 1 tread loss; destroyed on roll at most 4. |
| Heavy Armor | Dragon rammed-target profile: 2 tread loss; destroyed on roll at most 4. |
| GEV | Big Bad Wolf rammed-target profile: 1 tread loss; destroyed on roll at most 4. |
| Command | Swamp rammed-target profile: 1 tread loss; destroyed on roll at most 4. |
| Artillery | Farquaad rammed-target profile: 1 tread loss; destroyed on roll at most 4. |
| Onion | Attacker capability: can ram, capacity 2, and 2 rams per turn. Preserve Onion's separate tread-damage and ram-resolution behavior. |

### Edge-Aware Movement Contract

For every path step, the shared planner evaluates both the current and next
cell, looks up the canonical edge between them, and applies the class rule for
that terrain edge. Edge effects are bidirectional. It then applies the normal
destination-hex entry rule. Edge cost and destination-hex cost combine; a move
is unavailable when the unit lacks enough movement allowance for both. This
applies to reachable moves, pathfinding, GEV second moves, and authoritative
validation; occupancy and stacking remain hex-based.

### Clarified Terrain Behavior

- **Ridge:** Crossing is either allowed or prohibited by unit class. Crossing
  is bidirectional and adds no movement cost. `LittlePigs` no longer receives a
  ridge defense bonus; ridge edges do not modify fire from or across them.
- **Stream:** Light armor is delayed; heavy armor, infantry, GEV, and Onion are
  unaffected. Streams do not modify fire from or across them. The numeric
  cost is 2 MP total to enter a clear destination across a stream: normal
  destination entry costs 1 MP and the stream adds a +1 MP surcharge. The
  destination terrain cost is still applied normally.
- **Future terrain:** The shared rules design should support centrally defined
  movement behavior by terrain type and unit class, including both edge
  terrain and whole-hex terrain. Forest is an example of a future terrain type,
  not part of this implementation.

Use shared rules and `RulesContext` as the lookup boundary. Unit definitions
identify their class; a centralized class-by-terrain rules table owns crossing
permission and cost. Unit definitions inherit those movement rules rather than
copying per-unit terrain rules. The same class lookup should own class-based
ram behavior. Class-level ram rules must distinguish attacker capabilities
(such as `canRam`, capacity, and per-turn limits) from a unit's outcome profile
when it is rammed. Both belong to class rules rather than duplicated per-unit
terrain or ram settings.

Approved class-by-terrain movement matrix, using edge surcharge semantics:

| Unit class | Ridge | Stream |
| --- | --- | --- |
| Infantry | Allowed, +0 MP | Allowed, +0 MP |
| Light Armor | Prohibited | Allowed, +1 MP surcharge |
| Heavy Armor | Prohibited | Allowed, +0 MP |
| GEV | Prohibited | Allowed, +0 MP |
| Command | Immobile; no movement | Immobile; no movement |
| Artillery | Immobile; no movement | Immobile; no movement |
| Onion | Allowed, +0 MP | Allowed, +0 MP |

Ridge permission is a barrier by class, not a movement surcharge: Infantry and
Onion may cross, while Light Armor, Heavy Armor, and GEV may not. Command and
Artillery units do not move under their current unit rules. Stream permissions
and costs are the clarified requirements. An edge contributes a surcharge
(zero by default), then the destination hex contributes its normal entry cost.
For example, Light Armor crossing a stream into clear terrain costs
$1 + 1 = 2$ MP. If destination terrain costs more than 1 MP, that cost is added
too. A move is unavailable when the combined cost exceeds remaining movement
allowance.

For path failures caused by an impassable edge, retain the existing top-level
action error `MOVE_INVALID` and shared validation code `NO_PATH`. Add a
specific `prohibited-edge` detail code and propagate it through the server
movement adapter to the action response. This is preferable to a new
top-level validation code: the move still fails because no legal path exists,
while callers that need a specific message can distinguish an edge barrier.
Keep generic no-route failures as `NO_PATH` without that detail. Add parity
tests for shared validation and the API response. The current server adapter
drops the shared validator's optional detail code, so propagation is part of
the required change.

### Combat Behavior (Clarified)

Ridges and streams do not affect fire from or across them. Remove the
whole-hex ridgeline defense behavior, including the Little Pigs cover
capability. Update `shared/staticRules.ts`, `shared/combatCalculator.ts`,
combat preview behavior, and tests so combat does not receive ridge/stream
modifiers.

## Contracts, Snapshots, And Persistence

Likely implementation surfaces:

- `server/engine/scenarioSchema.ts`: authored edge schema and strict validation.
- `shared/scenarioMap.ts`: authored/runtime types, edge normalization, bounds,
  adjacency, and duplicate validation.
- `server/api/gameHelpers/scenario.ts`: materialized scenario map.
- `shared/apiProtocol.ts`: canonical `ScenarioMapSnapshot` response contract.
- `server/api/gameHelpers/stateProjection.ts` and
  `server/api/gameHelpers/actionResponses.ts`: map projection into responses.
- `server/api/gameRoutes/actionHandlers/move.ts`: preserve edge data when
  constructing the authoritative movement map.
- `web/lib/battlefieldDisplay/snapshotValidation.ts` and
  `web/lib/battlefieldViewBuilders.ts`: validate and project edge data.
- `web/components/HexMapBoard.tsx`: pass edge data to rendering and movement
  inputs.
- Scenario schema docs, map examples, fixtures, and tests.

The [persistence spec](../persistence.md) confirms the full scenario snapshot
is stored on the match row as JSONB; `game_state` does not own map terrain. A
required `edges` field does not require a relational-column migration, but it
does change the accepted shape of stored scenario JSON and the API snapshot.
The [snapshot policy](../snapshot-deprecation-policy.md) prohibits silent
compatibility inference. Do not translate old ridge data. All pre-existing
games will be deleted before the new contract is enforced, so no legacy-game
reader or snapshot migration is needed. Treat that deletion as an operational
rollout prerequisite; this implementation does not add data translation or
automatic deletion logic.

## Web Rendering Proposal

Render each canonical edge once as a presentation overlay derived from the
same axial geometry used for cells. Compute the shared boundary segment from
the two neighboring cell polygons and reuse the normalized edge key for React
identity and duplicate suppression. Keep the rendering geometry in
`web/lib/hexPixelLayout.ts` or a small adjacent pure helper; do not add another
coordinate/orientation model.

The current `HexMapCell` combines terrain, overlays, and unit markers inside
one cell group. A board-level edge layer drawn after whole cell groups could
cover markers; one drawn before all groups could be covered by later cell
backgrounds. Choose an explicit SVG stacking arrangement that places edge
strokes above terrain and below occupants/selection content, or render each
edge at a controlled point in its owning cell group after validating overlap
behavior. Edge strokes should not intercept map interaction. Verify clarity at
supported zoom levels and distinguish ridge from stream without color alone.

## Migration And Test Inventory

### Authored Data

- Do not migrate scenario files as part of this implementation. Pre-existing
  scenarios defining ridges will be updated externally; the new schema and
  runtime model do not translate legacy ridge values.
- Update `docs/scenario-schema.md` to document the new edge and unit-class
  contracts and remove the legacy ridge encoding.
- Update canonical fixtures and tests to the new contract. Keep test migration
  within scope even though authored scenario migration is external.

### Focused Tests To Update Or Add

- [test/shared/scenarioMap.test.ts](../../test/shared/scenarioMap.test.ts): edge
  adjacency, out-of-map endpoint, canonical ordering, reversed duplicates,
  conflicting kinds, compact and explicit map materialization.
- [test/shared/movementRules.test.ts](../../test/shared/movementRules.test.ts):
  approved ridge/stream permissions and costs per actual unit type.
- [test/shared/movePlanner.test.ts](../../test/shared/movePlanner.test.ts) and
  [test/shared/moveValidator.test.ts](../../test/shared/moveValidator.test.ts):
  edge-aware path cost, blocked path, reverse traversal, mixed routes, and
  validation/pathfinder parity.
- [test/server/engine/movement.test.ts](../../test/server/engine/movement.test.ts):
  authoritative adapter behavior and preservation of edge data.
- [test/shared/combatCalculator.test.ts](../../test/shared/combatCalculator.test.ts)
  and [test/web/lib/pure/combatPreview.test.ts](../../test/web/lib/pure/combatPreview.test.ts):
  only if the approved combat rule changes.
- Scenario parsing, API projection, snapshot validation, and response contract
  tests: canonical edges round-trip; malformed and legacy shapes fail as
  specified.
- [test/web/components/HexMapBoard.test.tsx](../../test/web/components/HexMapBoard.test.tsx)
  and [test/web/components/HexMapCell.test.tsx](../../test/web/components/HexMapCell.test.tsx):
  edge geometry, duplicate suppression, visual stacking, and pointer behavior.

Follow the repository testing policy: run focused Vitest files first, then the
relevant regression suite and `pnpm exec tsc --noEmit`. No tests were run for
this investigation document.

## Suggested Implementation Slices

1. **Add shared unit classes and rules:** add class metadata, resolve classes
  through `RulesContext`, and centralize movement and ram rules by class and
  terrain type. Define extension points for future terrain such as forests;
  do not add forest mechanics.
2. **Add edge identity and schema:** define canonical undirected edges, validate
  adjacency and map membership, and test compact/explicit materialization.
3. **Implement ridge and stream movement:** make planner, validator, and server
  adapter use edge context; combine edge cost with destination terrain entry
  cost, propagate the `prohibited-edge` detail code, and test multi-step and GEV
  second-move behavior.
4. **Update snapshots and clients:** project required canonical edges through
  API and web snapshot validation. Delete all existing games before enforcing
  the new snapshot contract.
5. **Render edges:** add a deterministic SVG overlay and focused rendering
  tests; remove whole-hex ridge presentation. Do not migrate scenario files.
6. **Remove ridge combat effects:** remove the old whole-hex defense modifier
  and cover capability; verify combat and preview parity.

## Recommendation

**Proceed with one edge-terrain and class-rules foundation, but keep forest
mechanics and external scenario updates out of scope.** Ridge and stream
movement rules, unit classes, endpoint representation, and combat behavior are
specified. Delete all existing games before enforcing the required new
snapshot contract; no compatibility translation is in scope.

Implementation constraints:

- Keep unit-class movement and ram rules centralized and resolved through
  `RulesContext`.
- Require runtime snapshots to carry `edges`, even when empty.
- Use `MOVE_INVALID` with `NO_PATH` and an edge-specific `prohibited-edge`
  detail for ridge barriers.
- Delete old game rows before rollout; do not translate old scenario snapshots.
