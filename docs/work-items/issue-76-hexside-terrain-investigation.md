# Issue #76: Hexside Terrain Model for Ridges and Streams

**Status:** Investigation complete; design decisions and implementation not approved
**Issue:** [Investigate hexside terrain model for ridges and streams](https://github.com/Zymurge/Onion/issues/76)
**Scope:** Design and impact assessment only. Do not implement from this document without approving the open rule decisions and migration plan.

## Summary

The current map model stores terrain on whole hexes. This works for craters but
does not represent a ridge or stream that lies between two hexes. The movement
planner, validator, combat calculator, scenario schema, snapshots, and web map
all currently inherit the whole-hex assumption.

The repository verifies current ridge behavior, but it does not define stream
rules or establish the intended combat effect of an edge ridge. The proposed
direction is to represent a hexside by its two adjacent endpoint hexes and
store it once as an undirected edge. Implement ridge migration first; settle
stream behavior before implementing stream rules.

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
  `ridgeline`. Ridge movement cost and permission come from unit terrain rules;
  crater terrain is impassable.
- [shared/config/unitCatalog.json](../../shared/config/unitCatalog.json)
  grants ridge crossing to `LittlePigs`, `TheOnion`, and `TheOnionDamaged`.
  `LittlePigs` has `movementCost: 1` and `canAccessCover: true`; the Onion
  variants have `canCross: true`. Other listed types have no ridge rule.
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

### Not Established By Repository Evidence

- Stream crossing permissions, costs, or movement-phase effects.
- Whether ridge edges affect combat, and if so, how attack direction matters.
- Whether any unit class can cross streams or ridges beyond the current catalog
  flags.
- Any assertion that official Ogre rules require a particular combat outcome.
  Verify intended rules against an approved project source before changing
  combat behavior.
- Whether stored matches persist an authored scenario snapshot that needs an
  explicit storage migration. Trace this before implementation.

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
validation/materialization responsibility, not client-side inference.

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
- Decide explicitly whether omitted authored `edges` is allowed for existing
  clear-only scenarios. Regardless of authoring defaults, runtime snapshots
  must have one canonical shape and must not infer edge data from legacy
  ridgeline hexes.
- Keep whole-hex terrain for terrain that genuinely occupies a cell, such as
  craters. Define the handling of legacy `t=1` separately: migrate the known
  scenarios or fail validation with an actionable error; do not reinterpret
  `t=1` silently.

## Rule Decisions

### Current Ridge Catalog Matrix

| Unit type ID | Current ridge catalog data | Current implication |
| --- | --- | --- |
| `LittlePigs` | `canCross: true`, `movementCost: 1`, `canAccessCover: true` | Can enter a whole-hex ridge at cost 1; can receive current ridge cover modifier. |
| `TheOnion` | `canCross: true` | Can enter a whole-hex ridge; default ridge cost is 2. |
| `TheOnionDamaged` | `canCross: true` | Same catalog rule as `TheOnion`. |
| `Puss`, `BigBadWolf`, `Witch`, `Pinocchio`, `Dragon` | No ridge terrain rule | Cannot enter a whole-hex ridge under current shared movement rules. |
| `Farquaad`, `Swamp` | No ridge terrain rule; both are immobile | No practical movement crossing under their current mobility rules. |

The class labels sometimes used in conversation (for example, “infantry,”
“Ogre,” or “Superheavy”) are not substitutes for these catalog type IDs.
Do not infer rules for streams or rename catalog capabilities based on class
labels without an approved rules decision.

### Edge-Aware Movement Contract

For every path step, the shared planner should evaluate both the current and
next cell, then look up the canonical edge between them. The destination
whole-hex terrain remains a separate check. This applies to reachable moves,
pathfinding, and authoritative validation; occupancy and stacking remain
hex-based.

Before implementation, define a shared edge rule contract that answers:

- Is crossing prohibited for a unit, or allowed at a modified cost?
- Does a catalog value mean total step cost or an additional edge cost?
- Can an edge and destination terrain penalty combine, and how?
- Are effects symmetric in both crossing directions?
- How do multi-step routes, movement allowance, and GEV second move treat the
  edge?
- How are errors distinguished when a path fails because of an edge?

Prefer shared rules and `RulesContext` as the lookup boundary, consistent with
current movement ownership. Whether unit permissions stay in
`unitCatalog.json` or move to a shared edge-rule table depends on the approved
semantics; do not add guessed stream values to the catalog.

### Combat Decision (Unresolved)

Current code doubles defense for eligible targets on whole-hex ridgelines.
Do not remove or preserve this behavior by assumption. Decide whether an edge
ridge is movement-only or affects combat. If it affects combat, specify how
the target side and attack line interact with the edge and identify the shared
combat input needed to evaluate that geometry. If no approved rule supports
edge-based cover, retain no edge-derived combat modifier. Update
`shared/staticRules.ts`, `shared/combatCalculator.ts`, preview behavior, and
tests only after this decision is recorded.

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

The snapshot policy in [snapshot-deprecation-policy.md](../snapshot-deprecation-policy.md)
prohibits silent compatibility inference. Therefore old snapshots missing a
required canonical edge field must either be explicitly versioned/migrated or
rejected. Before choosing, inspect how game records persist scenario data and
which old matches can still be loaded. Do not assume a database migration is
or is not needed based only on the API type.

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

- Migrate the 14 `t=1` entries in `scenarios/onion-ring-iii.json` and the 5 in
  `scenarios/swamp-siege-01.json` to explicit ridge edges after the map layout
  and rule mapping are approved.
- Update `docs/scenario-schema.md` and the example that currently documents
  `t=1` as ridgeline.
- Search all fixtures and snapshots before implementation; test usage is much
  broader than the two shipped scenarios.

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

1. **Approve rules and edge contract:** settle ridge crossing costs, stream
   semantics, combat impact, edge naming, and authored/runtime optionality.
2. **Add shared edge identity and schema:** define the canonical edge type/key,
   validate adjacency and membership, and test compact/explicit materialization.
3. **Migrate ridge movement:** make planner, validator, and server adapter use
   edge context; convert existing ridge scenarios and focused movement tests.
4. **Update snapshots and clients:** project canonical edges through API and
   web snapshot validation; resolve persisted-match compatibility explicitly.
5. **Render edges:** add a deterministic SVG overlay and focused rendering
   tests; remove whole-hex ridge presentation after scenario migration.
6. **Implement streams separately:** only after stream rules are approved;
   avoid adding stream behavior or scenario placements as part of ridge-only
   work.
7. **Align combat if required:** remove or redesign the old whole-hex ridge
   modifier only according to the approved combat contract.

## Recommendation

**Split the work.** First approve and implement the canonical edge contract and
ridge migration. Keep stream movement rules and scenario placements as a
separate follow-up because no stream semantics are currently defined in the
repository. Treat combat as an explicit decision within the ridge phase, not
an automatic consequence of changing the map representation.

Before implementation, record decisions on:

- Canonical endpoint-pair representation and runtime snapshot shape.
- Ridge crossing semantics for current catalog types.
- Stream permissions, costs, and any phase-specific behavior.
- Whether ridges affect combat and the required directional inputs.
- Legacy `t=1` rejection or migration, plus persisted-match compatibility.
