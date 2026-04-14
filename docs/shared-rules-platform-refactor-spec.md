# Shared Rules Platform Refactor Spec

**Status: Complete (April 2026)**

Status: Phase 4 complete
Date: 2026-04-13
Branch: `feature/shared-rules-platform-refactor`

## Purpose

Treat the following three todo items as one rules-platform update rather than three unrelated tasks:

1. externalize unit and weapon definitions so they can move cleanly to a shared data file or schema later
2. collapse movement profiles, pathfinding, terrain-entry rules, cover rules, and stacking rules into one shared rules model
3. add a standalone shared ramming calculator that consumes the same unit capability data

The current codebase already has part of this shape in `shared/unitDefinitions.ts`, `shared/engineTypes.ts`, `shared/movePlanner.ts`, `shared/unitMovement.ts`, and `shared/combatCalculator.ts`, but movement and ramming still depend on duplicated or hardcoded rule surfaces in engine code.

## Current Problems

1. Unit definitions are duplicated between `shared/unitDefinitions.ts` and `server/engine/units.ts`.
2. Movement allowances and mobility flags are duplicated in `shared/unitMovement.ts` via `MOVEMENT_PROFILES` instead of being derived from shared unit definitions.
3. `shared/movePlanner.ts` still hardcodes terrain costs, traversal, and Little Pigs stacking logic instead of asking a shared rule source.
4. `server/engine/movement.ts` still duplicates destination-stacking checks and hardcodes ramming outcomes in `calculateRamming`.
5. Combat already consumes shared definitions, so movement and ramming now lag behind the combat seam and increase the chance of rule drift.

## Goals

1. Make one shared static rules bundle the canonical source for unit, weapon, terrain, targeting, movement, stacking, cover, and ram-profile data.
2. Move rule interpretation into pure shared helpers so engine and UI can consume the same behavior.
3. Remove engine-local copies of unit definitions and movement profiles.
4. Keep the resulting rule model shaped so it can later be serialized to JSON or validated against a schema with minimal churn.
5. Keep the first refactor behavior-preserving unless a test explicitly documents an intended rules change.

## Non-Goals

1. No immediate switch to loading rules from external JSON files at runtime.
2. No broad scenario-format migration beyond what is needed to reference shared rule ids cleanly.
3. No redesign of combat resolution beyond wiring it to the consolidated rule source when useful.
4. No UI feature expansion outside the seams needed to consume the new shared helpers.

## Target Architecture

The major update should leave the rules stack in four layers.

### 1. Static Rule Data

Responsibilities:

1. declare unit and weapon definitions
2. declare terrain interaction metadata
3. declare ram profiles and stack limits
4. declare target restrictions and any other static capability flags

Suggested modules:

1. `shared/unitDefinitions.ts` as the canonical source, or a small `shared/rules/` folder if the file becomes too large
2. `shared/engineTypes.ts` as the stable type contract for rule data

### 2. Shared Rule Queries

Responsibilities:

1. derive movement allowance by phase from static rule data
2. answer terrain-entry and cover questions from unit and terrain definitions
3. answer traversal and stopping legality from stack rules and occupant mix
4. expose a small, reusable API for movement planning and move validation

Suggested modules:

1. `shared/unitMovement.ts` narrowed so it derives from canonical definitions instead of `MOVEMENT_PROFILES`
2. new `shared/movementRules.ts` for terrain, traversal, stopping, and stack-limit decisions

### 3. Pure Shared Calculators

Responsibilities:

1. movement pathfinding through `shared/movePlanner.ts`
2. combat math through `shared/combatCalculator.ts`
3. ramming outcomes through a new `shared/rammingCalculator.ts`

Rule: these modules should consume static rules and shared query helpers, not embed rule tables.

### 4. Engine Adapters

Responsibilities:

1. build live state snapshots for the pure shared calculators
2. mutate authoritative game state after a validated result is returned
3. emit API- and event-facing errors using the engine's existing result contracts

Primary affected engine modules:

1. `server/engine/units.ts`
2. `server/engine/movement.ts`
3. `server/engine/combat.ts`

## Proposed Implementation Shape

### Shared Static Rules Bundle

Introduce one exported bundle that groups the canonical static data the calculators need.

Minimum shape:

1. `unitDefinitions`
2. `terrainRules`
3. optional future metadata for scenario or weapon categories if needed later

That bundle should be stable enough to serialize later, even if it is still authored in TypeScript for now.

Canonical boundary:

1. `shared/staticRules.ts` is the current bundle-of-record
2. `ONION_STATIC_RULES` is the export consumers should depend on when they need canonical static gameplay rules
3. the bundle currently includes unit definitions and terrain rules only
4. future serialization work should transform this bundle, not rebuild equivalent rules from engine modules

Serialization contract:

1. static bundle content may describe unit stats, terrain interactions, stack limits, target restrictions, and ram profiles
2. static bundle content must not include live game state such as positions, statuses, spent movement, or phase progression
3. pure shared calculators may depend on the bundle directly
4. engine modules should adapt live state into calculator inputs and apply outputs, but not redefine static rules

### Shared Movement Rules API

Add a pure rules-query layer that owns questions like:

1. how much movement allowance does this unit have in this phase
2. can this unit enter or cross this terrain
3. can this unit benefit from terrain cover
4. can this unit traverse an occupied hex
5. can this unit stop on an occupied hex
6. what is the max stack size for this unit type

This should absorb the hardcoded logic currently split across `shared/unitMovement.ts`, `shared/movePlanner.ts`, and `server/engine/movement.ts`.

### Shared Ramming Calculator

Add a pure calculator that resolves ramming from static rule data plus a supplied die roll.

Minimum responsibilities:

1. derive tread cost from the rammed unit's rule profile
2. derive destroyed versus surviving outcome from the same profile
3. return a result shape the engine can apply without reinterpreting the rules

The engine should stop deciding ramming behavior with local `if` chains.

## Migration Plan

### Phase 0: Freeze Spec And Tests

Deliverables:

1. this spec
2. updated todo grouping the work as one major update
3. red tests that pin the shared movement and ramming contracts before implementation changes

Exit criteria:

1. the canonical ownership split is explicit
2. the first failing tests cover the new shared seams, not only engine wrappers

### Phase 1: Canonicalize Static Rule Data

Status: Complete on 2026-04-13

Deliverables:

1. remove duplicated unit-definition literals from `server/engine/units.ts`
2. have engine exports re-export or adapt the shared definitions instead of owning a second copy
3. add any missing terrain and ram-profile metadata required by movement and ramming

Exit criteria:

1. there is only one authored source of unit and weapon stats
2. combat and engine helpers consume the same definition objects or a shared clone of them

### Phase 2: Consolidate Movement Rule Queries

Status: Complete on 2026-04-13

Deliverables:

1. derive `shared/unitMovement.ts` behavior from canonical definitions
2. extract occupancy, stack, terrain-entry, and cover checks into shared rule-query helpers
3. update `shared/movePlanner.ts` to depend on those helpers rather than hardcoded unit names or terrain cost branches
4. remove duplicated destination-stacking logic from `server/engine/movement.ts`

Exit criteria:

1. movement legality decisions come from one shared rule layer
2. engine movement is mostly orchestration plus state mutation

### Phase 3: Extract Shared Ramming Calculator

Status: Complete on 2026-04-13

Deliverables:

1. create `shared/rammingCalculator.ts`
2. move tread-cost and destroy-survive logic out of `server/engine/movement.ts`
3. update movement execution and API tests to consume the shared calculator result

Exit criteria:

1. ramming outcome rules are expressed in static data plus one pure calculator
2. engine movement does not contain rule-specific ram tables

### Phase 4: Schema-Ready Cleanup

Status: Complete on 2026-04-13

Deliverables:

1. normalize any remaining rule shapes that still depend on engine-specific state objects
2. document the canonical static rules bundle and its intended serialization boundary
3. remove leftover compatibility shims if they are no longer needed

Exit criteria:

1. the static rules model is ready to move into external data files later without another major ownership refactor

## TDD Plan

The implementation should follow red-green-refactor in small slices.

Recommended test order:

1. add or update pure tests for shared rule queries first
2. add or update pure tests for `shared/movePlanner.ts` consuming those queries
3. add pure tests for the new shared ramming calculator
4. then update engine movement tests and API tests to prove the engine is only adapting shared results

## Actionable Checklist

- [ ] Add focused red tests for rule-query helpers derived from canonical unit definitions
- [x] Remove duplicated unit definitions from `server/engine/units.ts`
- [x] Replace `MOVEMENT_PROFILES` with definition-derived movement queries
- [x] Extract shared occupancy and stack rules out of `shared/movePlanner.ts`
- [x] Update engine movement validation to use shared movement-rule queries
- [x] Add a pure shared ramming calculator and migrate engine movement to it
- [x] Document the final canonical static rules bundle and schema-ready boundary