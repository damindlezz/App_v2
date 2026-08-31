CREATE TABLE IF NOT EXISTS user_annotations (
    profile_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    annotation_type TEXT NOT NULL CHECK (annotation_type IN ('bookmark','note')),
    text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(profile_id, entity_type, entity_id, annotation_type),
    FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_annotations_updated
ON user_annotations(profile_id, updated_at DESC);
