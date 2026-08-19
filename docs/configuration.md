# Server Configuration

The server uses environment-only configuration resolved by `server/config/loadConfig.ts`.
The resolver validates all required values with Zod and fails during startup when a value is
missing, blank, or malformed. It returns one typed configuration object that is passed into
server startup, the Fastify app, database access, logging, and scenario routes.

## Required Values

| Variable | Meaning | Example |
| :--- | :--- | :--- |
| `PORT` | HTTP and WebSocket listen port, from 1 through 65535 | `3000` |
| `HOST` | Listen address | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://onion:onionpass@localhost:5432/onion` |
| `NODE_ENV` | Runtime environment: `development`, `test`, or `production` | `development` |
| `LOG_LEVEL` | Server log level: `debug`, `info`, `warn`, or `error` | `info` |
| `SCENARIOS_DIR` | Directory containing scenario JSON files | `./scenarios` |

Copy `.env.example` and replace values for a local deployment. Deployment manifests should
provide every required variable explicitly; the server does not supply runtime defaults.

`JWT_SECRET` remains separate from this first configuration slice. It is a secret input for the
upcoming JWT migration and must be supplied through the environment or a secret manager, never
through a committed configuration file.

## Tests

Server tests provide an explicit complete environment in `test/server/setup.ts`. Loader tests
pass environment objects directly to `loadConfig`, which keeps missing and malformed-value
behavior deterministic without mutating process-wide configuration.

## Scope

Deployment settings belong in this resolver. Static game rules, unit and weapon catalogs, map
geometry, and scenario objectives remain versioned game data rather than deployment configuration.
Test-harness settings remain owned by the E2E runtime configuration.
