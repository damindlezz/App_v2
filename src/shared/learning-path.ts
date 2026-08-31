import type {
  CefrLevel,
  ContentProgressEntry,
  CourseTrack,
  LearningContent,
  LearningPathChapter,
  LearningPathLevel,
  LearningPathUnit,
  LearningStep,
  ProgressState,
  QuranLevel,
  StudyLevel,
  ReviewContentType,
  ReviewSummary
} from '../types/models';
import {
  buildCourseModuleState,
  chapterExamBestScore,
  coursePath,
  flattenCourseModules,
  isChapterExamPassed,
  isModuleExamPassed,
  type CourseModuleState,
  type CourseModuleStatus
} from './course-module';
import { compareLevels } from './levels';

export type LearningPathUnitStatus = CourseModuleStatus;
export type LearningPathUnitState = CourseModuleState;

export interface LearningPathChapterState {
  chapter: LearningPathChapter;
  modules: LearningPathUnitState[];
  progress: number;
  modulesComplete: boolean;
  examReady: boolean;
  examPassed: boolean;
  examScore: number;
  locked: boolean;
}

export interface CoursePathRuntimeModel {
  track: CourseTrack;
  modules: LearningPathUnitState[];
  chapters: LearningPathChapterState[];
  levels: LearningPathLevel[];
}

const courseLevelCache = new WeakMap<LearningContent, Map<CourseTrack, LearningPathLevel[]>>();
const pathStateCache = new WeakMap<LearningContent, WeakMap<ContentProgressEntry[], Map<string, LearningPathUnitState[]>>>();
const pathModelCache = new WeakMap<LearningContent, WeakMap<ContentProgressEntry[], Map<string, CoursePathRuntimeModel>>>();

function runtimeCacheKey(track: CourseTrack, progress: ProgressState): string {
  return `${track}:${progress.preferences.learningPathMode}:${progress.preferences.currentLevel}:${progress.preferences.onboardingComplete ? 'placed' : 'unplaced'}`;
}

function levelId(track: CourseTrack, cefrLevel: CefrLevel, quranLevel?: QuranLevel, studyLevel?: StudyLevel): string {
  if (track === 'quran') return `quran_level_${(quranLevel ?? 'Q0').toLowerCase()}`;
  if (track === 'fusha') return `fusha_level_${cefrLevel.toLowerCase()}`;
  return `${track}_level_${(studyLevel ?? 'S0').toLowerCase()}`;
}

export function groupCourseLevels(chapters: LearningPathChapter[], track: CourseTrack): LearningPathLevel[] {
  const groups = new Map<string, LearningPathLevel>();
  for (const chapter of [...chapters].sort((left, right) => left.order - right.order)) {
    const key = track === 'quran' ? (chapter.quranLevel ?? 'Q0') : track === 'fusha' ? chapter.cefrLevel : (chapter.studyLevel ?? 'S0');
    const existing = groups.get(key);
    if (existing) {
      existing.chapters.push(chapter);
      continue;
    }
    groups.set(key, {
      id: levelId(track, chapter.cefrLevel, chapter.quranLevel, chapter.studyLevel),
      track,
      cefrLevel: chapter.cefrLevel,
      quranLevel: chapter.quranLevel,
      studyLevel: chapter.studyLevel,
      title: track === 'quran' ? `${chapter.quranLevel ?? 'Q0'} · Quran lesen` : track === 'fusha' ? `${chapter.cefrLevel} · Fusha` : `${chapter.studyLevel ?? 'S0'} · ${chapter.title}`,
      description: track === 'quran'
        ? `Spezialisierungsstufe ${chapter.quranLevel ?? 'Q0'} im Quran-Lernpfad.`
        : track === 'fusha' ? `CEFR-Lernstufe ${chapter.cefrLevel} im Fusha-Lernpfad.` : `Studienstufe ${chapter.studyLevel ?? 'S0'} im islamischen Wissenschaftspfad.`,
      order: groups.size + 1,
      chapters: [chapter]
    });
  }
  return [...groups.values()];
}

export function courseLevels(content: LearningContent, track: CourseTrack, progress?: ProgressState): LearningPathLevel[] {
  void progress;
  let cache = courseLevelCache.get(content);
  if (!cache) { cache = new Map(); courseLevelCache.set(content, cache); }
  const cached = cache.get(track);
  if (cached) return cached;
  const levels = groupCourseLevels(coursePath(content, track), track);
  cache.set(track, levels);
  return levels;
}

export function flattenLearningPath(
  content: LearningContent,
  progress?: ProgressState,
  track: CourseTrack = 'fusha'
): Array<{ stage: LearningPathChapter; chapter: LearningPathChapter; unit: LearningPathUnit }> {
  const chapters = coursePath(content, track);
  void progress;
  return [...chapters]
    .sort((left, right) => left.order - right.order)
    .flatMap((chapter) => chapter.units.map((unit) => ({ stage: chapter, chapter, unit })));
}

/**
 * Arbeitsniveau und Lernziel sind Filter, keine Kompetenznachweise. Zusätzlich
 * zu Modulvoraussetzungen sperrt v0.11 den Einstieg in ein neues Kapitel, bis
 * die Kapitelprüfung des vorherigen Kapitels bestanden wurde.
 */

function assumedByPlacement(chapter: LearningPathChapter, track: CourseTrack, progress: ProgressState): boolean {
  return track === 'fusha'
    && progress.preferences.onboardingComplete
    && progress.preferences.learningPathMode === 'guided'
    && compareLevels(chapter.cefrLevel, progress.preferences.currentLevel) < 0;
}

export function buildCoursePathStates(
  content: LearningContent,
  progress: ProgressState,
  entries: ContentProgressEntry[],
  _review: ReviewSummary,
  track: CourseTrack
): LearningPathUnitState[] {
  const useCache = Object.isFrozen(entries);
  let cache: Map<string, LearningPathUnitState[]> | undefined;
  if (useCache) {
    let byEntries = pathStateCache.get(content);
    if (!byEntries) { byEntries = new WeakMap(); pathStateCache.set(content, byEntries); }
    cache = byEntries.get(entries);
    if (!cache) { cache = new Map(); byEntries.set(entries, cache); }
    const cached = cache.get(runtimeCacheKey(track, progress));
    if (cached) return cached;
  }
  const cacheKey = runtimeCacheKey(track, progress);

  const chapters = coursePath(content, track);
  const flat = flattenLearningPath(content, progress, track);
  const allModules = flattenCourseModules(content);
  const assumedUnits = new Set(allModules
    .filter((record) => assumedByPlacement(record.chapter, record.track, progress))
    .map((record) => record.unit.id));
  const passed = new Map(allModules.map(({ unit }) => [unit.id, assumedUnits.has(unit.id) || isModuleExamPassed(unit, entries)]));
  const chapterPassed = new Map(chapters.map((chapter) => [chapter.id, assumedByPlacement(chapter, track, progress) || isChapterExamPassed(chapter, entries)]));
  const free = progress.preferences.learningPathMode === 'free';
  const chapterIndex = new Map(chapters.map((chapter, index) => [chapter.id, index]));

  const states = flat.map(({ chapter, unit }) => {
    const missing = unit.prerequisiteIds.filter((id) => !passed.get(id));
    const index = chapterIndex.get(chapter.id) ?? 0;
    const previousChapter = index > 0 ? chapters[index - 1] : undefined;
    const firstModule = chapter.units[0]?.id === unit.id;
    if (firstModule && previousChapter && !chapterPassed.get(previousChapter.id)) {
      missing.push(`chapter:${previousChapter.id}`);
    }
    return buildCourseModuleState(unit, chapter, entries, {
      assumedByPlacement: assumedUnits.has(unit.id),
      missingPrerequisites: missing,
      freelyAvailable: free
    });
  });
  cache?.set(cacheKey, states);
  return states;
}

export function buildLearningPathStates(
  content: LearningContent,
  progress: ProgressState,
  entries: ContentProgressEntry[],
  review: ReviewSummary
): LearningPathUnitState[] {
  return buildCoursePathStates(content, progress, entries, review, 'fusha');
}

export function buildQuranPathStates(
  content: LearningContent,
  progress: ProgressState,
  entries: ContentProgressEntry[],
  review: ReviewSummary
): LearningPathUnitState[] {
  return buildCoursePathStates(content, progress, entries, review, 'quran');
}

export function buildCoursePathModel(
  content: LearningContent,
  progress: ProgressState,
  entries: ContentProgressEntry[],
  review: ReviewSummary,
  track: CourseTrack
): CoursePathRuntimeModel {
  const useCache = Object.isFrozen(entries);
  let cache: Map<string, CoursePathRuntimeModel> | undefined;
  if (useCache) {
    let byEntries = pathModelCache.get(content);
    if (!byEntries) { byEntries = new WeakMap(); pathModelCache.set(content, byEntries); }
    cache = byEntries.get(entries);
    if (!cache) { cache = new Map(); byEntries.set(entries, cache); }
    const cached = cache.get(runtimeCacheKey(track, progress));
    if (cached) return cached;
  }
  const cacheKey = runtimeCacheKey(track, progress);

  const modules = buildCoursePathStates(content, progress, entries, review, track);
  const modulesByChapter = new Map<string, LearningPathUnitState[]>();
  for (const state of modules) {
    const grouped = modulesByChapter.get(state.chapter.id);
    if (grouped) grouped.push(state);
    else modulesByChapter.set(state.chapter.id, [state]);
  }
  const chapters = coursePath(content, track).map((chapter): LearningPathChapterState => {
    const chapterModules = modulesByChapter.get(chapter.id) ?? [];
    const assumed = assumedByPlacement(chapter, track, progress);
    const modulesComplete = chapterModules.length > 0 && chapterModules.every((state) => state.examPassed);
    const examPassed = assumed || isChapterExamPassed(chapter, entries);
    const examScore = assumed ? 100 : chapterExamBestScore(chapter, entries);
    const moduleAverage = chapterModules.length ? chapterModules.reduce((sum, state) => sum + state.progress, 0) / chapterModules.length : 0;
    const examProgress = Math.min(100, Math.round(examScore / Math.max(1, chapter.exam.passScore) * 100));
    const progressValue = examPassed ? 100 : Math.round(moduleAverage * 0.8 + examProgress * 0.2);
    return {
      chapter,
      modules: chapterModules,
      progress: progressValue,
      modulesComplete,
      examReady: !examPassed && modulesComplete,
      examPassed,
      examScore,
      locked: chapterModules.length > 0 && chapterModules.every((state) => state.status === 'locked')
    };
  });
  const model = { track, modules, chapters, levels: courseLevels(content, track, progress) };
  cache?.set(cacheKey, model);
  return model;
}

export function buildChapterStates(
  content: LearningContent,
  progress: ProgressState,
  entries: ContentProgressEntry[],
  review: ReviewSummary,
  track: CourseTrack
): LearningPathChapterState[] {
  return buildCoursePathModel(content, progress, entries, review, track).chapters;
}

export function recommendedLearningUnit(
  states: LearningPathUnitState[],
  current?: ProgressState['preferences']['currentLevel']
): LearningPathUnitState | null {
  const candidates = states.filter((state) => ['in_progress', 'available', 'exam_ready'].includes(state.status));
  if (!candidates.length) return null;
  const priority = (status: LearningPathUnitStatus): number => status === 'exam_ready' ? 0 : status === 'in_progress' ? 1 : 2;
  return [...candidates].sort((left, right) => current
    ? (Math.abs(compareLevels(left.chapter.cefrLevel, current)) - Math.abs(compareLevels(right.chapter.cefrLevel, current))
      || priority(left.status) - priority(right.status)
      || left.chapter.order - right.chapter.order)
    : (priority(left.status) - priority(right.status) || left.chapter.order - right.chapter.order))[0] ?? null;
}

export function stageProgress(chapter: LearningPathChapter, states: LearningPathUnitState[]): number {
  const relevant = states.filter((state) => state.chapter.id === chapter.id);
  return relevant.length ? Math.round(relevant.reduce((sum, state) => sum + state.progress, 0) / relevant.length) : 0;
}

export function levelProgress(level: LearningPathLevel, chapters: LearningPathChapterState[]): number {
  const relevant = chapters.filter((state) => level.chapters.some((chapter) => chapter.id === state.chapter.id));
  return relevant.length ? Math.round(relevant.reduce((sum, state) => sum + state.progress, 0) / relevant.length) : 0;
}

function contentModuleForReview(type: ReviewContentType): string {
  if (type === 'knowledge') return 'courseModule';
  if (type === 'speaking') return 'vocabulary';
  return type;
}

function parentContentIdForReview(content: LearningContent, contentType: ReviewContentType, rawId: string): string {
  const contentId = rawId.split('::')[0] ?? rawId;
  if (contentType === 'reading') {
    return content.reading.find((lesson) => lesson.id === contentId || lesson.examples.some((example) => example.id === contentId))?.id ?? contentId;
  }
  if (contentType === 'grammar') {
    return content.grammar.find((lesson) => lesson.id === contentId || lesson.quiz.some((question) => question.id === contentId) || lesson.examples.some((example) => example.id === contentId))?.id ?? contentId;
  }
  return contentId;
}

export function learningStepForReview(
  content: LearningContent,
  contentType: ReviewContentType,
  contentId: string
): { track: CourseTrack; chapter: LearningPathChapter; unit: LearningPathUnit; step: LearningStep; stepId: string; stepTitle: string } | null {
  const expectedModule = contentModuleForReview(contentType);
  const lookupId = parentContentIdForReview(content, contentType, contentId);
  const rawId = contentId.split('::')[0] ?? contentId;
  const records = contentType === 'knowledge'
    ? flattenCourseModules(content)
    : flattenCourseModules(content, contentType === 'quran' ? 'quran' : 'fusha');
  for (const record of records) {
    const step = contentType === 'knowledge'
      ? record.unit.learningSteps.find((candidate) => candidate.kind === 'knowledge' && (
          candidate.id === rawId
          || candidate.knowledge.some((block) => block.claimId === rawId)
          || (record.unit.knowledgeQuestions ?? []).some((question) => question.id === rawId)
        ))
      : record.unit.learningSteps.find((candidate) => candidate.contentModule === expectedModule && candidate.contentIds.includes(lookupId));
    if (step) return { track: record.track, chapter: record.chapter, unit: record.unit, step, stepId: step.id, stepTitle: step.title };
  }
  return null;
}
