# Copilot Persistent Behaviors

## Copilot Model Recommendation Rules

- Alert the user if a task seems too complex for the current model.
- Recommend switching to a more advanced model for architecture, algorithms, or debugging.
- Remind the user to use a cheaper model for repetitive or boilerplate tasks.
- Use the following model cost multipliers and capability notes to guide recommendations:

- `Claude Opus 4.6`: `3x`. Most advanced Anthropic model; excels at reasoning, long context, and nuanced code or design work.
- `Claude Sonnet 4.6`: `1x`. Strong generalist; good for most coding, design, and reasoning tasks.
- `Claude Haiku 4.5`: `0.33x`. Fast, low-cost; best for simple code, boilerplate, or high-volume tasks.
- `GPT-4.1`: `0x`. Advanced OpenAI model; strong at code, reasoning, and general tasks.
- `GPT-5.3-Codex`: `1x`. Code-focused; strong at code generation, refactoring, and completion.
- `GPT-5.4`: `1x`. Latest high-capability OpenAI model; strong at code, reasoning, and general tasks.
- `GPT-5.4 mini`: `0.33x`. Strong low-cost coding model; solid for moderate implementation work, but weaker on high-complexity architecture and subtle state-machine design.
- `Grok Code Fast`: `0.25x`. Fast, low-cost; best for simple code, boilerplate, or high-volume tasks.
- `Raptor Mini (preview)`: `0x`. Experimental and very fast; best for trivial or bulk code generation.

## Test-Driven Development (TDD) Policy

- For all code changes, always follow this TDD flow:
  1. Ensure that the interface or feature specification is current and correct.
  2. Create or update unit tests to verify compliance with the specification.
  3. Ensure that new or changed tests fail (red) before implementation.
  4. Update implementation until all tests pass (green).
- Always suggest and document this TDD flow before making changes.
- Never skip the red-green-refactor cycle.
- If the spec is unclear, clarify or update it before writing tests or code.
- Prefer small, incremental changes with focused tests.
- Document TDD steps in commit messages and PRs when possible.

## Test Execution Policy

- Copilot has global permission to run tests at any time, including before, during, and after code changes, to validate the TDD process and ensure code quality.
- Tests should be run automatically after any code or test change, and whenever needed to confirm the state of the codebase.

## Usage

- These rules are to be applied proactively by the Copilot agent when reviewing user requests and current model selection.

## Web Session Controller Refactor Guidance

This repository has an approved refactor plan in [docs/web-session-controller-refactor-spec.md](../docs/web-session-controller-refactor-spec.md).

### Locked Architecture Choices

- One `App` instance maps to one game session.
- The app layer must not know whether synchronization uses WebSocket, REST, polling, batching, resume, or sequence handling.
- The selected sync strategy for this refactor is Option A: snapshot-driven synchronization triggered by live events.
- Option B, event-applied client projection, is explicitly deferred unless real evidence shows a need.

### Refactor Goals

- Introduce a `GameSessionController` above the transport seam.
- Move refresh timing, queueing, stale rejection, and retry behavior out of `App.tsx`.
- Keep transport concerns below the app layer.
- Enable fake backend testing through controller ports rather than browser WebSocket stubs.

### Model Recommendations By Workstream

Use the cheapest model that is still appropriate for the task.

- Spec clarification, contracts, architecture decisions:
  Recommended model: `GPT-5.4`
  Lower-cost fallback: `Claude Sonnet 4.6`
  Avoid when possible: `Haiku` or `Raptor Mini`
  Why: Highest reasoning density and fewer architectural mistakes.
- Transport port extraction:
  Recommended model: `GPT-5.3-Codex`
  Lower-cost fallback: `GPT-5.4 mini` or `Claude Sonnet 4.6`
  Avoid when possible: `Haiku` for primary implementation
  Why: Mostly mechanical but touches core seams; `GPT-5.4 mini` is acceptable if the seam is already well specified.
- Session controller implementation:
  Recommended model: `GPT-5.4`
  Lower-cost fallback: `Claude Sonnet 4.6`
  Avoid when possible: `Haiku` or `Raptor Mini`
  Why: Highest state-machine complexity and correctness risk.
- App rewiring and shell reduction:
  Recommended model: `GPT-5.3-Codex`
  Lower-cost fallback: `GPT-5.4 mini` or `Claude Sonnet 4.6`
  Avoid when possible: `Opus` unless blocked
  Why: Mostly structured refactor work; `GPT-5.4 mini` is a good value when contracts are already fixed.
- Fake backend harness and fixtures:
  Recommended model: `Claude Sonnet 4.6`
  Lower-cost fallback: `GPT-5.4 mini` or `GPT-5.3-Codex`
  Avoid when possible: `Haiku` for initial design
  Why: Good balance of testability and cost.
- Bulk follow-up cleanup, comment polish, and doc sync:
  Recommended model: `Claude Haiku 4.5`, `GPT-5.4 mini`, or `Grok Code Fast`
  Lower-cost fallback: `Raptor Mini`
  Avoid when possible: `Opus` or `GPT-5.4`
  Why: Cheap mechanical work.

### Cost-Oriented Assignment Summary

- Use `GPT-5.4` for contract design, controller semantics, and any architectural ambiguity.
- Use `GPT-5.3-Codex` for transport extraction and App rewiring once contracts are fixed.
- Use `GPT-5.4 mini` for moderate coding tasks where the architecture is already decided. It is a strong value model and materially better than older low-cost options, but it should not be the default for subtle controller semantics or architecture-heavy work.
- Use `Claude Sonnet 4.6` where strong coding quality is needed at lower cost than an architecture-first model.
- Use `Claude Haiku 4.5`, `Grok Code Fast`, or `Raptor Mini` only for repetitive cleanup after the core design is stable.

### GPT-5.4 mini Guidance

- Treat `GPT-5.4 mini` as a capable low-cost implementation model, not a throwaway model.
- It is appropriate for medium-complexity refactors, focused file edits, test scaffolding, and well-specified transport or UI wiring work.
- It is not the preferred model for the hardest parts of this refactor, especially the session controller contract, live-sync semantics, or any state machine where small reasoning mistakes can create fragility.
- If repeated fixes, hidden coupling, or architecture drift start to appear, escalate from `GPT-5.4 mini` to `GPT-5.4` or `Claude Sonnet 4.6` rather than pushing through with a cheaper model.

### Multi-Agent Execution Order

1. Lock contracts and file ownership first.
2. Run transport extraction and session controller work in parallel.
3. Start fake backend harness after the controller contract stabilizes.
4. Rewire `App.tsx` after the controller API is ready.
5. Use cheap models only for post-refactor cleanup, not for controller design.

### Copyable Subagent Prompts

These prompts are written to be handed to a synchronous coding agent with clear scope boundaries.

#### Prompt 1: Transport Port Extraction

Use when:

- extracting request transport from live event transport
- narrowing `liveGameClient.ts`
- preserving behavior while preparing for the controller layer

Recommended model:

- Primary: `GPT-5.3-Codex`
- Fallback: `Claude Sonnet 4.6`

Prompt:

```md
Refactor the web transport seam to support the approved session-controller architecture in docs/web-session-controller-refactor-spec.md.

Constraints:
1. Do not redesign the app layer yet.
2. Do not move refresh timing, batching, retry, or stale-rejection policy into transport.
3. Preserve current runtime behavior as much as possible.
4. Keep the work scoped to transport-facing modules unless a tiny compatibility shim is required elsewhere.

Goals:
1. Separate request transport concerns from live event source concerns.
2. Introduce or refine explicit transport ports that a future GameSessionController can consume.
3. Keep App-facing compatibility shims only where necessary.

Primary files:
1. web/lib/gameClient.ts
2. web/lib/httpGameClient.ts
3. web/lib/liveGameClient.ts
4. new transport-focused modules if needed

Deliverables:
1. Clear request transport contract
2. Clear live event source contract
3. Minimal compatibility layer if current consumers still expect old exports
4. Focused tests for the new transport boundaries

Do not:
1. Re-implement App orchestration in a hook
2. Add UI-local state to transport-owned snapshot data
3. Introduce event-applied projection logic

Validation:
1. Run targeted tests relevant to the transport files you changed.
2. Summarize any behavior preserved through compatibility shims.
```

#### Prompt 2: Session Controller Implementation

Use when:

- building the new single-game session controller
- moving refresh policy out of `App.tsx`
- implementing the main orchestration seam

Recommended model:

- Primary: `GPT-5.4`
- Fallback: `Claude Sonnet 4.6`

Prompt:

```md
Implement the single-game GameSessionController described in docs/web-session-controller-refactor-spec.md.

Constraints:
1. The approved strategy is Option A: snapshot-driven synchronization triggered by live events.
2. One App instance maps to one game session.
3. The controller, not App, must own refresh timing, queueing, phase-retry behavior, stale rejection, and normalized session state.
4. Do not add gameplay rule logic or event-applied projection semantics.

Goals:
1. Create a controller API that exposes subscribe(), getSnapshot(), load(), refresh(), submitAction(), and dispose().
2. Keep the controller independent from React rendering.
3. Add a thin React adapter only if needed, separate from the controller implementation.
4. Make the controller testable with fake ports.

Primary files:
1. new web/lib/gameSessionTypes.ts
2. new web/lib/gameSessionController.ts
3. optional web/lib/useGameSession.ts
4. controller-level tests

Deliverables:
1. Controller state model
2. Live signal handling
3. Coalesced refresh scheduling
4. Stale snapshot rejection
5. Explicit cleanup path

Do not:
1. Touch presentation concerns unless needed for wiring types
2. Depend on browser WebSocket APIs directly in tests
3. Hide server authority behind local projection logic

Validation:
1. Add focused controller tests that prove the selected sync strategy.
2. Run targeted tests for controller behavior.
```

#### Prompt 3: App Delegation And Shell Reduction

Use when:

- rewiring `App.tsx` to depend on the controller
- removing transport-specific orchestration from the app shell
- extracting presentation helpers or components only as needed

Recommended model:

- Primary: `GPT-5.3-Codex`
- Fallback: `Claude Sonnet 4.6`

Prompt:

```md
Refactor web/App.tsx to consume the GameSessionController defined by docs/web-session-controller-refactor-spec.md.

Constraints:
1. App must not know about WebSocket versus REST, connection resume, batching, event sequencing, or refresh timers.
2. Keep purely visual and local UI state in App.
3. Do not recreate controller logic inside App hooks.

Goals:
1. Remove live refresh refs, timers, and retry flags from App.
2. Replace transport detection and live-sync branching with controller state consumption.
3. Extract presentation modules only where it meaningfully reduces shell complexity.

Primary files:
1. web/App.tsx
2. optional new presentation modules under web/components
3. optional pure helper extraction under web/lib

Deliverables:
1. Thin App shell focused on rendering and UI event delegation
2. Controller-backed state flow
3. Minimal, readable wiring for connection gate and debug UI

Do not:
1. Add new transport seams inside App
2. Push UI-only state back into transport-owned snapshots
3. Change gameplay behavior beyond what is required for the refactor

Validation:
1. Run targeted App and orchestration tests affected by the change.
2. Summarize what stayed in App versus what moved out.
```

#### Prompt 4: Fake Backend Harness

Use when:

- building deterministic controller tests
- replacing browser WebSocket stubs with fake ports
- preparing cleaner app-level integration tests

Recommended model:

- Primary: `Claude Sonnet 4.6`
- Fallback: `GPT-5.3-Codex`

Prompt:

```md
Implement a fake backend harness for the web session-controller refactor described in docs/web-session-controller-refactor-spec.md.

Constraints:
1. Fake the controller ports, not the browser WebSocket API.
2. Support the selected Option A sync model.
3. Keep the harness deterministic and ergonomic for tests.

Goals:
1. Create a fake request transport that can seed snapshots, queue refresh responses, record submitted actions, and inject failures.
2. Create a fake live event source that can emit connection changes, event signals, snapshot signals, and errors.
3. Make the harness reusable for controller tests first, and app tests later.

Primary files:
1. new web/lib/fakeGameBackend.ts
2. related test helpers or fixtures
3. controller tests that consume the fake harness

Deliverables:
1. Deterministic fake ports
2. Clear event-emission API for tests
3. Action recording for assertions
4. Focused tests proving the harness works with the controller

Do not:
1. Add browser-only test plumbing unless absolutely required
2. Duplicate production controller logic in the fake
3. Expand scope into UI rendering unless a small integration test is needed

Validation:
1. Run targeted tests for the fake harness and any controller tests that use it.
2. Document the intended usage in short comments or test helpers only if needed for clarity.
```

### Model Escalation Guidance

- Escalate from `GPT-5.3-Codex` or `Claude Sonnet 4.6` to `GPT-5.4` if the work starts changing controller semantics, refresh correctness, or contract shape.
- Escalate from `GPT-5.4 mini` if the task stops being mostly mechanical and starts involving architecture, concurrency, sequencing, or subtle correctness tradeoffs.
- Escalate to `Claude Opus 4.6` only if the architecture becomes genuinely ambiguous or the controller semantics prove too subtle for the cheaper models.
- De-escalate to `Haiku`, `Grok Code Fast`, or `Raptor Mini` only after interfaces and tests are stable.
