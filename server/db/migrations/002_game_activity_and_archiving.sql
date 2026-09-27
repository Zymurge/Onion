-- migrate:up
ALTER TABLE matches ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE matches
SET last_activity_at = COALESCE(
  (SELECT MAX(timestamp) FROM game_events WHERE game_events.match_id = matches.id),
  created_at
)
WHERE last_activity_at IS NULL;

ALTER TABLE matches ALTER COLUMN last_activity_at SET DEFAULT NOW();
ALTER TABLE matches ALTER COLUMN last_activity_at SET NOT NULL;

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_lifecycle_status_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_lifecycle_status_check
  CHECK (lifecycle_status IN ('waiting', 'ready', 'active', 'completed', 'archived'));

-- migrate:down
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_lifecycle_status_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_lifecycle_status_check
  CHECK (lifecycle_status IN ('waiting', 'ready', 'active', 'completed'));
ALTER TABLE matches DROP COLUMN IF EXISTS last_activity_at;
ALTER TABLE matches DROP COLUMN IF EXISTS completed_at;
