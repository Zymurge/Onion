# Onion Scenario Schema (v1)

This document defines the JSON structure for game scenarios. This schema will be validated using **Zod** in the Node.js engine.

Core rules mechanics referenced from the public domain portions of the [OGRE Designer's Edition Rulebook (v6.0)](https://www.sjgames.com/ogre/kickstarter/ogre_rulebook.pdf) by Steve Jackson Games.

## 1. Map Configuration (Axial Hex Coordinates)

We use an **Axial Coordinate System** (q, r) where:

- `q`: Column index
- `r`: Row index
- `s = -q - r` (Implicit third axis for distance calculation)

### Hex Terrain Types

- `0`: Clear
- `1`: Ridgeline
- `2`: Crater
- `3`: Castle (Objective)

## 2. JSON Structure Example

```json
{
  "id": "swamp-siege-01",
  "name": "swamp-siege-01",
  "displayName": "The Siege of Shrek's Swamp",
  "description": "The Onion must reach the Castle while defenders hold the ridgeline.",
  "map": {
    "radius": 7,
    "hexes": [
      { "q": 0, "r": 0, "t": 0 },
      { "q": 1, "r": 0, "t": 1 },
      { "q": 5, "r": 5, "t": 3 }
    ]
  },
  "initialState": {
    "onion": {
      "type": "MkIII",
      "position": { "q": 0, "r": 10 },
      "treads": 45,
      "missiles": 2,
      "batteries": {
        "main": 1,
        "secondary": 4,
        "ap": 8
      },
      "status": "operational"
    },
    "defenders": {
      "wolf-1": { "type": "BigBadWolf", "position": { "q": 5, "r": 5 }, "status": "operational" },
      "puss-1": { "type": "Puss", "position": { "q": 6, "r": 5 }, "status": "operational" },
      "pigs-1": { "type": "LittlePigs", "position": { "q": 10, "r": 5 }, "squads": 3, "status": "operational" }
    }
  },
  # 6. Normalization Rules

  At game start, the engine will normalize the scenario's initialState as follows:

  1. **Onion Type:** If `onion.type` is missing, default to `"TheOnion"` (or the engine's default Onion type).
  2. **Unit Status:** If `status` is missing for onion or defenders, default to `"operational"`.
  3. **Unit IDs:** Ignore any `id` fields in the scenario; assign unique IDs at game start for onion and each defender.
  4. **Weapons:** Always auto-populate `weapons` for onion and defenders from engine definitions at game start.
  5. **Defenders Format:** Scenario must provide `defenders` as a Record keyed by id; keys may be arbitrary and will be replaced by generated IDs at game start.
  6. **Game State Fields:** `ramsThisTurn`, `currentPhase`, and `turn` are not part of the scenario and are set by the engine.
  "victoryConditions": {
    "onion": {
      "targetHex": { "q": 12, "r": 5 },
      "description": "Onion wins by moving onto or attacking the Castle hex."
    },
    "defender": {
      "condition": "onionImmobilized",
      "description": "Defender wins when the Onion's tread points reach 0 (MA 0). A stationary Onion cannot reach the Castle."
    },
    "maxTurns": 20
  }
}
```

## 3. Unit and Weapon Population

Scenario JSON only declares the starting unit types, positions, and stack sizes. The engine populates the full weapon lists, weapon stats, and any target-rule metadata from the shared unit definitions at normalization time.

1. Do not put combat target restrictions directly in scenario JSON.
2. If a weapon or unit has special targeting restrictions, define them on the shared unit definition in the engine source of truth.
3. Scenario `initialState` should remain focused on initial placement, stack sizes, and status fields that vary per scenario.

## 4. Map Encoding Convention

Authored scenarios may declare a hex map by `radius` instead of enumerating every cell. In that authoring mode, the backend/shared scenario pipeline converts the authored positions into runtime axial coordinates and materializes the map as an explicit `cells` array centered at `(radius, radius)`, which keeps the generated board geometry consistent and non-negative.

When `radius` is used, the authored coordinates are not raw runtime coordinates. The backend treats `r` as the authored row index and `q` as the authored column index within that row, then translates those authored positions into runtime axial coordinates before the scenario reaches the client.

The runtime/API map shape still uses explicit `cells`; `radius` is only an authoring convenience for scenario authors. The frontend consumes the materialized axial coordinates as-is and does not perform any coordinate translation.

Only non-clear hexes need to appear in the `hexes` array. Any hex coordinate not listed is assumed to be terrain type `0` (Clear). This keeps scenario files compact.

## 5. Unit Status State Machine

Defender units cycle through three states. The engine is responsible for advancing state automatically at the start of each Defender turn.

- `operational`: Unit acts normally.
- `disabled`: Unit was hit with a "D" result this turn. It cannot move or fire. At the start of the **next** Defender turn, the engine transitions it to `recovering`.
- `recovering`: Unit was disabled last turn. It returns to `operational` at the **start of the Recovery Phase** this turn and may act normally.

## 6. Zod Implementation Notes

We will define the following TS interfaces:

```typescript
const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  map: MapSchema,
  initialState: InitialStateSchema,
  victoryConditions: VictoryConditionsSchema
});

const HexSchema = z.object({
  q: z.number(),
  r: z.number(),
  t: z.nativeEnum(TerrainType)
});

const UnitStatusSchema = z.enum(["operational", "disabled", "recovering"]);

const UnitSchema = z.object({
  id: z.string(),
  type: z.enum(["Puss", "Witch", "BigBadWolf", "LittlePigs", "Dragon", "LordFarquaad"]),
  position: z.object({ q: z.number(), r: z.number() }),
  status: UnitStatusSchema.default("operational"),
  squads: z.number().optional() // For Little Pigs stacks only
});
```

The runtime unit definitions, not the scenario schema, supply the full weapon list and any weapon/unit target rules used by combat selection.
