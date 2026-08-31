import { createDefaultProgress, normalizeProgress } from '../../core/defaults';
import { isDue, scheduleReview } from '../review/review-scheduler';
import type {
  ExerciseResultEntry,
  ExerciseResultInput,
  LearningHistoryEntry,
  LearningHistoryInput,
  LearningTransactionInput,
  ProgressState,
  ResetScope,
  ReviewItem,
  ReviewSummary
} from '../../types/models';

export function createLearningHistoryEntry(profileId: string, input: LearningHistoryInput, occurredAt = new Date().toISOString()): LearningHistoryEntry {
  return {
    ...input,
    id: crypto.randomUUID(),
    profileId,
    occurredAt,
    xpDelta: input.xpDelta ?? 0
  };
}

export function createExerciseResultEntry(profileId: string, input: ExerciseResultInput, answeredAt = new Date().toISOString()): ExerciseResultEntry {
  return {
    ...input,
    id: crypto.randomUUID(),
    profileId,
    answeredAt,
    score: input.score ?? (input.wasCorrect ? 100 : 0)
  };
}

export interface LearningTransactionArtifacts {
  reviewItems: ReviewItem[];
  exerciseResults: ExerciseResultEntry[];
  historyEntry?: LearningHistoryEntry;
}

export function createLearningTransactionArtifacts(
  profileId: string,
  input: LearningTransactionInput,
  existingReviews: ReviewItem[] = [],
  now = new Date().toISOString()
): LearningTransactionArtifacts {
  const reviewIndex = new Map(existingReviews.map((item) => [`${item.contentType}:${item.contentId}`, item]));
  const reviewItems = (input.reviews ?? []).map((reviewInput) => scheduleReview(
    profileId,
    reviewInput,
    reviewIndex.get(`${reviewInput.contentType}:${reviewInput.contentId}`),
    new Date(now)
  ));
  const exerciseResults = (input.exerciseResults ?? []).map((result) => createExerciseResultEntry(profileId, result, now));
  const historyEntry = input.history ? createLearningHistoryEntry(profileId, input.history, now) : undefined;
  return { reviewItems, exerciseResults, historyEntry };
}

export function summarizeReviewItems(items: ReviewItem[], now = new Date()): ReviewSummary {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return {
    dueNow: items.filter((item) => isDue(item, now)).length,
    dueToday: items.filter((item) => new Date(item.nextReviewAt) <= endOfToday).length,
    total: items.length,
    mastered: items.filter((item) => item.mastery >= 80).length
  };
}

export function progressAfterReset(current: ProgressState, scope: ResetScope): ProgressState {
  if (scope === 'markings') {
    const next = normalizeProgress(structuredClone(current));
    next.completedLessons = [];
    next.overallProgress = 0;
    next.moduleProgress = { alphabet: 0, vocabulary: 0, grammar: 0, writing: 0, reading: 0, exercises: 0, quran: 0 };
    return next;
  }
  const preferences = structuredClone(current.preferences);
  const next = createDefaultProgress();
  next.preferences = preferences;
  return next;
}
