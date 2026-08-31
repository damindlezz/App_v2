import type {
  BackupPackage,
  ContentProgressEntry,
  ExerciseResultEntry,
  LearningHistoryEntry,
  LearningSession,
  ReviewItem,
  UserAnnotation
} from '../../types/models';
import { StorageError } from './storage-errors';
import { PAGE_IDS, normalizePageId } from '../../core/page-ids';
import { REGISTERED_EXERCISE_TYPES } from '../../shared/exercise-registry';

const MAX_ENTRIES_PER_COLLECTION = 100_000;
const BACKUP_PAGE_IDS = new Set<string>([...PAGE_IDS, 'quranPath']);
const CONTENT_STATUSES = new Set(['not_started', 'in_progress', 'completed', 'mastered']);
const REVIEW_TYPES = new Set(['vocabulary', 'reading', 'grammar', 'alphabet', 'quran', 'knowledge', 'speaking']);
const EXERCISE_TYPES = new Set([...REGISTERED_EXERCISE_TYPES, 'module_exam', 'chapter_exam']);
const ACTIVITY_TYPES = new Set([
  'lesson_completed', 'lesson_reopened', 'module_activity_completed', 'module_exam_completed', 'module_exam_failed',
  'vocabulary_answer', 'exercise_answer', 'writing_answer', 'review_answer', 'settings_changed', 'profile_created',
  'backup_exported', 'backup_imported', 'progress_reset'
]);
const HISTORY_RESULTS = new Set(['correct', 'wrong', 'completed', 'reopened', 'changed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}


function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isDateString(value: unknown): value is string {
  return isNonEmptyString(value) && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
}

function isNullableDateString(value: unknown): value is string | null {
  return value === null || isDateString(value);
}

function isEnum(value: unknown, allowed: Set<string>): value is string {
  return isString(value) && allowed.has(value);
}

function invalid(label: string): never {
  throw new StorageError(`Sicherung ist beschädigt: ${label}.`, 'INVALID_BACKUP');
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) invalid(`${label} fehlt`);
  if (value.length > MAX_ENTRIES_PER_COLLECTION) invalid(`${label} enthält ungewöhnlich viele Datensätze`);
  return value;
}

function validateEntries(value: unknown, label: string, validator: (entry: Record<string, unknown>) => boolean): void {
  requireArray(value, label).forEach((entry, index) => {
    if (!isRecord(entry) || !validator(entry)) invalid(`${label}, Datensatz ${index + 1} ist ungültig`);
  });
}

function validContentProgress(entry: Record<string, unknown>): boolean {
  return isNonEmptyString(entry.profileId)
    && isEnum(entry.module, BACKUP_PAGE_IDS)
    && isNonEmptyString(entry.contentId)
    && isEnum(entry.status, CONTENT_STATUSES)
    && isIntegerInRange(entry.attempts, 0)
    && isIntegerInRange(entry.correctCount, 0)
    && isIntegerInRange(entry.wrongCount, 0)
    && isNumberInRange(entry.bestScore, 0, 100)
    && isNumberInRange(entry.mastery, 0, 100)
    && isBoolean(entry.manualCompleted)
    && isDateString(entry.firstStartedAt)
    && isDateString(entry.lastPracticedAt)
    && isNullableDateString(entry.completedAt);
}

function validReviewItem(entry: Record<string, unknown>): boolean {
  return isNonEmptyString(entry.id)
    && isNonEmptyString(entry.profileId)
    && isEnum(entry.contentType, REVIEW_TYPES)
    && isNonEmptyString(entry.contentId)
    && isString(entry.prompt)
    && isString(entry.answer)
    && isNumberInRange(entry.mastery, 0, 100)
    && isIntegerInRange(entry.correctStreak, 0)
    && isIntegerInRange(entry.wrongCount, 0)
    && isIntegerInRange(entry.intervalDays, 0, 36500)
    && isNullableDateString(entry.lastReviewedAt)
    && isDateString(entry.nextReviewAt)
    && isDateString(entry.updatedAt);
}

function validHistoryEntry(entry: Record<string, unknown>): boolean {
  return isNonEmptyString(entry.id)
    && isNonEmptyString(entry.profileId)
    && isEnum(entry.module, BACKUP_PAGE_IDS)
    && isEnum(entry.activityType, ACTIVITY_TYPES)
    && isNonEmptyString(entry.title)
    && isDateString(entry.occurredAt)
    && (entry.contentId === undefined || isString(entry.contentId))
    && (entry.result === undefined || isEnum(entry.result, HISTORY_RESULTS))
    && (entry.xpDelta === undefined || isIntegerInRange(entry.xpDelta, -1_000_000, 1_000_000))
    && (entry.details === undefined || isRecord(entry.details));
}

function validExerciseResult(entry: Record<string, unknown>): boolean {
  return isNonEmptyString(entry.id)
    && isNonEmptyString(entry.profileId)
    && isNonEmptyString(entry.exerciseId)
    && isEnum(entry.exerciseType, EXERCISE_TYPES)
    && isBoolean(entry.wasCorrect)
    && isDateString(entry.answeredAt)
    && (entry.score === undefined || isNumberInRange(entry.score, 0, 100))
    && (entry.details === undefined || isRecord(entry.details));
}


function validUserAnnotation(entry: Record<string, unknown>): boolean {
  return isNonEmptyString(entry.profileId)
    && isNonEmptyString(entry.entityType)
    && isNonEmptyString(entry.entityId)
    && (entry.annotationType === 'bookmark' || entry.annotationType === 'note')
    && isString(entry.text)
    && isDateString(entry.createdAt)
    && isDateString(entry.updatedAt);
}

function validLearningSession(entry: Record<string, unknown>): boolean {
  return isNonEmptyString(entry.id)
    && isNonEmptyString(entry.profileId)
    && isDateString(entry.startedAt)
    && isNullableDateString(entry.endedAt)
    && isIntegerInRange(entry.durationSeconds, 0)
    && isIntegerInRange(entry.activityCount, 0);
}

export function validateBackupPackage(value: unknown): BackupPackage {
  if (!isRecord(value) || value.schemaVersion !== 4 || !isRecord(value.profile) || !isRecord(value.progress)) {
    throw new StorageError('Die Sicherungsdatei ist nicht mit der aktuellen Datenstruktur kompatibel.', 'INVALID_BACKUP');
  }
  if (!isNonEmptyString(value.appVersion) || !isDateString(value.exportedAt)) invalid('Versions- oder Exportinformationen fehlen');
  if (!isNonEmptyString(value.profile.id)
    || !isNonEmptyString(value.profile.name)
    || !isString(value.profile.avatar)
    || !isBoolean(value.profile.protected)
    || !isDateString(value.profile.createdAt)
    || !isDateString(value.profile.lastUsedAt)) {
    invalid('Das Profil ist ungültig');
  }
  if (!isNumberInRange(value.progress.xp, 0, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.progress.completedLessons)
    || !value.progress.completedLessons.every(isString)
    || !isRecord(value.progress.preferences)) {
    invalid('Der Lernstand ist ungültig');
  }

  validateEntries(value.contentProgress, 'Inhaltsfortschritt', validContentProgress);
  validateEntries(value.reviewItems, 'Wiederholungen', validReviewItem);
  validateEntries(value.learningHistory, 'Lernhistorie', validHistoryEntry);
  validateEntries(value.exerciseResults, 'Übungsergebnisse', validExerciseResult);
  validateEntries(value.learningSessions, 'Lernsitzungen', validLearningSession);
  if (value.userAnnotations !== undefined) validateEntries(value.userAnnotations, 'Notizen und Lesezeichen', validUserAnnotation);
  return value as unknown as BackupPackage;
}

export interface RemappedBackupData {
  contentProgress: ContentProgressEntry[];
  reviewItems: ReviewItem[];
  learningHistory: LearningHistoryEntry[];
  exerciseResults: ExerciseResultEntry[];
  learningSessions: LearningSession[];
  userAnnotations: UserAnnotation[];
}

export function remapBackupData(backup: BackupPackage, profileId: string): RemappedBackupData {
  const normalizedModule = (module: string) => normalizePageId(module) ?? 'dashboard';
  return {
    contentProgress: backup.contentProgress.map((entry) => ({
      ...entry,
      module: normalizedModule(entry.module),
      profileId,
      manualCompleted: Boolean(entry.manualCompleted)
    })),
    reviewItems: backup.reviewItems.map((item) => ({
      ...item,
      id: `${item.contentType}:${item.contentId}`,
      profileId
    })),
    learningHistory: backup.learningHistory.map((entry) => ({
      ...entry,
      module: normalizedModule(entry.module),
      id: crypto.randomUUID(),
      profileId
    })),
    exerciseResults: backup.exerciseResults.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
      profileId
    })),
    learningSessions: backup.learningSessions.map((session) => ({
      ...session,
      id: crypto.randomUUID(),
      profileId
    })),
    userAnnotations: (backup.userAnnotations ?? []).map((entry) => ({ ...entry, profileId }))
  };
}
