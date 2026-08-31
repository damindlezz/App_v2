import { APP_VERSION } from '../../shared/version';
import { SerialTaskQueue } from '../../shared/serial-task-queue';
import { createDefaultProgress, normalizeProgress } from '../../core/defaults';
import { normalizeLevelPair } from '../../shared/levels';
import { applyContentProgressUpdates } from '../learning/content-progress-service';
import { summarizeSessionDays } from '../learning/session-service';
import type {
  BackupPackage,
  ContentProgressEntry,
  CreateProfileInput,
  ExerciseResultEntry,
  ImportBackupOptions,
  LearningHistoryEntry,
  LearningHistoryInput,
  LearningSession,
  LearningTransactionInput,
  LearningTransactionResult,
  Profile,
  ProfileData,
  ProfileSummary,
  ProgressState,
  QuranHifzEntry,
  QuranHifzWordEntry,
  ResetScope,
  ReviewItem,
  ReviewSummary,
  SessionSummary,
  SkillProgressEntry,
  UserAnnotation,
  UserAnnotationInput,
  UserAnnotationEntityType,
  UserAnnotationType
} from '../../types/models';
import { createPinCredential, verifyPin } from '../security/pin-service';
import type { StorageService } from './storage-service';
import { StorageError } from './storage-errors';
import { RUNTIME_DATA_LIMITS, STORAGE_RETENTION } from './storage-policy';
import { remapBackupData, validateBackupPackage } from './backup-service';
import { createLearningHistoryEntry, createLearningTransactionArtifacts, progressAfterReset } from './storage-domain';
import {
  DATABASE_URL,
  contentRowToEntry,
  exerciseRowToEntry,
  historyRowToEntry,
  parseProgress,
  reviewRowToItem,
  rowToProfile,
  sessionRowToEntry,
  type ContentProgressRow,
  type ExerciseRow,
  type HistoryRow,
  type ProfileRow,
  type ReviewRow,
  type SessionRow,
  type SqlDatabase,
  type SqlTransactionStatement,
} from './tauri-sqlite-records';


export class TauriSqliteStorage implements StorageService {
  readonly mode = 'tauri-sqlite' as const;
  private database: SqlDatabase | null = null;
  private readonly writeQueue = new SerialTaskQueue();

  async initialize(): Promise<void> {
    if (this.database) return;
    // Migration-Metadaten aus frueheren Dev-Builds vor dem SQLx-Migrator bereinigen.
    // @ts-ignore Wird beim Tauri-Build aufgelöst.
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('prepare_sqlite_migration_compat');
    // @ts-ignore Wird beim Tauri-Build aufgelöst.
    const module = await import('@tauri-apps/plugin-sql');
    // load() erzeugt den einzigen Runtime-Pool und fuehrt danach die registrierten Migrationen aus.
    this.database = await module.default.load(DATABASE_URL);
    await this.executeTransaction([{ query: 'PRAGMA foreign_keys = ON' }, { query: 'PRAGMA busy_timeout = 5000' }]);
    try {
      await this.executeTransaction([{ query: 'PRAGMA journal_mode = WAL' }]);
    } catch {
      // WAL ist eine Optimierung. Ein nicht unterstütztes Dateisystem darf den Start nicht verhindern.
    }
  }

  private getDb(): SqlDatabase {
    if (!this.database) throw new StorageError('SQLite wurde noch nicht initialisiert.', 'NOT_INITIALIZED');
    return this.database;
  }

  private async executeTransaction(statements: SqlTransactionStatement[]): Promise<void> {
    if (!statements.length) return;
    // @ts-ignore Wird beim Tauri-Build aufgelöst.
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('execute_sqlite_transaction', {
      db: DATABASE_URL,
      statements: statements.map((statement) => ({
        query: statement.query,
        values: statement.values ?? []
      }))
    });
  }

  private progressCoreStatements(profileId: string, progress: ProgressState, now: string): SqlTransactionStatement[] {
    const normalized = normalizeProgress(progress);
    normalized.quranHifzEntries = [];
    normalized.quranHifzWordEntries = [];
    return [
      {
        query: `INSERT INTO profile_progress (profile_id, progress_json, updated_at)
                VALUES ($1, $2, $3)
                ON CONFLICT(profile_id) DO UPDATE SET progress_json = excluded.progress_json, updated_at = excluded.updated_at`,
        values: [profileId, JSON.stringify(normalized), now]
      },
      {
        query: 'UPDATE profiles SET last_used_at = $1 WHERE id = $2',
        values: [now, profileId]
      }
    ];
  }

  private hifzEntryChanged(previous: QuranHifzEntry, next: QuranHifzEntry): boolean {
    return previous.status !== next.status
      || previous.repetitions !== next.repetitions
      || previous.errorCount !== next.errorCount
      || previous.lastReviewedAt !== next.lastReviewedAt
      || previous.updatedAt !== next.updatedAt;
  }

  private hifzWordEntryChanged(previous: QuranHifzWordEntry, next: QuranHifzWordEntry): boolean {
    return previous.status !== next.status
      || previous.repetitions !== next.repetitions
      || previous.errorCount !== next.errorCount
      || previous.lastReviewedAt !== next.lastReviewedAt
      || previous.updatedAt !== next.updatedAt;
  }

  private hifzFullStatements(profileId: string, progress: ProgressState): SqlTransactionStatement[] {
    const normalized = normalizeProgress(progress);
    return [
      { query: 'DELETE FROM quran_hifz_word_progress WHERE profile_id=$1', values: [profileId] },
      { query: 'DELETE FROM quran_hifz_progress WHERE profile_id=$1', values: [profileId] },
      ...normalized.quranHifzEntries.map((entry): SqlTransactionStatement => ({
        query: `INSERT INTO quran_hifz_progress
                (profile_id, reference, status, repetitions, error_count, last_reviewed_at, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        values: [profileId, entry.reference, entry.status, entry.repetitions, entry.errorCount, entry.lastReviewedAt, entry.updatedAt]
      })),
      ...normalized.quranHifzWordEntries.map((entry): SqlTransactionStatement => ({
        query: `INSERT INTO quran_hifz_word_progress
                (profile_id, reference, word_index, status, repetitions, error_count, last_reviewed_at, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        values: [profileId, entry.reference, entry.wordIndex, entry.status, entry.repetitions, entry.errorCount, entry.lastReviewedAt, entry.updatedAt]
      }))
    ];
  }

  private hifzDeltaStatements(profileId: string, previousProgress: ProgressState, progress: ProgressState): SqlTransactionStatement[] {
    const previous = normalizeProgress(previousProgress);
    const next = normalizeProgress(progress);
    const statements: SqlTransactionStatement[] = [];

    const previousAyahs = new Map(previous.quranHifzEntries.map((entry) => [entry.reference, entry]));
    const nextAyahs = new Map(next.quranHifzEntries.map((entry) => [entry.reference, entry]));
    for (const reference of previousAyahs.keys()) {
      if (!nextAyahs.has(reference)) statements.push({ query: 'DELETE FROM quran_hifz_progress WHERE profile_id=$1 AND reference=$2', values: [profileId, reference] });
    }
    for (const entry of next.quranHifzEntries) {
      const previousEntry = previousAyahs.get(entry.reference);
      if (previousEntry && !this.hifzEntryChanged(previousEntry, entry)) continue;
      statements.push({
        query: `INSERT INTO quran_hifz_progress
                (profile_id, reference, status, repetitions, error_count, last_reviewed_at, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT(profile_id, reference) DO UPDATE SET
                  status=excluded.status, repetitions=excluded.repetitions, error_count=excluded.error_count,
                  last_reviewed_at=excluded.last_reviewed_at, updated_at=excluded.updated_at`,
        values: [profileId, entry.reference, entry.status, entry.repetitions, entry.errorCount, entry.lastReviewedAt, entry.updatedAt]
      });
    }

    const wordKey = (entry: QuranHifzWordEntry) => `${entry.reference}:${entry.wordIndex}`;
    const previousWords = new Map(previous.quranHifzWordEntries.map((entry) => [wordKey(entry), entry]));
    const nextWords = new Map(next.quranHifzWordEntries.map((entry) => [wordKey(entry), entry]));
    for (const [key, entry] of previousWords) {
      if (!nextWords.has(key)) statements.push({
        query: 'DELETE FROM quran_hifz_word_progress WHERE profile_id=$1 AND reference=$2 AND word_index=$3',
        values: [profileId, entry.reference, entry.wordIndex]
      });
    }
    for (const entry of next.quranHifzWordEntries) {
      const previousEntry = previousWords.get(wordKey(entry));
      if (previousEntry && !this.hifzWordEntryChanged(previousEntry, entry)) continue;
      statements.push({
        query: `INSERT INTO quran_hifz_word_progress
                (profile_id, reference, word_index, status, repetitions, error_count, last_reviewed_at, updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                ON CONFLICT(profile_id, reference, word_index) DO UPDATE SET
                  status=excluded.status, repetitions=excluded.repetitions, error_count=excluded.error_count,
                  last_reviewed_at=excluded.last_reviewed_at, updated_at=excluded.updated_at`,
        values: [profileId, entry.reference, entry.wordIndex, entry.status, entry.repetitions, entry.errorCount, entry.lastReviewedAt, entry.updatedAt]
      });
    }
    return statements;
  }

  private progressStatements(
    profileId: string,
    progress: ProgressState,
    now: string,
    previousProgress?: ProgressState
  ): SqlTransactionStatement[] {
    return [
      ...this.progressCoreStatements(profileId, progress, now),
      ...(previousProgress ? this.hifzDeltaStatements(profileId, previousProgress, progress) : this.hifzFullStatements(profileId, progress))
    ];
  }

  private async hydrateHifz(profileId: string, progress: ProgressState): Promise<ProgressState> {
    const rows = await this.getDb().select<Array<{reference:string;status:QuranHifzEntry['status'];repetitions:number;error_count:number;last_reviewed_at:string|null;updated_at:string}>>(
      `SELECT reference,status,repetitions,error_count,last_reviewed_at,updated_at
       FROM quran_hifz_progress WHERE profile_id=$1 ORDER BY updated_at DESC`, [profileId]
    );
    if (rows.length) progress.quranHifzEntries = rows.map((row) => ({
      reference: row.reference, status: row.status, repetitions: Number(row.repetitions), errorCount: Number(row.error_count),
      lastReviewedAt: row.last_reviewed_at, updatedAt: row.updated_at
    }));
    const wordRows = await this.getDb().select<Array<{reference:string;word_index:number;status:QuranHifzWordEntry['status'];repetitions:number;error_count:number;last_reviewed_at:string|null;updated_at:string}>>(
      `SELECT reference,word_index,status,repetitions,error_count,last_reviewed_at,updated_at
       FROM quran_hifz_word_progress WHERE profile_id=$1 ORDER BY updated_at DESC`, [profileId]
    );
    if (wordRows.length) progress.quranHifzWordEntries = wordRows.map((row) => ({
      reference: row.reference, wordIndex: Number(row.word_index), status: row.status, repetitions: Number(row.repetitions),
      errorCount: Number(row.error_count), lastReviewedAt: row.last_reviewed_at, updatedAt: row.updated_at
    }));
    return progress;
  }

  private historyStatement(entry: LearningHistoryEntry): SqlTransactionStatement {
    return {
      query: `INSERT INTO learning_history
              (id, profile_id, module, activity_type, content_id, title, result, xp_delta, details_json, occurred_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      values: [
        entry.id,
        entry.profileId,
        entry.module,
        entry.activityType,
        entry.contentId ?? null,
        entry.title,
        entry.result ?? null,
        entry.xpDelta ?? 0,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.occurredAt
      ]
    };
  }

  private contentProgressStatement(entry: ContentProgressEntry): SqlTransactionStatement {
    return {
      query: `INSERT INTO content_progress
              (profile_id, module, content_id, status, attempts, correct_count, wrong_count, best_score, mastery,
               manual_completed, first_started_at, last_practiced_at, completed_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
              ON CONFLICT(profile_id, module, content_id) DO UPDATE SET
                status=excluded.status, attempts=excluded.attempts, correct_count=excluded.correct_count,
                wrong_count=excluded.wrong_count, best_score=excluded.best_score, mastery=excluded.mastery,
                manual_completed=excluded.manual_completed, first_started_at=excluded.first_started_at,
                last_practiced_at=excluded.last_practiced_at, completed_at=excluded.completed_at`,
      values: [
        entry.profileId, entry.module, entry.contentId, entry.status, entry.attempts, entry.correctCount,
        entry.wrongCount, entry.bestScore, entry.mastery, entry.manualCompleted ? 1 : 0,
        entry.firstStartedAt, entry.lastPracticedAt, entry.completedAt
      ]
    };
  }

  private reviewStatement(item: ReviewItem): SqlTransactionStatement {
    return {
      query: `INSERT INTO review_items
              (profile_id, content_type, content_id, prompt, answer, mastery, correct_streak, wrong_count,
               interval_days, last_reviewed_at, next_review_at, updated_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
              ON CONFLICT(profile_id, content_type, content_id) DO UPDATE SET
                prompt=excluded.prompt, answer=excluded.answer, mastery=excluded.mastery,
                correct_streak=excluded.correct_streak, wrong_count=excluded.wrong_count,
                interval_days=excluded.interval_days, last_reviewed_at=excluded.last_reviewed_at,
                next_review_at=excluded.next_review_at, updated_at=excluded.updated_at`,
      values: [
        item.profileId, item.contentType, item.contentId, item.prompt, item.answer, item.mastery,
        item.correctStreak, item.wrongCount, item.intervalDays, item.lastReviewedAt, item.nextReviewAt,
        item.updatedAt
      ]
    };
  }

  private async getRow(profileId: string): Promise<ProfileRow> {
    const rows = await this.getDb().select<ProfileRow[]>(
      `SELECT p.id, p.name, p.avatar, p.pin_hash, p.pin_salt, p.created_at, p.last_used_at,
              pr.progress_json
       FROM profiles p
       LEFT JOIN profile_progress pr ON pr.profile_id = p.id
       WHERE p.id = $1`,
      [profileId]
    );
    if (!rows[0]) throw new StorageError('Profil wurde nicht gefunden.', 'PROFILE_NOT_FOUND');
    return rows[0];
  }

  private async insertHistory(entry: LearningHistoryEntry): Promise<void> {
    await this.executeTransaction([
      this.historyStatement(entry),
      {
        query: `DELETE FROM learning_history WHERE profile_id=$1 AND id NOT IN
                (SELECT id FROM learning_history WHERE profile_id=$1 ORDER BY occurred_at DESC LIMIT $2)`,
        values: [entry.profileId, STORAGE_RETENTION.historyEntries]
      }
    ]);
  }

  async listProfiles(): Promise<ProfileSummary[]> {
    const rows = await this.getDb().select<ProfileRow[]>(
      `SELECT p.id, p.name, p.avatar, p.pin_hash, p.pin_salt, p.created_at, p.last_used_at,
              pr.progress_json,
              (SELECT COUNT(*) FROM review_items r WHERE r.profile_id = p.id AND r.next_review_at <= $1) AS due_reviews
       FROM profiles p
       LEFT JOIN profile_progress pr ON pr.profile_id = p.id
       ORDER BY p.last_used_at DESC`,
      [new Date().toISOString()]
    );

    const activeRows = await this.getDb().select<Array<{profile_id:string;active_day:string}>>(
      `SELECT profile_id, date(started_at, 'localtime') AS active_day
       FROM learning_sessions
       WHERE started_at >= datetime('now','-400 days')
       GROUP BY profile_id, active_day
       ORDER BY profile_id, active_day DESC`
    );
    const daysByProfile = new Map<string, string[]>();
    for (const item of activeRows) { const list = daysByProfile.get(item.profile_id) ?? []; list.push(item.active_day); daysByProfile.set(item.profile_id, list); }
    const today = new Date();
    const currentStreak = (days: string[]): number => {
      if (!days.length) return 0;
      const daySet = new Set(days); let streak=0; const cursor=new Date(today);
      const localKey=(date:Date):string => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      if (!daySet.has(localKey(cursor))) cursor.setDate(cursor.getDate()-1);
      while (daySet.has(localKey(cursor))) { streak++; cursor.setDate(cursor.getDate()-1); }
      return streak;
    };
    return rows.map((row) => {
      const progress = parseProgress(row.progress_json);
      return {
        ...rowToProfile(row), currentLevel: progress.preferences.currentLevel, targetLevel: progress.preferences.targetLevel, xp: progress.xp,
        vocabularyCorrect: progress.vocabularyCorrect, progressPercent: progress.overallProgress, dueReviews: Number(row.due_reviews ?? 0),
        currentStreak: currentStreak(daysByProfile.get(row.id) ?? [])
      };
    });
  }

  async createProfile(input: CreateProfileInput): Promise<ProfileData> {
    return this.writeQueue.run(async () => {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const credential = await createPinCredential(input.pin);
      const progress = createDefaultProgress();
      const levels = normalizeLevelPair(input.currentLevel, input.targetLevel);
      progress.preferences.currentLevel = levels.currentLevel;
      progress.preferences.targetLevel = levels.targetLevel;
      const profile: Profile = {
        id,
        name: input.name.trim(),
        avatar: input.avatar,
        protected: Boolean(credential.pinHash),
        createdAt: now,
        lastUsedAt: now
      };
      const historyEntry = createLearningHistoryEntry(id, {
        module: 'dashboard', activityType: 'profile_created', title: 'Profil erstellt', result: 'completed'
      });

      await this.executeTransaction([
        {
          query: `INSERT INTO profiles (id, name, avatar, pin_hash, pin_salt, created_at, last_used_at)
                  VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          values: [id, profile.name, profile.avatar, credential.pinHash, credential.pinSalt, now, now]
        },
        ...this.progressStatements(id, progress, now),
        this.historyStatement(historyEntry)
      ]);
      return { profile, progress };
    });
  }

  async openProfile(profileId: string, pin = ''): Promise<ProfileData> {
    return this.writeQueue.run(async () => {
      const row = await this.getRow(profileId);
      if (!(await verifyPin(pin, row.pin_hash, row.pin_salt))) {
        throw new StorageError('Passwort/PIN ist nicht korrekt.', 'INVALID_PIN');
      }
      const lastUsedAt = new Date().toISOString();
      await this.executeTransaction([{ query: 'UPDATE profiles SET last_used_at = $1 WHERE id = $2', values: [lastUsedAt, profileId] }]);
      row.last_used_at = lastUsedAt;
      return { profile: rowToProfile(row), progress: await this.hydrateHifz(profileId, parseProgress(row.progress_json)) };

    });
  }

  async saveProgress(profileId: string, progress: ProgressState, previousProgress?: ProgressState): Promise<void> {
    return this.writeQueue.run(async () => {
      await this.executeTransaction(this.progressStatements(profileId, progress, new Date().toISOString(), previousProgress));

    });
  }

  async deleteProfile(profileId: string, pin = ''): Promise<void> {
    return this.writeQueue.run(async () => {
      const row = await this.getRow(profileId);
      if (!(await verifyPin(pin, row.pin_hash, row.pin_salt))) {
        throw new StorageError('Passwort/PIN ist nicht korrekt.', 'INVALID_PIN');
      }
      await this.executeTransaction([{ query: 'DELETE FROM profiles WHERE id = $1', values: [profileId] }]);

    });
  }

  async commitLearningAction(profileId: string, input: LearningTransactionInput, previousProgress?: ProgressState): Promise<LearningTransactionResult> {
    return this.writeQueue.run(async () => {
      const now = new Date().toISOString();
      const statements: SqlTransactionStatement[] = [
        ...this.progressStatements(profileId, input.progress, now, previousProgress)
      ];
      if (input.contentUpdates?.length) {
        const uniqueKeys = [...new Map(input.contentUpdates.map((item) => [`${item.module}:${item.contentId}`, item])).values()];
        const where = uniqueKeys.map((_, index) => `(module=$${index * 2 + 2} AND content_id=$${index * 2 + 3})`).join(' OR ');
        const values: unknown[] = [profileId];
        for (const item of uniqueKeys) values.push(item.module, item.contentId);
        const currentRows = await this.getDb().select<ContentProgressRow[]>(
          `SELECT profile_id, module, content_id, status, attempts, correct_count, wrong_count, best_score, mastery, manual_completed,
                  first_started_at, last_practiced_at, completed_at
           FROM content_progress WHERE profile_id=$1 AND (${where})`,
          values
        );
        const current = currentRows.map(contentRowToEntry);
        const next = applyContentProgressUpdates(current, profileId, input.contentUpdates);
        for (const entry of next) statements.push(this.contentProgressStatement(entry));
      }

      let existingReviewItems: ReviewItem[] = [];
      if (input.reviews?.length) {
        const uniqueReviews = [...new Map(input.reviews.map((item) => [`${item.contentType}:${item.contentId}`, item])).values()];
        const where = uniqueReviews.map((_, index) => `(content_type=$${index * 2 + 2} AND content_id=$${index * 2 + 3})`).join(' OR ');
        const values: unknown[] = [profileId];
        for (const item of uniqueReviews) values.push(item.contentType, item.contentId);
        const rows = await this.getDb().select<ReviewRow[]>(
          `SELECT profile_id, content_type, content_id, prompt, answer, mastery, correct_streak, wrong_count,
                  interval_days, last_reviewed_at, next_review_at, updated_at
           FROM review_items WHERE profile_id=$1 AND (${where})`,
          values
        );
        existingReviewItems = rows.map(reviewRowToItem);
      }
      const artifacts = createLearningTransactionArtifacts(profileId, input, existingReviewItems, now);
      for (const updated of artifacts.reviewItems) statements.push(this.reviewStatement(updated));
      for (const entry of artifacts.exerciseResults) {
        statements.push({
          query: `INSERT INTO exercise_attempts
                  (id, profile_id, exercise_id, exercise_type, was_correct, score, details_json, answered_at)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          values: [
            entry.id, profileId, entry.exerciseId, entry.exerciseType, entry.wasCorrect ? 1 : 0,
            entry.score, entry.details ? JSON.stringify(entry.details) : null, entry.answeredAt
          ]
        });
      }
      if (artifacts.exerciseResults.length) {
        statements.push({
          query: `DELETE FROM exercise_attempts WHERE profile_id=$1 AND id NOT IN
                  (SELECT id FROM exercise_attempts WHERE profile_id=$1 ORDER BY answered_at DESC LIMIT $2)`,
          values: [profileId, STORAGE_RETENTION.exerciseResults]
        });
      }
      const historyEntry = artifacts.historyEntry;
      if (historyEntry) {
        statements.push(this.historyStatement(historyEntry));
        statements.push({
          query: `DELETE FROM learning_history WHERE profile_id=$1 AND id NOT IN
                  (SELECT id FROM learning_history WHERE profile_id=$1 ORDER BY occurred_at DESC LIMIT $2)`,
          values: [profileId, STORAGE_RETENTION.historyEntries]
        });
      }

      if (input.sessionId) {
        statements.push({
          query: `UPDATE learning_sessions
                  SET duration_seconds=duration_seconds + MIN(300, MAX(0, CAST((julianday($1)-julianday(COALESCE(last_activity_at, started_at)))*86400 AS INTEGER))),
                      last_activity_at=$1,
                      activity_count=activity_count+1
                  WHERE id=$2 AND profile_id=$3`,
          values: [now, input.sessionId, profileId]
        });
      }

      await this.executeTransaction(statements);

      const [contentProgress, reviewSummary, sessionSummary] = await Promise.all([
        this.listContentProgress(profileId),
        this.getReviewSummary(profileId),
        this.getSessionSummary(profileId)
      ]);
      return { contentProgress, reviewSummary, sessionSummary, historyEntry, reviewItems: artifacts.reviewItems, exerciseResults: artifacts.exerciseResults };
    });
  }

  async listContentProgress(profileId: string): Promise<ContentProgressEntry[]> {
    const rows = await this.getDb().select<ContentProgressRow[]>(
      `SELECT profile_id, module, content_id, status, attempts, correct_count, wrong_count, best_score, mastery, manual_completed,
              first_started_at, last_practiced_at, completed_at
       FROM content_progress WHERE profile_id=$1`,
      [profileId]
    );
    return rows.map(contentRowToEntry);
  }

  async listSkillProgress(profileId: string): Promise<SkillProgressEntry[]> {
    const rows = await this.getDb().select<Array<{profile_id:string;skill_id:string;mastery:number;confidence:number;evidence_count:number;last_practiced_at:string|null;updated_at:string}>>(
      `SELECT profile_id,skill_id,mastery,confidence,evidence_count,last_practiced_at,updated_at
       FROM skill_progress WHERE profile_id=$1 ORDER BY skill_id`,
      [profileId]
    );
    return rows.map((row) => ({
      profileId: row.profile_id,
      skillId: row.skill_id,
      mastery: Number(row.mastery),
      confidence: Number(row.confidence),
      evidenceCount: Number(row.evidence_count),
      lastPracticedAt: row.last_practiced_at,
      updatedAt: row.updated_at
    }));
  }

  async syncSkillProgress(profileId: string, entries: SkillProgressEntry[]): Promise<void> {
    return this.writeQueue.run(async () => {
      const statements: SqlTransactionStatement[] = [
        { query: 'DELETE FROM skill_progress WHERE profile_id=$1', values: [profileId] }
      ];
      for (const entry of entries) {
        statements.push({
          query: `INSERT INTO skill_progress
                  (profile_id,skill_id,mastery,confidence,evidence_count,last_practiced_at,updated_at)
                  VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          values: [profileId, entry.skillId, entry.mastery, entry.confidence, entry.evidenceCount, entry.lastPracticedAt, entry.updatedAt]
        });
      }
      await this.executeTransaction(statements);
    });
  }

  async upsertSkillProgress(profileId: string, entries: SkillProgressEntry[]): Promise<void> {
    if (!entries.length) return;
    return this.writeQueue.run(async () => {
      const statements: SqlTransactionStatement[] = entries.map((entry) => ({
        query: `INSERT INTO skill_progress
                (profile_id,skill_id,mastery,confidence,evidence_count,last_practiced_at,updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT(profile_id,skill_id) DO UPDATE SET
                  mastery=excluded.mastery,
                  confidence=excluded.confidence,
                  evidence_count=excluded.evidence_count,
                  last_practiced_at=excluded.last_practiced_at,
                  updated_at=excluded.updated_at`,
        values: [profileId, entry.skillId, entry.mastery, entry.confidence, entry.evidenceCount, entry.lastPracticedAt, entry.updatedAt]
      }));
      await this.executeTransaction(statements);
    });
  }

  async listUserAnnotations(profileId: string): Promise<UserAnnotation[]> {
    const rows = await this.getDb().select<Array<{profile_id:string;entity_type:UserAnnotationEntityType;entity_id:string;annotation_type:UserAnnotationType;text:string;created_at:string;updated_at:string}>>(
      `SELECT profile_id,entity_type,entity_id,annotation_type,text,created_at,updated_at
       FROM user_annotations WHERE profile_id=$1 ORDER BY updated_at DESC`, [profileId]
    );
    return rows.map((row) => ({ profileId: row.profile_id, entityType: row.entity_type, entityId: row.entity_id, annotationType: row.annotation_type, text: row.text, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async upsertUserAnnotation(profileId: string, input: UserAnnotationInput): Promise<UserAnnotation> {
    return this.writeQueue.run(async () => {
      const now = new Date().toISOString();
      const existing = (await this.getDb().select<Array<{created_at:string}>>(
        `SELECT created_at FROM user_annotations WHERE profile_id=$1 AND entity_type=$2 AND entity_id=$3 AND annotation_type=$4`,
        [profileId, input.entityType, input.entityId, input.annotationType]
      ))[0];
      const annotation: UserAnnotation = { profileId, entityType: input.entityType, entityId: input.entityId, annotationType: input.annotationType, text: input.text?.trim() ?? '', createdAt: existing?.created_at ?? now, updatedAt: now };
      await this.executeTransaction([{
        query: `INSERT INTO user_annotations (profile_id,entity_type,entity_id,annotation_type,text,created_at,updated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
                ON CONFLICT(profile_id,entity_type,entity_id,annotation_type) DO UPDATE SET text=excluded.text,updated_at=excluded.updated_at`,
        values: [profileId, annotation.entityType, annotation.entityId, annotation.annotationType, annotation.text, annotation.createdAt, annotation.updatedAt]
      }]);
      return annotation;
    });
  }

  async deleteUserAnnotation(profileId: string, entityType: UserAnnotationEntityType, entityId: string, annotationType: UserAnnotationType): Promise<void> {
    return this.writeQueue.run(() => this.executeTransaction([{ query: 'DELETE FROM user_annotations WHERE profile_id=$1 AND entity_type=$2 AND entity_id=$3 AND annotation_type=$4', values: [profileId, entityType, entityId, annotationType] }]));
  }

  async recordHistory(profileId: string, input: LearningHistoryInput): Promise<LearningHistoryEntry> {
    return this.writeQueue.run(async () => {
      const entry = createLearningHistoryEntry(profileId, input);
      await this.insertHistory(entry);
      return entry;

    });
  }

  async listHistory(profileId: string, limit = 100): Promise<LearningHistoryEntry[]> {
    const query = `SELECT id, profile_id, module, activity_type, content_id, title, result, xp_delta, details_json, occurred_at
                   FROM learning_history WHERE profile_id=$1 ORDER BY occurred_at DESC${limit > 0 ? ' LIMIT $2' : ''}`;
    const rows = await this.getDb().select<HistoryRow[]>(query, limit > 0 ? [profileId, limit] : [profileId]);
    return rows.map(historyRowToEntry);
  }

  async listDueReviews(profileId: string, limit = 30): Promise<ReviewItem[]> {
    const rows = await this.getDb().select<ReviewRow[]>(
      `SELECT profile_id, content_type, content_id, prompt, answer, mastery, correct_streak, wrong_count,
              interval_days, last_reviewed_at, next_review_at, updated_at
       FROM review_items WHERE profile_id=$1 AND next_review_at <= $2
       ORDER BY next_review_at ASC${limit > 0 ? ' LIMIT $3' : ''}`,
      limit > 0 ? [profileId, new Date().toISOString(), limit] : [profileId, new Date().toISOString()]
    );
    return rows.map(reviewRowToItem);
  }

  async listAllReviews(profileId: string): Promise<ReviewItem[]> {
    const rows = await this.getDb().select<ReviewRow[]>(
      `SELECT profile_id, content_type, content_id, prompt, answer, mastery, correct_streak, wrong_count,
              interval_days, last_reviewed_at, next_review_at, updated_at
       FROM review_items WHERE profile_id=$1 ORDER BY next_review_at ASC`,
      [profileId]
    );
    return rows.map(reviewRowToItem);
  }

  async getReviewSummary(profileId: string): Promise<ReviewSummary> {
    const now = new Date();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const rows = await this.getDb().select<Array<{ due_now: number; due_today: number; total: number; mastered: number }>>(
      `SELECT
         SUM(CASE WHEN next_review_at <= $2 THEN 1 ELSE 0 END) AS due_now,
         SUM(CASE WHEN next_review_at <= $3 THEN 1 ELSE 0 END) AS due_today,
         COUNT(*) AS total,
         SUM(CASE WHEN mastery >= 80 THEN 1 ELSE 0 END) AS mastered
       FROM review_items WHERE profile_id=$1`,
      [profileId, now.toISOString(), endOfDay.toISOString()]
    );
    const row = rows[0];
    return {
      dueNow: Number(row?.due_now ?? 0),
      dueToday: Number(row?.due_today ?? 0),
      total: Number(row?.total ?? 0),
      mastered: Number(row?.mastered ?? 0)
    };
  }

  async listExerciseResults(profileId: string, limit: number = RUNTIME_DATA_LIMITS.exerciseResults): Promise<ExerciseResultEntry[]> {
    const rows = await this.getDb().select<ExerciseRow[]>(
      `SELECT id, profile_id, exercise_id, exercise_type, was_correct, score, details_json, answered_at
       FROM exercise_attempts WHERE profile_id=$1 ORDER BY answered_at DESC${limit > 0 ? ' LIMIT $2' : ''}`,
      limit > 0 ? [profileId, limit] : [profileId]
    );
    return rows.map(exerciseRowToEntry);
  }

  async startSession(profileId: string): Promise<LearningSession> {
    return this.writeQueue.run(async () => {
      const session: LearningSession = {
        id: crypto.randomUUID(),
        profileId,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSeconds: 0,
        activityCount: 0
      };
      await this.executeTransaction([{
        query: `INSERT INTO learning_sessions (id, profile_id, started_at, last_activity_at, ended_at, duration_seconds, activity_count)
                VALUES ($1,$2,$3,$3,NULL,0,0)`,
        values: [session.id, profileId, session.startedAt]
      }, {
        query: `DELETE FROM learning_sessions WHERE profile_id=$1 AND id NOT IN
                (SELECT id FROM learning_sessions WHERE profile_id=$1 ORDER BY started_at DESC LIMIT $2)`,
        values: [profileId, STORAGE_RETENTION.sessions]
      }]);
      return session;

    });
  }

  async touchSession(profileId: string, sessionId: string, activityDelta = 0): Promise<SessionSummary> {
    if (activityDelta <= 0) return this.getSessionSummary(profileId);
    return this.writeQueue.run(async () => {
      const now = new Date().toISOString();
      await this.executeTransaction([{
        query: `UPDATE learning_sessions
                SET duration_seconds=duration_seconds + MIN(300, MAX(0, CAST((julianday($1)-julianday(COALESCE(last_activity_at, started_at)))*86400 AS INTEGER))),
                    last_activity_at=$1, activity_count=activity_count+$2
                WHERE id=$3 AND profile_id=$4`,
        values: [now, activityDelta, sessionId, profileId]
      }]);
      return this.getSessionSummary(profileId);
    });
  }

  async endSession(profileId: string, sessionId: string): Promise<SessionSummary> {
    return this.writeQueue.run(async () => {
      await this.executeTransaction([{
        query: 'UPDATE learning_sessions SET ended_at=$1 WHERE id=$2 AND profile_id=$3',
        values: [new Date().toISOString(), sessionId, profileId]
      }]);
      return this.getSessionSummary(profileId);
    });
  }

  async getSessionSummary(profileId: string): Promise<SessionSummary> {
    const rows = await this.getDb().select<Array<{ active_day: string; duration_seconds: number }>>(
      `SELECT date(started_at, 'localtime') AS active_day, SUM(duration_seconds) AS duration_seconds
       FROM learning_sessions
       WHERE profile_id=$1 AND activity_count > 0
       GROUP BY active_day
       ORDER BY active_day ASC`,
      [profileId]
    );
    return summarizeSessionDays(rows.map((row) => ({ date: row.active_day, durationSeconds: Number(row.duration_seconds) || 0 })));
  }

  async listSessions(profileId: string): Promise<LearningSession[]> {
    const rows = await this.getDb().select<SessionRow[]>(
      `SELECT id, profile_id, started_at, ended_at, duration_seconds, activity_count
       FROM learning_sessions WHERE profile_id=$1 ORDER BY started_at DESC LIMIT 2000`,
      [profileId]
    );
    return rows.map(sessionRowToEntry);
  }

  async exportBackup(profileId: string, pin = ''): Promise<BackupPackage> {
    const row = await this.getRow(profileId);
    if (!(await verifyPin(pin, row.pin_hash, row.pin_salt))) {
      throw new StorageError('Passwort/PIN ist nicht korrekt.', 'INVALID_PIN');
    }
    const [contentProgress, reviewItems, learningHistory, exerciseResults, learningSessions] = await Promise.all([
      this.listContentProgress(profileId), this.listAllReviews(profileId), this.listHistory(profileId, 0),
      this.listExerciseResults(profileId, 0), this.listSessions(profileId)
    ]);
    return {
      schemaVersion: 4,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      profile: rowToProfile(row),
      progress: await this.hydrateHifz(profileId, parseProgress(row.progress_json)),
      contentProgress,
      reviewItems,
      learningHistory,
      exerciseResults,
      learningSessions,
      userAnnotations: await this.listUserAnnotations(profileId)
    };
  }

  async importBackup(backup: BackupPackage, options: ImportBackupOptions = {}): Promise<ProfileData> {
    return this.writeQueue.run(async () => {
      const validated = validateBackupPackage(backup);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const credential = await createPinCredential(options.pin);
      const profile: Profile = {
        ...validated.profile,
        id,
        name: (options.name?.trim() || `${validated.profile.name} (Import)`).slice(0, 40),
        protected: Boolean(credential.pinHash),
        createdAt: now,
        lastUsedAt: now
      };
      const remapped = remapBackupData(validated, id);
      const history = remapped.learningHistory;
      history.unshift(createLearningHistoryEntry(id, {
        module: 'settings', activityType: 'backup_imported', title: 'Profilsicherung importiert', result: 'completed'
      }));
      const importedProgress = {
        ...normalizeProgress(validated.progress),
        activeExerciseSession: null,
        activeModuleExam: null
      };
      const statements: SqlTransactionStatement[] = [
        {
          query: `INSERT INTO profiles (id,name,avatar,pin_hash,pin_salt,created_at,last_used_at)
                  VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          values: [id, profile.name, profile.avatar, credential.pinHash, credential.pinSalt, now, now]
        },
        ...this.progressStatements(id, importedProgress, now),
        ...remapped.contentProgress.map((entry) => this.contentProgressStatement(entry)),
        ...remapped.reviewItems.map((item) => this.reviewStatement(item)),
        ...history.map((entry) => this.historyStatement(entry)),
        ...remapped.userAnnotations.map((entry): SqlTransactionStatement => ({
          query: `INSERT INTO user_annotations (profile_id,entity_type,entity_id,annotation_type,text,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          values: [id, entry.entityType, entry.entityId, entry.annotationType, entry.text, entry.createdAt, entry.updatedAt]
        }))
      ];

      for (const result of remapped.exerciseResults) {
        statements.push({
          query: `INSERT INTO exercise_attempts
                  (id,profile_id,exercise_id,exercise_type,was_correct,score,details_json,answered_at)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          values: [
            result.id, id, result.exerciseId, result.exerciseType, result.wasCorrect ? 1 : 0,
            result.score ?? 0, result.details ? JSON.stringify(result.details) : null, result.answeredAt
          ]
        });
      }
      for (const session of remapped.learningSessions) {
        statements.push({
          query: `INSERT INTO learning_sessions
                  (id,profile_id,started_at,last_activity_at,ended_at,duration_seconds,activity_count)
                  VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          values: [session.id, id, session.startedAt, session.endedAt ?? session.startedAt, session.endedAt, session.durationSeconds, session.activityCount]
        });
      }

      await this.executeTransaction(statements);
      return { profile, progress: importedProgress };
    });
  }

  async resetLearningData(profileId: string, scope: ResetScope): Promise<ProfileData> {
    return this.writeQueue.run(async () => {
      const row = await this.getRow(profileId);
      const parsed = parseProgress(row.progress_json);
      // Hifz lives outside progress_json. Hydrate it for every reset so the delta
      // writer can preserve markings-only resets and delete Hifz on learning/all.
      const current = await this.hydrateHifz(profileId, parsed);
      const next = progressAfterReset(current, scope);
      const statements: SqlTransactionStatement[] = [];

      if (scope === 'markings') {
        statements.push(
          {
            query: 'DELETE FROM content_progress WHERE profile_id=$1 AND manual_completed=1 AND attempts=0',
            values: [profileId]
          },
          {
            query: `UPDATE content_progress SET manual_completed=0,
                      status=CASE WHEN mastery>=80 THEN 'mastered' WHEN mastery>=60 OR best_score>=70 THEN 'completed' ELSE 'in_progress' END,
                      completed_at=CASE WHEN mastery>=60 OR best_score>=70 THEN completed_at ELSE NULL END
                    WHERE profile_id=$1 AND manual_completed=1`,
            values: [profileId]
          }
        );
      } else {
        statements.push(
          { query: 'DELETE FROM content_progress WHERE profile_id=$1', values: [profileId] },
          { query: 'DELETE FROM review_items WHERE profile_id=$1', values: [profileId] },
          { query: 'DELETE FROM exercise_attempts WHERE profile_id=$1', values: [profileId] },
          { query: 'DELETE FROM skill_progress WHERE profile_id=$1', values: [profileId] }
        );
        if (scope === 'all') {
          statements.push(
            { query: 'DELETE FROM learning_history WHERE profile_id=$1', values: [profileId] },
            { query: 'DELETE FROM learning_sessions WHERE profile_id=$1', values: [profileId] },
            { query: 'DELETE FROM user_annotations WHERE profile_id=$1', values: [profileId] }
          );
        }
      }

      const now = new Date().toISOString();
      const historyEntry = createLearningHistoryEntry(profileId, {
        module: 'settings',
        activityType: 'progress_reset',
        title: scope === 'markings'
          ? 'Lernmarkierungen zurückgesetzt'
          : scope === 'learning'
            ? 'Fortschritt und Wiederholungen zurückgesetzt'
            : 'Profil-Lerndaten vollständig geleert',
        result: 'changed'
      });
      statements.push(...this.progressStatements(profileId, next, now, current), this.historyStatement(historyEntry));
      await this.executeTransaction(statements);

      row.last_used_at = now;
      return { profile: rowToProfile(row), progress: next };
    });
  }
}
