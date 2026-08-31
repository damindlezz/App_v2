import { APP_VERSION } from '../../shared/version';
import { SerialTaskQueue } from '../../shared/serial-task-queue';
import { createDefaultProgress, normalizeProgress } from '../../core/defaults';
import { normalizeLevelPair } from '../../shared/levels';
import { applyContentProgressUpdates } from '../learning/content-progress-service';
import { endSession as closeSession, recordSessionActivity, summarizeSessions } from '../learning/session-service';
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
  ProfileData,
  ProfileSummary,
  ProgressState,
  ResetScope,
  ReviewItem,
  ReviewSummary,
  SessionSummary,
  SkillProgressEntry,
  StoredProfileRecord,
  UserAnnotation,
  UserAnnotationInput,
  UserAnnotationEntityType,
  UserAnnotationType
} from '../../types/models';
import { createPinCredential, verifyPin } from '../security/pin-service';
import { isDue } from '../review/review-scheduler';
import type { StorageService } from './storage-service';
import { RUNTIME_DATA_LIMITS, STORAGE_RETENTION } from './storage-policy';
import { StorageError } from './storage-errors';
import { remapBackupData, validateBackupPackage } from './backup-service';
import { createLearningHistoryEntry, createLearningTransactionArtifacts, progressAfterReset, summarizeReviewItems } from './storage-domain';

const DATABASE_NAME = 'arabisch-lernen-preview';
const DATABASE_VERSION = 6;
const PROFILE_STORE = 'profiles';
const SEGMENT_STORE = 'profile-segments';
const HISTORY_STORE = 'history-events';
const EXERCISE_STORE = 'exercise-events';
const HISTORY_INDEX = 'profile-occurredAt';
const EXERCISE_INDEX = 'profile-answeredAt';

type SegmentKind = 'history' | 'reviewItems' | 'contentProgress' | 'exerciseResults' | 'sessions' | 'skillProgress' | 'userAnnotations';
type PersistedSegmentKind = Exclude<SegmentKind, 'history' | 'exerciseResults'>;
const SEGMENT_KINDS: readonly PersistedSegmentKind[] = ['reviewItems', 'contentProgress', 'sessions', 'skillProgress', 'userAnnotations'];
const LEGACY_EVENT_SEGMENTS = ['history', 'exerciseResults'] as const;

type SegmentValueMap = {
  history: LearningHistoryEntry[];
  reviewItems: ReviewItem[];
  contentProgress: ContentProgressEntry[];
  exerciseResults: ExerciseResultEntry[];
  sessions: LearningSession[];
  skillProgress: SkillProgressEntry[];
  userAnnotations: UserAnnotation[];
};

interface BrowserProfileRecord extends ProfileData {
  pinHash: string | null;
  pinSalt: string | null;
}

interface ProfileSegmentRecord<K extends SegmentKind = SegmentKind> {
  key: string;
  profileId: string;
  kind: K;
  value: SegmentValueMap[K];
}

interface ProfileEventUpdates {
  history?: LearningHistoryEntry[];
  exerciseResults?: ExerciseResultEntry[];
  clearHistory?: boolean;
  clearExerciseResults?: boolean;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function segmentKey(profileId: string, kind: SegmentKind): string {
  return `${profileId}:${kind}`;
}

function normalizeCore(record: BrowserProfileRecord): BrowserProfileRecord {
  return { ...record, progress: normalizeProgress(record.progress) };
}

function legacySegmentValue<K extends SegmentKind>(record: StoredProfileRecord, kind: K): SegmentValueMap[K] {
  const values: SegmentValueMap = {
    history: record.history ?? [],
    reviewItems: record.reviewItems ?? [],
    contentProgress: (record.contentProgress ?? []).map((entry) => ({ ...entry, manualCompleted: Boolean(entry.manualCompleted) })),
    exerciseResults: record.exerciseResults ?? [],
    sessions: record.sessions ?? [],
    skillProgress: record.skillProgress ?? [],
    userAnnotations: record.userAnnotations ?? []
  };
  return values[kind];
}

export class IndexedDbStorage implements StorageService {
  readonly mode = 'browser-indexeddb' as const;
  private database: IDBDatabase | null = null;
  private readonly writeQueue = new SerialTaskQueue();

  async initialize(): Promise<void> {
    if (this.database) return;
    if (typeof indexedDB === 'undefined') {
      throw new StorageError('Der lokale Browser-Speicher ist nicht verfügbar.', 'INDEXEDDB_UNAVAILABLE');
    }

    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      let settled = false;
      let blocked = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new StorageError(
          blocked
            ? 'Der lokale Speicher wird von einem anderen App-Fenster blockiert. Bitte andere Fenster schließen und erneut versuchen.'
            : 'Der lokale Speicher hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.',
          blocked ? 'DATABASE_BLOCKED' : 'DATABASE_TIMEOUT'
        ));
      }, 6_000);

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      };

      request.onblocked = () => { blocked = true; };
      request.onerror = () => fail(new StorageError(
        request.error?.message ? `IndexedDB konnte nicht geöffnet werden: ${request.error.message}` : 'IndexedDB konnte nicht geöffnet werden.',
        'DATABASE_OPEN_FAILED'
      ));
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction;
        if (!transaction) return;
        const oldVersion = event.oldVersion ?? 0;
        const profileStore = db.objectStoreNames.contains(PROFILE_STORE)
          ? transaction.objectStore(PROFILE_STORE)
          : db.createObjectStore(PROFILE_STORE, { keyPath: 'profile.id' });
        const segmentStore = db.objectStoreNames.contains(SEGMENT_STORE)
          ? transaction.objectStore(SEGMENT_STORE)
          : db.createObjectStore(SEGMENT_STORE, { keyPath: 'key' });
        const historyStore = db.objectStoreNames.contains(HISTORY_STORE)
          ? transaction.objectStore(HISTORY_STORE)
          : db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        const exerciseStore = db.objectStoreNames.contains(EXERCISE_STORE)
          ? transaction.objectStore(EXERCISE_STORE)
          : db.createObjectStore(EXERCISE_STORE, { keyPath: 'id' });
        if (!historyStore.indexNames.contains(HISTORY_INDEX)) historyStore.createIndex(HISTORY_INDEX, ['profileId', 'occurredAt']);
        if (!exerciseStore.indexNames.contains(EXERCISE_INDEX)) exerciseStore.createIndex(EXERCISE_INDEX, ['profileId', 'answeredAt']);

        if (oldVersion < 5) {
          const cursorRequest = profileStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const legacy = cursor.value as StoredProfileRecord;
            const allKinds = [...SEGMENT_KINDS, ...LEGACY_EVENT_SEGMENTS] as const;
            const hasLegacySegments = allKinds.some((kind) => Object.prototype.hasOwnProperty.call(legacy, kind));
            if (hasLegacySegments) {
              for (const kind of SEGMENT_KINDS) {
                const segment: ProfileSegmentRecord = {
                  key: segmentKey(legacy.profile.id, kind),
                  profileId: legacy.profile.id,
                  kind,
                  value: legacySegmentValue(legacy, kind)
                };
                segmentStore.put(segment);
              }
              for (const entry of legacySegmentValue(legacy, 'history')) historyStore.put(entry);
              for (const entry of legacySegmentValue(legacy, 'exerciseResults')) exerciseStore.put(entry);
              const core: BrowserProfileRecord = {
                profile: legacy.profile,
                progress: legacy.progress ?? createDefaultProgress(),
                pinHash: legacy.pinHash ?? null,
                pinSalt: legacy.pinSalt ?? null
              };
              cursor.update(core);
            }
            cursor.continue();
          };
        } else if (oldVersion < 6) {
          // v5 stores use profile-prefixed keys; migrate both event segment kinds with a cursor.
          const cursorRequest = segmentStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const segment = cursor.value as ProfileSegmentRecord;
            if (segment.kind === 'history') {
              for (const entry of segment.value as LearningHistoryEntry[]) historyStore.put(entry);
              cursor.delete();
            } else if (segment.kind === 'exerciseResults') {
              for (const entry of segment.value as ExerciseResultEntry[]) exerciseStore.put(entry);
              cursor.delete();
            }
            cursor.continue();
          };
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        settled = true;
        window.clearTimeout(timeout);
        db.onversionchange = () => {
          db.close();
          if (this.database === db) this.database = null;
        };
        db.onclose = () => {
          if (this.database === db) this.database = null;
        };
        resolve(db);
      };
    });
  }

  private getDb(): IDBDatabase {
    if (!this.database) throw new StorageError('Speicher wurde noch nicht initialisiert.', 'NOT_INITIALIZED');
    return this.database;
  }

  private runWrite<T>(task: () => Promise<T>): Promise<T> {
    return this.writeQueue.run(async () => {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request(`${DATABASE_NAME}:write`, { mode: 'exclusive' }, task);
      }
      return task();
    });
  }

  private async getAllCoreRecords(): Promise<BrowserProfileRecord[]> {
    const transaction = this.getDb().transaction(PROFILE_STORE, 'readonly');
    const store = transaction.objectStore(PROFILE_STORE);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error ?? new Error('Profile konnten nicht gelesen werden.'));
      request.onsuccess = () => resolve(((request.result ?? []) as BrowserProfileRecord[]).map(normalizeCore));
    });
  }

  private async getCoreRecord(profileId: string): Promise<BrowserProfileRecord> {
    const transaction = this.getDb().transaction(PROFILE_STORE, 'readonly');
    const store = transaction.objectStore(PROFILE_STORE);
    return new Promise((resolve, reject) => {
      const request = store.get(profileId);
      request.onerror = () => reject(request.error ?? new Error('Profil konnte nicht gelesen werden.'));
      request.onsuccess = () => {
        const record = request.result as BrowserProfileRecord | undefined;
        if (!record) {
          reject(new StorageError('Profil wurde nicht gefunden.', 'PROFILE_NOT_FOUND'));
          return;
        }
        resolve(normalizeCore(record));
      };
    });
  }

  private async getSegment<K extends SegmentKind>(profileId: string, kind: K): Promise<SegmentValueMap[K]> {
    const transaction = this.getDb().transaction(SEGMENT_STORE, 'readonly');
    const store = transaction.objectStore(SEGMENT_STORE);
    return new Promise((resolve, reject) => {
      const request = store.get(segmentKey(profileId, kind));
      request.onerror = () => reject(request.error ?? new Error(`${kind} konnte nicht gelesen werden.`));
      request.onsuccess = () => {
        const record = request.result as ProfileSegmentRecord<K> | undefined;
        resolve((record?.value ?? []) as SegmentValueMap[K]);
      };
    });
  }

  private eventRange(profileId: string): IDBKeyRange {
    return IDBKeyRange.bound([profileId, ''], [profileId, '\uffff']);
  }

  private async readEvents<T>(storeName: string, indexName: string, profileId: string, limit = 0): Promise<T[]> {
    const transaction = this.getDb().transaction(storeName, 'readonly');
    const index = transaction.objectStore(storeName).index(indexName);
    return new Promise((resolve, reject) => {
      const values: T[] = [];
      const request = index.openCursor(this.eventRange(profileId), 'prev');
      request.onerror = () => reject(request.error ?? new Error(`${storeName} konnte nicht gelesen werden.`));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || (limit > 0 && values.length >= limit)) {
          resolve(values);
          return;
        }
        values.push(cursor.value as T);
        cursor.continue();
      };
    });
  }

  private clearEventsInTransaction(store: IDBObjectStore, indexName: string, profileId: string): void {
    const request = store.index(indexName).openKeyCursor(this.eventRange(profileId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  }

  private pruneEventsInTransaction(store: IDBObjectStore, indexName: string, profileId: string, retention: number): void {
    const request = store.index(indexName).openKeyCursor(this.eventRange(profileId), 'prev');
    let skippedRetainedWindow = false;
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (!skippedRetainedWindow) {
        skippedRetainedWindow = true;
        cursor.advance(retention);
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  }

  private replaceEventsInTransaction<T>(
    store: IDBObjectStore,
    indexName: string,
    profileId: string,
    entries: readonly T[],
    retention: number
  ): void {
    const request = store.index(indexName).openKeyCursor(this.eventRange(profileId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
        return;
      }
      for (const entry of entries) store.put(entry);
      if (entries.length) this.pruneEventsInTransaction(store, indexName, profileId, retention);
    };
  }

  private applyEventUpdates(transaction: IDBTransaction, profileId: string, events: ProfileEventUpdates): void {
    const historyStore = transaction.objectStore(HISTORY_STORE);
    const exerciseStore = transaction.objectStore(EXERCISE_STORE);

    if (events.clearHistory) {
      this.replaceEventsInTransaction(
        historyStore,
        HISTORY_INDEX,
        profileId,
        events.history ?? [],
        STORAGE_RETENTION.historyEntries
      );
    } else {
      for (const entry of events.history ?? []) historyStore.put(entry);
      if (events.history?.length) {
        this.pruneEventsInTransaction(historyStore, HISTORY_INDEX, profileId, STORAGE_RETENTION.historyEntries);
      }
    }

    if (events.clearExerciseResults) {
      this.replaceEventsInTransaction(
        exerciseStore,
        EXERCISE_INDEX,
        profileId,
        events.exerciseResults ?? [],
        STORAGE_RETENTION.exerciseResults
      );
    } else {
      for (const entry of events.exerciseResults ?? []) exerciseStore.put(entry);
      if (events.exerciseResults?.length) {
        this.pruneEventsInTransaction(exerciseStore, EXERCISE_INDEX, profileId, STORAGE_RETENTION.exerciseResults);
      }
    }
  }

  private async getProfileSegments(profileId: string): Promise<SegmentValueMap> {
    const [values, history, exerciseResults] = await Promise.all([
      Promise.all(SEGMENT_KINDS.map((kind) => this.getSegment(profileId, kind))),
      this.readEvents<LearningHistoryEntry>(HISTORY_STORE, HISTORY_INDEX, profileId),
      this.readEvents<ExerciseResultEntry>(EXERCISE_STORE, EXERCISE_INDEX, profileId)
    ]);
    return {
      ...(Object.fromEntries(SEGMENT_KINDS.map((kind, index) => [kind, values[index]])) as Pick<SegmentValueMap, PersistedSegmentKind>),
      history,
      exerciseResults
    };
  }

  private async writeProfile(core: BrowserProfileRecord | null, updates: Partial<SegmentValueMap> = {}, events: ProfileEventUpdates = {}): Promise<void> {
    const transaction = this.getDb().transaction([PROFILE_STORE, SEGMENT_STORE, HISTORY_STORE, EXERCISE_STORE], 'readwrite');
    const profileStore = transaction.objectStore(PROFILE_STORE);
    const segmentStore = transaction.objectStore(SEGMENT_STORE);
    if (core) profileStore.put(normalizeCore(core));
    for (const kind of SEGMENT_KINDS) {
      const value = updates[kind];
      if (value === undefined || !core) continue;
      segmentStore.put({ key: segmentKey(core.profile.id, kind), profileId: core.profile.id, kind, value });
    }
    if (core) this.applyEventUpdates(transaction, core.profile.id, events);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      transaction.onerror = () => fail(transaction.error ?? new Error('Speichertransaktion ist fehlgeschlagen.'));
      transaction.onabort = () => fail(transaction.error ?? new Error('Speichertransaktion wurde abgebrochen.'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    });
  }

  private async deleteRecord(profileId: string): Promise<void> {
    const transaction = this.getDb().transaction([PROFILE_STORE, SEGMENT_STORE, HISTORY_STORE, EXERCISE_STORE], 'readwrite');
    transaction.objectStore(PROFILE_STORE).delete(profileId);
    const segmentStore = transaction.objectStore(SEGMENT_STORE);
    for (const kind of SEGMENT_KINDS) segmentStore.delete(segmentKey(profileId, kind));
    this.clearEventsInTransaction(transaction.objectStore(HISTORY_STORE), HISTORY_INDEX, profileId);
    this.clearEventsInTransaction(transaction.objectStore(EXERCISE_STORE), EXERCISE_INDEX, profileId);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      transaction.onerror = () => fail(transaction.error ?? new Error('Löschtransaktion ist fehlgeschlagen.'));
      transaction.onabort = () => fail(transaction.error ?? new Error('Löschtransaktion wurde abgebrochen.'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
    });
  }

  async listProfiles(): Promise<ProfileSummary[]> {
    const records = await this.getAllCoreRecords();
    const summaries = await Promise.all(records.map(async (record) => {
      const [reviews, sessions] = await Promise.all([
        this.getSegment(record.profile.id, 'reviewItems'),
        this.getSegment(record.profile.id, 'sessions')
      ]);
      return {
        ...record.profile,
        currentLevel: record.progress.preferences.currentLevel,
        targetLevel: record.progress.preferences.targetLevel,
        xp: record.progress.xp,
        vocabularyCorrect: record.progress.vocabularyCorrect,
        progressPercent: record.progress.overallProgress,
        dueReviews: reviews.filter((item) => isDue(item, new Date())).length,
        currentStreak: summarizeSessions(sessions).currentStreak
      };
    }));
    return summaries.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  async createProfile(input: CreateProfileInput): Promise<ProfileData> {
    return this.runWrite(async () => {
      const now = new Date().toISOString();
      const credential = await createPinCredential(input.pin);
      const profile = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        avatar: input.avatar,
        protected: Boolean(credential.pinHash),
        createdAt: now,
        lastUsedAt: now
      };
      const progress = createDefaultProgress();
      const levels = normalizeLevelPair(input.currentLevel, input.targetLevel);
      progress.preferences.currentLevel = levels.currentLevel;
      progress.preferences.targetLevel = levels.targetLevel;
      const history = [createLearningHistoryEntry(profile.id, {
        module: 'dashboard', activityType: 'profile_created', title: 'Profil erstellt', result: 'completed'
      })];
      const core: BrowserProfileRecord = { profile, progress, ...credential };
      await this.writeProfile(core, { reviewItems: [], contentProgress: [], sessions: [], skillProgress: [], userAnnotations: [] }, { history });
      return { profile: clone(profile), progress: clone(progress) };
    });
  }

  async openProfile(profileId: string, pin = ''): Promise<ProfileData> {
    return this.runWrite(async () => {
      const record = await this.getCoreRecord(profileId);
      if (!(await verifyPin(pin, record.pinHash, record.pinSalt))) throw new StorageError('Passwort/PIN ist nicht korrekt.', 'INVALID_PIN');
      record.profile.lastUsedAt = new Date().toISOString();
      await this.writeProfile(record);
      return { profile: clone(record.profile), progress: clone(record.progress) };
    });
  }

  async saveProgress(profileId: string, progress: ProgressState, _previousProgress?: ProgressState): Promise<void> {
    return this.runWrite(async () => {
      const record = await this.getCoreRecord(profileId);
      record.profile.lastUsedAt = new Date().toISOString();
      record.progress = normalizeProgress(progress);
      await this.writeProfile(record);
    });
  }

  async deleteProfile(profileId: string, pin = ''): Promise<void> {
    return this.runWrite(async () => {
      const record = await this.getCoreRecord(profileId);
      if (!(await verifyPin(pin, record.pinHash, record.pinSalt))) throw new StorageError('Passwort/PIN ist nicht korrekt.', 'INVALID_PIN');
      await this.deleteRecord(profileId);
    });
  }

  async commitLearningAction(profileId: string, input: LearningTransactionInput, _previousProgress?: ProgressState): Promise<LearningTransactionResult> {
    return this.runWrite(async () => {
      const [record, contentProgress, reviewItems, sessions] = await Promise.all([
        this.getCoreRecord(profileId),
        this.getSegment(profileId, 'contentProgress'),
        this.getSegment(profileId, 'reviewItems'),
        this.getSegment(profileId, 'sessions')
      ]);
      record.progress = normalizeProgress(input.progress);
      record.profile.lastUsedAt = new Date().toISOString();
      const nextContentProgress = applyContentProgressUpdates(contentProgress, profileId, input.contentUpdates ?? []);
      const artifacts = createLearningTransactionArtifacts(profileId, input, reviewItems);
      const nextReviews = [...reviewItems];
      for (const updated of artifacts.reviewItems) {
        const index = nextReviews.findIndex((item) => item.id === updated.id);
        if (index >= 0) nextReviews[index] = updated;
        else nextReviews.push(updated);
      }
      const historyEntry = artifacts.historyEntry;
      const nextSessions = input.sessionId
        ? sessions.map((session) => session.id === input.sessionId ? recordSessionActivity(session) : session)
        : sessions;

      const updates: Partial<SegmentValueMap> = {};
      if (input.contentUpdates?.length) updates.contentProgress = nextContentProgress;
      if (artifacts.reviewItems.length) updates.reviewItems = nextReviews;
      if (input.sessionId) updates.sessions = nextSessions;
      await this.writeProfile(record, updates, {
        history: historyEntry ? [historyEntry] : undefined,
        exerciseResults: artifacts.exerciseResults.length ? artifacts.exerciseResults : undefined
      });

      return {
        contentProgress: clone(nextContentProgress),
        reviewSummary: summarizeReviewItems(nextReviews),
        sessionSummary: summarizeSessions(nextSessions),
        historyEntry: historyEntry ? clone(historyEntry) : undefined,
        reviewItems: clone(artifacts.reviewItems),
        exerciseResults: clone(artifacts.exerciseResults)
      };
    });
  }

  async listContentProgress(profileId: string): Promise<ContentProgressEntry[]> {
    return clone((await this.getSegment(profileId, 'contentProgress')).map((entry) => ({ ...entry, manualCompleted: Boolean(entry.manualCompleted) })));
  }

  async listSkillProgress(profileId: string): Promise<SkillProgressEntry[]> {
    return clone(await this.getSegment(profileId, 'skillProgress'));
  }

  async syncSkillProgress(profileId: string, entries: SkillProgressEntry[]): Promise<void> {
    return this.runWrite(async () => {
      const record = await this.getCoreRecord(profileId);
      await this.writeProfile(record, { skillProgress: clone(entries.map((entry) => ({ ...entry, profileId }))) });
    });
  }

  async upsertSkillProgress(profileId: string, entries: SkillProgressEntry[]): Promise<void> {
    if (!entries.length) return;
    return this.runWrite(async () => {
      const [record, current] = await Promise.all([this.getCoreRecord(profileId), this.getSegment(profileId, 'skillProgress')]);
      const bySkill = new Map(current.map((entry) => [entry.skillId, entry]));
      for (const entry of entries) bySkill.set(entry.skillId, { ...entry, profileId });
      const next = [...bySkill.values()].sort((a, b) => a.skillId.localeCompare(b.skillId));
      await this.writeProfile(record, { skillProgress: next });
    });
  }

  async listUserAnnotations(profileId: string): Promise<UserAnnotation[]> {
    return clone(await this.getSegment(profileId, 'userAnnotations')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async upsertUserAnnotation(profileId: string, input: UserAnnotationInput): Promise<UserAnnotation> {
    return this.runWrite(async () => {
      const [record, current] = await Promise.all([this.getCoreRecord(profileId), this.getSegment(profileId, 'userAnnotations')]);
      const now = new Date().toISOString();
      const existing = current.find((entry) => entry.entityType === input.entityType && entry.entityId === input.entityId && entry.annotationType === input.annotationType);
      const annotation: UserAnnotation = {
        profileId, entityType: input.entityType, entityId: input.entityId, annotationType: input.annotationType,
        text: input.text?.trim() ?? '', createdAt: existing?.createdAt ?? now, updatedAt: now
      };
      const next = [annotation, ...current.filter((entry) => !(entry.entityType === input.entityType && entry.entityId === input.entityId && entry.annotationType === input.annotationType))];
      await this.writeProfile(record, { userAnnotations: next });
      return clone(annotation);
    });
  }

  async deleteUserAnnotation(profileId: string, entityType: UserAnnotationEntityType, entityId: string, annotationType: UserAnnotationType): Promise<void> {
    return this.runWrite(async () => {
      const [record, current] = await Promise.all([this.getCoreRecord(profileId), this.getSegment(profileId, 'userAnnotations')]);
      const next = current.filter((entry) => !(entry.entityType === entityType && entry.entityId === entityId && entry.annotationType === annotationType));
      await this.writeProfile(record, { userAnnotations: next });
    });
  }

  async recordHistory(profileId: string, input: LearningHistoryInput): Promise<LearningHistoryEntry> {
    return this.runWrite(async () => {
      const record = await this.getCoreRecord(profileId);
      const entry = createLearningHistoryEntry(profileId, input);
      await this.writeProfile(record, {}, { history: [entry] });
      return clone(entry);
    });
  }

  async listHistory(profileId: string, limit = 100): Promise<LearningHistoryEntry[]> {
    return clone(await this.readEvents<LearningHistoryEntry>(HISTORY_STORE, HISTORY_INDEX, profileId, limit));
  }

  async listDueReviews(profileId: string, limit = 30): Promise<ReviewItem[]> {
    const now = new Date();
    const items = clone(await this.getSegment(profileId, 'reviewItems'))
      .filter((item) => isDue(item, now)).sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
    return limit > 0 ? items.slice(0, limit) : items;
  }

  async listAllReviews(profileId: string): Promise<ReviewItem[]> {
    return clone(await this.getSegment(profileId, 'reviewItems')).sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
  }

  async getReviewSummary(profileId: string): Promise<ReviewSummary> {
    return summarizeReviewItems(await this.getSegment(profileId, 'reviewItems'));
  }

  async listExerciseResults(profileId: string, limit: number = RUNTIME_DATA_LIMITS.exerciseResults): Promise<ExerciseResultEntry[]> {
    return clone(await this.readEvents<ExerciseResultEntry>(EXERCISE_STORE, EXERCISE_INDEX, profileId, limit));
  }

  async startSession(profileId: string): Promise<LearningSession> {
    return this.runWrite(async () => {
      const [record, current] = await Promise.all([this.getCoreRecord(profileId), this.getSegment(profileId, 'sessions')]);
      const session: LearningSession = {
        id: crypto.randomUUID(), profileId, startedAt: new Date().toISOString(), endedAt: null, durationSeconds: 0, activityCount: 0
      };
      await this.writeProfile(record, { sessions: [session, ...current].slice(0, STORAGE_RETENTION.sessions) });
      return clone(session);
    });
  }

  async touchSession(profileId: string, sessionId: string, activityDelta = 0): Promise<SessionSummary> {
    if (activityDelta <= 0) return this.getSessionSummary(profileId);
    return this.runWrite(async () => {
      const [record, current] = await Promise.all([this.getCoreRecord(profileId), this.getSegment(profileId, 'sessions')]);
      const next = current.map((session) => session.id === sessionId ? recordSessionActivity(session) : session);
      await this.writeProfile(record, { sessions: next });
      return summarizeSessions(next);
    });
  }

  async endSession(profileId: string, sessionId: string): Promise<SessionSummary> {
    return this.runWrite(async () => {
      const [record, current] = await Promise.all([this.getCoreRecord(profileId), this.getSegment(profileId, 'sessions')]);
      const next = current.map((session) => session.id === sessionId ? closeSession(session) : session);
      await this.writeProfile(record, { sessions: next });
      return summarizeSessions(next);
    });
  }

  async getSessionSummary(profileId: string): Promise<SessionSummary> {
    return summarizeSessions(await this.getSegment(profileId, 'sessions'));
  }

  async listSessions(profileId: string): Promise<LearningSession[]> {
    return clone(await this.getSegment(profileId, 'sessions'));
  }

  async exportBackup(profileId: string, pin = ''): Promise<BackupPackage> {
    const [record, segments] = await Promise.all([this.getCoreRecord(profileId), this.getProfileSegments(profileId)]);
    if (!(await verifyPin(pin, record.pinHash, record.pinSalt))) throw new StorageError('Passwort/PIN ist nicht korrekt.', 'INVALID_PIN');
    return {
      schemaVersion: 4,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      profile: clone(record.profile),
      progress: clone(record.progress),
      contentProgress: clone(segments.contentProgress.map((entry) => ({ ...entry, manualCompleted: Boolean(entry.manualCompleted) }))),
      reviewItems: clone(segments.reviewItems),
      learningHistory: clone(segments.history),
      exerciseResults: clone(segments.exerciseResults),
      learningSessions: clone(segments.sessions),
      userAnnotations: clone(segments.userAnnotations)
    };
  }

  async importBackup(backup: BackupPackage, options: ImportBackupOptions = {}): Promise<ProfileData> {
    return this.runWrite(async () => {
      const validated = validateBackupPackage(backup);
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const credential = await createPinCredential(options.pin);
      const profile = {
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
      const progress = { ...normalizeProgress(validated.progress), activeExerciseSession: null, activeModuleExam: null };
      const core: BrowserProfileRecord = { profile, progress, ...credential };
      await this.writeProfile(core, {
        contentProgress: remapped.contentProgress,
        reviewItems: remapped.reviewItems,
        sessions: remapped.learningSessions,
        skillProgress: [],
        userAnnotations: remapped.userAnnotations
      }, { history, exerciseResults: remapped.exerciseResults });
      return { profile: clone(profile), progress: clone(progress) };
    });
  }

  async resetLearningData(profileId: string, scope: ResetScope): Promise<ProfileData> {
    return this.runWrite(async () => {
      const [record, contentProgress] = await Promise.all([
        this.getCoreRecord(profileId),
        this.getSegment(profileId, 'contentProgress')
      ]);
      record.progress = progressAfterReset(record.progress, scope);
      const updates: Partial<SegmentValueMap> = {};
      const events: ProfileEventUpdates = {};
      if (scope === 'markings') {
        updates.contentProgress = contentProgress.flatMap((entry) => {
          if (!entry.manualCompleted) return [entry];
          if (entry.attempts === 0) return [];
          const status = entry.mastery >= 80 ? 'mastered' : entry.mastery >= 60 || entry.bestScore >= 70 ? 'completed' : 'in_progress';
          return [{ ...entry, manualCompleted: false, status, completedAt: status === 'in_progress' ? null : entry.completedAt }];
        });
      } else {
        updates.contentProgress = [];
        updates.reviewItems = [];
        updates.skillProgress = [];
        events.clearExerciseResults = true;
        if (scope === 'all') {
          updates.sessions = [];
          updates.userAnnotations = [];
          events.clearHistory = true;
        }
      }
      const entry = createLearningHistoryEntry(profileId, {
        module: 'settings',
        activityType: 'progress_reset',
        title: scope === 'markings' ? 'Lernmarkierungen zurückgesetzt' : scope === 'learning' ? 'Fortschritt und Wiederholungen zurückgesetzt' : 'Profil-Lerndaten vollständig geleert',
        result: 'changed'
      });
      events.history = [entry];
      record.profile.lastUsedAt = new Date().toISOString();
      await this.writeProfile(record, updates, events);
      return { profile: clone(record.profile), progress: clone(record.progress) };
    });
  }
}
