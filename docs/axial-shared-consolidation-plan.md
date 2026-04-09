# Axial Shared Consolidation Plan

**Status: Completed (April 2026)**

## Purpose

This document is the plan of record for steps 1, 2, and 3 of the axial consolidation.

The target architecture is:

- one coordinate system: axial
- one authoritative shared implementation for each shared hex behavior
- backend and app both call the same shared axial functions
- offset-era logic is removed rather than preserved

This phase covers shared and backend-facing consolidation first. The app migration to shared axial modules happens only after backend regression is green.

## Phase Scope

This phase includes:

1. Establish a single authoritative shared axial hex-primitives module.
2. Make the shared movement planner consume that shared axial module.
3. Remove deprecated offset-era shared logic and tests.

This phase does not include the final app import migration. That is a later step once backend/shared regression passes.

## Target Shared Surface

### Shared Axial Primitives

Create a new shared module:

- src/shared/hex.ts

This module becomes the authoritative location for shared coordinate primitives.

Authoritative exports:

- HexPos
- hexKey
- hexDistance
- getNeighbors
- hexesWithinRange

Rules:

- axial only
- no row-parity logic
- no offset conversion helpers
- no rendering helpers

### Shared Movement Planner

Keep the movement planner in:

- src/shared/movePlanner.ts

Authoritative exports:

- findMovePath
- listReachableMoves

Rules:

- consumes src/shared/hex.ts for coordinate primitives
- contains no offset-era neighbor logic
- remains the single shared movement-planning implementation used across clients

## Ownership Boundaries

### Shared Layer

Shared layer owns:

- coordinate primitives used by both backend and app
- shared movement planning

### Engine Layer

Engine layer continues to own engine-specific map behavior in src/engine/map.ts:

- createMap
- getHex
- movementCost
- hasLineOfSight
- findPath

Engine-specific code may import or re-export shared primitives, but should not keep separate copies of shared coordinate logic.

### Web Layer

Web layer should keep only presentation-specific hex helpers in web/src/lib/hex.ts:

- axialToPixel
- hexCorners
- pointsToString
- boardPixelSize

Web layer should not keep its own shared-style coordinate math or movement planning once migration is complete.

## Function Migration Table

### New Shared Module: src/shared/hex.ts

Add:

- HexPos
- hexKey
- hexDistance
- getNeighbors
- hexesWithinRange

### Existing Module: src/shared/movePlanner.ts

Keep here:

- findMovePath
- listReachableMoves

Refactor:

- replace local neighbor logic with shared getNeighbors
- consume shared hexKey if practical in the same pass
- keep terrain and occupancy rules local to move planning

### Existing Module: src/engine/map.ts

Keep here:

- createMap
- getHex
- movementCost
- hasLineOfSight
- findPath

Deprecate local ownership of:

- hexDistance
- getNeighbors

Action:

- import from src/shared/hex.ts or re-export from there

### Existing Module: src/api/integration.helpers.ts

Deprecate local ownership of:

- getNeighbors

Action:

- replace local helper with shared getNeighbors
- keep scenario/test orchestration logic local

### Existing Module: web/src/lib/hex.ts

Keep here:

- axialToPixel
- hexCorners
- pointsToString
- boardPixelSize

Deprecate from this file:

- hexKey
- hexDistance
- hexesWithinRange

Action later:

- move app callers of shared-style coordinate helpers onto src/shared/hex.ts

### Existing Module: web/src/lib/axialMovePlanner.ts

Deprecate entire file.

Action later:

- move callers onto src/shared/movePlanner.ts
- delete file after app tests are green on shared planner

## Deprecations

### Immediate Shared/Backend Deprecations

Remove:

- any offset-era or parity-based neighbor logic in src/shared/movePlanner.ts
- any shared tests that exist only to preserve legacy parity-based adjacency semantics

### Backend Duplication Deprecations

Deprecate duplicate shared coordinate ownership in:

- src/engine/map.ts: hexDistance
- src/engine/map.ts: getNeighbors
- src/api/integration.helpers.ts: local getNeighbors helper

### App Duplication Deprecations

Deprecate after backend/shared is green:

- web/src/lib/axialMovePlanner.ts
- web/src/lib/hex.ts: hexKey
- web/src/lib/hex.ts: hexDistance
- web/src/lib/hex.ts: hexesWithinRange

## Test Plan

### Add

Create a new shared test file:

- src/shared/hex.test.ts

Cover:

- distance symmetry
- distance on all six axial neighbors
- neighbor set contents
- range generation via hexesWithinRange

### Keep and Update

Keep as authoritative movement-planner spec:

- src/shared/movePlanner.test.ts

Update to:

- assert only axial neighbor expectations
- remove stale offset-era expectations

### Backend Regression Gate

Run and keep green before app migration:

- src/shared/hex.test.ts
- src/shared/movePlanner.test.ts
- src/engine/movement.test.ts
- src/api/games.actions.move.test.ts
- src/api/integration.test.ts
- src/engine/map.test.ts as needed for any import or re-export changes

### App Tests Affected Later

Likely rewrite or redirect after app migration:

- web/src/test/lib/pure/hex.test.ts

These should eventually target the shared axial behavior, not a duplicate web-owned implementation of shared math.

## Execution Order

1. Create src/shared/hex.ts.
2. Add src/shared/hex.test.ts.
3. Refactor src/shared/movePlanner.ts to consume shared axial primitives.
4. Convert and clean src/shared/movePlanner.test.ts to axial-only expectations.
5. Remove all remaining offset-era shared logic and deprecated shared tests.
6. Update backend-side duplicate helpers to consume shared primitives.
7. Run backend regression suite until green.
8. Only then move app imports from web-local duplicated implementations onto shared axial modules.

## Done Criteria For Steps 1-3

This phase is complete when:

- src/shared/hex.ts exists and is the single authoritative shared axial primitive layer
- src/shared/movePlanner.ts uses shared axial primitives
- no offset-era logic remains in shared modules
- deprecated shared tests are removed or rewritten
- backend regression suite is green

Only after those conditions are met should the app migration onto shared axial modules begin
