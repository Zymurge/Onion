---
title: "Copilot Agent Rules for Onion"
version: "1.0.0"
canonical: true
lastUpdated: "2026-05-21"
schema: "copilot-agent-v1"
scope: "repository"
approval:
  fileSystem:
    allow:
      - path: /tmp/**
        operations: [read, write, delete]
models:
  - id: gpt-5-mini
    costMultiplier: 0
    usage: "utilities, small tasks"
  - id: gpt-5.4-mini
    costMultiplier: 0.33
    usage: "low-cost coding; moderate refactors"
  - id: gpt-5.4
    costMultiplier: 1
    usage: "architecture, complex reasoning"
  - id: gpt-5.3-codex
    costMultiplier: 1
    usage: "structured code generation and refactor"
  - id: claude-opus-4.6
    costMultiplier: 3
    usage: "long-context reasoning; highest-complexity"
  - id: claude-sonnet-4.6
    costMultiplier: 1
    usage: "balanced coding and design"
  - id: claude-haiku-4.5
    costMultiplier: 0.33
    usage: "fast boilerplate and bulk edits"
  - id: grok-code-fast
    costMultiplier: 0.25
    usage: "fast mechanical cleanup"
  - id: raptor-mini
    costMultiplier: 0
    usage: "experimental, trivial/bulk generation"

escalation:
  passesBeforeEscalate: 2
  rules:
    - condition: "repeated_fix_attempts_or_compilation_failures"
      action: "recommend_step_up"
    - condition: "architecture_or_contract_change"
      action: "recommend_gpt-5.4_or_claude-opus-4.6"

workstreams:
  spec_and_architecture:
    recommended: gpt-5.4
    fallback: [claude-sonnet-4.6]
    avoid: [claude-haiku-4.5, raptor-mini]
  transport_port_extraction:
    recommended: gpt-5.3-codex
    fallback: [gpt-5.4-mini, claude-sonnet-4.6]
    avoid: [claude-haiku-4.5]
  session_controller:
    recommended: gpt-5.4
    fallback: [claude-sonnet-4.6]
    avoid: [claude-haiku-4.5, raptor-mini]
  app_rewire:
    recommended: gpt-5.3-codex
    fallback: [gpt-5.4-mini, claude-sonnet-4.6]
    avoid: [claude-opus-4.6]
  fake_backend:
    recommended: claude-sonnet-4.6
    fallback: [gpt-5.4-mini, gpt-5.3-codex]
    avoid: [claude-haiku-4.5]

defaults:
  preferCheaperForBoilerplate: true
  escalationPassThreshold: 2
specializedAgents:
  - path: .copilot/quagmire-agent.md
    purpose: "Specialized coding and quality agent (see Quagmire)"
    mirrorPath: "/home/zymurge/.copilot/agents/quagmire-agent.md"
    optional: true
  - path: .copilot/PRimo-agent.md
    purpose: "Github interaction, PR creation and management, historical code investigations (see PRimo)"
    mirrorPath: "/home/zymurge/.copilot/agents/PRimo-agent.md"
    optional: true
---

# Copilot Agent (repository)

This canonical, repository-scoped agent file is intentionally minimal. It defines repository-level model recommendations and operational approval metadata. Code-specific guidance, refactor plans, Github interaction, PR management and prompt bodies have been moved to specialized agents. (see `specializedAgents` in the frontmatter)

Keep this file small so automation and agent tooling can quickly read model and permission metadata without loading large prompt bodies.

## Approval (operational)

The repository stores operational approval metadata in the document frontmatter (see top of file). This is intended for human reviewers and automation that consume approval metadata.

## Copilot Model Recommendation Rules

- Alert the user if a task seems too complex for the current model.
- Recommend switching to a more advanced model for architecture, algorithms, or debugging.
- Remind the user to use a cheaper model for repetitive or boilerplate tasks.
- Use the following model cost multipliers and capability notes to guide recommendations:

### Model costMultiplier semantics

- `costMultiplier` is a relative numeric indicator of expected run cost and capability. `0` indicates effectively free/preview, values <1 indicate lower-cost options, and values >=1 indicate standard or higher-cost models. Use these multipliers programmatically to prefer cheaper models for boilerplate or bulk tasks and escalate to higher-cost models for architecture or correctness-sensitive work.

Refer to the `models` frontmatter mapping at the top of this file for canonical IDs, display names, and `costMultiplier` values.

### gpt-5.4-mini Guidance

- Treat `gpt-5.4-mini` as a capable low-cost implementation model, not a throwaway model.
- It is appropriate for medium-complexity refactors, focused file edits, test scaffolding, and well-specified transport or UI wiring work.

### Model Escalation Guidance

- Escalate from `GPT-5.3-Codex` or `Claude Sonnet 4.6` to `GPT-5.4` if the work starts changing controller semantics, refresh correctness, or contract shape.
- Escalate from `GPT-5.4 mini` if the task stops being mostly mechanical and starts involving architecture, concurrency, sequencing, or subtle correctness tradeoffs.
- Escalate to `Claude Opus 4.6` only if the architecture becomes genuinely ambiguous or the controller semantics prove too subtle for the cheaper models.
- De-escalate to `Haiku`, `Grok Code Fast`, or `Raptor Mini` only after interfaces and tests are stable.
- If a given model takes more than two passes to address a complex issue, such as fixing a bug or compilation issue, immediately recommend to step up models. Do not thrash the code on multiple attempts from an under powered model.
