# Web UI Unit Presentation Specification

## Purpose and Ownership

This specification owns the web client's unit sprite asset flow, map sizing and
positioning, Inspector rendering, and unit-state visual cues. The server remains
authoritative for unit state and stack membership; combat and movement routing
are defined in the [interaction-routing specification](interaction-routing-spec.md).

The map and Inspector use the same resolved unit catalog and canonical sprite
assets. Map-specific scale and offsets do not change Inspector sizing or define
how a future help or scenario-authoring surface must frame an image.

## Asset Management

- The resolved unit definition supplies `spriteKey`; the web client does not
  derive image paths from type names.
- `unitSpriteRegistry` statically imports the bundled assets and maps each key
  to either one image or a set of explicit presentation variants. The server
  supplies catalog metadata, not image bytes.
- Scenario-derived unit types inherit `spriteKey` and map-presentation fields
  from their base type. Scenario derivations currently do not override these
  visual fields.
- The canonical image canvases share a 1024-pixel width and normalize visible
  artwork to a 940-pixel width. This shared asset convention is what lets the
  Inspector use one sizing rule without per-type scaling.
- There is no Inspector-only sprite set. Any future web surface should reuse
  the same registry assets unless it has a genuine need for different artwork.

The asset resolver uses a plain image for types without variants. For a type
with variants, a destroyed unit uses its `destroyed` image; otherwise a
requested damaged state uses the optional `damaged` image, falling back to the
operational image. Disabled and recovering states use the operational image
unless the registry is extended with a specific variant.

`spriteKey` is optional and its match against the registry is not validated by
the shared catalog parser. An absent or unrecognized key currently resolves to
no image; there is no fallback sprite. Keep shipped keys registered and decide
on validation or fallback behavior before allowing tools to author new asset
keys.

## Map Sizing and Positioning

`hexMapScale`, `hexMapOffsetX`, and `hexMapOffsetY` are presentation-only
fields on the resolved unit type. They are stored in the global unit catalog,
validated for finite values (scale must also be positive), and inherited by
scenario-derived unit types.

For hex radius `R`, center `(cx, cy)`, scale `s`, and offsets `ox` / `oy`, the
map layout is:

```text
hexDiameter = 2 * R
size = hexDiameter * s
x = cx - size / 2 + (ox / 100) * hexDiameter
y = cy - size / 2 - (oy / 100) * hexDiameter
```

- The default scale is `0.62` when a unit type does not specify one. Values
  greater than `1` are allowed.
- Offsets are percentage-point values of the hex diameter. Positive X moves
  right; positive Y moves up.
- The map renders the scaled layout box with aspect-ratio preservation; labels,
  stack membership, hit targets, and hex coordinates remain separate layers.
- Map metadata has no effect on the Inspector's image dimensions.

## Inspector Sizing

- The Inspector uses the same state-aware asset resolver as the map.
- Its image frame centers the image and reserves at least 180 pixels of height.
- The image width is `min(100%, 190px)` and its height remains automatic, so
  the source aspect ratio is preserved.
- The description follows the image frame; it is not displaced by per-unit
  map offsets or scale.

Because canonical canvases share a normalized visible width, the common
Inspector width yields a common visible sprite size without generating a
second display image per unit type.

## State and Destruction Presentation

- Sprite variants and unit status are separate. In particular, an Onion with
  damaged treads or a destroyed weapon can use its damaged image while its
  authoritative unit state remains operational; subsystem damage alone does
  not produce a destroyed-unit hatch.
- On the map, disabled or destroyed occupants apply a diagonal hatch to the
  entire hex, over the occupant sprites. Destroyed takes precedence if a hex
  contains both states. The destroyed hatch uses a 4-pixel stripe and 4-pixel
  gap; the disabled hatch uses a 6-pixel stripe and 4-pixel gap.
- The left-rail unit and weapon rows use the corresponding red destroyed and
  yellow-orange disabled hatch treatments. These state cues are not separate
  sprite assets.
- Destroyed Defender records remain in authoritative `state.defenders` and in
  the full Defender roster used by the left rail and Inspector. They sort below
  operational entries, remain inspectable, and are not eligible attackers.
- The active map projection omits destroyed Defender markers once cleanup has
  begun in `DEFENDER_MOVE`, `DEFENDER_COMBAT`, or `GEV_SECOND_MOVE`; destroyed
  Swamp markers remain visible. Before that boundary, destroyed Defenders may
  still appear on the map.
- When the engine enters `DEFENDER_MOVE`, destroyed members are removed from
  stack-roster membership, but their Defender records remain available for
  roster and Inspector history. Group identity and membership always come from
  `stackRoster`, not co-location.

For combat targeting, map and rail selection must use the canonical stack
group ID rather than an individual Little Pigs member ID. See the
[interaction-routing specification](interaction-routing-spec.md) and
[API contract](../api-contract.md).

## Implementation and Test Map

| Responsibility | Code and focused tests |
| --- | --- |
| Catalog fields and validation | [unitCatalog.json](../../shared/config/unitCatalog.json), [types/index.ts](../../shared/types/index.ts), [unitDefinitions.ts](../../shared/unitDefinitions.ts), [scenarioDefinitions.ts](../../server/engine/scenarioDefinitions.ts) |
| Session catalog and asset lookup | [sessionCatalog.ts](../../web/lib/sessionCatalog.ts), [unitSpriteRegistry.ts](../../web/lib/unitSpriteRegistry.ts) |
| Map layout and marker | [hexMapSpriteLayout.ts](../../web/lib/hexMapSpriteLayout.ts), [HexMapBoard.tsx](../../web/components/HexMapBoard.tsx), [HexMapCell.tsx](../../web/components/HexMapCell.tsx), [HexMapUnitMarker.tsx](../../web/components/HexMapUnitMarker.tsx) |
| Inspector and rail styling | [BattlefieldInspectorPanel.tsx](../../web/components/BattlefieldInspectorPanel.tsx), [App.css](../../web/App.css) |
| Roster and map projections | [battlefieldViewBuilders.ts](../../web/lib/battlefieldViewBuilders.ts), [projection.ts](../../web/lib/battlefieldDisplay/projection.ts), [phases.ts](../../server/engine/phases.ts), [game.ts](../../server/engine/game.ts), [stateProjection.ts](../../server/api/gameHelpers/stateProjection.ts) |
| Focused rendering and layout tests | [hexMapSpriteLayout.test.ts](../../test/web/lib/hexMapSpriteLayout.test.ts), [HexMapUnitMarker.test.tsx](../../test/web/components/HexMapUnitMarker.test.tsx), [HexMapCell.test.tsx](../../test/web/components/HexMapCell.test.tsx), [BattlefieldInspectorPanel.test.tsx](../../test/web/components/BattlefieldInspectorPanel.test.tsx) |
