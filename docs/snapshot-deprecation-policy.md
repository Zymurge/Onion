# Snapshot Deprecation Policy

Effective immediately, any snapshot that does not adhere to the canonical `stackRoster` bundle contract is considered deprecated and unsupported.

## What is deprecated

- Any snapshot lacking the canonical `stackRoster` bundle (`groupsById`) or the associated naming snapshot.
- Any snapshot with malformed `groupsById` (missing `groupName`, `unitType`, valid `position`, or `unitIds` array).
- Any snapshot where `defenders` is relied upon as the canonical source of stack membership.

## Policy

- Servers and clients MUST treat such snapshots as invalid.
- There is no automatic migration or compatibility shim provided by the platform.
- Loading an out-of-date snapshot should fail loudly (error response, reject on load, or show a clear terminal aborted-session UI).

## Refresh and Recovery Boundary

The server remains the single authoritative source of match state. If a client
is missing required server data, it requests the latest snapshot. A bounded
transport retry is allowed only for transient network failures or retryable
server responses (`408`, `429`, `500`, `502`, `503`, or `504`) while fetching
that snapshot or the event history.

Clients must not retry other HTTP errors, malformed responses, or invalid
snapshots. They must not retry action or diagnostic submissions. There is no
snapshot repair, fallback snapshot, migration,
version comparison, or event-race recovery. If the refreshed snapshot is still
invalid, the client reports `SNAPSHOT_INVALID` and the match is terminated for
both participants with `GAME_ABORTED`.

## Rationale

Silent fallbacks and on-the-fly inference caused bugs and divergence between server authority and client assumptions. Removing these fallbacks simplifies reasoning and reduces classes of hard-to-debug errors.

## Migration guidance

- Export any important legacy match state as data, then reconstruct a canonical snapshot using the scenario/initial-state tooling.
- Prefer re-creating matches from canonical scenario data rather than relying on automated upgrades.

## Tests & CI

- All tests must use canonical snapshots.
- Add negative tests to ensure loading invalid snapshot shapes fails as expected.

## Enforcement

- Server-side code will validate snapshot shapes at load time.
- Client-side code will validate server snapshots and error if canonical fields are missing.
