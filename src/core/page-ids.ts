import type { PageId } from '../types/models';

export const PAGE_IDS = [
  'dashboard',
  'learningPath',
  'islamicStudies',
  'courseModule',
  'library',
  'sources',
  'quran',
  'alphabet',
  'vocabulary',
  'grammar',
  'writing',
  'reading',
  'exercises',
  'review',
  'statistics',
  'settings'
] as const satisfies readonly PageId[];

const PAGE_ID_SET = new Set<string>(PAGE_IDS);

/** Legacy page IDs are accepted only while importing old profile/backup data. */
export type LegacyPageId = 'quranPath';

export function normalizePageId(value: string): PageId | null {
  if (value === 'quranPath') return 'quran';
  return PAGE_ID_SET.has(value) ? value as PageId : null;
}

export function isPageId(value: string): value is PageId {
  return PAGE_ID_SET.has(value);
}
