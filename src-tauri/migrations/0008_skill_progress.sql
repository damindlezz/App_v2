CREATE TABLE IF NOT EXISTS skill_progress (
    profile_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    mastery INTEGER NOT NULL CHECK (mastery BETWEEN 0 AND 100),
    confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
    last_practiced_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, skill_id),
    FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_progress_mastery
ON skill_progress(profile_id, mastery, confidence);
