import type { ExerciseResultEntry, LearningErrorType } from '../../types/models';

function detailText(result: ExerciseResultEntry, key: string): string {
  const value = result.details?.[key];
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export function classifyLearningError(result: ExerciseResultEntry): LearningErrorType {
  if (result.exerciseType === 'module_exam' || result.exerciseType === 'chapter_exam') return 'unknown';
  if (result.wasCorrect) return 'unknown';

  const skill = detailText(result, 'skill');
  const variant = detailText(result, 'variant');
  const mode = detailText(result, 'mode');
  const direction = detailText(result, 'direction');
  const combined = `${skill} ${variant} ${mode} ${direction}`;

  if (/listen|hear|audio|dictation/.test(combined)) return 'listening';
  if (/pronun|speech|voice|recit/.test(combined)) return 'pronunciation';
  if (/morph|root|pattern|conjug|plural|gender/.test(combined)) return 'morphology';
  if (/sentence|reorder|word.?order|assembly|builder/.test(combined) || result.exerciseType === 'sentence') return 'word_order';
  if (/spell|writing|input|harakat/.test(combined) || result.exerciseType === 'writing') return 'orthography';
  if (/grammar/.test(combined) || result.exerciseType === 'grammar') return 'grammar';
  if (result.exerciseType === 'vocabulary') return 'vocabulary';
  return 'unknown';
}
