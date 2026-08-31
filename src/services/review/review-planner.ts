import type { QuranHifzEntry, QuranHifzWordEntry, ReviewItem } from '../../types/models';
import { isHifzDue } from '../../features/quran/quran-utils';
import { prioritizeReviews } from './review-priority';

export type UnifiedReviewItem =
  | { kind: 'srs'; key: string; priority: number; review: ReviewItem }
  | { kind: 'hifz_ayah'; key: string; priority: number; reference: string; entry: QuranHifzEntry }
  | { kind: 'hifz_word'; key: string; priority: number; reference: string; wordIndex: number; entry: QuranHifzWordEntry };

function hifzPriority(entry: QuranHifzEntry | QuranHifzWordEntry, now: Date, word = false): number {
  const ageDays = entry.lastReviewedAt ? Math.max(0, (now.getTime() - new Date(entry.lastReviewedAt).getTime()) / 86400000) : 45;
  const state = entry.status === 'unstable' ? 55 : entry.status === 'learning' ? 35 : entry.status === 'new' ? 30 : entry.status === 'stable' ? 12 : 4;
  return Math.round(state + Math.min(45, ageDays * 2) + Math.min(35, entry.errorCount * 6) + (word ? 8 : 0));
}

export function buildUnifiedReviewQueue(
  reviews: readonly ReviewItem[],
  ayahs: readonly QuranHifzEntry[],
  words: readonly QuranHifzWordEntry[],
  now = new Date()
): UnifiedReviewItem[] {
  const srs = prioritizeReviews(reviews.filter((item) => new Date(item.nextReviewAt).getTime() <= now.getTime()))
    .map((item) => ({ kind: 'srs' as const, key: `srs:${item.item.id}`, priority: item.priority, review: item.item }));
  const hifzAyahs = ayahs.filter((entry) => isHifzDue(entry, now)).map((entry) => ({ kind: 'hifz_ayah' as const, key: `ayah:${entry.reference}`, priority: hifzPriority(entry, now), reference: entry.reference, entry }));
  const hifzWords = words.filter((entry) => isHifzDue(entry, now)).map((entry) => ({ kind: 'hifz_word' as const, key: `word:${entry.reference}:${entry.wordIndex}`, priority: hifzPriority(entry, now, true), reference: entry.reference, wordIndex: entry.wordIndex, entry }));
  return [...srs, ...hifzAyahs, ...hifzWords].sort((left, right) => right.priority - left.priority || left.key.localeCompare(right.key));
}
