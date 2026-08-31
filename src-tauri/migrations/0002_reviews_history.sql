CREATE TABLE IF NOT EXISTS review_items (
    profile_id TEXT NOT NULL,
    content_type TEXT NOT NULL,
    content_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    mastery INTEGER NOT NULL DEFAULT 0,
    correct_streak INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    interval_days INTEGER NOT NULL DEFAULT 0,
    last_reviewed_at TEXT,
    next_review_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, content_type, content_id),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_history (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL,
    module TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    content_id TEXT,
    title TEXT NOT NULL,
    result TEXT,
    xp_delta INTEGER NOT NULL DEFAULT 0,
    details_json TEXT,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_items_due
    ON review_items(profile_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_learning_history_profile_date
    ON learning_history(profile_id, occurred_at DESC);
