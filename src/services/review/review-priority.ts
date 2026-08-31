import type { ReviewItem } from '../../types/models';

export interface PrioritizedReview {
  item: ReviewItem;
  priority: number;
  reason: 'overdue' | 'weak' | 'errors' | 'scheduled';
}

export function prioritizeReviews(items: readonly ReviewItem[], now = new Date()): PrioritizedReview[] {
  const nowMs = now.getTime();
  return items.map((item) => {
    const dueMs = new Date(item.nextReviewAt).getTime();
    const overdueHours = Math.max(0, (nowMs - dueMs) / 3600000);
    const weakness = Math.max(0, 75 - item.mastery);
    const errors = Math.min(40, item.wrongCount * 8);
    const priority = Math.round(Math.min(100, overdueHours * 0.8 + weakness * 0.9 + errors));
    const reason = overdueHours >= 24 ? 'overdue' : item.mastery < 60 ? 'weak' : item.wrongCount >= 2 ? 'errors' : 'scheduled';
    return { item, priority, reason } as PrioritizedReview;
  }).sort((a, b) => b.priority - a.priority || a.item.nextReviewAt.localeCompare(b.item.nextReviewAt));
}
