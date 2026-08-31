import type {
  ContentProgressEntry,
  ContentProgressUpdate,
  PageId
} from '../../types/models';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function contentProgressKey(module: PageId, contentId: string): string {
  return `${module}:${contentId}`;
}

/**
 * Immutable lookup built once per ContentProgress array. AppState replaces the
 * array whenever persisted progress changes, so WeakMap identity gives us
 * automatic cache invalidation without lifecycle bookkeeping.
 */
export interface ContentProgressIndex {
  get(module: PageId, contentId: string): ContentProgressEntry | undefined;
  hasEvidence(module: PageId, contentId: string): boolean;
  forModule(module: PageId): readonly ContentProgressEntry[];
}

const progressIndexCache = new WeakMap<ContentProgressEntry[], ContentProgressIndex>();

export function contentProgressIndex(entries: ContentProgressEntry[]): ContentProgressIndex {
  const cacheableEntries = Object.isFrozen(entries);
  const cached = cacheableEntries ? progressIndexCache.get(entries) : undefined;
  if (cached) return cached;
  const byKey = new Map<string, ContentProgressEntry>();
  const byModule = new Map<PageId, ContentProgressEntry[]>();
  for (const entry of entries) {
    byKey.set(contentProgressKey(entry.module, entry.contentId), entry);
    const moduleEntries = byModule.get(entry.module);
    if (moduleEntries) moduleEntries.push(entry);
    else byModule.set(entry.module, [entry]);
  }
  const index: ContentProgressIndex = {
    get: (module, contentId) => byKey.get(contentProgressKey(module, contentId)),
    hasEvidence: (module, contentId) => {
      const entry = byKey.get(contentProgressKey(module, contentId));
      return Boolean(entry && (entry.attempts > 0 || entry.manualCompleted || entry.bestScore > 0 || entry.mastery > 0));
    },
    forModule: (module) => byModule.get(module) ?? []
  };
  if (cacheableEntries) progressIndexCache.set(entries, index);
  return index;
}

export function getContentProgressEntry(
  entries: ContentProgressEntry[],
  module: PageId,
  contentId: string
): ContentProgressEntry | undefined {
  return contentProgressIndex(entries).get(module, contentId);
}

export function createContentProgressEntry(
  profileId: string,
  update: ContentProgressUpdate,
  now = new Date().toISOString()
): ContentProgressEntry {
  return {
    profileId,
    module: update.module,
    contentId: update.contentId,
    status: 'not_started',
    attempts: 0,
    correctCount: 0,
    wrongCount: 0,
    bestScore: 0,
    mastery: 0,
    manualCompleted: false,
    firstStartedAt: now,
    lastPracticedAt: now,
    completedAt: null
  };
}

export function applyContentProgressUpdate(
  existing: ContentProgressEntry | undefined,
  profileId: string,
  update: ContentProgressUpdate,
  now = new Date().toISOString()
): ContentProgressEntry {
  const next = existing
    ? { ...existing }
    : createContentProgressEntry(profileId, update, now);

  next.lastPracticedAt = now;
  if (!next.firstStartedAt) next.firstStartedAt = now;

  const action = update.action ?? 'attempt';
  if (action === 'reopen') {
    const wasOnlyManual = next.manualCompleted && next.attempts === 0 && next.correctCount === 0 && next.wrongCount === 0;
    next.manualCompleted = false;

    if (wasOnlyManual) {
      next.mastery = 0;
      next.bestScore = 0;
      next.status = 'not_started';
      next.completedAt = null;
      return next;
    }

    if (next.mastery >= 80) next.status = 'mastered';
    else if (next.mastery >= 60 || next.bestScore >= 70) next.status = 'completed';
    else next.status = next.attempts > 0 ? 'in_progress' : 'not_started';
    next.completedAt = next.status === 'completed' || next.status === 'mastered' ? next.completedAt : null;
    return next;
  }

  if (action === 'practice') {
    next.attempts += 1;
    if (next.status === 'not_started') next.status = 'in_progress';
    return next;
  }

  if (action === 'verify') {
    next.manualCompleted = false;
    next.attempts += 1;
    if (typeof update.score === 'number') next.bestScore = Math.max(next.bestScore, clamp(update.score));
    if (update.correct === false) {
      next.wrongCount += 1;
      next.mastery = clamp(next.mastery - 12);
      next.status = 'in_progress';
      next.completedAt = null;
      return next;
    }
    next.correctCount += 1;
    next.mastery = Math.max(next.mastery, clamp(update.score ?? 70, 60, 100));
    next.status = next.mastery >= 80 ? 'mastered' : 'completed';
    next.completedAt = next.completedAt ?? now;
    return next;
  }

  // Legacy import bridge only. New learning flows use evidence-backed `verify`.
  if (action === 'complete') {
    next.manualCompleted = true;
    next.mastery = Math.max(next.mastery, 70);
    next.status = next.mastery >= 80 ? 'mastered' : 'completed';
    next.completedAt = next.completedAt ?? now;
    if (typeof update.score === 'number') next.bestScore = Math.max(next.bestScore, clamp(update.score));
    return next;
  }

  next.attempts += 1;
  if (typeof update.score === 'number') next.bestScore = Math.max(next.bestScore, clamp(update.score));

  if (update.correct === true) {
    next.correctCount += 1;
    next.mastery = clamp(next.mastery + (next.correctCount >= 3 ? 18 : 14));
  } else if (update.correct === false) {
    next.wrongCount += 1;
    next.mastery = clamp(next.mastery - 18);
  }

  if (next.mastery >= 80) {
    next.status = 'mastered';
    next.completedAt = next.completedAt ?? now;
  } else if (next.mastery >= 60 || next.bestScore >= 70) {
    next.status = 'completed';
    next.completedAt = next.completedAt ?? now;
  } else {
    next.status = 'in_progress';
  }

  return next;
}

export function applyContentProgressUpdates(
  entries: ContentProgressEntry[],
  profileId: string,
  updates: ContentProgressUpdate[] = []
): ContentProgressEntry[] {
  const map = new Map(entries.map((entry) => [contentProgressKey(entry.module, entry.contentId), { ...entry }]));
  const now = new Date().toISOString();
  for (const update of updates) {
    const key = contentProgressKey(update.module, update.contentId);
    map.set(key, applyContentProgressUpdate(map.get(key), profileId, update, now));
  }
  return [...map.values()];
}


export function isContentCompleted(entry?: ContentProgressEntry): boolean {
  return entry?.status === 'completed' || entry?.status === 'mastered';
}
