import type {
  ContentProgressEntry,
  CourseTrack,
  LearningActivity,
  LearningContent,
  LearningModulePhase,
  LearningPathChapter,
  LearningPathUnit,
  LearningStep,
  PracticePolicy
} from '../types/models';
import { contentProgressIndex, getContentProgressEntry, isContentCompleted } from '../services/learning/content-progress-service';

export type CourseActivityStatus = 'locked' | 'available' | 'in_progress' | 'completed' | 'mastered';
export type CourseModuleStatus = 'locked' | 'available' | 'in_progress' | 'exam_ready' | 'completed' | 'mastered';

export interface CourseLearningStepState {
  step: LearningStep;
  progress: number;
  status: CourseActivityStatus;
  lockedReason: string | null;
}

export interface CourseActivityState {
  activity: LearningActivity;
  phase: LearningModulePhase;
  progress: number;
  status: CourseActivityStatus;
  lockedReason: string | null;
}

export interface CoursePhaseState {
  phase: LearningModulePhase;
  activities: CourseActivityState[];
  progress: number;
  complete: boolean;
  locked: boolean;
  attempts: number;
  bestScore: number;
}

export interface CourseModuleState {
  unit: LearningPathUnit;
  chapter: LearningPathChapter;
  stage: LearningPathChapter;
  track: CourseTrack;
  learningSteps: CourseLearningStepState[];
  learningProgress: number;
  learningComplete: boolean;
  phases: CoursePhaseState[];
  progress: number;
  status: CourseModuleStatus;
  examScore: number;
  examPassed: boolean;
  requiredActivitiesComplete: boolean;
  assumedByPlacement: boolean;
  missingPrerequisites: string[];
}

export interface CourseModuleRecord {
  chapter: LearningPathChapter;
  stage: LearningPathChapter;
  unit: LearningPathUnit;
  track: CourseTrack;
}

const DEFAULT: PracticePolicy = {
  excellentScore: 85,
  repeatScore: 75,
  repeatAttempts: 2,
  minimumSkillScore: 60,
  critical: false
};

export function moduleExamEntryId(id: string): string { return `exam:${id}`; }
export function chapterExamEntryId(id: string): string { return `chapter-exam:${id}`; }
export function phasePracticeEntryId(id: string): string { return `practice:${id}`; }
export function moduleIntroId(id: string): string { return `intro:${id}`; }
export function moduleLearningId(unit: LearningPathUnit): string { return unit.learningId; }

export function entryFor(
  entries: ContentProgressEntry[],
  module: ContentProgressEntry['module'],
  id: string
): ContentProgressEntry | undefined {
  return getContentProgressEntry(entries, module, id);
}

function policy(unit?: LearningPathUnit): PracticePolicy { return unit?.practicePolicy ?? DEFAULT; }

function adaptive(entry: ContentProgressEntry | undefined, rule: PracticePolicy): boolean {
  if (!entry || entry.bestScore < rule.minimumSkillScore) return false;
  if (entry.bestScore >= 100) return true;
  if (rule.critical) return entry.correctCount >= rule.repeatAttempts && entry.bestScore >= rule.repeatScore;
  return entry.bestScore >= rule.excellentScore || (entry.correctCount >= rule.repeatAttempts && entry.bestScore >= rule.repeatScore);
}

function activityAttempted(activity: LearningActivity, entries: ContentProgressEntry[]): boolean {
  return (entryFor(entries, 'courseModule', activity.id)?.attempts ?? 0) > 0;
}

export function activityProgress(
  activity: LearningActivity,
  entries: ContentProgressEntry[],
  _unit?: LearningPathUnit,
  phase?: LearningModulePhase
): number {
  const entry = entryFor(entries, 'courseModule', activity.id);
  if (activity.kind === 'content' || activity.kind === 'knowledge') {
    return entry ? (isContentCompleted(entry) ? 100 : Math.max(entry.mastery, entry.bestScore)) : 0;
  }
  if (activity.kind === 'exercise' && phase?.type === 'practice') {
    return entry ? Math.min(100, Math.max(entry.bestScore, entry.attempts > 0 ? 60 : 0)) : 0;
  }
  if (!entry) return 0;
  const minimum = Math.max(1, activity.minimumScore ?? (activity.kind === 'exam' ? 80 : 70));
  return entry.bestScore >= minimum ? 100 : Math.max(entry.mastery, Math.round(entry.bestScore / minimum * 100));
}

export function isActivityComplete(
  activity: LearningActivity,
  entries: ContentProgressEntry[],
  unit?: LearningPathUnit,
  phase?: LearningModulePhase
): boolean {
  if (activity.kind === 'exercise' && phase?.type === 'practice') return activityAttempted(activity, entries);
  if (activity.kind === 'exercise' || activity.kind === 'exam') {
    const entry = entryFor(entries, 'courseModule', activity.id);
    return Boolean(entry && entry.bestScore >= (activity.minimumScore ?? (activity.kind === 'exam' ? 80 : 70)));
  }
  return activityProgress(activity, entries, unit, phase) >= 100;
}

function learningStepComplete(step: LearningStep, entries: ContentProgressEntry[]): boolean {
  return isActivityComplete(step, entries);
}

function requiredPhaseComplete(
  unit: LearningPathUnit,
  phase: LearningModulePhase | undefined,
  entries: ContentProgressEntry[]
): boolean {
  if (!phase) return true;
  if (phase.type === 'practice') {
    return adaptive(entryFor(entries, 'courseModule', phasePracticeEntryId(phase.id)), policy(unit));
  }
  const required = phase.activities.filter((activity) => activity.required);
  return required.length === 0 || required.every((activity) => isActivityComplete(activity, entries, unit, phase));
}

export function examBestScore(unit: LearningPathUnit, entries: ContentProgressEntry[]): number {
  return entryFor(entries, 'courseModule', moduleExamEntryId(unit.id))?.bestScore ?? 0;
}

export function chapterExamBestScore(chapter: LearningPathChapter, entries: ContentProgressEntry[]): number {
  return entryFor(entries, 'courseModule', chapterExamEntryId(chapter.id))?.bestScore ?? 0;
}

export function isModuleExamPassed(unit: LearningPathUnit, entries: ContentProgressEntry[]): boolean {
  return isContentCompleted(entryFor(entries, 'courseModule', unit.id));
}

export function isChapterExamPassed(chapter: LearningPathChapter, entries: ContentProgressEntry[]): boolean {
  return isContentCompleted(entryFor(entries, 'courseModule', chapterExamEntryId(chapter.id)));
}

export function moduleIsMastered(unit: LearningPathUnit, entries: ContentProgressEntry[]): boolean {
  if (!isModuleExamPassed(unit, entries)) return false;
  const deepen = unit.phases.find((phase) => phase.type === 'deepen');
  return (!deepen || deepen.activities.every((activity) => isActivityComplete(activity, entries, unit, deepen)))
    && examBestScore(unit, entries) >= 90;
}

export interface CourseModuleProgressBreakdown {
  learning: number;
  practice: number;
  exam: number;
  total: number;
}

export function calculateCourseModuleProgress(
  unit: LearningPathUnit,
  entries: ContentProgressEntry[],
  assumedByPlacement = false
): CourseModuleProgressBreakdown {
  if (assumedByPlacement) return { learning: 100, practice: 100, exam: 100, total: 100 };

  const learning = unit.learningSteps.length
    ? Math.round(unit.learningSteps.reduce((sum, step) => sum + activityProgress(step, entries, unit), 0) / unit.learningSteps.length)
    : 0;

  const practicePhase = unit.phases.find((phase) => phase.type === 'practice');
  let practice = 0;
  if (practicePhase) {
    const practiceEntry = entryFor(entries, 'courseModule', phasePracticeEntryId(practicePhase.id));
    const activities = practicePhase.activities.map((activity) => activityProgress(activity, entries, unit, practicePhase));
    practice = activities.length ? Math.round(activities.reduce((sum, value) => sum + value, 0) / activities.length) : 0;
    if (practiceEntry) {
      const rule = policy(unit);
      const target = rule.critical ? rule.repeatScore : rule.excellentScore;
      practice = requiredPhaseComplete(unit, practicePhase, entries)
        ? 100
        : Math.min(99, Math.round(practiceEntry.bestScore / Math.max(1, target) * 100));
    }
  }

  const exam = Math.min(100, Math.round(examBestScore(unit, entries) / Math.max(1, unit.exam.passScore) * 100));
  const total = Math.round((learning + practice + exam) / 3);
  return { learning, practice, exam, total };
}

export function buildCourseModuleState(
  unit: LearningPathUnit,
  chapter: LearningPathChapter,
  entries: ContentProgressEntry[],
  options: { assumedByPlacement?: boolean; missingPrerequisites?: string[]; freelyAvailable?: boolean; reviewMode?: boolean } = {}
): CourseModuleState {
  const assumed = options.assumedByPlacement ?? false;
  const missing = options.missingPrerequisites ?? [];
  const examPassed = assumed || isModuleExamPassed(unit, entries);
  const moduleProgressIds = new Set([
    unit.id,
    moduleExamEntryId(unit.id),
    ...unit.learningSteps.map((step) => step.id),
    ...unit.phases.flatMap((phase) => [
      phasePracticeEntryId(phase.id),
      ...phase.activities.map((activity) => activity.id)
    ])
  ]);
  const progressIndex = contentProgressIndex(entries);
  const alreadyStarted = [...moduleProgressIds].some((contentId) => progressIndex.hasEvidence('courseModule', contentId));
  const moduleLocked = !assumed && !options.freelyAvailable && missing.length > 0 && !alreadyStarted;

  const learningSteps = [...unit.learningSteps].sort((left, right) => left.order - right.order).map((step, index): CourseLearningStepState => {
    const previousIncomplete = unit.learningSteps
      .filter((candidate) => candidate.order < step.order && candidate.required)
      .some((candidate) => !learningStepComplete(candidate, entries));
    const locked = moduleLocked || (!assumed && previousIncomplete);
    const progress = assumed ? 100 : activityProgress(step, entries, unit);
    const complete = assumed || learningStepComplete(step, entries);
    const entry = entryFor(entries, 'courseModule', step.id);
    const status: CourseActivityStatus = complete
      ? (entry?.status === 'mastered' ? 'mastered' : 'completed')
      : locked ? 'locked' : progress > 0 ? 'in_progress' : 'available';
    return {
      step,
      progress,
      status,
      lockedReason: locked ? (index === 0 ? 'Das Modul ist noch gesperrt.' : 'Schließe zuerst den vorherigen Lernschritt ab.') : null
    };
  });

  const requiredLearningSteps = learningSteps.filter((state) => state.step.required);
  const learningComplete = assumed || requiredLearningSteps.every((state) => state.status === 'completed' || state.status === 'mastered');
  const canonicalProgress = calculateCourseModuleProgress(unit, entries, assumed);
  const learningProgress = canonicalProgress.learning;

  const practicePhase = unit.phases.find((phase) => phase.type === 'practice');
  const practiceComplete = assumed || requiredPhaseComplete(unit, practicePhase, entries);

  const phases = [...unit.phases].sort((left, right) => left.order - right.order).map((phase): CoursePhaseState => {
    const lockedByFlow = phase.type === 'exam' ? !learningComplete || !practiceComplete : !learningComplete;
    const locked = moduleLocked || (!assumed && !examPassed && lockedByFlow);
    const activities = phase.activities.map((activity, index): CourseActivityState => {
      const previousIncomplete = phase.type !== 'practice' && phase.activities
        .slice(0, index)
        .filter((candidate) => candidate.required)
        .some((candidate) => !isActivityComplete(candidate, entries, unit, phase));
      const activityLocked = locked || (!assumed && previousIncomplete);
      const progress = assumed ? 100 : activityProgress(activity, entries, unit, phase);
      const complete = assumed || isActivityComplete(activity, entries, unit, phase);
      const entry = entryFor(entries, 'courseModule', activity.id);
      const status: CourseActivityStatus = complete
        ? (entry?.status === 'mastered' ? 'mastered' : 'completed')
        : activityLocked ? 'locked' : progress > 0 ? 'in_progress' : 'available';
      return {
        activity,
        phase,
        progress,
        status,
        lockedReason: activityLocked
          ? (phase.type === 'exam' ? 'Schließe Lernen und Üben ab.' : 'Schließe zuerst die Lernschritte ab.')
          : null
      };
    });
    const practiceEntry = phase.type === 'practice' ? entryFor(entries, 'courseModule', phasePracticeEntryId(phase.id)) : undefined;
    const complete = assumed || (phase.type === 'deepen'
      ? phase.activities.every((activity) => isActivityComplete(activity, entries, unit, phase))
      : requiredPhaseComplete(unit, phase, entries));
    let progress = activities.length ? Math.round(activities.reduce((sum, state) => sum + state.progress, 0) / activities.length) : 0;
    if (phase.type === 'practice' && practiceEntry) {
      const target = policy(unit).critical ? policy(unit).repeatScore : policy(unit).excellentScore;
      progress = complete ? 100 : Math.min(99, Math.round(practiceEntry.bestScore / Math.max(1, target) * 100));
    }
    return {
      phase,
      activities,
      progress,
      complete,
      locked,
      attempts: practiceEntry?.attempts ?? 0,
      bestScore: practiceEntry?.bestScore ?? 0
    };
  });

  const requiredComplete = assumed || (learningComplete && (phases.find((state) => state.phase.type === 'practice')?.complete ?? true));
  const examScore = assumed ? 100 : examBestScore(unit, entries);
  const progress = canonicalProgress.total;
  const mastered = !assumed && moduleIsMastered(unit, entries);
  const status: CourseModuleStatus = moduleLocked
    ? 'locked'
    : mastered ? 'mastered'
      : examPassed ? 'completed'
        : requiredComplete ? 'exam_ready'
          : progress > 0 ? 'in_progress' : 'available';

  return {
    unit,
    chapter,
    stage: chapter,
    track: unit.track ?? chapter.track ?? 'fusha',
    learningSteps,
    learningProgress,
    learningComplete,
    phases,
    progress,
    status,
    examScore,
    examPassed,
    requiredActivitiesComplete: requiredComplete,
    assumedByPlacement: assumed,
    missingPrerequisites: missing
  };
}

export function coursePath(content: LearningContent, track: CourseTrack): LearningPathChapter[] {
  if (track === 'fusha') return content.learningPath;
  if (track === 'quran') return content.quranPath;
  return (content.islamicPaths ?? []).filter((chapter) => chapter.track === track);
}

const flattenedModuleCache = new WeakMap<LearningContent, Map<string, CourseModuleRecord[]>>();
const moduleByIdCache = new WeakMap<LearningContent, Map<string, CourseModuleRecord>>();
const chapterByIdCache = new WeakMap<LearningContent, Map<string, LearningPathChapter>>();

export function flattenCourseModules(content: LearningContent, track?: CourseTrack): CourseModuleRecord[] {
  let cache = flattenedModuleCache.get(content);
  if (!cache) { cache = new Map(); flattenedModuleCache.set(content, cache); }
  const key = track ?? '__all__';
  const cached = cache.get(key);
  if (cached) return cached;
  const chapters = track ? coursePath(content, track) : [...content.learningPath, ...content.quranPath, ...(content.islamicPaths ?? [])];
  const flattened = [...chapters]
    .sort((left, right) => left.order - right.order)
    .flatMap((chapter) => chapter.units.map((unit) => ({ chapter, stage: chapter, unit, track: unit.track ?? chapter.track ?? 'fusha' })));
  cache.set(key, flattened);
  return flattened;
}

export function findCourseModule(content: LearningContent, id: string | null | undefined): CourseModuleRecord | null {
  if (!id) return null;
  let index = moduleByIdCache.get(content);
  if (!index) { index = new Map(flattenCourseModules(content).map((record) => [record.unit.id, record])); moduleByIdCache.set(content, index); }
  return index.get(id) ?? null;
}

export function findCourseChapter(content: LearningContent, id: string | null | undefined): LearningPathChapter | null {
  if (!id) return null;
  let index = chapterByIdCache.get(content);
  if (!index) {
    index = new Map([...content.learningPath, ...content.quranPath, ...(content.islamicPaths ?? [])].map((chapter) => [chapter.id, chapter]));
    chapterByIdCache.set(content, index);
  }
  return index.get(id) ?? null;
}

export function nextCourseModule(content: LearningContent, id: string): CourseModuleRecord | null {
  const current = findCourseModule(content, id);
  if (!current) return null;
  const all = flattenCourseModules(content, current.track);
  const index = all.findIndex((record) => record.unit.id === id);
  return index >= 0 ? all[index + 1] ?? null : null;
}

export function firstActionableLearningStep(state: CourseModuleState): CourseLearningStepState | null {
  return state.learningSteps.find((step) => step.status === 'in_progress' || step.status === 'available')
    ?? state.learningSteps.find((step) => step.status !== 'locked')
    ?? null;
}

export function firstActionableActivityInPhase(phase: CoursePhaseState): CourseActivityState | null {
  return phase.activities.find((state) => state.activity.required && (state.status === 'in_progress' || state.status === 'available'))
    ?? phase.activities.find((state) => state.status === 'in_progress' || state.status === 'available')
    ?? phase.activities[0]
    ?? null;
}

export function firstActionablePhase(state: CourseModuleState): CoursePhaseState | null {
  if (!state.learningComplete) return null;
  if (state.status === 'exam_ready') return state.phases.find((phase) => phase.phase.type === 'exam' && !phase.locked) ?? null;
  const practice = state.phases.find((phase) => phase.phase.type === 'practice' && !phase.locked && !phase.complete);
  if (practice) return practice;
  const exam = state.phases.find((phase) => phase.phase.type === 'exam' && !phase.locked && !phase.complete);
  if (exam) return exam;
  return state.phases.find((phase) => !phase.locked) ?? null;
}

export function firstActionableActivity(state: CourseModuleState): CourseActivityState | null {
  const phase = firstActionablePhase(state);
  return phase ? firstActionableActivityInPhase(phase) : null;
}
