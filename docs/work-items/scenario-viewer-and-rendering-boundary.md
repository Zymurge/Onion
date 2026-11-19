# Scenario Viewer And Rendering Boundary

## Status

Proposed. This work is a two-phase visual foundation for a future scenario editor.
It does not add scenario editing, drag and drop, transport, match creation, or
transport-backed unit interaction.

## Purpose

Create a read-only visual scenario viewer that renders a scenario's complete
starting state: materialized map, whole-hex terrain, edge terrain, all starting
units, starting stack groups, and scenario-specific unit presentation.

Use the viewer as a learned prototype for extracting a render-only map and unit
boundary from the current battlefield. The extraction will follow the prototype,
then the production game will move onto that boundary before the viewer is
updated to the durable implementation.

## Scope Boundary

In scope:

- Browser-loaded scenario JSON.
- Read-only display of a complete starting state.
- Reuse of the existing unit and terrain assets.
- A temporary viewer implementation that is allowed to simplify the battlefield.
- A follow-on render-boundary extraction for production reuse.
- Focused tests for loading, projection, rendering, and game visual parity.

Out of scope:

- Drag and drop.
- Editing terrain or unit deployments.
- Saving or exporting scenario files.
- Match creation or join behavior.
- Server-authoritative game actions from the viewer.
- Live updates or game transport.
- Full accessibility, keyboard editing, undo/redo, or editor history.
- Making the viewer the final source of truth for normalizers or stack identity.

## Current Rendering Surface

The current presentation path is coupled to game behavior:

- `web/components/HexMapBoard.tsx` owns SVG map rendering, zoom, movement
  reachability, combat ranges, selection, interaction routing, stack projection,
  and occupancy.
- `web/components/HexMapCell.tsx` mixes whole-hex terrain rendering with unit
  marker, selection, and interaction rendering.
- `web/components/HexMapUnitMarker.tsx` both resolves presentation data and
  routes game interactions.
- `web/lib/hexMapOccupancy.ts` builds battlefield occupancy projections.
- `shared/scenarioMap.ts` is the browser-safe authoritative materializer for
  authored map geometry and edge terrain.
- `shared/unitDefinitions.ts`, `shared/unitSpriteManifest.ts`, and
  `web/lib/unitSpriteRegistry.ts` own resolved unit presentation assets.
- `server/engine/scenarioNormalizer.ts` owns match-start runtime units, IDs,
  weapons, treads, and stack membership. The viewer must not duplicate this
  normalizer as a second runtime-source implementation.

## Design Decisions

1. Phase 1 is a temporary, read-only viewer. It may fork or reduce battlefield
   code if that is the fastest way to discover the shared rendering contract.
2. Phase 1 must not add hidden compatibility inference or silent fallback
   behavior for invalid scenarios. Missing or malformed required data should
   fail visibly.
3. Terrain is displayed from the authored/materialized scenario map, not from
   a generated match snapshot.
4. Starting units are projected from authored deployments for presentation.
   Authored deployment keys are presentation and future-editor identity, while
   normalized runtime unit IDs are game-match identity.
5. Stack-group deployments are shown once with their authored count and stable
   future-editor identity. They are not expanded into fabricated runtime unit
   IDs in the viewer.
6. The durable boundary must separate resolved visual props from interaction
   callbacks. Rendered components do not know phase, combat eligibility,
   movement legality, or editor mutation rules.
7. The production game remains server-authoritative. The viewer is an initial
   state projection and must never imply that client modifications are committed.

## Shared Presentation Contract

The durable implementation should converge on render props that are independent
of game mode:

```ts
MapPresenterModel {
  width: number
  height: number
  cells: ReadonlyArray<{ q: number; r: number }>
  hexes: ReadonlyArray<{ q: number; r: number; t: number }>
  edges: ReadonlyArray<ScenarioTerrainEdge>
}

UnitPresenterModel {
  identity: string
  position: { q: number; r: number }
  role: 'onion' | 'defender'
  typeId: string
  label: string | null
  spriteKey: string | undefined
  status: 'operational' | 'disabled' | 'recovering' | 'destroyed'
  count?: number
  selected?: boolean
}

MapInteractionHooks {
  onUnitPrimary?: (identity: string, event: unknown) => void
  onUnitSecondary?: (identity: string, event: unknown) => void
  onHexPrimary?: (position: { q: number; r: number }, event: unknown) => void
  onHexDrop?: (identity: string, position: { q: number; r: number }) => void
}
```

The exact type names and event types are implementation decisions. The contract
must remain independent of match phase, player role, legal-move lists, and
scenario mutation policy.

## Phase 1: Temporary Read-Only Scenario Viewer

### Phase 1 Tasks

#### T1. Add a standalone viewer entry point

Add a browser entry that is separate from authenticated game orchestration.
Prefer a second Vite HTML entry and viewer component pair over installing viewer
logic into `App.tsx` or `GameSessionController`.

The viewer shell owns only:

- Scenario selection.
- Local scenario-file loading.
- Loading/error presentation.
- Presentation zoom and viewport sizing.

The shell must not contain transport, match lifecycle, snapshot refresh, or game
commit behavior.

#### T2. Load and materialize scenario JSON

Support:

- A built-in list of repository scenarios for local development.
- A local JSON file selected with a browser file input.

For each scenario:

1. Parse the top-level JSON object.
2. Reject malformed JSON and invalid required scenario fields visibly.
3. Materialize the map with `materializeScenarioMap`.
4. Project authored deployments into read-only presenter units.
5. Resolve scenario-derived unit presentation fields without running match
   normalization or engine mutation.

The implementation may initially reuse `resolveScenarioDefinitions` or extract a
small browser-safe projection boundary. It must not import server logger,
Fastify, database, or match-persistence code into the viewer bundle.

#### T3. Implement a read-only map scene

Create the smallest temporary scene needed to verify full starting-state
rendering:

- Render materialized axial cells.
- Render whole-hex terrain and edge terrain sprites.
- Render coordinates where useful for scenario authoring.
- Render every starting Onion and Defender deployment.
- Render stack-group deployments once with the authored count.
- Reuse `getUnitSpriteHref`, `resolveHexMapSpriteLayout`, terrain assets, and
  edge terrain geometry/asset registries.
- Apply initial status presentation from authored deployment status.
- Apply map-only label abbreviations through the existing presentation rules.

A neutral placeholder is acceptable for T3 where a unit is visually reduced or
not yet fully scenario-aware, but unknown sprite keys or invalid deployment
types must not silently become valid content.

#### T4. Add the minimal viewer test contract

Add component tests for:

- Materialized compact rectangle/scenario map rendering.
- Whole-hex terrain.
- Ridge and stream edges.
- At least one Onion deployment.
- Individual Defender deployments.
- Stack-group deployment count/presentation.
- Scenario-derived unit sprite/scale metadata.
- Malformed JSON and invalid deployment/type feedback.

Tests must identify cells and units with stable coordinates and authored
deployment keys, not CSS classes or visible copy.

Add one browser smoke test for a real scenario if a viewer entry exists and can
run in the repository's existing Playwright setup.

### Phase 1 Doneness

Phase 1 is done when all of these are true:

- A local viewer entry can open without game authentication or a match snapshot.
- The Onion Ring III scenario, and at least one other real scenario, can be
  selected and visually rendered.
- A local JSON file can be loaded and rendered or rejected without a server.
- The complete starting terrain and every starting deployment are visible.
- Edge terrain and whole-hex terrain use the existing asset paths and geometry.
- Stack groups use a single stable presentation marker and display their count.
- Scenario-derived unit types use resolved sprite and map-presentation metadata.
- Invalid JSON or scenario shape has visible error output and no partial board.
- Focused viewer tests pass.
- The implementation does not create or mutate a game match.
- The prototype's hard-wired dependencies are documented as follow-up boundaries
  for the Phase 2 extraction.

## Phase 2: Durable Render Boundary Extraction

### Phase 2 Tasks

#### E1. Extract read-only map presentation

Separate the static base map from current game overlays. The shared scene should
render the materialized map and deployment presenter models without requiring
`BattlefieldActionEligibility`, phase, or game session state.

#### E2. Extract a reusable unit marker

Move the render-only unit glyph contract out of `HexMapUnitMarker` into a shared
presentation component or equivalent. Keep interaction outside it.

Game-specific state may still use the host to add classes, overlays, and
selection. The renderer receives enough resolved visual data to show the unit
without deciding whether it is eligible or legal to act.

#### E3. Add interaction hooks

Add optional callbacks for unit and hex pointer actions. The callbacks receive
stable authored or runtime identity according to the host mode.

Game hosts must continue to own:

- Selection policy.
- Movement/candidate generation and validation.
- Combat targeting.
- Interaction routing.
- Server commit behavior.

Editor hosts must later own:

- Selection and drag state.
- Hex/drop validation.
- Scenario mutation.
- Save/export behavior.

#### E4. Adapt the production game

Replace the game's battlefield rendering dependencies with the extracted scene
and marker while preserving existing phase, selection, stack, movement, combat,
zoom, and overlay behavior. The extraction must not change the authoritative
snapshot, engine, or API.

#### E5. Upgrade the viewer to shared components

Remove the temporary viewer's forked map and marker rendering. Replace it with
only the shared scene plus viewer projection and host callbacks.

#### E6. Add parity and migration tests

Tests must prove:

- Shared map and unit presentation renders terrain and assets identically for
  game and viewer hosts.
- Both hosts can supply no-op or host-specific interaction callbacks.
- Production game behavior and visual snapshots remain unchanged.
- Existing unit marker, stack, edge terrain, zoom, and inspector tests continue
  to pass.
- The viewer has no game interaction routing or transport dependency.

### Phase 2 Doneness

Phase 2 is complete only after Phase 1 is stable and the following are true:

- The game battlefield uses the extracted shared scene and marker without losing
  current behavior.
- The viewer uses the same scene and marker as the game instead of forked code.
- Rendering props contain resolved visual state, not game phase or legality.
- Interaction is supplied by optional host callbacks and can be absent.
- Existing `pnpm test`, focused web tests, and relevant typecheck/build gates
  pass.
- The full regression suite contains no false visual behavior because of the
  temporary viewer or shared extraction.
- No scenario snapshot or match transport is required by the viewer.
- Editor drag and drop remains outside this phase.

## Test And Validation Plan

- TDD first for presenter projection and read-only component behavior.
- Component tests for the viewer and shared renderer only; no mocked transport.
- Pure tests for scenario-to-presenter projection and scenario-derived visual
  metadata resolution.
- Existing `HexMapUnitMarker`, `HexMapCell`, `HexMapBoard`, and unit-presentation
  tests provide the production parity baseline.
- Run focused Vitest files first.
- Run `pnpm test` for the default regression suite.
- Run `pnpm exec tsc --noEmit` and `pnpm --dir web build` for TypeScript and web
  bundle changes.
- Run relevant integration or browser smoke coverage if the viewer entry is
  included in Playwright configuration.

## Agent-Sized Task Granularity

Each implementation PR or task should stop at one boundary:

- Viewer entry and shell.
- Scenario loading and validation.
- Scenario-to-presenter projection.
- Temporary map scene.
- Temporary unit rendering.
- Viewer tests.
- Shared map extraction.
- Shared marker extraction.
- Optional interaction hook adaptation.
- Production game migration.
- Viewer migration.
- Full parity and regression validation.

Do not combine terrain extraction with viewer transport work or combine game
battlefield migration with drag/drop editor behavior.

## Deferred Phase: Visual Scenario Editor

A later work item will add:

- Editing tools and sidebars.
- Terrain painting and edge painting.
- Deployment selection and editing.
- Drag and drop.
- Unit and stack creation/removal.
- Scenario JSON save/export and validation feedback.
- Undo/redo and draft history.
- Keyboard and accessibility workflows.

Those features are deferred until the shared rendering boundary and both hosts
are stable.

## References

- [Scenario schema](../scenario-schema.md)
- [Web unit presentation specification](../web-ui/unit-presentation-spec.md)
- [Testing strategy](../testing-strategy.md)
- [Agent start here](../agent-start-here.md)
