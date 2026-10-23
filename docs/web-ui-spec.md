# Onion Web UI Specification

## Purpose

This document is the top-down map and index for the Onion web client. It keeps
cross-area contracts small and points to focused specifications that can be
loaded independently.

## Architecture

- React + TypeScript SPA in `web/`.
- The backend remains authoritative for rules, phases, lifecycle, and action
  validation.
- The client renders authoritative server data and keeps interaction state
  separate from server state.
- Each area owns its UI contract; cross-area boundaries are listed below.

## Area Index

| Area | Owns | Specification |
| --- | --- | --- |
| Architecture and state | Client architecture, authority boundaries, snapshot synchronization, local versus derived state, and stable UI identity | [architecture-and-state-spec.md](web-ui/architecture-and-state-spec.md) |
| Lobby and game sessions | Lobby lifecycle, polling, discovery, mutations, game-window handoff, and lifecycle gating | [lobby-and-session-spec.md](web-ui/lobby-and-session-spec.md) |
| Interaction routing | Normalized interaction requests, routing matrix, intent vocabulary, role-specific combat routing, and stack expansion | [interaction-routing-spec.md](web-ui/interaction-routing-spec.md) |
| Unit presentation | Sprite asset management, map sizing and positioning, Inspector rendering, and unit-state visual cues | [unit-presentation-spec.md](web-ui/unit-presentation-spec.md) |
| Battlefield and combat | Board geometry, movement, combat preparation, targeting, objectives, and combat results | [battlefield-and-combat-spec.md](web-ui/battlefield-and-combat-spec.md) |
| Turn and event display | Turn acknowledgement, phase controls, inactive event stream, and combat event presentation | [turn-and-events-spec.md](web-ui/turn-and-events-spec.md) |
| Errors and validation | User-facing errors, terminal snapshot failures, diagnostics, retry boundaries, and test obligations | [errors-and-validation-spec.md](web-ui/errors-and-validation-spec.md) |

## Cross-Area Boundaries

- [Architecture and state](web-ui/architecture-and-state-spec.md) defines what
  data is authoritative and how every other area consumes it.
- [Lobby and sessions](web-ui/lobby-and-session-spec.md) ends when a game
  window has an authoritative snapshot; battlefield and turn behavior begins
  only after its lifecycle gate.
- [Interaction routing](web-ui/interaction-routing-spec.md) converts UI
  gestures into local intents or backend commands but never mutates
  authoritative state directly.
- [Unit presentation](web-ui/unit-presentation-spec.md) owns sprite lookup,
  map-only sizing and offsets, Inspector sizing, and unit-state visual cues.
- [Battlefield and combat](web-ui/battlefield-and-combat-spec.md) owns map and
  combat interactions, the shared action-eligibility contract, and the
  board-to-rail eligibility boundary. Its Selection and Eligibility section is
  canonical for phase-specific action highlights;
  [turn and events](web-ui/turn-and-events-spec.md) owns turn handoff and event
  presentation around it.
- [Errors and validation](web-ui/errors-and-validation-spec.md) applies to all
  areas, including the distinction between recoverable errors and terminal
  invalid snapshots.

## Scenario Briefing Presentation

Scenario descriptions preserve authored line breaks. Lines beginning with `-`
or `*` render as bullet items; other lines remain paragraph text. The shared
briefing renderer is used by both the Create Game preview and the in-game
scenario dialog.

Briefing objectives are grouped by their `victor` with separate headings for
The Onion and Defenders. Each objective bubble exposes generated,
condition-specific hover detail. Required markers are omitted when all
objectives are required. Escape coordinates are not listed; the escape
condition's hover detail uses its location label and mentions the map's green
crosshatching. Force summaries are generated from structured deployments and
aggregated by side and unit type.

## Contract Sources

Load a second spec only when this UI change depends on that contract.

- Command or event payloads: the matching line range in [agent-start-here.md](agent-start-here.md) for [api-contract.md](api-contract.md).
- Displayed combat or movement rules: the matching line range in [agent-start-here.md](agent-start-here.md) for [game-rules.md](game-rules.md).
- Scenario authoring shape: [scenario-schema.md](scenario-schema.md).
- Invalid snapshots and retries: [snapshot-deprecation-policy.md](snapshot-deprecation-policy.md) only.

Current lobby behavior is [web-ui/lobby-and-session-spec.md](web-ui/lobby-and-session-spec.md). Do not load work-items or archive docs for it.

## Future State

- Spectator mode remains future product work.
- Responsive/mobile work remains deferred until desktop gameplay is stable.
- Design tokens and brand direction remain undecided.
