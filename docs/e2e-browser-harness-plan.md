# Automated Browser E2E Harness Plan

**Status:** Phases 1, 2, 3, 4.1, 4.2, and 4.3 complete; 4.4 is the next active track
**Branch:** `e2e_harness`
**Date:** 2026-08-09

## Current State

The runtime supervisor, Playwright handoff, artifact cleanup, and per-test two-player fixture boundary are in place. Phases 4.1 through 4.3 are complete: ram resolution, weapon-target selection, and authoritative stale-selection refresh all pass across isolated browser contexts. Cross-player tests wait on rendered authoritative phase changes rather than elapsed time. The next browser regression is 4.4.

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

## Using E2E

From a clean checkout, the expected setup is:

```text
pnpm install
pnpm test:e2e:install
pnpm test:e2e
```

`pnpm test:e2e:install` downloads the pinned Chromium browser used by the
smoke test and by CI. Run it again after clearing the Playwright browser cache
or when the local machine has not yet installed Chromium.

If the run fails, inspect these paths in the preserved diagnostic root:

- `Logs`: the runtime supervisor log directory, including `engine.log`, `web.log`, and `artifacts.json`.
- `Playwright report`: the HTML report folder under `playwright/report`.
- `Playwright failure output`: screenshots, traces, and error context under `playwright/test-results`.

Useful overrides while debugging:

- `E2E_WEB_URL` attaches the browser to an existing web server and skips Vite startup.
- `E2E_ENGINE_URL` and `E2E_DATABASE_URL` attach to existing backend services and skip owned startup for those components.
- `E2E_RUNTIME_FILE` moves the preserved runtime descriptor and logs to a different location.
- `E2E_KEEP_RUNTIME_ON_FAILURE=false` forces teardown after a failing run when you no longer need the preserved assets.

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

- **Complete:** Add environment parsing and runtime descriptor types.
- **Complete:** Add health probes for engine, web, and database.
- **Complete:** Add descriptor discovery, reuse, and atomic startup lock.
- **Complete:** Add disposable PostgreSQL, engine, and Vite startup adapters.
- **Complete:** Add ownership-aware success teardown and failure preservation.
- **Complete:** Add focused unit tests using fake HTTP services and mocked child/container adapters.

Phase 1 implementation lives under `test/e2e/runtime/` and is intentionally
independent of Playwright. The runtime supervisor owns lifecycle decisions while
the future browser runner will consume its resolved URLs and artifact paths.

Phase 1 validation:

```text
pnpm exec vitest run test/e2e/runtime
pnpm typecheck:e2e
```

### Phase 2: Playwright entry point

Phase 2 should connect the already-tested runtime supervisor to a real browser
runner without adding gameplay setup, database cleanup, deterministic rolls, or
page-object abstractions yet. The key risk is lifecycle ownership across two
process trees: Playwright workers must inherit the resolved runtime contract,
return their exit status to the wrapper, and leave the supervisor responsible for
teardown. Keep the first browser test deliberately small so failures distinguish
browser connectivity from runtime startup, authentication, or game orchestration.

Install the pinned Chromium browser used by local and CI runs with:

```text
pnpm test:e2e:install
```

The wrapper passes a named runtime contract to the Playwright process and its
workers. Browser code may read `E2E_WEB_URL`, `E2E_ENGINE_URL`,
`E2E_RUNTIME_FILE`, `E2E_ARTIFACT_FILE`, and `E2E_LOG_DIR`; it must not import
the runtime supervisor or rely on mutable process state.

#### Phase 2 one-line task breakdown

| Task | One-line task | Recommended model | Done when |
| --- | --- | --- | --- |
| 2.1 | Add `@playwright/test` as a root development dependency and pin the browser-install command used by local and CI runs. | Opus 4.8 | The dependency and lockfile are updated, and a documented install command works from a clean checkout. |
| 2.2 | Add `playwright.config.ts` with a single-project configuration driven by `E2E_WEB_URL` and conservative trace, screenshot, video, timeout, and worker defaults. | Opus 5 | The config has no hard-coded service URL, behaves deterministically in local and CI runs, and typechecks. |
| 2.3 | Define the typed environment handoff from `scripts/test-e2e.ts` to Playwright for web URL, engine URL, runtime descriptor, artifact manifest, and log directory. | Opus 5 | A browser test can read the resolved runtime contract without importing supervisor internals or relying on process-global mutable state. |
| 2.4 | Make `scripts/test-e2e.ts` invoke Playwright with inherited signals and exit codes while guaranteeing supervisor teardown runs exactly once. | Opus 5 | Passing and failing Playwright commands produce the correct process status and owned resources are cleaned or preserved according to the existing policy. |
| 2.5 | Configure Playwright reporters and output directories so reports, traces, screenshots, video, runtime logs, and the artifact manifest share one run-specific diagnostic location. | Opus 4.8 | A failed run prints stable paths for every available diagnostic artifact and a successful run does not leave stale report output. |
| 2.6 | Add a minimal two-context connection smoke test that opens Onion and Defender contexts against the same web runtime without sharing storage state. | Opus 5 | `pnpm test:e2e` proves both contexts can reach the app and verifies their cookies/local storage are isolated. |
| 2.7 | Add focused unit tests for Playwright config resolution, environment handoff, wrapper failure propagation, and diagnostic-path behavior using injected process seams. | Opus 5 | Failure modes are tested without starting Docker, Vite, the engine, or a real browser. |
| 2.8 | Add the Phase 2 command, browser-install prerequisite, and troubleshooting workflow to the harness documentation. | Opus 4.7 | A developer can follow the documented steps from a clean checkout and understand where preserved failures are stored. |

#### Phase 2 execution order

Implement 2.1 before 2.2, then 2.3 and 2.4 as one lifecycle slice; implement
2.5 and 2.7 before 2.6; finish with 2.8 after the command works end to end.
Do not introduce API game setup, artifact registration, deterministic roll
control, or page objects in this phase; those belong to Phase 3 and Phase 4.

#### Phase 2 acceptance criteria

- `pnpm test:e2e` starts or reuses the Phase 1 runtime and invokes Playwright.
- An explicit `E2E_WEB_URL` attaches the browser runner without starting a web process.
- The resolved runtime URLs and diagnostic paths reach the Playwright process through a typed, documented contract.
- Playwright failures propagate a non-zero command status and preserve diagnostics according to `E2E_KEEP_RUNTIME_ON_FAILURE`.
- A successful run tears down only resources owned by the supervisor.
- Two browser contexts can load the same web runtime without sharing authentication storage.
- The Phase 2 smoke test does not create users, games, or database rows.
- Runtime unit tests, Phase 2 seam tests, and the browser smoke test have separate failure messages.

### Phase 3: Targeted cleanup and deterministic setup

Phase 2 established that Playwright can attach to the supervisor-owned runtime
and maintain isolated browser contexts. Phase 3 should add the smallest reliable
test-data boundary needed for real gameplay scenarios. The central risk is
cross-run contamination: setup must register only what it creates, cleanup must
be idempotent and narrowly scoped, and deterministic combat control must be
available to tests without becoming a production rules API. Keep browser page
objects and user-visible regression assertions in Phase 4; Phase 3 should
produce fixtures and data contracts that those tests can consume.

#### Phase 3 one-line task breakdown

| Task | One-line task | Recommended model | Done when |
| --- | --- | --- | --- |
| 3.1 | Define a versioned artifact manifest and registry API for run-owned game IDs and user IDs with atomic, duplicate-safe writes. | Opus 5 | Concurrent fixture operations can register artifacts without losing entries, malformed manifests fail clearly, and the registry never accepts unscoped cleanup data. |
| 3.2 | Add a Playwright-accessible artifact registry client that reads the supervisor-provided manifest path without importing database or supervisor internals. | Opus 4.8 | Browser fixtures can register created resources through one typed API and the manifest remains inspectable after a failed run. |
| 3.3 | Implement targeted PostgreSQL cleanup for registered games and users in dependency-safe order using parameterized queries. | Opus 5 | Cleanup deletes only registered rows, is safe to repeat, preserves unrelated data, and reports partial failures without hiding the original test failure. |
| 3.4 | Integrate artifact cleanup into supervisor teardown with success-only default cleanup and failure preservation controlled by `E2E_KEEP_RUNTIME_ON_FAILURE`. | Opus 5 | Successful runs remove registered test data before owned runtime shutdown, failed runs preserve rows and diagnostics by default, and external or reused databases are never globally cleaned. |
| 3.5 | Define a test-only deterministic roll queue or injection boundary for combat and ramming outcomes without changing normal production randomness. | Opus 5 | Tests can declare a finite sequence of rolls, production code has no implicit test queue, and exhausted or invalid queues fail loudly. |
| 3.6 | Add focused tests proving deterministic roll isolation, queue consumption order, exhaustion behavior, and rejection outside the test boundary. | Opus 5 | The roll-control contract is covered without requiring a browser, Docker, or a live game. |
| 3.7 | Build a typed two-player game bootstrap fixture that creates isolated users, creates or joins one match, registers all artifacts, and returns both player identities. | Opus 5 | A fixture can prepare a known match once, returns typed Onion and Defender credentials, and cleans up through the registry rather than broad deletion. |
| 3.8 | Add fixture-level tests for partial setup failure, duplicate registration, cleanup retry, and explicit external-database attachment. | Opus 5 | Failure paths leave actionable diagnostics and never delete data outside the current run’s registry. |
| 3.9 | Document the Phase 3 data lifecycle, deterministic-roll contract, fixture API, and preserved-failure inspection workflow. | Opus 4.7 | A Phase 4 scenario author can create a two-player match and understand exactly what is cleaned, preserved, or forbidden. |

#### Phase 3 execution order

Implement 3.1 before 3.2; implement 3.3 and 3.4 as the cleanup slice; implement
3.5 and 3.6 as the deterministic-control slice; then implement 3.7 and 3.8
against those completed contracts. Finish with 3.9 after a complete fixture
run. Do not add page objects, long-lived browser assertions, or regression
scenario coverage in this phase; those belong to Phase 4.

#### Phase 3 implemented contracts

Phase 3 is implemented under `test/e2e/` and keeps browser setup separate from
runtime ownership and database cleanup. The lifecycle is:

1. The supervisor creates a run-specific `artifacts.json` manifest and passes
  its path to Playwright as `E2E_ARTIFACT_FILE`.
2. `bootstrapTwoPlayerGame()` registers each user immediately after successful
  creation, creates the Onion-owned match, registers the match immediately,
  and then joins it with the Defender session. If setup fails, the manifest
  contains every resource created before the failure.
3. A successful teardown deletes registered matches first, allowing their
  dependent `game_state` and `game_events` rows to cascade, and then deletes
  registered users. Cleanup is parameterized, idempotent, and scoped only to
  the manifest. Cleanup errors are reported without replacing the test result.
4. With `E2E_KEEP_RUNTIME_ON_FAILURE=true`, the failed run preserves the
  manifest, registered rows, runtime descriptor, logs, and Playwright
  diagnostics. Setting it to `false` enables the same targeted cleanup during
  failure teardown.

External and reused databases are never stopped or destroyed by the harness.
They may receive targeted deletion of rows explicitly registered by the current
run; no teardown path performs a global match or user deletion.

#### Two-player fixture API

Phase 4 scenarios can import the test-scoped fixture and use the returned
identities to create separate browser sessions:

```ts
import { expect, test } from '../fixtures/twoPlayerGame.js'

test('uses two isolated players', async ({ browser, twoPlayerGame }) => {
  const onionContext = await browser.newContext()
  const defenderContext = await browser.newContext()

  // Log each context in with twoPlayerGame.onion or twoPlayerGame.defender.
  expect(twoPlayerGame.onion.role).toBe('onion')
  expect(twoPlayerGame.defender.role).toBe('defender')
  expect(twoPlayerGame.onion.userId).not.toBe(twoPlayerGame.defender.userId)

  await Promise.all([onionContext.close(), defenderContext.close()])
})
```

`TwoPlayerGame` returns the shared `gameId`, `scenarioId`, and both
`TwoPlayerIdentity` values. Each identity contains its username, password,
user ID, token, and assigned role. The fixture uses the engine URL from the
Playwright runtime handoff unless a test injects an explicit base URL.

#### Deterministic roll contract

Deterministic rolls are test-only and opt-in. `createRollQueue()` accepts a
finite sequence of integers from 1 through 6. Tests pass the queue explicitly
through the movement execution options as `ramRolls`; each value is consumed in
order for one rammed unit. A malformed value or an exhausted queue throws a
descriptive error. When no queue is supplied, production movement keeps its
normal random ramming behavior. The queue is not stored in process-global
state, so separate tests cannot consume one another's rolls.

Example test setup:

```ts
const ramRolls = createRollQueue([6, 1])
const result = executeUnitMovement(gameState, movementPlan, { ramRolls })
```

The exact movement function signature may vary with the scenario adapter, but
the rule is fixed: the queue must be created by the test and passed explicitly
to the engine call that resolves ramming.

#### Preserved-failure inspection

When a browser run fails with preservation enabled, the wrapper prints stable
locations for the runtime descriptor, log directory, artifact manifest,
Playwright report, and test-result output. Inspect `artifacts.json` first to see
which users and games were created before setup or gameplay failed. Then use
the registered game ID with the API or database tools and inspect `engine.log`
and `web.log` from the same run directory. Do not run `scripts/flush-games.js`:
it is intentionally outside the normal E2E cleanup path.

The runtime handoff available to Playwright is:

| Variable | Meaning |
| --- | --- |
| `E2E_WEB_URL` | Browser base URL. |
| `E2E_ENGINE_URL` | API and engine base URL used by fixture setup. |
| `E2E_RUNTIME_FILE` | Runtime descriptor path. |
| `E2E_ARTIFACT_FILE` | Additive game/user manifest path. |
| `E2E_LOG_DIR` | Run-specific logs and Playwright diagnostics root. |

#### Phase 3 acceptance criteria

- Every test-created game and user is registered before cleanup can be attempted.
- Successful cleanup deletes only registered games and users, in dependency-safe order.
- Failed runs preserve registered rows and diagnostics when preservation is enabled.
- Cleanup is idempotent and does not use global match/user deletion or `scripts/flush-games.js`.
- External and reused databases are never destroyed and are never cleaned globally.
- Deterministic rolls are explicit, finite, test-only, and isolated per test run.
- A typed fixture creates two users and one shared match through the existing API contract, then returns credentials for two isolated browser contexts.
- Partial setup failures preserve the manifest and identify the resources created before failure.
- Phase 3 unit and fixture tests do not require Playwright browsers or a running disposable runtime.

### Phase 4: Browser regressions

Phase 4 turns the completed two-player fixture into user-visible browser
regressions. Keep these tests sequential, deterministic, and narrow: each spec
should exercise one live UI contract, one shared match, and one diagnostic path.

#### Phase 4 one-line task breakdown

| Task | One-line task | Recommended model | Done when |
| --- | --- | --- | --- |
| 4.1 | Add the first browser regression for ram resolution so both players see the same destroyed-or-survived result and the same toast copy. | Opus 5 | Complete: a single shared match drives one ram scenario end to end, and both contexts render the same resolved combat result. |
| 4.2 | Add a weapon-target selection regression that proves the intended target is chosen through the UI and that the other player sees the authoritative result. | Opus 5 | Complete: the Defender selects and destroys the intended Onion weapon, and the Onion sees the authoritative result. |
| 4.3 | Add stale-selection regressions for grouped targets and stack cards so a refresh clears any local-only selection residue. | Opus 5 | Complete: rendered authoritative phase updates clear grouped-target and stack-card selections without timer-based waits. |
| 4.4 | Add a co-location regression that verifies stacked and adjacent units render consistently for active and inactive players. | Opus 4.8 | Both players see the same board geometry and the same stack/rail state for co-located units. |
| 4.5 | Add a failed-ram regression that proves the ram toast, destroyed-state rendering, and follow-up movement controls stay in sync. | Opus 5 | The UI exposes the failure path clearly, and the same authoritative result appears in both browser contexts. |
| 4.6 | Add a planner-actionability regression that disables actions only when the authoritative state makes them invalid. | Opus 5 | The planner obeys the live game state rather than local snapshot guesses. |
| 4.7 | Add Phase 4 fixture/utility tests only when a browser regression introduces a new shared helper or page-object contract. | Opus 4.7 | New helpers are covered without widening browser scope beyond the specific user-visible behavior under test. |

#### Phase 4 execution order

Implement 4.1 first so the two-player fixture proves a real gameplay outcome in
the browser. **4.1, 4.2, and 4.3 are complete and validated by `pnpm test:e2e`.** Follow with 4.4 and 4.5 to cover the board-state edge cases that most
often expose desynchronization. Finish with 4.6 once the browser harness has a
stable selection and combat baseline.

#### Phase 4 acceptance criteria

- Browser regressions use the typed two-player fixture from Phase 3 instead of ad hoc setup.
- Each scenario is deterministic and declares any required roll sequence explicitly.
- Assertions are based on browser-visible state, not API shortcuts or direct database reads.
- Onion and Defender contexts continue to remain isolated across every scenario.
- The suite surfaces one readable failure per regression, not a broad shared fixture error.
- Phase 4 introduces no new global deletion or teardown path.

## Next Steps

1. Continue Phase 4 with the 4.4 co-location regression for active and inactive players.
2. Follow with the 4.5 failed-ram regression.
3. Keep cross-player synchronization tied to rendered authoritative state; do not add fixed sleeps.

## Acceptance Criteria

- A developer can run `pnpm test:e2e` without manually starting Docker, Vite, or the engine.
- A healthy prior harness is reused and startup is skipped where possible.
- Explicit DB, engine, and web URLs attach without the harness stopping those assets.
- A successful run removes registered test data and all harness-owned disposable resources.
- A failed run leaves enough runtime state and logs to reproduce the failure when preservation is enabled.
- Two browser contexts can play against the same match without sharing authentication state.
- The browser suite is deterministic and does not depend on uncontrolled random rolls.
- No cleanup path performs global match deletion.
