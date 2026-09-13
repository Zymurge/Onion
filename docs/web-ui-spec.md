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
| Battlefield and combat | Board geometry, movement, combat preparation, targeting, objectives, colors, and combat results | [battlefield-and-combat-spec.md](web-ui/battlefield-and-combat-spec.md) |
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
- [Battlefield and combat](web-ui/battlefield-and-combat-spec.md) owns map and
  combat presentation; [turn and events](web-ui/turn-and-events-spec.md) owns
  turn handoff and event presentation around it.
- [Errors and validation](web-ui/errors-and-validation-spec.md) applies to all
  areas, including the distinction between recoverable errors and terminal
  invalid snapshots.

## Contract Sources

The web UI uses the endpoint and payload contracts in
[api-contract.md](api-contract.md), the rules in [game-rules.md](game-rules.md),
and the scenario shape in [scenario-schema.md](scenario-schema.md). Lobby
implementation history and deferred product work remain in the
[lobby overview](work-items/lobby-overview-spec.md) and
[multi-window lobby work item](work-items/multi-window-lobby-spec.md).

## Future State

- Spectator mode remains future product work.
- Responsive/mobile work remains deferred until desktop gameplay is stable.
- Design tokens and brand direction remain undecided.
