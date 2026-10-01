-- migrate:up
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS snapshot_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_snapshot_revision_nonnegative;

ALTER TABLE matches
  ADD CONSTRAINT matches_snapshot_revision_nonnegative
  CHECK (snapshot_revision >= 0);

-- migrate:down
ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_snapshot_revision_nonnegative;

ALTER TABLE matches
  DROP COLUMN IF EXISTS snapshot_revision;
