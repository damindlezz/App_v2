import type {
  AdaptivePlanBucket,
  AdaptivePlanItem,
  AdaptiveSessionPlan,
  ContentProgressEntry,
  CourseTrack,
  ExerciseResultEntry,
  ExerciseType,
  ExerciseVariant,
  LearningContent,
  LearningItemMastery,
  PageId,
  ProgressState,
  ReviewItem
} from '../../types/models';
import { buildCoursePathStates, recommendedLearningUnit } from '../../shared/learning-path';
import { flattenCourseModules } from '../../shared/course-module';
import { isDue } from '../review/review-scheduler';
import { buildMasteryIndex, masteryKey } from './mastery-service';
import { contentProgressIndex, type ContentProgressIndex } from './content-progress-service';
import { contentIndex } from '../../shared/content-index';

const BUCKETS: AdaptivePlanBucket[] = ['due', 'current', 'weakness', 'interleaving', 'transfer'];
const WEIGHTS: Record<AdaptivePlanBucket, number> = { due: 0.30, current: 0.25, weakness: 0.20, interleaving: 0.15, transfer: 0.10 };
const LEARNING_MODULES = new Set<PageId>(['alphabet', 'vocabulary', 'grammar', 'writing', 'reading', 'quran']);
const pathRefCache = new WeakMap<LearningContent, Map<CourseTrack, ContentRef[]>>();

interface ContentRef {
  key: string;
  module: PageId;
  contentId: string;
  unitId: string;
  pathIndex: number;
  learningStepId: string | null;
}

function exerciseFor(module: PageId, bucket: AdaptivePlanBucket, item?: LearningItemMastery, audioEnabled = true): { type: ExerciseType; variant: ExerciseVariant } | null {
  if (module === 'vocabulary') {
    if (bucket === 'transfer' && audioEnabled && (item?.overall ?? 0) >= 55) return { type: 'speaking', variant: 'speaking_shadowing' };
    if (bucket === 'due' || bucket === 'weakness') {
      const dimensions = item?.dimensions;
      if (dimensions) {
        const candidates: Array<{ key: keyof typeof dimensions; score: number }> = [
          { key: 'recall', score: dimensions.recall },
          { key: 'spelling', score: dimensions.spelling },
          ...(audioEnabled ? [{ key: 'listening' as const, score: dimensions.listening }, { key: 'production' as const, score: dimensions.production }] : [])
        ];
        candidates.sort((a, b) => a.score - b.score);
        const weakest = candidates[0]?.key;
        if (weakest === 'listening') return { type: 'vocabulary', variant: 'vocabulary_listening' };
        if (weakest === 'spelling') return { type: 'vocabulary', variant: 'vocabulary_dictation' };
        if (weakest === 'production' && audioEnabled) return { type: 'speaking', variant: 'speaking_shadowing' };
        if (weakest === 'recall') return { type: 'vocabulary', variant: 'vocabulary_recall' };
      }
    }
    return { type: 'vocabulary', variant: bucket === 'interleaving' ? 'vocabulary_context' : 'vocabulary_matching' };
  }
  if (module === 'alphabet') return { type: 'alphabet', variant: bucket === 'transfer' ? 'alphabet_positions' : bucket === 'interleaving' ? 'alphabet_sound' : 'alphabet_recognition' };
  if (module === 'grammar') return bucket === 'transfer' ? { type: 'sentence', variant: 'sentence_builder' } : { type: 'grammar', variant: 'grammar_rules' };
  if (module === 'reading') return { type: 'reading', variant: bucket === 'transfer' ? 'reading_vocalized' : 'reading_meaning' };
  if (module === 'writing') return { type: 'writing', variant: 'writing_input' };
  if (module === 'quran') return { type: 'quran', variant: 'quran_signs' };
  return null;
}

function pathRefs(content: LearningContent, track: CourseTrack): ContentRef[] {
  let cache = pathRefCache.get(content);
  if (!cache) { cache = new Map(); pathRefCache.set(content, cache); }
  const cached = cache.get(track);
  if (cached) return cached;
  const refs: ContentRef[] = [];
  for (const [pathIndex, record] of flattenCourseModules(content, track).entries()) {
    const activities = [
      ...record.unit.learningSteps.map((activity) => ({ activity, learningStepId: activity.id })),
      ...record.unit.phases.flatMap((phase) => phase.activities.map((activity) => ({ activity, learningStepId: null })))
    ];
    for (const source of activities) {
      const module = source.activity.contentModule;
      if (!module || !LEARNING_MODULES.has(module)) continue;
      for (const contentId of source.activity.contentIds) {
        refs.push({
          key: masteryKey(module, contentId),
          module,
          contentId,
          unitId: record.unit.id,
          pathIndex,
          learningStepId: source.learningStepId
        });
      }
    }
  }
  const seen = new Set<string>();
  const unique = refs.filter((ref) => seen.has(ref.key) ? false : (seen.add(ref.key), true));
  cache.set(track, unique);
  return unique;
}

function quotas(maxItems: number): Record<AdaptivePlanBucket, number> {
  const safe = Math.max(1, Math.round(maxItems));
  const base = Object.fromEntries(BUCKETS.map((bucket) => [bucket, Math.floor(safe * WEIGHTS[bucket])])) as Record<AdaptivePlanBucket, number>;
  let assigned = BUCKETS.reduce((sum, bucket) => sum + base[bucket], 0);
  const ranked = [...BUCKETS].sort((a, b) => (safe * WEIGHTS[b] % 1) - (safe * WEIGHTS[a] % 1));
  let index = 0;
  while (assigned < safe) {
    const bucket = ranked[index % ranked.length] ?? 'current';
    base[bucket] += 1;
    assigned += 1;
    index += 1;
  }
  return base;
}

function asItem(ref: ContentRef, bucket: AdaptivePlanBucket, state: LearningItemMastery | undefined, reason: string, audioEnabled = true): AdaptivePlanItem | null {
  const exercise = exerciseFor(ref.module, bucket, state, audioEnabled);
  if (!exercise) return null;
  const diagnostics = state?.evidenceCount
    ? ` · Sicherheit ${state.confidence}% · Vergessensrisiko ${state.forgettingRisk}%`
    : '';
  return { key: ref.key, bucket, module: ref.module, contentId: ref.contentId, exerciseType: exercise.type, exerciseVariant: exercise.variant, mastery: state?.overall ?? 0, reason: `${reason}${diagnostics}` };
}

function hasDirectEvidence(ref: ContentRef, progressIndex: ContentProgressIndex, reviewKeys: Set<string>): boolean {
  if (progressIndex.hasEvidence(ref.module, ref.contentId)) return true;
  return reviewKeys.has(ref.key);
}

export function createAdaptiveSessionPlan(
  content: LearningContent,
  progress: ProgressState,
  contentProgress: ContentProgressEntry[],
  reviewItems: ReviewItem[] = [],
  exerciseResults: ExerciseResultEntry[] = [],
  maxItems = 20,
  track: CourseTrack = 'fusha',
  reference = new Date(),
  focusUnitId?: string
): AdaptiveSessionPlan {
  const refs = pathRefs(content, track);
  const mastery = buildMasteryIndex(contentProgress, reviewItems, exerciseResults);
  const progressIndex = contentProgressIndex(contentProgress);
  const reviewKeys = new Set(reviewItems.map((review) => masteryKey(
    review.contentType === 'knowledge' ? 'courseModule' : review.contentType as PageId,
    review.contentId
  )));
  const reviewSummary = {
    dueNow: reviewItems.filter((item) => isDue(item, reference)).length,
    dueToday: reviewItems.length,
    total: reviewItems.length,
    mastered: reviewItems.filter((item) => item.mastery >= 80).length
  };
  const states = buildCoursePathStates(content, progress, contentProgress, reviewSummary, track);
  const recommendation = recommendedLearningUnit(states, track === 'fusha' ? progress.preferences.currentLevel : undefined);
  const currentUnitId = focusUnitId ?? recommendation?.unit.id ?? states[states.length - 1]?.unit.id ?? null;
  const currentIndex = Math.max(0, states.findIndex((state) => state.unit.id === currentUnitId));
  const stateByUnit = new Map(states.map((state, index) => [state.unit.id, { state, index }]));

  const eligibleRefs = refs.filter((ref) => {
    const resolved = stateByUnit.get(ref.unitId);
    if (!resolved || resolved.state.status === 'locked' || resolved.index > currentIndex) return false;
    if (resolved.state.examPassed || resolved.state.status === 'completed' || resolved.state.status === 'mastered') return true;
    if (hasDirectEvidence(ref, progressIndex, reviewKeys)) return true;
    if (!ref.learningStepId) return false;
    const step = resolved.state.learningSteps.find((candidate) => candidate.step.id === ref.learningStepId);
    if (!step || step.status === 'locked') return false;
    return resolved.state.learningComplete
      || step.status === 'completed'
      || step.status === 'mastered'
      || step.status === 'in_progress'
      || step.progress > 0;
  });

  const byKey = new Map(eligibleRefs.map((ref) => [ref.key, ref]));
  const pools: Record<AdaptivePlanBucket, AdaptivePlanItem[]> = { due: [], current: [], weakness: [], interleaving: [], transfer: [] };

  for (const review of reviewItems.filter((item) => isDue(item, reference))) {
    if (track === 'quran' && review.contentType !== 'quran') continue;
    if (track !== 'quran' && review.contentType === 'quran') continue;
    const reviewModule: PageId = review.contentType === 'knowledge' ? 'courseModule' : review.contentType as PageId;
    const ref = byKey.get(masteryKey(reviewModule, review.contentId));
    if (!ref) continue;
    const item = asItem(ref, 'due', mastery.get(ref.key), 'Fällige SRS-Wiederholung', progress.preferences.audioEnabled);
    if (item) pools.due.push(item);
  }
  pools.due.sort((a, b) => (mastery.get(b.key)?.forgettingRisk ?? 100) - (mastery.get(a.key)?.forgettingRisk ?? 100));

  for (const ref of eligibleRefs.filter((candidate) => candidate.unitId === currentUnitId)) {
    const item = asItem(ref, 'current', mastery.get(ref.key), 'Aktuelles geführtes Modul', progress.preferences.audioEnabled);
    if (item) pools.current.push(item);
  }
  pools.current.sort((a, b) => a.mastery - b.mastery);

  const weakKeys = new Set<string>();
  for (const entry of contentProgress) {
    const key = masteryKey(entry.module, entry.contentId);
    if (byKey.has(key) && (entry.mastery < 65 || entry.wrongCount > entry.correctCount)) weakKeys.add(key);
  }
  for (const review of reviewItems) {
    const key = masteryKey(review.contentType === 'knowledge' ? 'courseModule' : review.contentType as PageId, review.contentId);
    if (byKey.has(key) && (review.mastery < 65 || review.wrongCount > 0)) weakKeys.add(key);
  }
  for (const key of weakKeys) {
    const ref = byKey.get(key);
    if (!ref) continue;
    const state = mastery.get(key);
    const reason = state?.dominantError ? `Schwachstelle · ${state.dominantError}` : 'Schwachstelle aus bisherigen Versuchen';
    const item = asItem(ref, 'weakness', state, reason, progress.preferences.audioEnabled);
    if (item) pools.weakness.push(item);
  }
  pools.weakness.sort((a, b) => {
    const left = mastery.get(a.key); const right = mastery.get(b.key);
    const priority = (item?: LearningItemMastery): number => (item?.forgettingRisk ?? 100) * 0.4 + (item?.difficulty ?? 50) * 0.3 + (item?.errorRate ?? 0) * 0.3 - (item?.confidence ?? 0) * 0.15;
    return priority(right) - priority(left);
  });

  const prior = eligibleRefs.filter((ref) => ref.unitId !== currentUnitId && ref.pathIndex < currentIndex);
  for (const ref of prior) {
    const score = mastery.get(ref.key)?.overall ?? 0;
    const item = asItem(ref, 'interleaving', mastery.get(ref.key), 'Altwissen aus früheren freigeschalteten Modulen', progress.preferences.audioEnabled);
    if (item) pools.interleaving.push(item);
    if (score >= 80) {
      const quranLink = ref.module === 'vocabulary' ? contentIndex(content).quranVocabularyByVocabularyId.get(ref.contentId) : undefined;
      const quranTransfer = quranLink?.reviewStatus === 'verified' ? quranLink : undefined;
      const transfer = quranTransfer
        ? asItem(ref, 'transfer', mastery.get(ref.key), `Quran-Transfer · ${quranTransfer.occurrenceCount} Corpus-Treffer`, progress.preferences.audioEnabled)
        : asItem(ref, 'transfer', mastery.get(ref.key), 'Transfer mit anspruchsvollerer Aufgabenform', progress.preferences.audioEnabled);
      if (transfer) pools.transfer.push(quranTransfer ? { ...transfer, exerciseType: 'vocabulary', exerciseVariant: 'vocabulary_context' } : transfer);
    }
  }
  pools.interleaving.sort((a, b) => a.mastery - b.mastery);
  pools.transfer.sort((a, b) => b.mastery - a.mastery);

  const targetCount = Math.min(maxItems, eligibleRefs.length);
  const desired = quotas(Math.max(1, targetCount));
  const selected: AdaptivePlanItem[] = [];
  const used = new Set<string>();
  const actual = Object.fromEntries(BUCKETS.map((bucket) => [bucket, 0])) as Record<AdaptivePlanBucket, number>;
  const take = (bucket: AdaptivePlanBucket, limit: number): void => {
    for (const item of pools[bucket]) {
      if (actual[bucket] >= limit) break;
      if (used.has(item.key)) continue;
      selected.push(item);
      used.add(item.key);
      actual[bucket] += 1;
    }
  };
  for (const bucket of BUCKETS) take(bucket, desired[bucket]);

  if (selected.length < targetCount) {
    const fallback = eligibleRefs
      .map((ref) => asItem(ref, 'current', mastery.get(ref.key), ref.unitId === currentUnitId ? 'Zusätzlicher Inhalt des aktuellen Moduls' : 'Bekannter Lernpfad-Inhalt', progress.preferences.audioEnabled))
      .filter((item): item is AdaptivePlanItem => Boolean(item))
      .sort((a, b) => a.mastery - b.mastery);
    for (const item of fallback) {
      if (selected.length >= targetCount) break;
      if (used.has(item.key)) continue;
      selected.push(item);
      used.add(item.key);
      actual.current += 1;
    }
  }

  return {
    track,
    generatedAt: reference.toISOString(),
    totalItems: selected.length,
    estimatedMinutes: selected.length ? Math.max(5, Math.ceil(selected.length * 0.75)) : 0,
    allocations: actual,
    items: selected
  };
}
