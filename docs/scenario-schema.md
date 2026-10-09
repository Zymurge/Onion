# Onion Scenario Schema (v1)

This document defines the JSON structure for game scenarios. This schema will be validated using **Zod** in the Node.js engine.

Core rules mechanics referenced from the public domain portions of the [OGRE Designer's Edition Rulebook (v6.0)](https://www.sjgames.com/ogre/kickstarter/ogre_rulebook.pdf) by Steve Jackson Games.

## Schema and Normalization Overview (2026)

This schema is designed for authoring flexibility and robust normalization. The backend engine materializes all runtime geometry and unit/weapon state from authored scenario JSON as follows:

- **Authoring:** Scenarios may specify a map by `radius` (for a regular hexagon) or by explicit `cells`/`hexes`. Only non-clear terrain needs to be listed in `hexes`.
- **Backend Normalization:**
  - If `radius` is present, the backend generates a canonical list of axial coordinates for all valid map cells, centered at `(radius, radius)`.
  - The backend translates authored `q`/`r` positions into runtime coordinates and materializes the full `cells` array.
  - The frontend always receives explicit `cells` and does not perform coordinate translation.
- **Unit/Weapon Population:**
  - The global catalog supplies reusable base unit and weapon types.
  - A scenario may declare local unit derivations with single inheritance and
    numeric/loadout overrides. The server resolves these definitions once
    before deployment and sends the resolved catalog through `SESSION_INIT`.
  - Deployments reference either a global type id or a scenario-local type key.
    The server resolves local types first and materializes a namespaced runtime
    id such as `scenarioId:ScenarioDragon`.
  - Runtime state is populated from the resolved catalog plus deployment
    starting values. Combat target rules and arbitrary ability structure are
    not authored in scenario JSON.
- **Unit Status State Machine:**
  - All units default to `operational` if status is missing.
  - Defender units cycle: `operational` → `disabled` (if hit) → `recovering` (start of next turn) → `operational` (start of Recovery Phase).
  - The engine manages all status transitions automatically.
- **IDs:**
  - The keys in `initialState.deployments` are authored deployment IDs for individual units or stack groups. Stack-group keys are used as the source for deterministic member ID bases; the engine expands each group into unique member IDs.
- **Victory Conditions:**
  - Scenario JSON specifies victory conditions, but the engine enforces and tracks win/loss state.

See also: [shared/config/unitCatalog.json] and [shared/unitDefinitions.ts] for canonical unit/weapon definitions and rules.

## 1. Map Configuration (Axial Hex Coordinates)

We use an **Axial Coordinate System** (q, r) where:

- `q`: Column index
- `r`: Row index
- `s = -q - r` (Implicit third axis for distance calculation)

### Hex Terrain Types

- `0`: Clear
- `1`: Ridgeline
- `2`: Crater
- `3`: The Swamp (Objective)

## 2. JSON Structure Example

```json
{
  "id": "swamp-siege-01",
  "name": "swamp-siege-01",
  "displayName": "The Siege of Shrek's Swamp",
  "description": "The Onion must destroy the Swamp and then escape the map.",
  "map": {
    "radius": 7,
    "hexes": [
      { "q": 0, "r": 0, "t": 0 },
      { "q": 1, "r": 0, "t": 1 },
      { "q": 5, "r": 5, "t": 3 }
    ]
  },
  "initialState": {
    "deployments": {
      "onion-1": {
        "type": "TheOnion",
        "side": "onion",
        "position": { "q": 0, "r": 10 },
        "status": "operational"
      },
      "swamp-1": {
        "type": "Swamp",
        "side": "defender",
        "position": { "q": 5, "r": 5 },
        "status": "operational"
      }
    }
  },
  "victoryConditions": {
    "objectives": [
      {
        "id": "destroy-swamp",
        "label": "Destroy The Swamp",
        "kind": "destroy-unit",
        "unitId": "swamp-1",
        "victor": "onion",
        "required": true
      },
      {
        "id": "escape-map",
        "label": "Escape to a scenario-defined edge hex after The Swamp is destroyed",
        "kind": "escape-map",
        "victor": "onion",
        "required": true
      },
      {
        "id": "immobilize-onion",
        "label": "Immobilize The Onion",
        "kind": "immobilize-onion",
        "victor": "defender",
        "required": true
      }
    ],
    "onion": { "escapeHexes": [{ "q": 2, "r": 9 }] }
  }
}
```

The engine's normalized runtime state uses separate `onions` and `defenders` maps, but scenario authors use the single `initialState.deployments` map shown above. Scenario authors may use `kind: "stack-group"` with `unitType`, `position`, and `count` for stackable units.

## 3. Victory Conditions

Victory conditions are authored in the scenario under `victoryConditions`. The engine materializes them into runtime objective state, but the scenario file remains the source of truth.

### Fields

- `maxTurns`: Optional turn limit for the scenario. If omitted, the engine uses its default maximum turn count.
- `objectives`: Ordered list of scenario objectives. Each objective is evaluated independently and exposed to the API/UI as its own completion state.
- Every scenario must declare at least one objective with `kind: "immobilize-onion"` and `victor: "defender"`.
- `onion.escapeHexes`: Array of explicit escape hexes. The Onion completes the `escape-map` objective by reaching any listed hex after the prerequisite objective sequence is satisfied.

### Currently Supported Objective Types

- `destroy-unit`: Completes when the named unit is destroyed. Use either `unitId` for a specific authored unit or `unitType` for any unit of that type.
- `escape-map`: Completes when the Onion leaves the map after the prerequisite objective sequence has been satisfied.
- `immobilize-onion`: Completes when every Onion has no tread points remaining or is destroyed. This is a defender objective.

### Authoring Rules

1. Mark each objective with a stable `id`, a player-facing `label`, and a `victor` of `onion` or `defender`.
2. Set `required` to `true` for objectives that must be complete for that victor to win. Omitted `required` defaults to required in the current engine contract.
3. Use `unitId` when the scenario contains one specific named objective unit, such as The Swamp.
4. Use `unitType` when any unit of that type should satisfy the objective.
5. Add new objective kinds only when the engine and API contract have been updated to support them end to end.
6. Do not use the deprecated `victoryConditions.defender.condition` field or rely on an implicit immobilized-Onion fallback.

## 4. Unit and Weapon Definitions

The global catalog remains the base definition source. A scenario may add
scenario-local derived unit types, but the runtime must always consume one
resolved `UnitTypeCatalog` and `WeaponTypeCatalog`.

### Global weapon type shape

Global weapon types are keyed by stable ids. A weapon type contains:

```json
{
  "id": "TheOnion.secondary",
  "name": "Secondary Weapon",
  "weaponClass": "main",
  "attack": 4,
  "range": 3,
  "defense": 4,
  "individuallyTargetable": true,
  "maxAmmo": 1,
  "defaultQuantity": 1,
  "friendlyNameTemplate": "Secondary Weapon {{ordinal}}"
}
```

The catalog defines weapon types, not individual mounted weapons.
`defaultQuantity` is the number of runtime instances created when a unit
loadout does not provide an explicit quantity. A unit loadout may override
that quantity, including with zero to omit the type. The engine creates the
requested instances during scenario normalization. Instance IDs are
deterministic and unique within the match, using the owning unit ID, weapon
type ID, and one-based ordinal (for example,
`onion-1:TheOnion.secondary:1`); the friendly name template receives the same
ordinal. Runtime weapon instances are mutable state and are never catalog
entries.

`maxAmmo` is the maximum remaining ammunition for finite-ammo weapons. It is
not replenished during play. A weapon's `spent` readiness state may reset at
the normal turn boundary when ammunition remains, but consumed ammunition does
not return.

### Global unit type shape

Global unit types are keyed by stable ids and reference existing weapon types
through a quantity map in the resolved model:

```json
{
  "name": "The Onion",
  "friendlyNameTemplate": "The Onion {{ordinal}}",
  "spriteKey": "the-onion",
  "movement": 3,
  "defense": 0,
  "maxTreads": 45,
  "treadsPerMove": 15,
  "ramsPerTurn": 2,
  "abilities": {
    "maxStacks": 1,
    "canRam": true,
    "ramCapacity": 2
  },
  "weaponQuantities": {
    "TheOnion.main": 1,
    "TheOnion.secondary": 4,
    "TheOnion.missile": 2
  }
}
```

Each key identifies one global weapon type and each value is the number of
instances mounted on this unit type. If a loadout omits a quantity, resolution
uses the weapon type's `defaultQuantity`. The global catalog must therefore
contain one entry for `TheOnion.secondary`, not four instance entries.

Role remains a deployment-side concern. Base stackability and structural
abilities are not scenario overrides. `maxStacks` may vary only within the
base type's stackability contract.

### Scenario-local unit derivation

Scenario-local types use one base type and are declared at the scenario root:

```json
{
  "unitTypes": {
    "ScenarioDragon": {
      "extends": "Dragon",
      "overrides": {
        "movement": 4,
        "defense": 5,
        "maxStacks": 2,
        "weaponQuantities": {
          "Dragon.main": 2
        },
        "weaponOverrides": {
          "Dragon.main": {
            "attack": 7,
            "range": 4
          }
        }
      }
    }
  }
}
```

Resolution rules:

1. Resolve the base type from the global catalog.
2. Apply one level of scenario-local derivation.
3. Namespace the runtime id as `scenarioId:localKey`.
4. Inherit the base type's `spriteKey`; a scenario-local type cannot provide or
  replace a sprite key. A new sprite requires a new global unit type.
5. Permit numeric unit overrides, per-weapon quantities, and numeric overrides
  for existing weapon values such as attack and range. These values are
  resolved into the derived type and do not mutate the global catalog.
6. Instantiate each weapon type using the derived quantity, or its global
  `defaultQuantity` when no quantity override is present.
7. Reject added weapon types, role changes, base-stackability changes, nested
  inheritance, cycles, unknown bases, id collisions, and invalid values.
  Overrides that do not apply to the base type, such as `startingTreads` on a
  non-Onion type or a stack-size override on a non-stackable type, are ignored;
  the server may log a warning and continues loading the scenario.
8. Fail scenario loading when an applicable override is invalid.

Deployments use the short authored key for a scenario-local type. The resolver
expands it to the namespaced runtime type ID before creating state. The same
expansion applies to `victoryConditions.objectives[].unitType`, so an objective
may target `ScenarioDragon` without spelling `scenarioId:ScenarioDragon`.

The engine, API, WebSocket catalog, replay path, and UI must consume the same
resolved definitions. No runtime owner may inspect raw scenario overrides.

### Deployment starting values

Types define maximum capacities and default starting values. A deployment may
override the initial mutable state within those maxima:

```json
{
  "type": "TheOnion",
  "side": "onion",
  "position": { "q": 0, "r": 10 },
  "startingTreads": 30,
  "startingAmmoByWeaponType": {
    "TheOnion.missile": 0
  }
}
```

`startingTreads` is optional and applies only to types that define `maxTreads`.
On other types it is ignored, with an optional warning. When applicable, it
must not exceed `maxTreads`. Treads are not repaired during play.
`startingAmmoByWeaponType` is optional and addresses all generated instances
of the referenced weapon type on that deployment. Each value must not exceed
the referenced weapon type's `maxAmmo`; it is already part of the deployment
validation contract. `ramsRemaining` is runtime state derived from
`ramsPerTurn` and resets at the normal turn boundary rather than being a
deployment override.

### Authoring restrictions

1. Do not put target restrictions or arbitrary ability structures in scenario
   JSON.
2. Do not define new weapon types inside a scenario derivation; promote a
   frequently reused weapon modification to the global catalog instead.
3. Do not use scenario overrides to change role or turn mechanics.
4. Existing scenarios may be updated to this contract; no legacy compatibility
   layer is required.

## 5. Map Encoding Convention

Authored scenarios may declare a hex map by `radius` instead of enumerating every cell. In that authoring mode, the backend/shared scenario pipeline converts the authored positions into runtime axial coordinates and materializes the map as an explicit `cells` array centered at `(radius, radius)`, which keeps the generated board geometry consistent and non-negative.

When `radius` is used, the authored coordinates are not raw runtime coordinates. The backend treats `r` as the authored row index and `q` as the authored column index within that row, then translates those authored positions into runtime axial coordinates before the scenario reaches the client.

The runtime/API map shape still uses explicit `cells`; `radius` is only an authoring convenience for scenario authors. The frontend consumes the materialized axial coordinates as-is and does not perform any coordinate translation.

Only non-clear hexes need to appear in the `hexes` array. Any hex coordinate not listed is assumed to be terrain type `0` (Clear). This keeps scenario files compact.

## 6. Unit Status State Machine

Defender units cycle through three states. The engine is responsible for advancing state automatically at the start of each Defender turn.

- `operational`: Unit acts normally.
- `disabled`: Unit was hit with a "D" result this turn. It cannot move or fire. At the start of the **next** Defender turn, the engine transitions it to `recovering`.
- `recovering`: Unit was disabled last turn. It returns to `operational` at the **start of the Recovery Phase** this turn and may act normally.

## 7. Zod Implementation Notes

The scenario schema is implemented in `server/engine/scenarioSchema.ts` and
uses string unit types so the shared catalog remains the runtime authority:

```typescript
const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string(),
  map: MapSchema,
  unitTypes: UnitTypesSchema.optional(),
  initialState: InitialStateSchema,
  victoryConditions: VictoryConditionsSchema
});

const HexSchema = z.object({
  q: z.number(),
  r: z.number(),
  t: z.number()
});

const UnitStatusSchema = z.enum(["operational", "disabled", "recovering", "destroyed"]);

const StartingAmmoByWeaponTypeSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative()
);

const DeploymentBaseSchema = {
  side: z.enum(["onion", "defender"]),
  position: z.object({ q: z.number(), r: z.number() }),
  status: UnitStatusSchema.optional(),
  startingTreads: z.number().int().nonnegative().optional(),
  startingAmmoByWeaponType: StartingAmmoByWeaponTypeSchema.optional(),
};

const StackGroupDeploymentSchema = z.object({
  kind: z.literal("stack-group"),
  unitType: z.string().min(1),
  count: z.number().int().positive(),
  groupName: z.string().optional(),
  ...DeploymentBaseSchema
}).strict();

const UnitDeploymentSchema = z.object({
  type: z.string().min(1),
  ...DeploymentBaseSchema
}).strict();

const DeploymentSchema = z.union([
  UnitDeploymentSchema,
  StackGroupDeploymentSchema
]);

const UnitTypeDerivationSchema = z.object({
  extends: z.string().min(1),
  overrides: z.object({
    movement: z.number().nonnegative().optional(),
    defense: z.number().nonnegative().optional(),
    maxTreads: z.number().int().nonnegative().optional(),
    treadsPerMove: z.number().int().positive().optional(),
    ramsPerTurn: z.number().int().nonnegative().optional(),
    squads: z.number().int().positive().optional(),
    maxStacks: z.number().int().positive().optional(),
    weaponQuantities: z.record(z.string().min(1), z.number().int().nonnegative()).optional(),
    weaponOverrides: z.record(z.string().min(1), z.object({
      attack: z.number().positive().optional(),
      range: z.number().positive().optional(),
      defense: z.number().positive().optional(),
      maxAmmo: z.number().int().positive().optional(),
    }).strict()).optional(),
  }).strict(),
}).strict();

const UnitTypesSchema = z.record(z.string().min(1), UnitTypeDerivationSchema);
```

The deployment union is `UnitDeploymentSchema | StackGroupDeploymentSchema`;
both forms use `DeploymentBaseSchema`, and `InitialStateSchema` requires at
least one Onion deployment. `startingAmmoByWeaponType` is checked against the
resolved finite-ammo weapon definition during normalization. A scenario-local
weapon override may reduce a finite `maxAmmo`, but cannot add ammunition to an
unlimited weapon or exceed the base maximum.

The implementation must use `UnitTypesSchema` to validate scenario-local
derivations and `DeploymentBaseSchema` for deployment starting values. The
resolved global and scenario-local definitions, not raw scenario JSON, supply
the full weapon list and any weapon/unit target rules used by combat selection.
