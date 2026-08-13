---
description: "Onion testing and TDD policy. Apply whenever changing implementation, contracts, fixtures, tests, or validation behavior."
applyTo: "**"
---

# Onion Testing And TDD

## Default TDD Flow

- TDD is the default for code changes.
- Confirm or update the relevant specification before implementation.
- Add or update focused behavior tests.
- Run the changed tests and verify the new test fails for the intended reason before implementing when the behavior is new or changing.
- Implement the smallest change that makes the tests pass, then run the focused suite again.
- Finish with the appropriate broader regression suite and typecheck.

When a specification is unclear, resolve the contract before writing implementation code. Keep tests and assertions focused on observable behavior rather than private implementation details.

## Choose The Narrowest Stable Boundary

- Pure deterministic rules, phase transitions, combat math, movement, and map helpers belong in unit tests with no I/O, database, or React rendering.
- Transport adapters test payload mapping, error normalization, snapshot handling, and event polling at their seam.
- Session controllers test refresh policy, live-event handling, stale-load protection, and synchronization without rendering React.
- App orchestration tests cover action commits, connection gates, refresh, and local error state with an injected client.
- Component tests cover rendering and view-only interaction, not transport policy.
- API route tests use Fastify `app.inject()` and in-memory adapters; persistence integration tests use the real database path when needed.
- Reserve E2E for a small set of high-value user journeys across the full stack.

## Test Contracts

- Identify units and targets with stable IDs and the selection contract, not visible copy or CSS classes.
- Prefer accessible roles and names for generic controls, stable `data-testid` hooks for rail controls, board occupants, and hex cells, and `data-selected="true"` for selection assertions.
- Use canonical snapshot fixtures. Add negative coverage for malformed or deprecated snapshot shapes rather than adding fallback behavior.
- Keep smoke flows in the default regression run when they protect phase sequencing, synchronization, or terminal-game behavior.

## Validation Commands

- `pnpm test` is the default fast regression suite.
- `pnpm test:integration` covers slower persistence or backend wiring when relevant.
- Run focused Vitest files first, then the relevant suite, then `pnpm exec tsc --noEmit` for TypeScript changes.
