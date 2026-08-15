# Scenario-Driven Unit Deployment TDD Test Specification

## Purpose

This document defines the tests that establish the end-state boundary between
static unit capabilities, scenario-authored deployment data, and dynamic runtime
state. It is the implementation handoff for Tasks 1-5 under "Scenario-Driven
Unit Deployment" in `docs/todo.md`.

The first implementation pass must add tests before changing production code.
Tests marked **red** describe target behavior that the current implementation
does not support. Tests marked **green** preserve behavior that must survive the
refactor.

## Target Contract Decisions

These decisions remove ambiguity for the test implementation model.

1. Use `side` for scenario and runtime allegiance. Its values are `onion` and
   `defender`. Reserve `role` for player/session authorization and remove it from
   static unit definitions.
2. Author deployments in one `initialState.deployments` record. A regular entry
   has `type`, `side`, `position`, optional `status`, and optional
   `startingAmmoByWeaponType`. A stack-group entry additionally has
   `kind: 'stack-group'`, `count`, and optional `groupName`.
3. A deployment's record key is the runtime unit ID for a regular unit and the
   deterministic ID base for a stack group.
4. Side and chassis capabilities are orthogonal. A `Puss` deployed to the Onion
   side does not gain treads or rams. `TheOnion` deployed to the Defender side
   retains its catalog-defined tread and ram capabilities.
5. Static unit types describe intrinsic capabilities only. They never contain
   side, position, status, movement spent, current ammo, current treads, or
   remaining rams.
6. `maxAmmo` is optional static weapon metadata. When present, it is a positive
   integer. A weapon without `maxAmmo` is not ammo-limited.
7. `startingAmmoByWeaponType` is keyed by the full weapon type ID. Values are
   integers from zero through that weapon type's `maxAmmo`, inclusive. An
   override is invalid when the unit does not own the weapon type or the weapon
   type has no `maxAmmo`.
8. Normalization copies `maxAmmo` into dynamic `weapon.ammo` when no override is
   supplied. It copies the override when supplied. Unlimited weapons omit
   `ammo`. Initial weapon state remains `ready`; availability at zero ammo stays
   the responsibility of `UnitWeapons`.
9. Normalized runtime units carry `side`. Capability-specific dynamic fields are
   derived from catalog capabilities, not from side. Runtime collections may
   remain split by side during migration, but their value type must admit every
   valid chassis deployed to that side.
10. No dual-path compatibility layer is required for the old
    `initialState.onions`/`initialState.defenders` shape or catalog `role` field.

## Current-State Evidence

- `shared/config/unitCatalog.json` is the static source of unit and weapon data.
  Unit entries currently contain `role`; weapon entries do not contain
  `maxAmmo`.
- `shared/unitDefinitions.ts` validates the imported JSON at module load, adds
  `typeId`, resolves `weaponTypeIds`, derives `stackable`, and currently derives
  unit subtypes from catalog `role`.
- `shared/types/index.ts` currently puts `role` on both static unit types and
  dynamic `OnionUnit`/`DefenderUnit` types.
- `server/engine/scenarioSchema.ts` currently accepts separate `onions` and
  `defenders` records. It has no deployment `side` or ammo override.
- `server/engine/scenarioNormalizer.ts` currently rejects catalog types whose
  role does not match their authored record, hardcodes missile ammo to `1`, and
  writes runtime role from the selected record.
- `server/api/gamesHelpers.ts#parseScenarioSnapshot` validates authored input,
  materializes the map, and translates deployment positions before the
  normalizer receives them.
- `shared/unitWeapons.ts` treats a weapon with zero ammo as unavailable even if
  its state is `ready`.
- Existing preservation coverage lives in `test/shared/unitCatalog.test.ts`,
  `test/shared/types.test.ts`, `test/shared/unitWeapons.test.ts`,
  `test/server/api/scenarioParsing.test.ts`, and
  `test/server/engine/scenarioNormalizer.test.ts`.

## Required Test Seam

Malformed catalog cases cannot be tested thoroughly while validation only runs
against a statically imported JSON module. Extract or expose one pure function
that accepts unknown catalog input and returns normalized catalogs or throws.
Tests must call that function directly. Production module initialization must
use the same function so tests cannot exercise a parallel validator.

The test specification does not mandate the function's name. It must have no
filesystem, logger, server, or mutable global-state dependency.

## Test Definitions

### A. Static Catalog Contract

Target file: `test/shared/unitCatalog.test.ts`

#### CAT-001: normalizes every canonical unit under its configured type ID

- **Status:** green, update assertions
- **What:** Load the canonical catalog and iterate every configured unit entry.
- **Why:** Configuration identifiers are open strings and must survive
  normalization without a hardcoded union.
- **Assert:** Every configured key exists in the normalized catalog; each value
  has the same `typeId`; no configured entry is dropped or added.

#### CAT-002: normalizes every canonical weapon under its configured type ID

- **Status:** green
- **What:** Compare configured and normalized weapon keys.
- **Why:** Unit weapon references are meaningful only if catalog normalization
  is complete and deterministic.
- **Assert:** Key sets match exactly and every normalized weapon's `typeId`
  equals its key.

#### CAT-003: keeps intrinsic unit capability data in the static catalog

- **Status:** green
- **What:** Table-test representative mobile, stackable, immobile, terrain-aware,
  ram-capable, and treaded unit definitions.
- **Why:** Removing side must not erase chassis behavior.
- **Assert:** Movement, defense, cost, abilities, terrain rules, ram profiles,
  tread metadata, and resolved weapon references retain configured values.

#### CAT-004: excludes deployment and runtime state from every static unit

- **Status:** red because `role` is currently present
- **What:** Iterate every normalized unit definition.
- **Why:** A reusable chassis cannot encode scenario allegiance or mutable game
  state.
- **Assert absent:** `role`, `side`, `unitId`, `id`, `type`, `position`, `state`,
  `status`, `movementSpent`, `ammo`, and `ramsRemaining`. Catalog `treads` and
  `ramsPerTurn` remain allowed as maximum chassis capabilities; their dynamic
  counterparts represent current values on runtime instances.

#### CAT-005: excludes runtime state from every static weapon

- **Status:** green
- **What:** Iterate every normalized weapon definition.
- **Why:** Weapon instances own mutable state and current ammo.
- **Assert absent:** `id`, `unitId`, `state`, `status`, and `ammo`. `maxAmmo` is
  allowed.

#### CAT-006: rejects missing or malformed required unit attributes

- **Status:** partially green; expand to red cases
- **What:** Table-test missing/wrong `name`, `movement`, `defense`, `abilities`,
  `abilities.maxStacks`, and `weaponTypeIds`.
- **Why:** Invalid configuration must fail during startup rather than produce
  partially usable definitions.
- **Assert:** The pure catalog parser throws an error naming the unit type and
  invalid field.

#### CAT-007: rejects unknown unit fields, including legacy role

- **Status:** red
- **What:** Add one arbitrary unknown field and independently add legacy `role`.
- **Why:** A strict catalog prevents misspellings and prevents deployment data
  from leaking back into static configuration.
- **Assert:** Both inputs are rejected with the unit type and field identified.

#### CAT-008: rejects dynamic aliases on unit definitions

- **Status:** partially green
- **What:** Table-test `id`, `unitId`, `type`, `state`, `status`, `position`,
  `movementSpent`, `side`, and `ramsRemaining`.
- **Why:** Explicit regression coverage makes the static/dynamic boundary
  durable even if strict validation changes implementation.
- **Assert:** Each field is rejected.

#### CAT-009: resolves all configured weapon references

- **Status:** green
- **What:** Normalize a unit with multiple weapon references.
- **Why:** Runtime normalization must receive complete static weapon metadata.
- **Assert:** Weapon order matches `weaponTypeIds`; each resolved object equals
  the corresponding normalized weapon catalog entry.

#### CAT-010: rejects a missing weapon reference

- **Status:** green
- **What:** Reference an unknown full weapon type ID.
- **Why:** A typo must not silently create an unarmed or partially armed unit.
- **Assert:** Parsing throws and identifies both unit and weapon type IDs.

#### CAT-011: derives stackability exclusively from maxStacks

- **Status:** green
- **What:** Normalize definitions with `maxStacks` of 1 and greater than 1.
- **Why:** `stackable` is normalized data, not a second authoring source.
- **Assert:** Values are `false` and `true`, respectively; authored `stackable`
  is rejected as an unknown field.

#### CAT-012: does not mutate raw catalog input

- **Status:** new, expected green after test seam extraction
- **What:** Deep-freeze raw input before normalization.
- **Why:** A pure boundary is easier to test and safe to reuse in tools.
- **Assert:** Normalization succeeds and raw input remains deeply equal to its
  pre-call clone.

### B. Weapon Ammo Metadata

Target files: `test/shared/unitCatalog.test.ts`,
`test/shared/unitWeapons.test.ts`, and `test/shared/types.test.ts`

#### AMMO-001: accepts omitted maxAmmo as unlimited

- **Status:** green after strict parser extraction
- **What:** Normalize a weapon without `maxAmmo`.
- **Why:** Most current weapons are not consumable ammunition stores.
- **Assert:** The normalized type omits `maxAmmo`.

#### AMMO-002: accepts a positive integer maxAmmo

- **Status:** red
- **What:** Normalize weapon definitions with `maxAmmo` values 1 and greater
  than 1.
- **Why:** The catalog must express finite ammunition capacity.
- **Assert:** The normalized values are preserved exactly.

#### AMMO-003: rejects invalid maxAmmo values

- **Status:** red
- **What:** Table-test zero, negative, fractional, string, boolean, and null.
- **Why:** Capacity must be a positive integer and must not rely on coercion.
- **Assert:** Each value is rejected with weapon type and `maxAmmo` identified.

#### AMMO-004: rejects runtime or unknown ammo-shaped weapon fields

- **Status:** red for strict unknown fields
- **What:** Table-test `ammo`, `startingAmmo`, `currentAmmo`, and an arbitrary
  unknown field.
- **Why:** Current ammunition belongs to deployment/runtime state, and near-name
  fields otherwise hide configuration mistakes.
- **Assert:** Each field is rejected.

#### AMMO-005: keeps maxAmmo static and ammo dynamic at compile time

- **Status:** red
- **What:** Add positive assignments and `@ts-expect-error` cases to the existing
  type-boundary test style.
- **Why:** Runtime tests alone cannot prevent static metadata from being copied
  into instance contracts.
- **Assert:** `WeaponType` accepts `maxAmmo` and rejects `ammo`; `Weapon` accepts
  `ammo` and rejects `maxAmmo`.

#### AMMO-006: zero-ammo ready weapons remain unavailable

- **Status:** green
- **What:** Construct a ready weapon with `ammo: 0`.
- **Why:** A valid zero starting-ammo override must not make the weapon usable.
- **Assert:** It is absent from `getReadyWeapons` and `consumeAmmo` returns
  false without mutation.

### C. Scenario Deployment Schema

Target files: `test/server/api/scenarioParsing.test.ts` and
`test/server/engine/scenarioNormalizer.test.ts`

#### DEP-001: accepts a regular deployment for either side

- **Status:** red
- **What:** Parse one ordinary deployment with `side: 'onion'` and another with
  `side: 'defender'`.
- **Why:** Allegiance is selected by the scenario, not inferred from chassis.
- **Assert:** Both parse and preserve type, side, translated position, and
  optional status.

#### DEP-002: requires a deployment side

- **Status:** red
- **What:** Omit `side` from a regular deployment and a stack group.
- **Why:** Falling back to catalog role would preserve the coupling being
  removed.
- **Assert:** Both inputs fail schema validation.

#### DEP-003: rejects invalid deployment sides

- **Status:** red
- **What:** Table-test empty string, wrong case, unknown string, number, and
  null.
- **Why:** Side is a closed scenario vocabulary.
- **Assert:** Every value fails schema validation without coercion.

#### DEP-004: strictly rejects unknown deployment fields

- **Status:** green behavior on old shapes; red on target shape
- **What:** Add arbitrary fields to regular and stack-group deployments.
- **Why:** Strict authoring catches obsolete and misspelled fields.
- **Assert:** Both fail schema validation.

#### DEP-005: accepts valid starting-ammo overrides

- **Status:** red
- **What:** Parse an override map keyed by full weapon type IDs with values zero
  and positive integers.
- **Why:** Scenarios need to start finite weapons below capacity.
- **Assert:** Schema parsing preserves keys and values exactly. Catalog-aware
  ownership and capacity checks occur during normalization.

#### DEP-006: rejects malformed starting-ammo override values

- **Status:** red
- **What:** Table-test negative, fractional, string, boolean, and null values.
- **Why:** Runtime ammo must be a nonnegative integer.
- **Assert:** Every malformed value fails schema validation.

#### DEP-007: accepts side and ammo overrides on stack groups

- **Status:** red
- **What:** Parse a valid stack group with side and an override map.
- **Why:** Every expanded member must receive the same authored deployment
  policy without a separate schema path.
- **Assert:** Side, count, group name, status, position, and overrides survive
  parsing.

#### DEP-008: requires at least one Onion-side deployment

- **Status:** red
- **What:** Parse no deployments and then only Defender-side deployments.
- **Why:** This preserves the existing minimum playable-state invariant without
  relying on an `onions` container name.
- **Assert:** Both are rejected; a mixed deployment containing one Onion-side
  entry is accepted.

#### DEP-009: translates deployment positions exactly once

- **Status:** green behavior, migrate fixture
- **What:** Parse a radius-authored scenario and then normalize its validated
  initial state.
- **Why:** Schema migration must not duplicate or skip coordinate translation.
- **Assert:** Parsed positions equal the expected runtime coordinates and
  normalization preserves those coordinates unchanged.

#### DEP-010: rejects the legacy split deployment shape

- **Status:** red until cutover
- **What:** Parse a scenario using `initialState.onions` and
  `initialState.defenders`.
- **Why:** The epic explicitly avoids a dual-path compatibility layer.
- **Assert:** Validation fails after the canonical scenario fixtures migrate.

### D. Catalog-Aware Deployment Normalization

Target file: `test/server/engine/scenarioNormalizer.test.ts`

#### NORM-001: normalizes a regular unit from static and deployment sources

- **Status:** green behavior, red target input
- **What:** Normalize a regular deployment with explicit side, position, and
  status.
- **Why:** This is the primary pure boundary of the refactor.
- **Assert:** Unit ID comes from the deployment key; `typeId` and intrinsic
  capabilities resolve from catalog; side, position, and status resolve from
  deployment; friendly name and weapons are deterministic.

#### NORM-002: defaults missing status to operational

- **Status:** green
- **What:** Normalize regular and stack-group deployments without status.
- **Why:** Existing scenario behavior must remain stable.
- **Assert:** Every generated unit is operational.

#### NORM-003: assigns a defender-oriented chassis to the Onion side

- **Status:** red
- **What:** Deploy `Puss` with `side: 'onion'`.
- **Why:** This is the acceptance test proving side is scenario-authored.
- **Assert:** The unit is in the Onion-side collection with side `onion`, retains
  Puss movement/defense/weapons through catalog lookup, and has no tread or ram
  runtime fields.

#### NORM-004: assigns a treaded chassis to the Defender side

- **Status:** red
- **What:** Deploy `TheOnion` with `side: 'defender'`.
- **Why:** Testing both directions proves capabilities are not inferred from
  side.
- **Assert:** The unit is in the Defender-side collection with side `defender`
  and receives catalog-derived current treads, remaining rams, and weapons.

#### NORM-005: rejects an unknown unit type

- **Status:** green, generalize error wording
- **What:** Normalize an unknown type on each side and in a stack group.
- **Why:** Side must not alter catalog lookup behavior.
- **Assert:** Each throws an error naming the unknown type and deployment key;
  errors do not call it an unknown Onion or defender type.

#### NORM-006: defaults finite ammo from catalog maxAmmo

- **Status:** red
- **What:** Normalize a unit owning a finite-ammo weapon with no override.
- **Why:** Catalog capacity is the canonical default.
- **Assert:** The matching dynamic weapon has `ammo === maxAmmo`; unlimited
  weapons omit `ammo`.

#### NORM-007: applies a valid starting-ammo override

- **Status:** red
- **What:** Normalize an override strictly below capacity.
- **Why:** Scenario state must override the static default without changing the
  catalog.
- **Assert:** Dynamic ammo equals the override and all static weapon attributes
  remain catalog-derived.

#### NORM-008: accepts a zero starting-ammo override

- **Status:** red
- **What:** Normalize a finite weapon with override zero.
- **Why:** Depleted-at-start scenarios are valid and `UnitWeapons` already
  treats zero ammo as unavailable.
- **Assert:** Dynamic ammo is zero and initial state remains `ready`.

#### NORM-009: rejects an override above maxAmmo

- **Status:** red
- **What:** Normalize `maxAmmo + 1`.
- **Why:** A scenario cannot create ammunition beyond chassis capacity.
- **Assert:** Throw with deployment key, weapon type ID, supplied value, and
  maximum represented in the error.

#### NORM-010: rejects an override for an unowned weapon type

- **Status:** red
- **What:** Give Puss an override keyed to an Onion missile.
- **Why:** Globally known weapon IDs are not necessarily installed on a unit.
- **Assert:** Throw with deployment key and weapon type ID.

#### NORM-011: rejects an override for an unlimited weapon

- **Status:** red
- **What:** Override a weapon whose catalog type omits `maxAmmo`.
- **Why:** An override must not implicitly convert unlimited/rechargeable weapons
  into finite-ammo weapons.
- **Assert:** Throw with deployment key and weapon type ID.

#### NORM-012: applies stack-group side and ammo policy to every member

- **Status:** red
- **What:** Normalize a stack group with explicit side, status, and finite-ammo
  override using a purpose-built catalog fixture.
- **Why:** Group expansion must not lose per-deployment policy.
- **Assert:** Every member has the authored side, position, status, and ammo;
  IDs and friendly-name ordinals remain deterministic; roster membership lists
  every generated ID.

#### NORM-013: preserves deterministic IDs and names across stack groups

- **Status:** green
- **What:** Migrate the existing two-group ordinal test to unified deployments.
- **Why:** Scenario schema changes must not regress canonical stack identity.
- **Assert:** IDs, friendly names, group keys, and membership retain the existing
  deterministic sequence.

#### NORM-014: rejects generated unit-ID collisions

- **Status:** red
- **What:** Author a regular deployment whose key collides with a generated
  stack member ID.
- **Why:** Silent record overwrite would corrupt state and roster membership.
- **Assert:** Normalization throws and identifies the duplicate unit ID.

#### NORM-015: does not mutate deployment or catalog inputs

- **Status:** red or green depending on extracted seam
- **What:** Deep-freeze both inputs before normalization.
- **Why:** A standalone normalizer must be deterministic and side-effect free.
- **Assert:** Normalization succeeds and both inputs remain deeply equal to
  pre-call clones.

#### NORM-016: does not copy static combat data into runtime instances

- **Status:** green, broaden assertion
- **What:** Inspect every normalized unit and weapon instance.
- **Why:** Runtime state should refer to static data by `typeId` rather than
  duplicate attack, range, defense, movement, abilities, or target rules.
- **Assert absent on units:** movement, defense, cost, abilities, targetRules,
  stackable, and max capacities except capability-specific current values.
- **Assert absent on weapons:** attack, range, defense, targetRules, and
  `maxAmmo`.

#### NORM-017: every runtime type reference resolves to the supplied catalog

- **Status:** green behavior, add exhaustive assertion
- **What:** Normalize regular, stack, weaponless, treaded, and finite-ammo units.
- **Why:** This is the referential-integrity invariant for downstream rules.
- **Assert:** Every unit `typeId` exists in the unit catalog and every dynamic
  weapon `typeId` exists in both its unit definition and weapon catalog.

### E. Compile-Time Runtime Model Boundary

Target file: `test/shared/types.test.ts`

#### TYPE-001: static unit types do not accept side or role

- **Status:** red
- **What:** Add `@ts-expect-error` assignments for both fields.
- **Why:** The compiler must enforce the catalog boundary independently of JSON
  validation.

#### TYPE-002: runtime units require side independently of chassis fields

- **Status:** red
- **What:** Type-check a non-treaded and treaded runtime unit on each side.
- **Why:** Side must not select the chassis shape.
- **Assert:** Both chassis categories accept either side; missing side fails;
  non-treaded units reject current tread/ram fields.

#### TYPE-003: side collections admit every runtime chassis

- **Status:** red
- **What:** Type-check Puss-shaped and treaded units in both side collections.
- **Why:** Runtime maps cannot preserve the old side-as-type assumption.
- **Assert:** All four combinations compile without casts.

## Sequencing and Red-Green Batches

Implement in these batches so each failure points to one contract boundary.

1. **Catalog parser seam:** CAT-001 through CAT-012.
2. **Ammo metadata and types:** AMMO-001 through AMMO-006.
3. **Target scenario schema:** DEP-001 through DEP-010; migrate canonical
   scenario fixtures in the same cutover, without compatibility parsing.
4. **Pure normalizer:** NORM-001 through NORM-017.
5. **Runtime type boundary:** TYPE-001 through TYPE-003.
6. **Phase 2 integration:** completed after all prior batches passed. The mixed-
  side integration coverage proves that units move, attack, receive phase
  effects, and appear correctly in API and web projections through
  `test/server/engine/mixedSideScenario.test.ts`,
  `test/server/api/gamesHelpers.test.ts`, and
  `test/web/lib/battlefieldViewBuilders.test.ts`.

Do not commit intentionally failing tests between batches. Within a working
session, demonstrate the expected red failure, implement the smallest matching
production change, and rerun the same focused command before continuing.

## Focused Validation

```bash
pnpm exec vitest run \
  test/shared/unitCatalog.test.ts \
  test/shared/unitWeapons.test.ts \
  test/shared/types.test.ts \
  test/server/api/scenarioParsing.test.ts \
  test/server/engine/scenarioNormalizer.test.ts \
  --config vitest.node.config.ts
```

Run `pnpm build` after type-contract batches because Vitest runtime execution
does not prove every `@ts-expect-error` boundary.

## Traceability to TODO Tasks

| TODO task | Test IDs |
| --- | --- |
| Task 1: standalone contract | CAT-001..012, DEP-001..010, NORM-001..005, NORM-012..017, TYPE-001..003 |
| Task 2: weapon maxAmmo | AMMO-001..006, NORM-006 |
| Task 3: starting ammo override | DEP-005..007, NORM-007..012 |
| Task 4: scenario side assignment | DEP-001..004, DEP-008, DEP-010, NORM-003..005, TYPE-001..002 |
| Task 5: side-based runtime maps | NORM-003..004, TYPE-002..003, followed by Phase 2 integration tests |

## Explicitly Out of Scope for This Specification

- Phase transition behavior
- Movement authorization and pathfinding
- Combat attacker/target eligibility
- API and WebSocket projection migration
- Web selection and rendering behavior
- Database migration or compatibility with existing persisted games
- Renaming player/session authorization `role`

Those concerns consume the normalized runtime contract and require integration
tests after this standalone boundary is green.
