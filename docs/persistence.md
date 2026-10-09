# Persistence

## Storage boundary

- The `matches` row holds the complete scenario snapshot, including any
	scenario-local `unitTypes`, player ids, current phase, turn, and winner.
- `game_state` JSONB is the mutable board copied from the scenario initial state. It holds unit positions, status, weapons, and the stack roster.
- Victory conditions and map terrain stay on the match row. They are not stored in `game_state`.
- The immutable per-match `RulesContext` is reconstructed from the stored
	scenario snapshot at each authoritative engine/API boundary. It is not
	persisted inside `game_state`; runtime state stores only the resolved type
	and weapon IDs needed by the board.
- `SESSION_INIT` sends the same resolved unit and weapon catalogs used by the
	match. Clients must not reconstruct scenario derivations from raw JSON.
- Payload field names are the GameState section of [api-contract.md](api-contract.md). Do not restate them here.

## Schema changes

Migration mechanics are in [database-migrations.md](database-migrations.md). Routes call named operations on `server/db/adapter.ts`. Tests use the in-memory adapter. Integration tests use PostgreSQL.

Do not load [configuration.md](configuration.md) unless the task changes deployment environment.
