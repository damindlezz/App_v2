from pathlib import Path
import json
import sqlite3

root = Path(__file__).resolve().parents[1]
user_migrations = sorted((root / 'src-tauri' / 'migrations').glob('*.sql'))
if len(user_migrations) != 9:
    raise SystemExit(f'Es werden genau 9 Lernstand-Migrationen erwartet, gefunden: {len(user_migrations)}')
if (root / 'src-tauri' / 'content-migrations').exists():
    raise SystemExit('Historische Content-SQL-Migrationen duerfen im Release nicht mehr gebuendelt werden.')


def apply(connection: sqlite3.Connection, migrations) -> None:
    connection.execute('PRAGMA foreign_keys=ON')
    for migration in migrations:
        connection.executescript(migration.read_text(encoding='utf-8'))


# Clean install: only personal learning data is migrated.
user_connection = sqlite3.connect(':memory:')
apply(user_connection, user_migrations)
expected_tables = {
    'profiles', 'profile_progress', 'content_progress', 'review_items',
    'learning_history', 'exercise_attempts', 'learning_sessions', 'quran_hifz_progress', 'quran_hifz_word_progress', 'skill_progress', 'user_annotations', 'app_meta'
}
tables = {row[0] for row in user_connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
missing = expected_tables - tables
if missing:
    raise SystemExit(f'Fehlende Tabellen: {sorted(missing)}')
columns = {row[1] for row in user_connection.execute('PRAGMA table_info(content_progress)')}
if 'manual_completed' not in columns:
    raise SystemExit('Migration 4 fehlt: manual_completed')
legacy = {'lesson_progress', 'vocabulary_progress', 'exercise_results', 'learning_sessions_v2'} & tables
if legacy:
    raise SystemExit(f'Redundante Alttabellen wurden nicht entfernt: {sorted(legacy)}')
print(f'{len(user_migrations)} Lernstand-Migrationen fuer Clean Install erfolgreich angewendet.')

# Upgrade path: v3 user data survives v4 and the v5 session-table rename.
upgrade = sqlite3.connect(':memory:')
apply(upgrade, user_migrations[:3])
now = '2026-08-16T10:00:00.000Z'
profile_id = 'upgrade-profile'
progress_json = json.dumps({'xp': 420, 'currentLearningModuleId': 'fusha_a2_relative_clause'}, separators=(',', ':'))
upgrade.execute('INSERT INTO profiles(id,name,avatar,created_at,last_used_at) VALUES (?,?,?,?,?)', (profile_id, 'Upgrade', 'U', now, now))
upgrade.execute('INSERT INTO profile_progress(profile_id,progress_json,updated_at) VALUES (?,?,?)', (profile_id, progress_json, now))
upgrade.execute('''INSERT INTO content_progress(profile_id,module,content_id,status,attempts,correct_count,wrong_count,best_score,mastery,first_started_at,last_practiced_at,completed_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''', (profile_id, 'courseModule', 'fusha_a2_relative_clause', 'completed', 2, 8, 1, 92, 88, now, now, now))
upgrade.execute('''INSERT INTO review_items(profile_id,content_type,content_id,prompt,answer,mastery,correct_streak,wrong_count,interval_days,next_review_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)''', (profile_id, 'vocabulary', 'vocab_a0_core_001', 'p', 'a', 70, 2, 1, 3, now, now))
upgrade.commit()
before = {
    'progress': upgrade.execute('SELECT progress_json FROM profile_progress WHERE profile_id=?', (profile_id,)).fetchone(),
    'content': upgrade.execute('SELECT module,content_id,status,attempts,mastery FROM content_progress WHERE profile_id=?', (profile_id,)).fetchall(),
    'review': upgrade.execute('SELECT content_type,content_id,mastery FROM review_items WHERE profile_id=?', (profile_id,)).fetchall(),
}
for migration in user_migrations[3:]:
    upgrade.executescript(migration.read_text(encoding='utf-8'))
after = {
    'progress': upgrade.execute('SELECT progress_json FROM profile_progress WHERE profile_id=?', (profile_id,)).fetchone(),
    'content': upgrade.execute('SELECT module,content_id,status,attempts,mastery FROM content_progress WHERE profile_id=?', (profile_id,)).fetchall(),
    'review': upgrade.execute('SELECT content_type,content_id,mastery FROM review_items WHERE profile_id=?', (profile_id,)).fetchall(),
}
if before != after:
    raise SystemExit(f'Upgrade hat Lernstand veraendert: vorher={before!r}, nachher={after!r}')
manual = upgrade.execute('SELECT manual_completed FROM content_progress WHERE profile_id=?', (profile_id,)).fetchone()
if manual != (0,):
    raise SystemExit(f'Upgrade-Default manual_completed ist falsch: {manual!r}')
session_table = upgrade.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='learning_sessions'").fetchone()
if session_table != ('learning_sessions',):
    raise SystemExit('Migration 5 hat learning_sessions nicht finalisiert.')
session_columns = {row[1] for row in upgrade.execute('PRAGMA table_info(learning_sessions)')}
if 'last_activity_at' not in session_columns:
    raise SystemExit('Migration 6 fehlt: last_activity_at')
if upgrade.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='quran_hifz_progress'").fetchone() != ('quran_hifz_progress',):
    raise SystemExit('Migration 6 fehlt: quran_hifz_progress')
if upgrade.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='quran_hifz_word_progress'").fetchone() != ('quran_hifz_word_progress',):
    raise SystemExit('Migration 7 fehlt: quran_hifz_word_progress')
if upgrade.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='skill_progress'").fetchone() != ('skill_progress',):
    raise SystemExit('Migration 8 fehlt: skill_progress')
if upgrade.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_annotations'").fetchone() != ('user_annotations',):
    raise SystemExit('Migration 9 fehlt: user_annotations')
print('Upgrade v3 -> v9 erhaelt Profil, Fortschritt und Reviewdaten vollstaendig.')

contract = json.loads((root / 'content-src' / 'release-id-contract.json').read_text(encoding='utf-8'))
alias_payload = json.loads((root / 'content-src' / 'id-aliases.json').read_text(encoding='utf-8'))
aliases = alias_payload.get('aliases', {})
if contract.get('baselineVersion') != '0.12.1' or len(contract.get('stableKeys', [])) < 1000:
    raise SystemExit('Release-ID-Vertrag ist unvollstaendig.')
if not isinstance(aliases, dict):
    raise SystemExit('Content-ID-Aliase sind kein Objekt.')
print(f"Stable-ID-Vertrag aktiv: {len(contract['stableKeys'])} eingefrorene IDs, {len(aliases)} explizite Aliase.")
