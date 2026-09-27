# Persistence

## Storage boundary

- The `matches` row holds the scenario snapshot, player ids, current phase, turn, and winner.
- `game_state` JSONB is the mutable board copied from the scenario initial state. It holds unit positions, status, weapons, and the stack roster.
- Victory conditions and map terrain stay on the match row. They are not stored in `game_state`.
- Payload field names are the GameState section of [api-contract.md](api-contract.md). Do not restate them here.

## Schema changes

Migration mechanics are in [database-migrations.md](database-migrations.md). Routes call named operations on `server/db/adapter.ts`. Tests use the in-memory adapter. Integration tests use PostgreSQL.

Do not load [configuration.md](configuration.md) unless the task changes deployment environment.
