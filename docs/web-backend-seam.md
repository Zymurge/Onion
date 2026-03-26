# Web Backend Seam Plan

Branch: `web-backend-seam`

This doc captures the intended shape of the frontend/backend seam before implementation starts so we can keep the work testable as the UI and transport evolve.

## Goals

- Introduce a thin, typed client boundary between the web UI and the backend.
- Keep the UI focused on presentation and local interaction state.
- Make the seam callable by both real implementation code and tests.
- Start HTTP REST first, then preserve the option to add websocket transport later without changing the UI contract.
- Keep the work on a focused branch and avoid unrelated churn.

## seam shape

The UI should depend on a small client interface rather than direct `fetch` calls or mock data imports.

Suggested responsibilities:

- load the current game snapshot
- submit an action
- refresh or sync state
- observe events or updates through a transport-agnostic callback or subscription shape
- surface loading and error states in a domain-level way

The app should own UI state only. The client should own transport and backend contract details.

## transport decision

Use HTTP REST for the first pass.

Why:

- the backend contract already fits a request/response shape
- the first implementation stays smaller and easier to stabilize
- polling can be introduced for refresh/event sync without a websocket dependency
- websocket support can be added later behind the same client contract if live push becomes necessary

## TDD order

1. Write failing contract tests for the client seam in the web package.
2. Define the client interface and domain models.
3. Add a stubbed in-memory adapter to make the contract tests pass.
4. Add app-level tests that exercise the UI against the stubbed client.
5. Replace direct mock data in `App` with injected client state.
6. Add the first HTTP adapter and its tests against the backend endpoints.
7. Expand the contract only when the UI needs a new behavior.
8. Add websocket transport later only if the contract requires live push.

## testing rules

- Prefer red-green cycles for every stable behavior.
- Keep UI smoke tests in place while the seam is introduced.
- Add stubbed tests only once the seam is well-defined and callable from both tests and implementation.
- Keep transport-specific tests separate from UI tests.
- Favor semantic assertions over snapshots or layout checks.

## initial contract

The first API surface should stay minimal:

- `getState()`
- `submitAction(...)`
- `subscribe(...)` or `poll(...)`
- standardized loading/error return shapes

If the contract grows too quickly, split it into smaller client types instead of making one large interface.

## notes

- The current UI is still mock-data driven, so the seam should be introduced before replacing those imports.
- Websocket transport is not the first step.
- The main point of the seam is testability and long-term transport flexibility, not protocol abstraction for its own sake.
