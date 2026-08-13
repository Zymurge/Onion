---
description: "Repository-wide Onion architecture and state-ownership rules. Apply when changing backend, shared rules, web, CLI, scenarios, snapshots, or tests."
applyTo: "**"
---

# Onion Repository Architecture

## Authority And Boundaries

- The backend engine is authoritative for game rules, phase transitions, action legality, combat resolution, and committed game state.
- Shared modules own domain contracts and rules that must agree across engine, API, CLI, and web. Do not create a second implementation of shared coordinate, movement, unit, weapon, target, or combat rules in a client layer.
- The API owns transport and persistence concerns. Routes call named database operations and preserve structured backend errors instead of rewriting them into vague client messages.
- The web client is a React + TypeScript presentation and interaction layer. It prepares commands locally, but committed actions must round trip through the backend; do not optimistically mutate authoritative game state.

## Web State Ownership

Keep these categories separate:

- **Server snapshot:** backend-authoritative game state, phase, turn, winner, event sequence, objectives, and scenario map.
- **Interaction state:** client-local selections, target preparation, inspector focus, stack-member toggles, prompts, and local error presentation.
- **Derived view state:** pure projections computed from the snapshot and interaction state.
- **Sync state:** connection, refresh, live-event, and stale-load bookkeeping.

Hard reload must reconstruct the app from a fresh server snapshot plus empty local interaction state. Never persist UI selection or pending targeting inside a snapshot-shaped server model, and never mutate server-derived state in place.

## Canonical Identity And Snapshots

- Canonical snapshots require the `stackRoster.groupsById` bundle and its naming data. Invalid or deprecated snapshot shapes must fail loudly; do not add silent migration or compatibility inference.
- `stackRoster` owns stack membership, group identity, and unit identity. `defenders` may be a projection, but never the canonical source of stack membership when roster data exists.
- Preserve stable unit IDs and per-unit friendly names across regrouping. Stack names are display identity; they must not replace unit identity.
- Do not invent member IDs, renumber members from layout order, infer stack membership from co-location, or synthesize missing canonical fields. Projection helpers should fail fast when required canonical data is absent.
- Keep movement spent and other phase counters on individual unit records, not on a top-level convenience bundle.

## Rules And UI Routing

- Model terrain, movement, target eligibility, weapon statistics, and ramming outcomes as structured data owned by the unit, weapon, or shared rules model. Avoid hard-coded one-off checks in UI components.
- UI components emit semantic interaction requests. A shared routing policy decides intent from viewer activity, role, phase, surface, gesture, subject relation, and capability. Components and thin handlers must not re-decide those rules independently.
- Inactive players are inspection-only. Active-player preparation remains client-local; only explicit commit actions are sent to the server.
- Use canonical protocol target IDs at commit time. UI-only prefixes or aliases must be removed before a command is submitted.

## Source Selection

- Treat current code and active specifications as authoritative over historical plans in `docs/archive/`. Use archived documents as design history unless a task explicitly reactivates one.
- Prefer the smallest existing abstraction that owns a behavior. Keep domain logic in shared/engine modules and projections or rendering logic in web modules.
