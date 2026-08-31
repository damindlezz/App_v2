import type {
  CourseTrack,
  JourneyStateEntry,
  JourneyStatus,
  LearningContent,
  LearningHealth,
  ProgressState,
  ReviewItem
} from '../types/models';
import type { LearningPathUnitState } from './learning-path';
import { learningStepForReview } from './learning-path';

export interface ModuleHealthState {
  health: LearningHealth;
  dueCount: number;
  weakCount: number;
  lowestMastery: number | null;
}

export function journeyStateFor(progress: ProgressState, track: CourseTrack): JourneyStateEntry | null {
  return progress.journeyStates[track] ?? null;
}

export function setJourneyPosition(
  progress: ProgressState,
  track: CourseTrack,
  chapterId: string | null,
  moduleId: string | null,
  stepId: string | null = null,
  activityId: string | null = null,
  updatedAt = new Date().toISOString()
): void {
  progress.journeyStates[track] = {
    track,
    currentChapterId: chapterId,
    currentModuleId: moduleId,
    currentStepId: stepId,
    currentActivityId: activityId,
    updatedAt
  };
}

export function mostRecentJourneyTrack<T extends CourseTrack>(progress: ProgressState, allowed: readonly T[]): T | null;
export function mostRecentJourneyTrack(progress: ProgressState): CourseTrack | null;
export function mostRecentJourneyTrack<T extends CourseTrack>(progress: ProgressState, allowed?: readonly T[]): T | CourseTrack | null {
  const candidates = Object.values(progress.journeyStates)
    .filter((entry): entry is JourneyStateEntry => Boolean(entry) && (!allowed || (allowed as readonly CourseTrack[]).includes(entry!.track)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (candidates[0]?.track as T | CourseTrack | undefined) ?? null;
}

export function journeyStatusFor(state: LearningPathUnitState, selectedModuleId: string | null): JourneyStatus {
  if (state.unit.id === selectedModuleId) return 'active';
  if (state.examPassed || state.status === 'completed' || state.status === 'mastered') return 'completed';
  if (state.status === 'locked') return 'locked';
  return 'available';
}

export function resolveJourneyModule(states: LearningPathUnitState[], progress: ProgressState, track: CourseTrack): LearningPathUnitState | null {
  const stored = journeyStateFor(progress, track)?.currentModuleId;
  const fromStored = stored ? states.find((state) => state.unit.id === stored && state.status !== 'locked') : null;
  if (fromStored && !fromStored.examPassed) return fromStored;
  if (fromStored?.examPassed) {
    const index = states.findIndex((state) => state.unit.id === fromStored.unit.id);
    const next = states.slice(index + 1).find((state) => ['in_progress', 'exam_ready', 'available'].includes(state.status));
    if (next) return next;
    return fromStored;
  }

  return states.find((state) => state.status === 'in_progress')
    ?? states.find((state) => state.status === 'exam_ready')
    ?? states.find((state) => state.status === 'available')
    ?? [...states].reverse().find((state) => state.examPassed)
    ?? states[0]
    ?? null;
}

export function buildModuleHealthIndex(content: LearningContent, reviews: ReviewItem[], now = new Date()): Map<string, ModuleHealthState> {
  const accumulator = new Map<string, { dueCount: number; weakCount: number; lowestMastery: number | null }>();
  for (const review of reviews) {
    const location = learningStepForReview(content, review.contentType, review.contentId);
    if (!location) continue;
    const current = accumulator.get(location.unit.id) ?? { dueCount: 0, weakCount: 0, lowestMastery: null };
    if (new Date(review.nextReviewAt).getTime() <= now.getTime()) current.dueCount += 1;
    if (review.mastery < 60 || review.wrongCount >= 2) current.weakCount += 1;
    current.lowestMastery = current.lowestMastery === null ? review.mastery : Math.min(current.lowestMastery, review.mastery);
    accumulator.set(location.unit.id, current);
  }

  const result = new Map<string, ModuleHealthState>();
  for (const [moduleId, current] of accumulator) {
    result.set(moduleId, {
      ...current,
      health: current.dueCount > 0 ? 'review_due' : current.weakCount > 0 ? 'weak' : 'stable'
    });
  }
  return result;
}

export function moduleHealth(index: Map<string, ModuleHealthState>, moduleId: string): ModuleHealthState {
  return index.get(moduleId) ?? { health: 'stable', dueCount: 0, weakCount: 0, lowestMastery: null };
}

export type StudyTarget = { area: 'arabic' | 'quran' | 'knowledge' | 'hifz'; track?: CourseTrack };

export function mostRecentStudyTarget(progress: ProgressState): StudyTarget {
  const candidates: Array<{ target: StudyTarget; updatedAt: string }> = [];
  for (const entry of Object.values(progress.journeyStates)) {
    if (!entry) continue;
    candidates.push({ target: entry.track === 'fusha' ? { area: 'arabic', track: entry.track } : entry.track === 'quran' ? { area: 'quran', track: entry.track } : { area: 'knowledge', track: entry.track }, updatedAt: entry.updatedAt });
  }
  if (progress.quranReaderState.updatedAt) candidates.push({ target: { area: 'quran', track: 'quran' }, updatedAt: progress.quranReaderState.updatedAt });
  if (progress.hifzStudyState.updatedAt) candidates.push({ target: { area: 'hifz' }, updatedAt: progress.hifzStudyState.updatedAt });
  candidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return candidates[0]?.target ?? { area: 'arabic', track: 'fusha' };
}
