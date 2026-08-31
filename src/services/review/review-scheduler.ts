import type { ReviewItem, ReviewRating, ReviewResultInput } from '../../types/models';

const MAX_INTERVAL_DAYS = 365;

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function resolveRating(input: ReviewResultInput): ReviewRating {
  return input.rating ?? (input.correct ? 'good' : 'again');
}

function nextInterval(rating: ReviewRating, existing: ReviewItem | undefined, mastery: number): number {
  const previous = Math.max(0, existing?.intervalDays ?? 0);
  if (rating === 'again') return 0;
  if (rating === 'hard') return clamp(previous > 0 ? Math.round(previous * 1.2) : 1, 1, MAX_INTERVAL_DAYS);
  if (rating === 'easy') return clamp(previous > 0 ? Math.round(previous * 2.6 + 1) : 4, 1, MAX_INTERVAL_DAYS);
  const masteryFactor = 1.7 + mastery / 250;
  return clamp(previous > 0 ? Math.round(previous * masteryFactor) : 1, 1, MAX_INTERVAL_DAYS);
}

function masteryDelta(rating: ReviewRating): number {
  if (rating === 'again') return -20;
  if (rating === 'hard') return 4;
  if (rating === 'easy') return 18;
  return 12;
}

export function createReviewId(contentType: string, contentId: string): string {
  return `${contentType}:${contentId}`;
}

export function scheduleReview(
  profileId: string,
  input: ReviewResultInput,
  existing?: ReviewItem,
  reference = new Date()
): ReviewItem {
  const now = new Date(reference);
  const rating = resolveRating(input);
  const successful = rating !== 'again';
  const previousMastery = existing?.mastery ?? 0;
  const previousStreak = existing?.correctStreak ?? 0;
  const previousWrong = existing?.wrongCount ?? 0;
  const correctStreak = successful ? previousStreak + 1 : 0;
  const wrongCount = rating === 'again' ? previousWrong + 1 : previousWrong;
  const mastery = clamp(previousMastery + masteryDelta(rating), 0, 100);
  const intervalDays = nextInterval(rating, existing, mastery);

  return {
    id: createReviewId(input.contentType, input.contentId),
    profileId,
    contentType: input.contentType,
    contentId: input.contentId,
    prompt: input.prompt,
    answer: input.answer,
    mastery,
    correctStreak,
    wrongCount,
    intervalDays,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: rating === 'again' ? now.toISOString() : addDays(now, intervalDays),
    updatedAt: now.toISOString()
  };
}

export function reviewDifficulty(item: Pick<ReviewItem, 'mastery' | 'wrongCount' | 'correctStreak'>): 'hoch' | 'mittel' | 'niedrig' {
  const pressure = item.wrongCount * 12 - item.correctStreak * 5 + (100 - item.mastery);
  if (pressure >= 80) return 'hoch';
  if (pressure >= 40) return 'mittel';
  return 'niedrig';
}

export function isDue(item: ReviewItem, reference = new Date()): boolean {
  return new Date(item.nextReviewAt).getTime() <= reference.getTime();
}
