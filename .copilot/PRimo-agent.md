---
title: "PRimo: GitHub & PR Agent (repo pointer)"
version: "1.0.0"
canonical: false
lastUpdated: "2026-05-21"
schema: "copilot-agent-v1"
scope: "repository"
agentType: "github-specialist"
source: "user-global"
mirrorPath: "/home/zymurge/.copilot/agents/PRimo-agent.md"
optional: true
---

## PRimo (repo pointer)

This file is a small repository-scoped pointer to a user-global PRimo agent. The authoritative persona and prompts live in the user prompts folder at the `mirrorPath` above. Tools and agents should treat this file as non-canonical and may honor repo-specific overrides found here.

If you want to make PRimo repo-canonical for this repository, set `canonical: true` and update content accordingly.

### Repo override

- For GitHub issue interactions, always use the GitHub CLI (`gh`) for reliable execution.
