# V1 and V2 Scope

## Purpose

This is the agent-facing scope boundary for current Onion work. Read it before
selecting a work item or proposing adjacent improvements.

## V1 Rule

V1 is the current playable product and its correctness, reliability, and
maintainability work. Implement V1 work when it is listed in `docs/work-items/todo.md`
or explicitly requested by the user.

Do not pull V2 features into a V1 task because they seem useful, adjacent, or
architecturally elegant. Preserve the current server-authoritative snapshot
model, REST lobby flow, per-game WebSocket flow, and existing gameplay surface.

## V1 Includes

- Authoritative server gameplay: movement, combat, phases, victory, and events.
- REST game creation, discovery, join, start, state, actions, and event polling.
- Per-game WebSocket hints, resume, reconnect, and bounded refresh behavior.
- Server-owned snapshot revisions and conditional full-snapshot refreshes.
- The current lobby flow: polling, lifecycle gating, ready-to-active handoff,
  and one dedicated game window per player session path.
- Correctness, security, testing, diagnostics, and performance work that
  preserves the boundaries above.
- The active feature work listed in `docs/work-items/todo.md`.

## V2 Backlog

These items are intentionally deferred. Do not implement them unless the user
explicitly moves them into scope.

### Accessibility

The full accessibility baseline is V2 work, including:

- Keyboard-only completion of core gameplay workflows.
- Screen-reader semantics for controls, map-equivalent interaction, rails,
  overlays, dialogs, and event streams.
- Announcements for loading, transport errors, invalid snapshots, rejected
  actions, combat results, phase changes, and game-over state.
- Non-tooltip disclosure of important information currently exposed only by
  hover or row titles.
- The detailed acceptance contract lives in
  [accessibility-overview-spec.md](accessibility-overview-spec.md).

### Lobby and Multi-Window Expansion

The implemented short-term lobby and dedicated-window flow remains V1. The
following deferred work is V2:

- A dedicated user/lobby live channel.
- Multiple concurrent game windows with focus-existing or duplicate suppression.
- Cross-window logout and authentication-expiry propagation.
- Cross-window nudges for already-open waiting games.
- Multi-match turn, ready, and notification badges.
- Leave, cancel, rematch, host transfer, private games, invite codes, and
  user-controlled ready-up.
- Removal of the legacy `ready` field after all clients use lifecycle status.

The detailed multi-window contract lives in
[multi-window-lobby-spec.md](multi-window-lobby-spec.md).

## Agent Decision Rule

When a task touches a V2 item:

1. Stop treating it as an implicit follow-up.
2. State that it is V2-deferred.
3. Continue with the smallest V1-compatible change, or ask for explicit scope
   expansion when the requested behavior depends on V2.

An explicit user request overrides this boundary for that task only. Keep the
V2 backlog documented rather than silently moving it into V1.
