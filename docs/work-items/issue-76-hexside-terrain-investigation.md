# Issue #76: Hexside Terrain Model for Ridges and Streams

**Status:** Phase 2.2 caller migration complete; canonical edge implementation
phases remain pending
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
- Unit classes and ridge/stream movement behavior are specified below. The
  class table owns class-specific mobility, terrain access, ramming, and
  `isArmor`, and is the extension point for future class-specific behavior.
- Ridges and streams do not affect fire from or across them; ridges provide no
  defensive bonus. The inspector does not show edge terrain: it shows the
  domain of the selected unit, and a unit cannot occupy an edge.
- `NO_PATH` means no calculated path to that hex costs less than or equal to
  the unit's remaining movement allowance. It is not an absolute connectivity
  failure. Clients only need to know whether a destination is eligible; do not
  add an edge-specific error or extra explanation.
- The movement highlight continues to light every eligible hex within the
  remaining allowance, treating edges as class-specific obstacles or penalties.
- There is no legacy support. Existing games will be deleted manually from the
  database before new games start. This implementation does not translate old
  snapshots or old ridge hexes.
- Scenarios are vetted during development. Update `scripts/validate-scenario.ts`
  and the parser it calls so invalid endpoint pairings fail with the path and
  reason. Game start uses that same check and throws; it does not repair the
  map. Stored snapshots are assumed pre-vetted and valid.
- Ridge and stream presentation uses one rotatable sprite per terrain kind,
  drawn on all six hex-edge facings. Movement and firing-range overlays are a
  removable transparent layer above the map, edges, and unit sprites.
- Every scenario file loaded by tests is updated to this contract in this work.

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
- Require canonical endpoint order and canonical edge-array order. Reject
  reversed endpoints and out-of-order records instead of sorting them at game
  start or on snapshot read.
- Sort edge records lexicographically by `(a.q, a.r, b.q, b.r)` after endpoint
  canonicalization. Endpoint-pair uniqueness means no type tie-breaker is needed.
- Reject duplicate endpoint pairs, including reversed duplicates.
- Reject conflicting terrain kinds on one edge; do not silently choose one.
- Omitted authored `edges` is allowed when a map defines no edge features;
  materialized maps and runtime snapshots always include the array.
- Remap whole-hex terrain codes contiguously: `0` clear, `1` crater, and `2`
  The Swamp. Ridge and stream remain distinct edge terrain types. When updating
  existing scenario files, convert old `t=1` ridge features to explicit edges,
  old crater `t=2` to `t=1`, and old swamp `t=3` to `t=2`. Do not infer old
  ridge edges at runtime; unsupported whole-hex codes are invalid until a new
  terrain type is explicitly introduced.
- `pnpm scenario:validate` (`scripts/validate-scenario.ts`) is the development
  gate. It already delegates to `parseScenarioSnapshot`; extend that shared
  parser and the script's error text so an endpoint-pairing failure names the
  edge and the rule it broke. Game creation uses the same parser and throws
  `ScenarioValidationError` with that detail. Do not add a second repair pass.
- Snapshot readers assume the stored map was vetted. They do not re-canonicalize
  edges, infer missing edges, or translate old ridge hexes.

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
categories, not replacements for unit type IDs. The class table owns every
class-specific attribute: whether the class can move, second-move eligibility
when that is class-wide, terrain access and cost, ram attacker capability,
rammed-target profile, and `isArmor`. It must be able to grow new class-specific
behaviors without copying those rules back onto each unit type. Numeric
movement allowance, defense, weapons, and presentation stay on the unit type,
because those already differ inside a class. Scenario-derived types inherit
their base type's class and cannot override class rules.

Approved class assignments:

| Unit type ID | Unit class |
| --- | --- |
| `LittlePigs` | `Infantry` |
| `Puss`, `Witch`, `Pinocchio` | `LightArmor` |
| `Dragon` | `HeavyArmor` |
| `BigBadWolf` | `GEV` |
| `Swamp` | `Command` |
| `Farquaad` | `Artillery` |
| `TheOnion` | `Onion` |

Represent these as stable PascalCase identifiers in TypeScript and the catalog
(`'Infantry'`, `'LightArmor'`, `'HeavyArmor'`, `'GEV'`, `'Command'`,
`'Artillery'`, and `'Onion'`), defined in a typed TypeScript module
(`shared/classRules.ts`).

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

Use shared rules and `RulesContext` as the lookup boundary, including the
global fallback context. Unit definitions identify their class and do not copy
class rules. The class table owns crossing permission, edge surcharge, whole-hex
entry rules, mobility, `isArmor`, and ram behavior. Ram rules still distinguish
attacker capabilities (`canRam`, capacity, and per-turn limits) from the
outcome profile when that class is rammed. Because the Onion class owns
`canRam`, the Onion unit definition rams through that class rule rather than
through a hardcoded type id. Replace the current
`unitType === 'TheOnion'` ram check and the per-unit `terrainRules`,
`ramProfile`, and `isArmor` copies.

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
Artillery are immobile as a class rule. Stream permissions and costs are the
clarified requirements. An edge contributes a surcharge (zero by default), then
the destination hex contributes its normal entry cost. For example, Light Armor
crossing a stream into clear terrain costs $1 + 1 = 2$ MP. If destination
terrain costs more than 1 MP, that cost is added too. A crater destination
remains impassable; the edge surcharge does not make it enterable. A step is
unavailable when the combined cost exceeds the remaining movement allowance.

`NO_PATH` means the planner found no path to that hex whose cost is less than
or equal to the remaining movement allowance. A prohibited ridge and a stream
surcharge are inputs to that calculation, not separate error causes. Do not add
a `prohibited-edge` detail code, and do not add client copy that explains why
the destination is ineligible. Keep the existing top-level `MOVE_INVALID` and
shared `NO_PATH` when an explicit move is submitted to an unlit hex. Clients
show eligibility by lighting every reachable hex within the remaining
allowance. That highlight must use the same edge-aware planner as authoritative
validation, including class obstacles, class penalties, reverse traversal, and
GEV second moves.

### Combat Behavior (Clarified)

Ridges and streams do not affect fire from or across them. Remove the
whole-hex ridgeline defense behavior, including the Little Pigs cover
capability. Update `shared/staticRules.ts`, `shared/combatCalculator.ts`,
combat preview behavior, and tests so combat does not receive ridge/stream
modifiers.

## Contracts, Snapshots, And Persistence

Likely implementation surfaces:

- `server/engine/scenarioSchema.ts`: authored edge schema and strict validation.
- `shared/scenarioMap.ts`: authored/runtime types, edge bounds, adjacency, and
  duplicate validation. Do not sort a non-canonical pair at game start.
- `scripts/validate-scenario.ts` and `server/api/gameHelpers/scenario.ts`:
  development validation and game-start errors share one parser and name the
  failing edge rule.
- `web/public/terrain/`: rotatable ridge and stream edge sprites. Do not reuse
  the whole-hex ridge image for an edge facing.
- `shared/apiProtocol.ts`: canonical `ScenarioMapSnapshot` response contract.
- `server/api/gameHelpers/stateProjection.ts` and
  `server/api/gameHelpers/actionResponses.ts`: map projection into responses.
- `server/engine/map.ts` and `server/engine/movement.ts`: carry edges on the
  engine map and into `toMoveMapSnapshot`. Updating the move handler alone
  cannot preserve them, because `createMap` currently keeps only cells and
  whole-hex terrain.
- `server/api/gameRoutes/actionHandlers/move.ts`: pass the edge-bearing map
  into authoritative validation. The fire handler does not need edge rules.
- `web/lib/battlefieldDisplay/snapshotValidation.ts` and
  `web/lib/battlefieldViewBuilders.ts`: validate and project edge data.
  `shared/protocolSchemas.ts` does not validate the map shape; do not treat
  that passthrough schema as the fail-loud boundary.
- `web/lib/battlefieldInteraction/movement.ts`: copy edges into the shared
  planner input so highlighted hexes match the server.
- `web/lib/gameClient.ts`: keep its scenario-map type aligned with the
  canonical snapshot. Do not leave a second map contract without `edges`.
- `web/components/HexMapBoard.tsx`: pass edge data to rendering and movement
  inputs.
- `docs/scenario-schema.md`, `docs/game-rules.md`, and the ridgeline ownership
  row in `docs/agent-start-here.md`: record edges, class rules, and the removal
  of ridge cover. Scenario map examples, fixtures, and tests follow the same
  contract.

The [persistence spec](../persistence.md) confirms the full scenario snapshot
is stored on the match row as JSONB; `game_state` does not own map terrain. A
required `edges` field does not require a relational-column migration, but it
does change the accepted shape of stored scenario JSON and the API snapshot.
The [snapshot policy](../snapshot-deprecation-policy.md) prohibits silent
compatibility inference. Do not translate old ridge data. The user will
manually delete all existing game rows from the database before starting games
on the new contract. This implementation does not add a reader, a translation,
or automatic deletion. It also does not need to call the game-delete route.

## Web Rendering Proposal

Render each canonical edge once as a presentation overlay derived from the
same axial geometry used for cells. Compute the shared boundary segment from
the two neighboring cell polygons and reuse the normalized edge key for React
identity and duplicate suppression. Keep the rendering geometry in
`web/lib/hexPixelLayout.ts` or a small adjacent pure helper; do not add another
coordinate/orientation model.

Draw the static map in this order: base map, whole-hex terrain, edge terrain,
then unit sprites. Use one board-level edge layer so each canonical edge is
drawn once, above hex terrain and below occupants. Do not draw the edge inside
each owning cell group, and do not draw it twice from the two endpoints.

Ridge and stream each have one sprite that can be rotated onto all six edge
facings of a hex. Derive the facing from the existing pointy-top corners in
`web/lib/hexPixelLayout.ts`; do not add a second orientation model or six
authored files per terrain kind. The current whole-hex `/terrain/ridges.svg`
is not that sprite. Edge sprites must not intercept map interaction. The
inspector needs no edge treatment.

Movement highlights and firing-range marks are a separate top layer, above
unit sprites, with enough transparency to show the terrain, edges, and units
underneath. Removing that layer must not change those underlying graphics, so
it cannot be implemented by replacing the hex terrain fill. Keep the overlay
`pointer-events` off. Selection and escape marks are not part of this dynamic
layer unless a later change says otherwise.

## Migration And Test Inventory

### Authored Data

- Do not translate legacy ridge hexes. There is no legacy-support window.
  The user deletes existing game rows manually before starting new games.
- Convert old `t=1` ridge features to explicit edges in scenario source data;
  remap crater `t=2` to `t=1` and swamp `t=3` to `t=2`. Runtime parsing does
  not infer edges from whole-hex terrain codes.
- Update every scenario file loaded by unit, integration, or end-to-end tests
  to the new edge contract in this work. Run `pnpm scenario:validate` on each
  updated file. A ridge hex still cannot be mechanically converted into one
  edge, so this is a map edit, not a codemod.
- Update `docs/scenario-schema.md`, `docs/game-rules.md`, the ridgeline
  ownership note in `docs/agent-start-here.md`, the ridge-cover note in
  `docs/ai-opponent-strategy.md`, and the map-presentation spec named by
  `docs/agent-start-here.md`.

### Focused Tests To Update Or Add

- [test/shared/scenarioMap.test.ts](../../test/shared/scenarioMap.test.ts): edge
  adjacency, out-of-map endpoint, canonical ordering, reversed duplicates,
  conflicting kinds, compact and explicit map materialization.
- [test/shared/movementRules.test.ts](../../test/shared/movementRules.test.ts):
  approved ridge/stream permissions and costs per actual unit type.
- [test/shared/movePlanner.test.ts](../../test/shared/movePlanner.test.ts) and
  [test/shared/moveValidator.test.ts](../../test/shared/moveValidator.test.ts):
  edge-aware path cost, blocked path, reverse traversal, mixed routes,
  allowance-bounded `NO_PATH`, and validation/pathfinder parity. Do not require
  a `prohibited-edge` detail.
- Client reachable-hex coverage for
  [web/lib/battlefieldInteraction/movement.ts](../../web/lib/battlefieldInteraction/movement.ts):
  highlighted hexes match the shared planner when an edge is an obstacle or a
  class penalty.
- [test/server/engine/movement.test.ts](../../test/server/engine/movement.test.ts):
  authoritative adapter behavior and preservation of edge data. Class-owned
  `canRam` covers every Onion unit type that can be moved, not only the
  `TheOnion` type id.
- [test/shared/combatCalculator.test.ts](../../test/shared/combatCalculator.test.ts),
  [test/shared/staticRules.test.ts](../../test/shared/staticRules.test.ts), and
  [test/web/lib/pure/combatPreview.test.ts](../../test/web/lib/pure/combatPreview.test.ts):
  ridge and stream add no combat modifier. Remove the old ridgeline-cover
  parity fixture.
- Scenario parsing, API projection, snapshot validation, and response contract
  tests: canonical edges round-trip; malformed and legacy shapes fail as
  specified.
- [test/web/components/HexMapBoard.test.tsx](../../test/web/components/HexMapBoard.test.tsx)
  and [test/web/components/HexMapCell.test.tsx](../../test/web/components/HexMapCell.test.tsx):
  edge geometry, duplicate suppression, visual stacking, and pointer behavior.

Follow the repository testing policy: run focused Vitest files first, then the
relevant regression suite and `pnpm exec tsc --noEmit`. No tests were run for
this investigation document.

## Implementation Plan: Phases And Tasks

Each phase should finish with its stated acceptance checks before the next
phase changes the dependent layer. Phase 1 is a required documentation gate:
implementation should not begin from an undocumented or contradictory rule.

### Phase 1: Extract Rules Into Source Documentation (Complete)

**Phase status:** Complete. The authoritative gameplay, scenario-authoring,
ownership, AI, and web presentation documents were updated and validated. The
remaining phases are implementation work and are not implied by this status.

Record the rules introduced by this change in the documents that own those
rules. Keep this work item as the implementation plan and decision record; do
not make it the only place where gameplay behavior is documented.

Tasks:

- Update `docs/game-rules.md` with the approved unit-class taxonomy and the
  class-owned attributes: mobility, `isArmor`, edge and whole-hex terrain
  behavior, second-move behavior where applicable, and ramming capabilities
  and outcome profiles.
- Replace the old whole-hex ridge movement and cover rules in
  `docs/game-rules.md` with the undirected ridge-edge and stream-edge rules,
  including the Light Armor surcharge formula and allowance-bounded
  `NO_PATH` behavior.
- Record that ridges and streams do not affect fire, that ridgeline cover is
  removed, and that class rules are resolved through `RulesContext`.
- Update `docs/scenario-schema.md` with the authored `edges` shape, endpoint
  validity rules, canonical endpoint and edge-array ordering, optional-authored
  versus required-runtime `edges`, contiguous whole-hex codes, and the scenario
  validator command.
- Update the relevant ownership and presentation guidance: the movement and
  map-contract rows in `docs/agent-start-here.md`, the stale ridgeline-cover
  statement in `docs/ai-opponent-strategy.md`, and the named battlefield and
  unit-presentation specifications for edge sprites and transparent dynamic
  overlays.
- Remove or revise every contradictory statement found by a targeted search
  for `ridgeline`, `terrain cover`, old whole-hex terrain codes, and the old
  Onion ridge surcharge.

Acceptance checks:

- `docs/game-rules.md` is the authoritative gameplay summary and contains no
  obsolete whole-hex ridge or ridgeline-cover rule.
- `docs/scenario-schema.md` is the authoritative authoring contract and agrees
  with the runtime edge contract in this work item.
- The ownership router points implementers to the actual shared, server, and
  web owners without duplicating rule definitions.

### Phase 2: Build The Class-Rule Foundation

**Task 2.1 status:** Complete. PascalCase class identifiers, the typed
immutable class-rule table, and required catalog class assignments are in
place.

**Task 2.2 status:** Complete. Movement, ramming, unit-state, combat,
scenario-definition, and initial-state normalization callers now resolve
class-owned behavior through `RulesContext`. The duplicated per-unit ability
fields and `ramsPerTurn` catalog/scenario metadata were removed, catalog
parsing rejects those legacy fields, and ridgeline combat modifiers were
removed. Focused tests, the full regression suite (1,797 tests), TypeScript,
and ESLint pass; ESLint reports three warnings from generated coverage output
and no errors.

Tasks:

- Add stable class identifiers and a class-rule table to the shared catalog and
  types. Include mobility, `isArmor`, second-move capability when class-wide,
  terrain access and surcharge rules, ram attacker capability, ram capacity and
  per-turn limits, and rammed-target outcomes.
- Resolve class rules through `RulesContext`, including the global fallback
  context. Preserve unit-specific movement allowance, defense, weapons, and
  presentation metadata on unit definitions.
- Make scenario-derived unit types inherit their base class and reject class
  overrides. Remove duplicated per-unit `terrainRules`, `ramProfile`, and
  `isArmor` rule ownership.
- Replace type-id checks such as `unitType === 'TheOnion'` with class-rule
  lookups. Verify the Onion unit receives its capabilities through the Onion
  class.
- Update movement, unit-state, ramming, combat, and scenario-definition callers
  and tests to use the class boundary.

Acceptance checks:

- Every catalog unit type resolves to exactly one approved class.
- Class values and behavior remain available for namespaced scenario-derived
  types.
- Ramming, immobility, armor checks, and GEV second moves have no remaining
  type-id or duplicated class-rule authority.

### Phase 3: Add Canonical Edge Schema And Materialization

Tasks:

- Add authored and runtime edge types to `server/engine/scenarioSchema.ts`,
  `shared/scenarioMap.ts`, and the scenario materialization path.
- Validate endpoint membership, distinctness, adjacency, canonical ordering,
  duplicate pairs, conflicting terrain kinds, and supported edge terrain kinds.
- Use contiguous whole-hex codes (`0` clear, `1` crater, `2` The Swamp),
  convert old ridge terrain to explicit edges when updating scenario files, and
  normalize omitted authored `edges` to an empty runtime array. Edge types are
  a separate terrain class from whole-hex numeric codes.
- Carry edges through the engine `GameMap`, movement map snapshots, API
  `ScenarioMapSnapshot`, state projection, action responses, and the web map
  type. Keep stored snapshots read-only and pre-vetted.
- Update `scripts/validate-scenario.ts` and shared parser errors so malformed
  edge records identify the edge path and violated rule. Game creation must use
  the same parser and throw a detailed `ScenarioValidationError`.

Acceptance checks:

- Valid compact and explicit scenarios materialize the same canonical edge
  shape, including `edges: []` when no features are authored.
- Invalid or unsorted endpoint pairs and unsupported whole-hex codes fail
  validation with useful detail; no code path repairs or infers them.
- Canonical edges survive API projection, engine-map construction, and snapshot
  validation without being dropped.

### Phase 4: Implement Shared Edge-Aware Movement

Tasks:

- Add canonical edge lookup by normalized endpoint pair and use it for both
  traversal directions.
- Update `movePlanner.ts` reachable-move and pathfinding algorithms to combine
  edge surcharge with destination whole-hex entry cost, while treating
  prohibited edges and craters as impassable.
- Update `moveValidator.ts` to use the same planner inputs and define
  `NO_PATH` strictly as no path within the remaining movement allowance. Keep
  `MOVE_INVALID` and do not add an edge-specific error code or message.
- Update the engine movement adapter to preserve edges and pass the shared
  edge-aware map to authoritative validation and execution.
- Verify reverse traversal, mixed ridge/stream routes, occupancy, stacking,
  ramming, and GEV second-move allowance all use the same edge semantics.
- Update client movement preparation and reachable-hex highlighting to call the
  same shared edge-aware planner; an ineligible destination must not light up.

Acceptance checks:

- Client reachable hexes and server validation agree for every class in the
  approved matrix.
- Light Armor pays `1 + 1` MP across a stream into clear terrain; ridge
  barriers and allowance limits produce ordinary `NO_PATH` failures.
- All focused planner, validator, engine movement, and client movement tests
  pass.

### Phase 5: Complete Snapshot And API Contract Propagation

Tasks:

- Make `edges` required in the canonical shared and web snapshot types and
  snapshot validation. Preserve the empty-array contract.
- Update scenario API projection, game-state projection, action responses,
  WebSocket snapshots, and transport fixtures so no response path drops edges.
- Keep `shared/protocolSchemas.ts` and the passthrough response boundaries
  consistent with the canonical map contract without adding compatibility
  inference.
- Add malformed, missing-edge, legacy-shape, and round-trip contract tests at
  the scenario, API, transport, and web snapshot boundaries.

Acceptance checks:

- A fresh snapshot contains canonical `edges` in REST and WebSocket delivery.
- Missing or malformed runtime edge data fails the designated snapshot
  validation boundary clearly.
- No old-game translation or automatic database deletion exists.

### Phase 6: Render Static Edge Terrain And Dynamic Overlays

Tasks:

- Add ridge and stream edge sprite assets under the web terrain asset path,
  with one rotatable sprite per terrain kind and six supported edge facings.
- Add pure geometry helpers based on `hexPixelLayout.ts` to derive shared edge
  segments and rotation. Render each canonical edge once in a board-level layer.
- Render static content in this order: base map, whole-hex terrain, edge
  terrain, then unit sprites. Keep edge sprites non-interactive.
- Move movement and firing-range marks into a transparent top layer above unit
  sprites. Removing that layer must leave terrain, edges, and sprites unchanged.
- Remove whole-cell ridge presentation and preserve existing unit selection,
  escape, and state overlays unless their stacking requires an explicit local
  adjustment.

Acceptance checks:

- Each edge appears once at the correct facing for all six axial directions.
- Ridge and stream assets remain visually distinguishable without relying on
  color alone.
- Dynamic overlays are transparent, removable, and do not intercept clicks or
  mutate the underlying map graphics.
- Focused geometry, board, cell, and screenshot-level rendering tests pass.

### Phase 7: Remove Obsolete Combat Terrain Behavior

Tasks:

- Remove ridgeline defense multipliers and the Little Pigs terrain-cover
  capability from `shared/staticRules.ts`, `shared/combatCalculator.ts`, and
  related rule types.
- Ensure combat from, across, or onto ridge and stream edges receives no
  terrain modifier. Edge terrain must not enter line-of-fire or target-rule
  calculations.
- Update combat preview, parity fixtures, server combat tests, and static-rule
  tests to the clarified behavior.

Acceptance checks:

- Shared combat odds, server combat, and web preview agree with no ridge or
  stream modifier.
- No stale ridgeline-cover fixture or static rule remains.

### Phase 8: Update Scenario Fixtures And Validation Coverage

Tasks:

- Redesign every scenario JSON loaded by unit, integration, or end-to-end tests
  so ridge and stream features use valid canonical edges; remap crater `t=2`
  to `t=1` and swamp `t=3` to `t=2`.
- Add focused invalid fixtures for non-adjacent, out-of-map, reversed,
  out-of-order, duplicate, conflicting edge records, and unsupported
  whole-hex terrain codes.
- Run `pnpm scenario:validate` against every updated scenario file and retain
  the validator as a development gate.
- Verify scenario preflight, game creation, and normalized deployment tests
  still cover the updated maps and required `edges` field.

Acceptance checks:

- Every test scenario passes the validator before the game/API suites run.
- No test fixture depends on legacy whole-hex ridge behavior.
- Scenario placement changes preserve the intended test purpose, especially
  movement barriers, streams, combat fixtures, and victory objectives.

### Phase 9: Regression, Rollout, And Cleanup

Tasks:

- Run focused tests for each changed phase, then the relevant regression suite,
  `pnpm exec tsc --noEmit`, and the scenario validator over all test maps.
- Search for stale whole-hex ridge assumptions, old terrain-cover wording,
  dropped map-edge fields, and type-id class checks.
- Confirm the manual rollout prerequisite: existing game rows are deleted by
  the user before any new game starts. Do not add deletion or migration logic.
- Update this work item with the completed implementation status, final source
  locations, and any residual test limitations.

Acceptance checks:

- Focused tests, broader regression tests, typecheck, and scenario validation
  pass, or any unrelated pre-existing failure is recorded.
- A fresh game can load a vetted edge-bearing scenario and round-trip its map
  through the authoritative server and web client.

## Recommendation

**Proceed with one edge-terrain and class-rules foundation, but keep forest
mechanics out of scope.** Ridge and stream movement rules, unit classes,
endpoint representation, combat behavior, validation, edge sprites, and overlay
order are specified. Update the scenarios the tests load. The user deletes
existing game rows before starting new games; no compatibility translation is
in scope.

Implementation constraints:

- Keep class mobility, terrain, ram, and `isArmor` rules centralized and
  resolved through `RulesContext`, including its global fallback.
- Require runtime snapshots to carry `edges`, even when empty.
- Use allowance-bounded `NO_PATH` under `MOVE_INVALID`. Do not add an
  edge-specific error detail or explanation.
- Do not translate old games or old ridge hexes. The user deletes existing
  game rows before new games start. Test scenarios are updated in this work
  and must pass `pnpm scenario:validate`.
- Reject non-canonical endpoint order at validation time. Do not sort it on
  game start or snapshot read.
