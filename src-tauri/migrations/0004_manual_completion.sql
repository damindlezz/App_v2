ALTER TABLE content_progress ADD COLUMN manual_completed INTEGER NOT NULL DEFAULT 0;

-- Die folgenden Tabellen waren in der frühen Architektur nur Platzhalter und wurden nie produktiv beschrieben.
-- v0.5 verwendet ausschließlich die normalisierten Tabellen aus Migration 3.
DROP TABLE IF EXISTS lesson_progress;
DROP TABLE IF EXISTS vocabulary_progress;
DROP TABLE IF EXISTS exercise_results;
DROP TABLE IF EXISTS learning_sessions;

INSERT INTO app_meta(key, value) VALUES ('schema_family', 'normalized-v4')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
