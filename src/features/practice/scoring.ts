import type { ExerciseTask } from './tasks';

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const PUNCTUATION = /[.,!?;:'"()\[\]{}\-–—،؛؟ـ]/g;

export function normalizeAnswer(value: string, stripDiacritics = false): string {
  let normalized = value.normalize('NFKC').toLowerCase().replace(PUNCTUATION, '').replace(/\s+/g, ' ').trim();
  if (stripDiacritics) normalized = normalized.replace(ARABIC_DIACRITICS, '');
  return normalized;
}

export function textSimilarityScore(actual: string, expected: string, mode: 'standard' | 'arabic_tolerant' | 'vocalization' = 'standard'): number {
  const fullActual = normalizeAnswer(actual);
  const fullExpected = normalizeAnswer(expected);
  if (!fullExpected) return 0;
  if (fullActual === fullExpected) return 100;
  const full = similarity(fullActual, fullExpected);
  const bareActual = normalizeAnswer(actual, true);
  const bareExpected = normalizeAnswer(expected, true);
  const bare = similarity(bareActual, bareExpected);
  const containsArabic = /[\u0600-\u06ff]/.test(expected);
  if (!containsArabic) return Math.round(full * 100);
  if (mode === 'vocalization') return Math.round((bare * 0.65 + full * 0.35) * 100);
  if (mode === 'arabic_tolerant') return Math.round(Math.max(full, bare * 0.96) * 100);
  return Math.round(Math.max(full, bare * 0.88) * 100);
}

export function scoreTextTask(task: ExerciseTask, value: string): { score: number; correct: boolean; threshold: number } {
  const expected = task.correct ?? '';
  const mode = task.evaluation ?? evaluationForVariant(task.variant);
  const score = textSimilarityScore(value, expected, mode);
  const threshold = mode === 'vocalization' ? 90 : mode === 'arabic_tolerant' ? 85 : 90;
  return { score, correct: score >= threshold, threshold };
}

export function speakingScore(transcript: string, expected: string, confidence = 1): number {
  const text = textSimilarityScore(transcript, expected, 'arabic_tolerant');
  const confidenceFactor = Math.max(0.7, Math.min(1, confidence || 0.7));
  return Math.round(text * confidenceFactor);
}

export function selfAssessmentScore(criteria: boolean[]): number {
  if (!criteria.length) return 0;
  return Math.round(criteria.filter(Boolean).length / criteria.length * 100);
}

function evaluationForVariant(variant: ExerciseTask['variant']): 'standard' | 'arabic_tolerant' | 'vocalization' {
  if (variant === 'reading_harakat' || variant === 'reading_vocalized') return 'vocalization';
  if (variant === 'vocabulary_dictation' || variant === 'writing_copy' || variant === 'writing_input' || variant === 'vocabulary_recall') return 'arabic_tolerant';
  return 'standard';
}

function similarity(left: string, right: string): number {
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const distance = levenshtein(left, right);
  return Math.max(0, 1 - distance / Math.max(left.length, right.length));
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length];
}
