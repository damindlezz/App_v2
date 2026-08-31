import type {
  ContentProgressEntry,
  ExerciseResultEntry,
  LearningItemMastery,
  MasteryDimension,
  PageId,
  ReviewItem
} from '../../types/models';
import { classifyLearningError } from './error-classifier';

const DIMENSIONS: MasteryDimension[] = ['recognition', 'recall', 'listening', 'spelling', 'production'];
const LEARNING_MODULES = new Set<PageId>(['alphabet', 'vocabulary', 'grammar', 'writing', 'reading', 'quran', 'courseModule']);

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function emptyDimensions(): Record<MasteryDimension, number> {
  return { recognition: 0, recall: 0, listening: 0, spelling: 0, production: 0 };
}

function primaryDimension(module: PageId): MasteryDimension {
  if (module === 'writing') return 'spelling';
  if (module === 'reading' || module === 'alphabet' || module === 'quran') return 'recognition';
  if (module === 'courseModule') return 'recall';
  return 'recall';
}

function moduleForExercise(result: ExerciseResultEntry): PageId | null {
  if (result.exerciseType === 'module_exam' || result.exerciseType === 'chapter_exam') return null;
  if (result.exerciseType === 'sentence') return 'grammar';
  if (result.exerciseType === 'knowledge') return 'courseModule';
  if (result.exerciseType === 'speaking') return 'vocabulary';
  return result.exerciseType;
}

function explicitContentId(result: ExerciseResultEntry): string | null {
  const keys = ['targetId', 'lessonId', 'contentId', ...(result.exerciseType === 'knowledge' ? ['questionId', 'moduleId'] : [])];
  for (const key of keys) {
    const value = result.details?.[key];
    if (typeof value === 'string' && value) return value;
  }
  const patterns = [
    /^vocabulary:([^:]+)/,
    /^grammar-quiz:([^:]+)/,
    /^reading:([^:]+)/,
    /^writing-(?:assembly|input):([^:]+)/
  ];
  for (const pattern of patterns) {
    const match = result.exerciseId.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function dimensionForResult(result: ExerciseResultEntry): MasteryDimension {
  const skill = typeof result.details?.skill === 'string' ? result.details.skill.toLowerCase() : '';
  const variant = typeof result.details?.variant === 'string' ? result.details.variant.toLowerCase() : '';
  const mode = typeof result.details?.mode === 'string' ? result.details.mode.toLowerCase() : '';
  const direction = typeof result.details?.direction === 'string' ? result.details.direction.toLowerCase() : '';
  const combined = `${skill} ${variant} ${mode}`;
  if (/listen|hear|audio|dictation/.test(combined)) return 'listening';
  if (result.exerciseType === 'speaking' || /speaking|pronunciation|shadowing/.test(combined)) return 'production';
  if (result.exerciseType === 'writing' || /writing|input|harakat/.test(combined)) return 'spelling';
  if (result.exerciseType === 'sentence' || /sentence|reorder|builder/.test(combined)) return 'production';
  if (result.exerciseType === 'vocabulary' && direction === 'german_to_arabic') return 'production';
  if (result.exerciseType === 'reading' || result.exerciseType === 'alphabet' || result.exerciseType === 'quran') return 'recognition';
  return 'recall';
}

export function masteryKey(module: PageId, contentId: string): string {
  return `${module}:${contentId}`;
}

export function buildMasteryIndex(
  contentProgress: ContentProgressEntry[],
  reviewItems: ReviewItem[] = [],
  exerciseResults: ExerciseResultEntry[] = []
): Map<string, LearningItemMastery> {
  const working = new Map<string, {
    value: LearningItemMastery;
    dimensionSamples: Record<MasteryDimension, number[]>;
    errors: Map<string, number>;
    responseTimeTotal: number;
    responseTimeCount: number;
  }>();

  const ensure = (module: PageId, contentId: string): ReturnType<typeof working.get> extends infer T ? Exclude<T, undefined> : never => {
    const key = masteryKey(module, contentId);
    const existing = working.get(key);
    if (existing) return existing;
    const value: LearningItemMastery = {
      key,
      module,
      contentId,
      dimensions: emptyDimensions(),
      overall: 0,
      stability: 0,
      difficulty: 50,
      evidenceCount: 0,
      lastPracticedAt: null,
      dominantError: null,
      confidence: 0,
      errorRate: 0,
      responseTimeMs: null,
      forgettingRisk: 100
    };
    const created = {
      value,
      dimensionSamples: { recognition: [], recall: [], listening: [], spelling: [], production: [] },
      errors: new Map<string, number>(),
      responseTimeTotal: 0,
      responseTimeCount: 0
    };
    working.set(key, created);
    return created;
  };

  for (const entry of contentProgress) {
    if (!LEARNING_MODULES.has(entry.module)) continue;
    const item = ensure(entry.module, entry.contentId);
    item.dimensionSamples[primaryDimension(entry.module)].push(clamp(entry.mastery));
    item.value.evidenceCount += Math.max(1, entry.attempts);
    item.value.lastPracticedAt = entry.lastPracticedAt || item.value.lastPracticedAt;
    item.value.difficulty = clamp(45 + entry.wrongCount * 8 - entry.correctCount * 3 + (100 - entry.mastery) * 0.25);
  }

  for (const review of reviewItems) {
    const module: PageId = review.contentType === 'knowledge' ? 'courseModule' : review.contentType as PageId;
    const item = ensure(module, review.contentId);
    item.dimensionSamples.recall.push(clamp(review.mastery));
    item.value.evidenceCount += Math.max(1, review.correctStreak + review.wrongCount);
    item.value.stability = Math.max(item.value.stability, clamp(Math.log2(review.intervalDays + 1) * 18 + review.mastery * 0.35));
    item.value.difficulty = Math.max(item.value.difficulty, clamp(35 + review.wrongCount * 10 + (100 - review.mastery) * 0.35));
    item.value.lastPracticedAt = review.lastReviewedAt ?? item.value.lastPracticedAt;
  }

  for (const result of [...exerciseResults].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt))) {
    const module = moduleForExercise(result);
    if (!module || !LEARNING_MODULES.has(module)) continue;
    const contentId = explicitContentId(result);
    if (!contentId) continue;
    const item = ensure(module, contentId);
    const dimension = dimensionForResult(result);
    const score = clamp(result.score ?? (result.wasCorrect ? 100 : 0));
    item.dimensionSamples[dimension].push(score);
    item.dimensionSamples[dimension] = item.dimensionSamples[dimension].slice(-12);
    item.value.evidenceCount += 1;
    item.value.lastPracticedAt = result.answeredAt;
    const responseTimeMs = Number(result.details?.responseTimeMs);
    if (Number.isFinite(responseTimeMs) && responseTimeMs >= 0) {
      item.responseTimeTotal += responseTimeMs;
      item.responseTimeCount += 1;
    }
    if (!result.wasCorrect) {
      const error = classifyLearningError(result);
      item.errors.set(error, (item.errors.get(error) ?? 0) + 1);
      item.value.difficulty = clamp(item.value.difficulty + 6);
    }
  }

  const result = new Map<string, LearningItemMastery>();
  for (const [key, item] of working) {
    for (const dimension of DIMENSIONS) {
      const samples = item.dimensionSamples[dimension];
      if (!samples.length) continue;
      const weighted = samples.reduce((sum, value, index) => sum + value * (index + 1), 0);
      const weights = samples.reduce((sum, _, index) => sum + index + 1, 0);
      item.value.dimensions[dimension] = clamp(weighted / weights);
    }
    const observed = DIMENSIONS.map((dimension) => item.value.dimensions[dimension]).filter((value) => value > 0);
    item.value.overall = observed.length ? clamp(observed.reduce((sum, value) => sum + value, 0) / observed.length) : 0;
    if (!item.value.stability) item.value.stability = clamp(item.value.overall * 0.45);
    const dominant = [...item.errors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    item.value.dominantError = (dominant as LearningItemMastery['dominantError']) ?? null;
    const errorCount = [...item.errors.values()].reduce((sum, value) => sum + value, 0);
    item.value.errorRate = clamp(item.value.evidenceCount ? (errorCount / item.value.evidenceCount) * 100 : 0);
    item.value.confidence = clamp(Math.min(100, item.value.evidenceCount * 8) * 0.45 + item.value.stability * 0.55);
    const ageDays = item.value.lastPracticedAt ? Math.max(0, (Date.now() - new Date(item.value.lastPracticedAt).getTime()) / 86400000) : 30;
    item.value.forgettingRisk = clamp((100 - item.value.stability) * 0.62 + Math.min(100, ageDays * 4) * 0.38);
    item.value.responseTimeMs = item.responseTimeCount
      ? Math.round(item.responseTimeTotal / item.responseTimeCount)
      : null;
    result.set(key, item.value);
  }
  return result;
}
