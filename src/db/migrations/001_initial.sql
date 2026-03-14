CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id        TEXT        NOT NULL,
  scenario_snapshot  JSONB       NOT NULL,
  onion_player_id    UUID        REFERENCES users(id),
  defender_player_id UUID        REFERENCES users(id),
  current_phase      TEXT        NOT NULL DEFAULT 'ONION_MOVE',
  turn_number        INTEGER     NOT NULL DEFAULT 1,
  winner             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_state (
  match_id   UUID        PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  state      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_events (
  id         BIGSERIAL   PRIMARY KEY,
  match_id   UUID        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq        INTEGER     NOT NULL,
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_game_events_match_seq ON game_events (match_id, seq);
