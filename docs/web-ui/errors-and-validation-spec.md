# Web UI Errors and Validation Specification

## Purpose

Define recoverable error behavior, terminal invalid-snapshot behavior, retry
boundaries, diagnostics, and validation obligations shared by all web UI areas.

## User-Facing Errors

- User-facing errors show a friendly message and machine-readable details.
- Expandable diagnostics include `code`, `detailCode`, and `currentPhase` when
  available.
- Recoverable API, network, and parsing errors use dismissible overlays. They
  do not block the page with a modal or cause content shifts.
- Failed drafts are preserved where retrying is safe.
- The notification policy distinguishes recoverable transport/action errors
  from terminal invalid-snapshot failures. Dismissal is semantic to the error
  scope, and dismissal state resets when that scope clears and later reappears.

## Retry Boundaries

Retry limits and invalid-snapshot handling are in [snapshot-deprecation-policy.md](../snapshot-deprecation-policy.md). This spec does not add a second policy.

## Invalid Snapshots and Session Abort

- Terminal invalid-snapshot failures are not dismissible.
- The aborted state replaces the game screen. It is not an overlay.

## Validation Obligations

- Unit tests cover selectors, routing policies, payload builders, and diagnostic
  decisions.
- Component tests cover App orchestration, interaction states, lobby lifecycle,
  event display, and error surfaces.
- Integration tests cover UI and API wiring, authoritative refresh, retry
  boundaries, and lobby convergence.
- Connected game-screen tests prove that defender roster, selected-unit
  inspector, and hex-board bounds come from authoritative game state and
  scenario map data.
- Accessibility behavior, event arrival, error handling, and acknowledgement
  gating require regression coverage.
