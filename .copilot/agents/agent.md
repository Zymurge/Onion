---
title: "Copilot Agent Rules for Onion"
version: "1.0.0"
canonical: true
lastUpdated: "2026-08-13"
schema: "copilot-agent-v1"
scope: "repository"
approval:
  fileSystem:
    allow:
      - path: /tmp/**
        operations: [read, write, delete]
models:
  - id: gpt-5.6-luna
    displayName: "GPT-5.6 Luna"
    releaseStatus: "GA"
    category: "Lightweight"
    tier: "Default"
    costMultiplier: 0.1
    pricing:
      default:
        threshold: "<= 200K input tokens"
        inputPerMillionTokens: 0.20
        cachedInputPerMillionTokens: 0.02
        cacheWritePerMillionTokens: 0.25
        outputPerMillionTokens: 1.20
      longContext:
        threshold: "> 200K input tokens"
        inputPerMillionTokens: 0.40
        cachedInputPerMillionTokens: 0.04
        cacheWritePerMillionTokens: 0.50
        outputPerMillionTokens: 1.80
    usage: "low-cost implementation, tests, boilerplate, and well-defined small scope"
  - id: gpt-5.6-terra
    displayName: "GPT-5.6 Terra"
    releaseStatus: "GA"
    category: "Versatile"
    tier: "Default"
    costMultiplier: 1
    pricing:
      default:
        threshold: "<= 272K input tokens"
        inputPerMillionTokens: 2.00
        cachedInputPerMillionTokens: 0.20
        cacheWritePerMillionTokens: 2.50
        outputPerMillionTokens: 12.00
      longContext:
        threshold: "> 272K input tokens"
        inputPerMillionTokens: 4.00
        cachedInputPerMillionTokens: 0.40
        cacheWritePerMillionTokens: 5.00
        outputPerMillionTokens: 18.00
    usage: "architecture, refactor analysis, and correctness-sensitive implementation"
  - id: gpt-5.6-sol
    displayName: "GPT-5.6 Sol"
    releaseStatus: "GA"
    category: "Powerful"
    tier: "Default"
    costMultiplier: 2.5
    pricing:
      default:
        threshold: "<= 272K input tokens"
        inputPerMillionTokens: 5.00
        cachedInputPerMillionTokens: 0.50
        cacheWritePerMillionTokens: 6.25
        outputPerMillionTokens: 30.00
      longContext:
        threshold: "> 272K input tokens"
        inputPerMillionTokens: 10.00
        cachedInputPerMillionTokens: 1.00
        cacheWritePerMillionTokens: 12.50
        outputPerMillionTokens: 45.00
    usage: "ambiguous architecture, difficult debugging, and high-stakes reasoning"
  - id: gpt-5.3-codex
    displayName: "GPT-5.3 Codex"
    releaseStatus: "GA"
    category: "Powerful"
    tier: "Default"
    costMultiplier: 0.875
    pricing:
      default:
        threshold: "not applicable"
        inputPerMillionTokens: 1.75
        cachedInputPerMillionTokens: 0.175
        cacheWrite: "not applicable"
        outputPerMillionTokens: 14.00
    usage: "structured code generation and refactor"
  - id: claude-opus-4.8
    displayName: "Claude Opus 4.8"
    releaseStatus: "GA"
    category: "Powerful"
    costMultiplier: 2.5
    pricing:
      default:
        inputPerMillionTokens: 5.00
        cachedInputPerMillionTokens: 0.50
        cacheWritePerMillionTokens: 6.25
        outputPerMillionTokens: 25.00
    usage: "high-complexity architecture and difficult debugging"
  - id: claude-opus-5
    displayName: "Claude Opus 5"
    releaseStatus: "GA"
    category: "Powerful"
    costMultiplier: 2.5
    pricing:
      default:
        inputPerMillionTokens: 5.00
        cachedInputPerMillionTokens: 0.50
        cacheWritePerMillionTokens: 6.25
        outputPerMillionTokens: 25.00
    usage: "high-complexity architecture and difficult debugging"
  - id: claude-sonnet-5
    displayName: "Claude Sonnet 5"
    releaseStatus: "GA"
    category: "Versatile"
    costMultiplier: 1
    pricing:
      default:
        inputPerMillionTokens: 2.00
        cachedInputPerMillionTokens: 0.20
        cacheWritePerMillionTokens: 2.50
        outputPerMillionTokens: 10.00
    usage: "refactor analysis and balanced coding"
  - id: claude-opus-4.8-fast
    displayName: "Claude Opus 4.8 (fast mode)"
    releaseStatus: "GA"
    modeStatus: "preview"
    category: "Powerful"
    costMultiplier: 5
    pricing:
      default:
        inputPerMillionTokens: 10.00
        cachedInputPerMillionTokens: 1.00
        cacheWritePerMillionTokens: 12.50
        outputPerMillionTokens: 50.00
    usage: "fast-mode high-complexity work when latency matters"
  - id: claude-fable-5
    displayName: "Claude Fable 5"
    releaseStatus: "GA"
    category: "Powerful"
    costMultiplier: 5
    pricing:
      default:
        inputPerMillionTokens: 10.00
        cachedInputPerMillionTokens: 1.00
        cacheWritePerMillionTokens: 12.50
        outputPerMillionTokens: 50.00
    usage: "high-cost specialized reasoning"
  - id: grok-4.5
    displayName: "Grok 4.5"
    releaseStatus: "GA"
    category: "Versatile"
    tier: "Default"
    costMultiplier: 1
    pricing:
      default:
        threshold: "<= 200K input tokens"
        inputPerMillionTokens: 2.00
        cachedInputPerMillionTokens: 0.50
        cacheWrite: "not applicable"
        outputPerMillionTokens: 6.00
      longContext:
        threshold: "> 200K input tokens"
        inputPerMillionTokens: 4.00
        cachedInputPerMillionTokens: 1.00
        cacheWrite: "not applicable"
        outputPerMillionTokens: 12.00
    usage: "fallback for well-defined small scope"
  - id: gemini-3.6-flash
    displayName: "Gemini 3.6 Flash"
    releaseStatus: "GA"
    category: "Versatile"
    tier: "Default"
    costMultiplier: 0.375
    pricing:
      default:
        threshold: "not applicable"
        inputPerMillionTokens: 0.75
        cachedInputPerMillionTokens: 0.075
        cacheWrite: "not applicable"
        outputPerMillionTokens: 3.75
    usage: "low-cost versatile implementation and test work"
  - id: gemini-3.7-flash
    displayName: "Gemini 3.7 Flash"
    releaseStatus: "GA"
    category: "Versatile"
    tier: "Default"
    costMultiplier: 0.375
    pricing:
      default:
        threshold: "not applicable"
        inputPerMillionTokens: 0.75
        cachedInputPerMillionTokens: 0.075
        cacheWrite: "not applicable"
        outputPerMillionTokens: 3.75
    usage: "low-cost versatile implementation and test work"

escalation:
  passesBeforeEscalate: 2
  rules:
    - condition: "repeated_fix_attempts_or_compilation_failures"
      action: "recommend_step_up"
    - condition: "architecture_or_contract_change"
      action: "recommend_gpt-5.6-terra_or_gpt-5.6-sol"

workstreams:
  spec_and_architecture:
    recommended: gpt-5.6-terra
    fallback: [claude-sonnet-5]
    avoid: []
  well_defined_small_scope:
    recommended: gpt-5.6-luna
    fallback: [grok-4.5]
    avoid: [claude-haiku-4.5]
  refactor_analysis:
    recommended: claude-sonnet-5
    fallback: [gpt-5.6-terra]
    avoid: [claude-haiku-4.5, raptor-mini]
  test_case_development:
    recommended: gpt-5.6-luna
    fallback: [grok-4.5]
    avoid: []
  test_fakes:
    recommended: gpt-5.6-luna
    fallback: [gpt-5.6-terra]
    avoid: []

defaults:
  preferCheaperForBoilerplate: true
  escalationPassThreshold: 2
specializedAgents:
  - path: .copilot/agents/quagmire-agent.md
    purpose: "Specialized coding and quality agent (see Quagmire)"
    mirrorPath: "/home/zymurge/.copilot/agents/quagmire-agent.md"
    optional: true
  - path: .copilot/agents/PRimo-agent.md
    purpose: "Github interaction, PR creation and management, historical code investigations (see PRimo)"
    mirrorPath: "/home/zymurge/.copilot/agents/PRimo-agent.md"
    optional: true
---

## Copilot Agent Metadata

This file contains the repository's machine-readable model catalog, cost data, workstream preferences, approval metadata, and specialized-agent pointers. Shared project behavior and coding guidance live in `.copilot/instructions/`.
