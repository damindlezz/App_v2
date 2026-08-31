CREATE TABLE IF NOT EXISTS content_progress (
    profile_id TEXT NOT NULL,
    module TEXT NOT NULL,
    content_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    attempts INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER NOT NULL DEFAULT 0,
    mastery INTEGER NOT NULL DEFAULT 0,
    first_started_at TEXT NOT NULL,
    last_practiced_at TEXT NOT NULL,
    completed_at TEXT,
    PRIMARY KEY (profile_id, module, content_id),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercise_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    exercise_type TEXT NOT NULL,
    was_correct INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    details_json TEXT,
    answered_at TEXT NOT NULL,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_sessions_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    activity_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_content_progress_profile_module
    ON content_progress(profile_id, module, status);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_profile_date
    ON exercise_attempts(profile_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_v2_profile_date
    ON learning_sessions_v2(profile_id, started_at DESC);

INSERT INTO app_meta(key, value) VALUES ('schema_family', 'normalized-v3')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
