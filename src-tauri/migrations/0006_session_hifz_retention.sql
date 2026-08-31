-- Production storage hardening: distinguish session activity from closure and normalize Quran Hifz state.
ALTER TABLE learning_sessions ADD COLUMN last_activity_at TEXT;
UPDATE learning_sessions SET last_activity_at = COALESCE(ended_at, started_at) WHERE last_activity_at IS NULL;

CREATE TABLE IF NOT EXISTS quran_hifz_progress (
    profile_id TEXT NOT NULL,
    reference TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('new','learning','unstable','stable','mastered')),
    repetitions INTEGER NOT NULL DEFAULT 0 CHECK(repetitions >= 0),
    error_count INTEGER NOT NULL DEFAULT 0 CHECK(error_count >= 0),
    last_reviewed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, reference),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quran_hifz_profile_status ON quran_hifz_progress(profile_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_attempts_profile_date ON exercise_attempts(profile_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_history_profile_date ON learning_history(profile_id, occurred_at DESC);
