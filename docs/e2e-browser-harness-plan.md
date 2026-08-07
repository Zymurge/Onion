# Automated Browser E2E Harness Plan

**Status:** Proposed
**Branch:** `main`
**Date:** 2026-08-07

## Purpose

Provide one command that runs Onion's browser-level acceptance tests across the web UI, engine, and database without requiring the developer to start Docker, Vite, or the engine manually.

The harness must support two isolated browser sessions so sequential two-player workflows exercise the same UI and backend path that real players use.

## Goals

1. Start a complete disposable runtime when no usable runtime is available.
2. Detect and reuse a healthy harness runtime to avoid repeated startup cost.
3. Allow any runtime component to be supplied explicitly for attachment to existing assets.
4. Keep Onion and Defender authentication isolated in separate browser contexts.
5. Clean test-created games and harness-owned runtime assets after successful runs.
6. Preserve owned runtime assets, logs, traces, and test data after failures by default for debugging.
7. Use readiness checks and process/container ownership rather than fixed sleeps or broad database deletion.

### Nice to have -- potential future phases

1. Expose test definitions via Gherkin

## Non-Goals

- Replacing unit, component, API, or integration tests.
- Making the browser suite cover every rules permutation.
- Stopping or deleting infrastructure supplied by the developer.
- Using the global `scripts/flush-games.js` script during normal test cleanup.

## User-Facing Command

The intended entry point is:

```text
pnpm test:e2e
```

The command owns the complete lifecycle:

```text
resolve parameters
  -> discover a healthy reusable harness
  -> start only missing owned components
  -> run Playwright tests
  -> delete registered test games/users
  -> on success, stop and remove owned components
  -> on failure, preserve owned assets and diagnostics by default
```

A failed run should print the runtime descriptor, log directory, artifact manifest, and Playwright report location so the developer can inspect the preserved environment.

## Runtime Resolution

Each component has an explicit override. An omitted component is resolved by the harness.

| Component | Environment variable | Resolution order |
| --- | --- | --- |
| Database | `E2E_DATABASE_URL` | Explicit URL, `DATABASE_URL` when present, or disposable PostgreSQL |
| Engine | `E2E_ENGINE_URL` | Explicit URL, healthy discovered harness, or owned child process |
| Web | `E2E_WEB_URL` | Explicit URL, healthy discovered harness, or owned Vite process |
| Runtime descriptor | `E2E_RUNTIME_FILE` | Supplied path or `.e2e-runtime/runtime.json` |

Additional controls:

| Variable | Default | Meaning |
| --- | --- | --- |
| `E2E_REUSE_RUNTIME` | `true` | Probe and reuse the descriptor's healthy runtime |
| `E2E_KEEP_RUNTIME_ON_FAILURE` | `true` | Preserve owned assets and diagnostics after a failed run |
| `E2E_STARTUP_TIMEOUT_MS` | `120000` | Maximum wait for readiness of each started component |

The harness must normalize trailing slashes in URLs and use health/readiness probes rather than assuming that a listening port means the service is ready. Engine readiness is `/health/ready`; web readiness is a successful request for `/` and database readiness is `SELECT 1`.

## Ownership Model

Every component is labeled relative to the current invocation:

- **external:** supplied through a runtime parameter; never stopped, deleted, or modified by teardown.
- **reused:** found through the harness descriptor and healthy; never stopped by the attaching invocation.
- **owned:** started by the current invocation; eligible for success teardown and optional failure teardown.

The descriptor should contain the runtime URLs, owning process id, start time, log directory, artifact manifest path, and disposable database container id when applicable. A stale or unhealthy descriptor may be replaced, but its external assets must not be destroyed merely because the descriptor is stale.

A small atomic lock file should prevent two invocations from creating competing disposable runtimes. A healthy existing descriptor should be reused before acquiring the startup lock.

## Disposable Runtime

The default isolated runtime should use:

- PostgreSQL Testcontainers with the repository migration applied before the engine starts.
- A child `tsx server/index.ts` process bound to a dynamically allocated loopback port.
- A child Vite process bound to a dynamically allocated loopback port with `VITE_ONION_API_URL` set to the engine URL.
- Separate log files for database metadata, engine output, and web output.

Dynamic ports avoid collisions with a developer's normal Docker Compose or development server. The harness should capture child stdout and stderr continuously and terminate only children it owns.

If an explicit engine is supplied without an explicit database, the harness must not start an unrelated database. A database is started only when it is needed to start an owned engine or when the test needs database cleanup.

## Test Data Cleanup

Browser tests may use API calls for setup, deterministic configuration, diagnostics, and cleanup, but gameplay behavior must be exercised through the browser.

The harness should expose a small artifact registry shared with the Playwright process:

- `gameIds`: matches created by the test run.
- `userIds`: users created by the test run.

On successful teardown, delete only registered matches. The foreign keys cascade to `game_state` and `game_events`; registered test users may then be deleted. Never delete all matches or all users from a shared database.

On failure, preserve the manifest and registered rows when `E2E_KEEP_RUNTIME_ON_FAILURE=true`. This allows the developer to inspect the exact failed match. If failure cleanup is explicitly enabled, apply the same targeted deletion rules and still preserve logs and traces when practical.

## Browser Test Shape

Use Playwright with one browser and two `BrowserContext` instances:

- Onion context: its own storage, login, page, and event stream.
- Defender context: separate storage, login, page, and event stream.

A typed test bootstrap may use the existing CLI API client patterns to create users and join a match. Each browser assertion should then navigate and act through the UI. API calls must not stand in for UI behavior under test.

Initial high-value scenarios:

1. A ram result is shown consistently to both players, including destroyed status.
2. A defender can select the intended weapon target through the UI and the Onion sees the correct resulting state.
3. Grouped targets and stack selections do not retain stale selection after a state refresh.
4. Co-located units and failed ram results render consistently for active and inactive players.
5. A planner action is disabled only when the authoritative state makes it non-actionable.

The suite should use deterministic server-side roll configuration or a test-only roll queue. Expected outcomes must be declared in the scenario setup rather than relying on `Math.random()`.

## Proposed File Layout

```text
playwright.config.ts
scripts/test-e2e.ts
test/e2e/
  fixtures/
    runtime.ts
    twoPlayerGame.ts
  pages/
    loginPage.ts
    battlefieldPage.ts
    rightRail.ts
  scenarios/
    ramResolution.spec.ts
    selectionRefresh.spec.ts
  support/
    artifactRegistry.ts

docs/e2e-browser-harness-plan.md
```

The runtime supervisor should be a library used by `scripts/test-e2e.ts`, not embedded in Playwright fixtures. This keeps process/container lifecycle outside worker retries and makes the cleanup decision based on the overall command result.

## Phased Implementation

### Phase 1: Runtime contract and supervisor

- Add environment parsing and runtime descriptor types.
- Add health probes for engine, web, and database.
- Add descriptor discovery, reuse, and atomic startup lock.
- Add disposable PostgreSQL, engine, and Vite startup.
- Add ownership-aware success teardown and failure preservation.
- Add focused unit tests using fake HTTP services and mocked child/container adapters.

### Phase 2: Playwright entry point

- Add Playwright dependency and configuration.
- Add `pnpm test:e2e` wrapper.
- Pass resolved runtime URLs and artifact manifest path to workers.
- Preserve Playwright traces, screenshots, video, and runtime logs on failure.
- Add a two-context connection smoke test.

### Phase 3: Targeted cleanup and deterministic setup

- Add artifact registration helpers.
- Add targeted match/user cleanup against PostgreSQL.
- Add deterministic test-roll configuration behind a test-only boundary.
- Add a typed two-player bootstrap fixture based on the existing CLI client.

### Phase 4: Browser regressions

- Implement the ram display regression first.
- Add sequential two-player scenarios for weapon targets, stale selections, co-location, failed rams, and planner actionability.
- Keep each scenario focused on one user-visible contract and one diagnostic path.

## Acceptance Criteria

- A developer can run `pnpm test:e2e` without manually starting Docker, Vite, or the engine.
- A healthy prior harness is reused and startup is skipped where possible.
- Explicit DB, engine, and web URLs attach without the harness stopping those assets.
- A successful run removes registered test data and all harness-owned disposable resources.
- A failed run leaves enough runtime state and logs to reproduce the failure when preservation is enabled.
- Two browser contexts can play against the same match without sharing authentication state.
- The browser suite is deterministic and does not depend on uncontrolled random rolls.
- No cleanup path performs global match deletion.
