# Database migrations

Onion uses [dbmate](https://github.com/amacneil/dbmate) with PostgreSQL migrations in `server/db/migrations`.

Migration files use numeric ordering and contain both sections:

```sql
-- migrate:up
-- forward changes

-- migrate:down
-- development rollback
```

The Docker Compose `migrate` service runs before `engine` and applies pending migrations. PostgreSQL's `/docker-entrypoint-initdb.d` mechanism is intentionally not used because it only runs for a brand-new data volume.

## Docker workflow

Start or rebuild the stack normally:

```sh
docker compose up --build -d
```

Inspect migration state:

```sh
docker compose run --rm migrate status
```

Apply pending migrations without starting the engine:

```sh
docker compose run --rm migrate
```

The local Compose database uses `sslmode=disable`; production deployments should provide the appropriate PostgreSQL SSL settings through `DATABASE_URL`.

## Existing databases

`001_initial.sql` is the preserved pre-activity baseline. New schema changes go in later migrations, such as `002_game_activity_and_archiving.sql`.

The first dbmate run against an existing Onion Docker volume applies the idempotent baseline and then the pending forward migrations. Applied versions are stored in `dbmate_schema_migrations`, separate from any legacy `schema_migrations` table created by the previous application-owned runner.
