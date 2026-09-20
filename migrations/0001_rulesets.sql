CREATE TABLE IF NOT EXISTS rulesets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  origin TEXT NOT NULL,
  source_url TEXT,
  notes TEXT,
  bundle_version TEXT NOT NULL,
  game_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rulesets_updated_at ON rulesets(updated_at DESC);
