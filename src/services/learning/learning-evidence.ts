import type { ExerciseResultEntry, LearningEvidenceMode, PageId } from '../../types/models';
import { classifyLearningError } from './error-classifier';

export interface LearningEvidenceRecord {
  id: string;
  exerciseId: string;
  module: PageId | null;
  contentId: string | null;
  score: number;
  correct: boolean;
  responseTimeMs: number | null;
  errorType: string | null;
  variant: string | null;
  mode: LearningEvidenceMode;
  skillIds: string[];
  answeredAt: string;
}

function moduleFor(result: ExerciseResultEntry): PageId | null {
  const explicit = result.details?.module;
  if (typeof explicit === 'string') return explicit as PageId;
  if (result.exerciseType === 'module_exam' || result.exerciseType === 'chapter_exam') return 'courseModule';
  if (result.exerciseType === 'sentence') return 'grammar';
  if (result.exerciseType === 'knowledge') return 'courseModule';
  if (result.exerciseType === 'speaking') return 'vocabulary';
  return result.exerciseType;
}

function contentIdFor(result: ExerciseResultEntry): string | null {
  for (const key of ['contentId', 'lessonId', 'targetId', 'questionId', 'moduleId']) {
    const value = result.details?.[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

const EVIDENCE_MODES: readonly LearningEvidenceMode[] = ['recognition', 'recall', 'application', 'production', 'listening', 'speaking'];

function evidenceModeFor(result: ExerciseResultEntry): LearningEvidenceMode {
  const explicit = result.details?.evidenceMode;
  if (typeof explicit === 'string' && (EVIDENCE_MODES as readonly string[]).includes(explicit)) return explicit as LearningEvidenceMode;
  if (result.exerciseType === 'speaking') return 'speaking';
  const interaction = typeof result.details?.interaction === 'string' ? result.details.interaction : '';
  const variant = typeof result.details?.variant === 'string' ? result.details.variant : '';
  if (interaction === 'trace' || result.exerciseType === 'writing') return 'production';
  if (interaction === 'text' && (variant.includes('dictation') || variant.includes('listening'))) return 'listening';
  if (interaction === 'text') return 'recall';
  if (['order', 'cloze', 'match', 'tokens', 'drag'].includes(interaction)) return 'application';
  if (variant.includes('builder') || variant.includes('analysis') || variant.includes('compare') || variant.includes('cloze')) return 'application';
  if (variant.includes('recall')) return 'recall';
  return 'recognition';
}

export function buildLearningEvidence(results: readonly ExerciseResultEntry[]): LearningEvidenceRecord[] {
  return results.map((result) => {
    const response = Number(result.details?.responseTimeMs);
    const rawSkills = result.details?.skillIds;
    return {
      id: result.id,
      exerciseId: result.exerciseId,
      module: moduleFor(result),
      contentId: contentIdFor(result),
      score: Math.max(0, Math.min(100, Math.round(result.score ?? (result.wasCorrect ? 100 : 0)))),
      correct: result.wasCorrect,
      responseTimeMs: Number.isFinite(response) && response >= 0 ? Math.round(response) : null,
      errorType: result.wasCorrect ? null : classifyLearningError(result),
      variant: typeof result.details?.variant === 'string' ? result.details.variant : null,
      mode: evidenceModeFor(result),
      skillIds: Array.isArray(rawSkills) ? rawSkills.filter((item): item is string => typeof item === 'string') : [],
      answeredAt: result.answeredAt
    };
  });
}
