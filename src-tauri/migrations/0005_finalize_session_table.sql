-- v9 finalisiert den normalisierten Tabellennamen. Migration 4 hat die
-- historische learning_sessions-Tabelle bereits entfernt, daher ist der Name frei.
ALTER TABLE learning_sessions_v2 RENAME TO learning_sessions;
DROP INDEX IF EXISTS idx_learning_sessions_v2_profile_date;
CREATE INDEX IF NOT EXISTS idx_learning_sessions_profile_date
    ON learning_sessions(profile_id, started_at DESC);

INSERT INTO app_meta(key, value) VALUES ('schema_family', 'normalized-v5')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
