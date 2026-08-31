-- Word-level Quran memorization state. Kept separate from profile JSON so large Hifz sets remain bounded and queryable.
CREATE TABLE IF NOT EXISTS quran_hifz_word_progress (
    profile_id TEXT NOT NULL,
    reference TEXT NOT NULL,
    word_index INTEGER NOT NULL CHECK(word_index > 0),
    status TEXT NOT NULL CHECK(status IN ('new','learning','unstable','stable','mastered')),
    repetitions INTEGER NOT NULL DEFAULT 0 CHECK(repetitions >= 0),
    error_count INTEGER NOT NULL DEFAULT 0 CHECK(error_count >= 0),
    last_reviewed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, reference, word_index),
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quran_hifz_word_profile_reference
    ON quran_hifz_word_progress(profile_id, reference, word_index);
CREATE INDEX IF NOT EXISTS idx_quran_hifz_word_weak
    ON quran_hifz_word_progress(profile_id, error_count DESC, updated_at DESC);
