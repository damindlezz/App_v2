import { createDefaultProgress, normalizeProgress } from '../../core/defaults';
import type {
  ContentProgressEntry,
  ExerciseResultEntry,
  LearningHistoryEntry,
  LearningSession,
  Profile,
  ProgressState,
  ReviewItem,
} from '../../types/models';

export interface ProfileRow {
  id: string;
  name: string;
  avatar: string;
  pin_hash: string | null;
  pin_salt: string | null;
  created_at: string;
  last_used_at: string;
  progress_json: string | null;
  due_reviews?: number;
}

export interface HistoryRow {
  id: string;
  profile_id: string;
  module: LearningHistoryEntry['module'];
  activity_type: LearningHistoryEntry['activityType'];
  content_id: string | null;
  title: string;
  result: LearningHistoryEntry['result'] | null;
  xp_delta: number;
  details_json: string | null;
  occurred_at: string;
}

export interface ReviewRow {
  profile_id: string;
  content_type: ReviewItem['contentType'];
  content_id: string;
  prompt: string;
  answer: string;
  mastery: number;
  correct_streak: number;
  wrong_count: number;
  interval_days: number;
  last_reviewed_at: string | null;
  next_review_at: string;
  updated_at: string;
}

export interface ContentProgressRow {
  profile_id: string;
  module: ContentProgressEntry['module'];
  content_id: string;
  status: ContentProgressEntry['status'];
  attempts: number;
  correct_count: number;
  wrong_count: number;
  best_score: number;
  mastery: number;
  manual_completed: number;
  first_started_at: string;
  last_practiced_at: string;
  completed_at: string | null;
}

export interface ExerciseRow {
  id: string;
  profile_id: string;
  exercise_id: string;
  exercise_type: ExerciseResultEntry['exerciseType'];
  was_correct: number;
  score: number;
  details_json: string | null;
  answered_at: string;
}

export interface SessionRow {
  id: string;
  profile_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  activity_count: number;
}

export interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

export interface SqlTransactionStatement {
  query: string;
  values?: unknown[];
}

export const DATABASE_URL = 'sqlite:arabisch-lernen.db';

export function parseProgress(value: string | null): ProgressState {
  if (!value) return createDefaultProgress();
  try {
    return normalizeProgress(JSON.parse(value) as Partial<ProgressState>);
  } catch {
    return createDefaultProgress();
  }
}

export function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    protected: Boolean(row.pin_hash),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function historyRowToEntry(row: HistoryRow): LearningHistoryEntry {
  let details: Record<string, unknown> | undefined;
  if (row.details_json) {
    try { details = JSON.parse(row.details_json) as Record<string, unknown>; } catch { details = undefined; }
  }
  return {
    id: row.id,
    profileId: row.profile_id,
    module: row.module,
    activityType: row.activity_type,
    contentId: row.content_id ?? undefined,
    title: row.title,
    result: row.result ?? undefined,
    xpDelta: row.xp_delta,
    details,
    occurredAt: row.occurred_at,
  };
}

export function reviewRowToItem(row: ReviewRow): ReviewItem {
  return {
    id: `${row.content_type}:${row.content_id}`,
    profileId: row.profile_id,
    contentType: row.content_type,
    contentId: row.content_id,
    prompt: row.prompt,
    answer: row.answer,
    mastery: Number(row.mastery),
    correctStreak: Number(row.correct_streak),
    wrongCount: Number(row.wrong_count),
    intervalDays: Number(row.interval_days),
    lastReviewedAt: row.last_reviewed_at,
    nextReviewAt: row.next_review_at,
    updatedAt: row.updated_at,
  };
}

export function contentRowToEntry(row: ContentProgressRow): ContentProgressEntry {
  return {
    profileId: row.profile_id,
    module: row.module,
    contentId: row.content_id,
    status: row.status,
    attempts: Number(row.attempts),
    correctCount: Number(row.correct_count),
    wrongCount: Number(row.wrong_count),
    bestScore: Number(row.best_score),
    mastery: Number(row.mastery),
    manualCompleted: Boolean(row.manual_completed),
    firstStartedAt: row.first_started_at,
    lastPracticedAt: row.last_practiced_at,
    completedAt: row.completed_at,
  };
}

export function exerciseRowToEntry(row: ExerciseRow): ExerciseResultEntry {
  let details: Record<string, unknown> | undefined;
  if (row.details_json) {
    try { details = JSON.parse(row.details_json) as Record<string, unknown>; } catch { details = undefined; }
  }
  return {
    id: row.id,
    profileId: row.profile_id,
    exerciseId: row.exercise_id,
    exerciseType: row.exercise_type,
    wasCorrect: Boolean(row.was_correct),
    score: Number(row.score),
    details,
    answeredAt: row.answered_at,
  };
}

export function sessionRowToEntry(row: SessionRow): LearningSession {
  return {
    id: row.id,
    profileId: row.profile_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: Number(row.duration_seconds),
    activityCount: Number(row.activity_count),
  };
}
