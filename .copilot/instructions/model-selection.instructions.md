---
description: "Model selection and escalation policy for Onion coding agents. Apply when choosing an agent, delegating work, or deciding whether to escalate."
applyTo: "**"
---

# Onion Model Selection

The machine-readable model catalog, current prices, and workstream preferences live in `.copilot/agents/agent.md`. Use that file as the source of truth for IDs and costs; do not invent prices or treat historical model names in archived docs as current.

## Routing Defaults

- Use `gpt-5.6-luna` or Gemini Flash for low-cost, well-specified edits, tests, fixtures, boilerplate, and mechanical work.
- Use `gpt-5.3-codex` for structured code generation and focused refactors with a clear contract.
- Use `gpt-5.6-terra` for architecture, contract changes, controller semantics, refresh correctness, and refactor analysis.
- Use `claude-sonnet-5` for broad refactor analysis and balanced coding when that is the selected workstream preference.
- Use Grok 4.5 as a versatile fallback for well-defined work when its context profile is a better fit.
- Escalate to `gpt-5.6-sol`, Claude Opus 4.8/5, or another powerful model only for genuinely ambiguous architecture, difficult debugging, or high-stakes correctness work. Fast-mode and Fable options are high-cost choices, not routine defaults.

## Cost And Escalation Rules

- Prefer the cheapest model that can reliably satisfy the contract. Consider input, cached-input, cache-write, output, and long-context pricing from the agent catalog rather than comparing only one rate.
- Escalate when work changes architecture, concurrency, state-machine behavior, protocol contracts, or subtle synchronization semantics.
- After two unsuccessful fix or compilation passes on a complex issue, recommend a stronger model instead of repeating the same approach.
- De-escalate after interfaces and tests are stable.
- State the reason for a model recommendation and the validation needed to confirm the result.
