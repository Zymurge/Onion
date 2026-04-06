# Onion Testing Strategy

This document is the canonical map of test layers, boundaries, and purposes for the project.
When a behavior crosses layers, test the narrowest stable boundary that owns the behavior.

## Method and Tooling

- Test-driven development (TDD) is the default approach from Phase 1 onward.
- Vitest is the standard test runner for the repository.
- Keep test names and assertions focused on behavior, not implementation details.

## Layer Map

| Layer | What it proves | Typical location | Notes |
| --- | --- | --- | --- |
| Engine unit | Pure rules, phase transitions, combat resolution, map math | `src/engine/*.test.ts` | No I/O, no DB, no React |
| API route + DAL unit | Route validation, auth, state writes, DB adapter behavior | `src/api/*.test.ts`, `src/db/*.test.ts` | Fastify `app.inject()`, in-memory adapter |
| API/DAL integration | Real SQL and persistence behavior | `src/db/*.integration.test.ts`, backend integration suites | Run against Postgres/testcontainers |
| Web transport seam contract | `GameClient`, `httpGameClient`, error normalization, snapshot mapping, event polling | `web/src/test/lib/transport/*.test.ts` | Test the adapter directly, not the UI |
| Web session/controller | `gameSessionController`, `useGameSession`, live signal handling, refresh policy | `web/src/test/lib/session/*.test.ts*` | Keep controller behavior testable without React rendering |
| Pure web helpers | `hex`, `combatRange`, `combatResolution`, `combatPreview` | `web/src/test/lib/pure/*.test.ts` | Fast deterministic helper coverage |
| App orchestration | `commitClientAction`, refresh, connection gate, stale-load protection, local error state | `web/src/test/app/**/*.test.tsx` | Component-level, with injected client |
| Component rendering | Presentation components and view-only behavior | `web/src/test/components/*.test.tsx` | Render tests only, no transport policy |
| CLI behavior | Command parsing, session flow, rendering, server error display | `src/cli/*.test.ts` | Validate manual testing ergonomics |
| E2E | Full user journey across UI and backend | `e2e/*.spec.ts`, Playwright suites | Keep this small and high value |

## Rules of Thumb

- If the code is pure and deterministic, keep it in unit tests.
- If the code translates transport payloads or normalizes errors, test the adapter contract directly.
- If the code coordinates state in the App or CLI shell, test the orchestration layer.
- If the behavior depends on rendering, interaction, or network wiring across layers, use component or integration tests.
- Reserve E2E for user-critical paths that need the whole stack.
- When tests need to identify a selected unit or target, use the stable unit id plus the selection state contract instead of visible copy.
- Prefer `role`/accessible name for locating generic controls, `data-testid` for rail selection controls, board occupants, and hex cells, and `data-selected="true"` for asserting selection state.
- Do not anchor selection tests to text like `Selected unit: ...` or to styling class names as the primary contract.

## Execution Profiles

- `pnpm test`: fast suites that should stay close to unit and contract boundaries.
- `pnpm test:integration`: slower suites that verify real persistence or backend wiring.
- Keep smoke flows in the default regression run when they guard phase sequencing or terminal-game behavior.

## Current Boundary Map

- `gameClient.ts` is the seam contract.
- `httpGameClient.ts` is the HTTP adapter implementation of that seam.
- `commitClientAction` in `App.tsx` is App orchestration above the seam.
- App event handlers are a layer above that orchestration.
- `web/src/test/lib/transport/gameClient.seam.contract.test.ts` should stay focused on seam behavior.
- `web/src/test/app/**/*.test.tsx` should cover App orchestration and failure surfaces.
