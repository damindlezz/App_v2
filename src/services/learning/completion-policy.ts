import type { ExerciseResultEntry, LearningEvidenceMode, LearningStep } from '../../types/models';
import { buildLearningEvidence } from './learning-evidence';

export interface LearningStepCompletionEvaluation {
  complete: boolean;
  successfulEvidenceCount: number;
  requiredEvidenceCount: number;
  achievedModes: LearningEvidenceMode[];
  missingModes: LearningEvidenceMode[];
  averageScore: number | null;
}

export function evaluateLearningStepCompletion(
  step: LearningStep,
  exerciseResults: readonly ExerciseResultEntry[],
  since?: string | null
): LearningStepCompletionEvaluation {
  const policy = step.completionPolicy;
  const skillIds = new Set(step.skillIds);
  const contentIds = new Set([step.id, ...step.contentIds]);
  const evidence = buildLearningEvidence(exerciseResults)
    .filter((item) => !since || item.answeredAt >= since)
    .filter((item) => Boolean(item.contentId && contentIds.has(item.contentId)) || item.skillIds.some((id) => skillIds.has(id)));

  const successfulByExercise = new Map<string, (typeof evidence)[number]>();
  for (const item of evidence) {
    if (item.score < policy.minimumScore) continue;
    const previous = successfulByExercise.get(item.exerciseId);
    if (!previous || item.score > previous.score || item.answeredAt > previous.answeredAt) successfulByExercise.set(item.exerciseId, item);
  }
  const successful = [...successfulByExercise.values()];
  const achievedModes = [...new Set(successful.map((item) => item.mode))];
  const missingModes = policy.requiredModes.filter((mode) => !achievedModes.includes(mode));
  const averageScore = successful.length
    ? Math.round(successful.reduce((sum, item) => sum + item.score, 0) / successful.length)
    : null;
  return {
    complete: successful.length >= policy.minimumEvidenceCount && missingModes.length === 0,
    successfulEvidenceCount: successful.length,
    requiredEvidenceCount: policy.minimumEvidenceCount,
    achievedModes,
    missingModes,
    averageScore
  };
}
