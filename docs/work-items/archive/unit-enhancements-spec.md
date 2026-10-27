# Unit Definitions and Sprite Enhancements

**Status: Complete.**

## Decision

- `shared/unitSpriteManifest.ts` is the shared source of supported authored
  sprite keys.
- The shared catalog parser and scenario resolver reject unknown authored keys.
- An absent key is allowed for an intentionally non-specific unit type and
  resolves in the web client to the explicit generic unit sprite.
- The generic asset is a presentation fallback, not a catalog key.

## Delivered Requirements

- Global unit definitions and scenario-derived definitions use one immutable,
  resolved catalog.
- The scenario validator resolves the authored scenario catalog before
  reporting success.
- The web registry is checked against the shared key manifest and defensively
  resolves absent or invalid runtime keys to the generic asset.
- Focused tests cover unknown catalog keys, registry/manifest coverage, and
  missing or unknown runtime keys.

Canonical contracts live in [scenario-schema.md](../../scenario-schema.md) and
[unit-presentation-spec.md](../../web-ui/unit-presentation-spec.md).
