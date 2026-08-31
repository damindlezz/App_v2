import { isRegisteredExerciseType } from '../shared/exercise-registry';
import { isCourseTrack } from '../shared/course-track-meta';
import type { AppPreferences, CourseTrack, HifzStudyState, JourneyStateEntry, ModuleProgressSummary, ProgressState, QuranReaderState } from '../types/models';
import { normalizeLevelPair } from '../shared/levels';


type LegacyProgressState = Partial<ProgressState> & {
  transliteration?: boolean;
  currentLearningModuleId?: string | null;
  currentLearningPhaseId?: string | null;
  currentLearningActivityId?: string | null;
  currentCourseTrack?: CourseTrack;
  currentQuranLesson?: string | null;
  currentQuranReference?: string | null;
};

const EPOCH = new Date(0).toISOString();

export const DEFAULT_QURAN_READER_STATE: QuranReaderState = {
  reference: null,
  view: 'focus',
  showWordByWord: false,
  showTranslation: true,
  showTajwid: false,
  updatedAt: EPOCH
};

export const DEFAULT_HIFZ_STUDY_STATE: HifzStudyState = {
  reference: null,
  selection: [],
  navMode: 'surah',
  view: 'verses',
  surah: 1,
  juz: 1,
  page: null,
  showWordByWord: true,
  showTranslation: false,
  showTajwid: false,
  mushafLayoutId: 'indopak_13_line',
  updatedAt: EPOCH
};

export const EMPTY_MODULE_PROGRESS: ModuleProgressSummary = {
  alphabet: 0,
  vocabulary: 0,
  grammar: 0,
  writing: 0,
  reading: 0,
  exercises: 0,
  quran: 0
};

export const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: 'dark',
  colorScheme: 'tannengold',
  fontSize: 'normal',
  arabicFontSize: 'large',
  arabicFont: 'naskh',
  transliteration: true,
  harakat: 'learning',
  density: 'comfortable',
  learningHelp: 'standard',
  learningPathMode: 'guided',
  currentLevel: 'A0',
  targetLevel: 'A2',
  contentLevelScope: 'up_to_target',
  arabicVariety: 'fusha',
  dailyGoalMinutes: 15,
  reducedMotion: false,
  highContrast: false,
  enabledTracks: ['fusha', 'quran'],
  primaryFiqhSchool: 'hanafi',
  onboardingComplete: false,
  onboardingVersion: 0,
  primaryLearningGoal: 'quran',
  onboardingExperience: 'none',
  placementScore: null,
  audioEnabled: true,
  audioRate: 1,
  audioVoice: '',
  autoRecoverySnapshots: true,
  moduleHarakat: {
    vocabulary: 'inherit',
    grammar: 'inherit',
    writing: 'inherit',
    reading: 'inherit',
    quran: 'inherit',
    exercises: 'inherit'
  }
};

export const DEFAULT_PROGRESS: ProgressState = {
  xp: 0,
  streak: 0,
  completedLessons: [],
  vocabularyCorrect: 0,
  vocabularyWrong: 0,
  quizCorrect: 0,
  quizTotal: 0,
  currentVocabulary: 0,
  currentVocabularyCategory: 'Alle',
  currentVocabularyDirection: 'arabic_to_german',
  currentVocabularyLevelFilter: 'current',
  currentVocabularyStatusFilter: 'all',
  currentGrammarLevelFilter: 'current',
  currentAlphabetLetter: null,
  currentWritingLesson: null,
  currentGrammarLesson: null,
  currentReadingLesson: null,
  currentExerciseType: 'vocabulary',
  currentExerciseVariant: 'vocabulary_matching',
  freePracticeModuleId: null,
  exercisePickerOpen: true,
  activeExerciseSession: null,
  journeyStates: {},
  quranReaderState: { ...DEFAULT_QURAN_READER_STATE },
  hifzStudyState: { ...DEFAULT_HIFZ_STUDY_STATE, selection: [] },
  quranHifzEntries: [],
  quranHifzWordEntries: [],
  libraryFavorites: [],
  libraryRecent: [],
  dailyImpulseDate: null,
  dailyImpulseId: null,
  impulseRecentIds: [],
  impulseFavoriteIds: [],
  dailyChallenge: null,
  activeModuleExam: null,
  overallProgress: 0,
  moduleProgress: { ...EMPTY_MODULE_PROGRESS },
  preferences: structuredClone(DEFAULT_PREFERENCES)
};

export const AVATARS = ['🦉', '🌙', '📘', '⭐', '🌿', '🧠', '✈️', '🐪'];

export function createDefaultProgress(): ProgressState {
  return {
    ...DEFAULT_PROGRESS,
    completedLessons: [],
    quranHifzEntries: [],
    journeyStates: {},
    quranReaderState: { ...DEFAULT_QURAN_READER_STATE },
    hifzStudyState: { ...DEFAULT_HIFZ_STUDY_STATE, selection: [] },
    quranHifzWordEntries: [],
    libraryFavorites: [],
    libraryRecent: [],
    impulseRecentIds: [],
    impulseFavoriteIds: [],
    moduleProgress: { ...EMPTY_MODULE_PROGRESS },
    preferences: {
      ...DEFAULT_PREFERENCES,
      moduleHarakat: { ...DEFAULT_PREFERENCES.moduleHarakat }
    }
  };
}

function normalizeJourneyStates(value?: LegacyProgressState | null): ProgressState['journeyStates'] {
  const source = value?.journeyStates && typeof value.journeyStates === 'object' ? value.journeyStates : {};
  const normalized: ProgressState['journeyStates'] = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!isCourseTrack(key) || !raw || typeof raw !== 'object') continue;
    const entry = raw as Partial<JourneyStateEntry>;
    normalized[key] = {
      track: key,
      currentChapterId: typeof entry?.currentChapterId === 'string' ? entry.currentChapterId : null,
      currentModuleId: typeof entry?.currentModuleId === 'string' ? entry.currentModuleId : null,
      currentStepId: typeof entry?.currentStepId === 'string' ? entry.currentStepId : null,
      currentActivityId: typeof entry?.currentActivityId === 'string' ? entry.currentActivityId : null,
      updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : EPOCH
    };
  }
  const legacyTrack = isCourseTrack(value?.currentCourseTrack) ? value.currentCourseTrack : 'fusha';
  if (!normalized[legacyTrack] && typeof value?.currentLearningModuleId === 'string') {
    normalized[legacyTrack] = {
      track: legacyTrack,
      currentChapterId: null,
      currentModuleId: value.currentLearningModuleId,
      currentStepId: null,
      currentActivityId: typeof value.currentLearningActivityId === 'string' ? value.currentLearningActivityId : null,
      updatedAt: EPOCH
    };
  }
  return normalized;
}

function normalizeQuranReaderState(value: LegacyProgressState | null | undefined): QuranReaderState {
  const raw = value?.quranReaderState as Partial<QuranReaderState> | undefined;
  const legacyReference = typeof value?.currentQuranReference === 'string' ? value.currentQuranReference : null;
  return {
    reference: typeof raw?.reference === 'string' ? raw.reference : legacyReference,
    view: raw?.view === 'verses' || raw?.view === 'mushaf' || raw?.view === 'focus' ? raw.view : DEFAULT_QURAN_READER_STATE.view,
    showWordByWord: typeof raw?.showWordByWord === 'boolean' ? raw.showWordByWord : DEFAULT_QURAN_READER_STATE.showWordByWord,
    showTranslation: typeof raw?.showTranslation === 'boolean' ? raw.showTranslation : DEFAULT_QURAN_READER_STATE.showTranslation,
    showTajwid: typeof raw?.showTajwid === 'boolean' ? raw.showTajwid : DEFAULT_QURAN_READER_STATE.showTajwid,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : EPOCH
  };
}

function normalizeHifzStudyState(value: LegacyProgressState | null | undefined): HifzStudyState {
  const raw = value?.hifzStudyState as Partial<HifzStudyState> | undefined;
  const legacyReference = typeof value?.currentQuranReference === 'string' ? value.currentQuranReference : null;
  const reference = typeof raw?.reference === 'string' ? raw.reference : legacyReference;
  return {
    reference,
    selection: Array.isArray(raw?.selection) ? [...new Set(raw.selection.filter((item): item is string => typeof item === 'string'))].slice(0, 50) : reference ? [reference] : [],
    navMode: raw?.navMode === 'juz' || raw?.navMode === 'page' || raw?.navMode === 'surah' ? raw.navMode : DEFAULT_HIFZ_STUDY_STATE.navMode,
    view: raw?.view === 'verses' || raw?.view === 'mushaf' || raw?.view === 'focus' ? raw.view : DEFAULT_HIFZ_STUDY_STATE.view,
    surah: Number.isFinite(raw?.surah) ? Math.max(1, Math.min(114, Math.trunc(Number(raw?.surah)))) : DEFAULT_HIFZ_STUDY_STATE.surah,
    juz: Number.isFinite(raw?.juz) ? Math.max(1, Math.min(30, Math.trunc(Number(raw?.juz)))) : DEFAULT_HIFZ_STUDY_STATE.juz,
    page: Number.isFinite(raw?.page) ? Math.max(1, Math.trunc(Number(raw?.page))) : null,
    showWordByWord: typeof raw?.showWordByWord === 'boolean' ? raw.showWordByWord : DEFAULT_HIFZ_STUDY_STATE.showWordByWord,
    showTranslation: typeof raw?.showTranslation === 'boolean' ? raw.showTranslation : DEFAULT_HIFZ_STUDY_STATE.showTranslation,
    showTajwid: typeof raw?.showTajwid === 'boolean' ? raw.showTajwid : DEFAULT_HIFZ_STUDY_STATE.showTajwid,
    mushafLayoutId: 'indopak_13_line',
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : EPOCH
  };
}

export function normalizeProgress(value?: Partial<ProgressState> | null): ProgressState {
  const legacy = value as LegacyProgressState | null | undefined;
  const storedPreferences = (legacy?.preferences ?? {}) as Partial<AppPreferences> & { focusMode?: boolean; lineSpacing?: unknown };
  const { lineSpacing: _legacyLineSpacing, ...currentStoredPreferences } = storedPreferences;
  const legacyViewMode = storedPreferences.viewMode;
  const levels = normalizeLevelPair(storedPreferences.currentLevel, storedPreferences.targetLevel);
  const contentLevelScope: AppPreferences['contentLevelScope'] = ['current', 'up_to_target', 'all'].includes(String(storedPreferences.contentLevelScope))
    ? storedPreferences.contentLevelScope as AppPreferences['contentLevelScope']
    : DEFAULT_PREFERENCES.contentLevelScope;
  const fontSize: AppPreferences['fontSize'] = ['small', 'normal', 'large', 'xlarge'].includes(String(storedPreferences.fontSize))
    ? storedPreferences.fontSize as AppPreferences['fontSize']
    : DEFAULT_PREFERENCES.fontSize;
  const arabicFontSize: AppPreferences['arabicFontSize'] = ['small', 'normal', 'large', 'xlarge'].includes(String(storedPreferences.arabicFontSize))
    ? storedPreferences.arabicFontSize as AppPreferences['arabicFontSize']
    : DEFAULT_PREFERENCES.arabicFontSize;
  const arabicFont: AppPreferences['arabicFont'] = ['naskh', 'uthmani', 'turkish', 'sans', 'kufi', 'system'].includes(String(storedPreferences.arabicFont))
    ? storedPreferences.arabicFont as AppPreferences['arabicFont']
    : DEFAULT_PREFERENCES.arabicFont;
  const legacyColorScheme = String(storedPreferences.colorScheme ?? '');
  const colorScheme: AppPreferences['colorScheme'] = (['tannengold','lapis','sand','smaragd','wein','schiefer'] as const).includes(legacyColorScheme as any)
    ? legacyColorScheme as AppPreferences['colorScheme']
    : ({ indigo: 'lapis', emerald: 'smaragd', amber: 'sand', rose: 'wein' } as Record<string, AppPreferences['colorScheme']>)[legacyColorScheme] ?? DEFAULT_PREFERENCES.colorScheme;
  const preferences = {
    ...DEFAULT_PREFERENCES,
    ...currentStoredPreferences,
    colorScheme,
    ...levels,
    contentLevelScope,
    fontSize,
    arabicFontSize,
    arabicFont,
    arabicVariety: 'fusha' as const,
    density: 'comfortable' as const,
    learningHelp: storedPreferences.learningHelp
      ?? (legacyViewMode === 'detailed' ? 'detailed' : 'standard'),
    transliteration: storedPreferences.transliteration ?? legacy?.transliteration ?? DEFAULT_PREFERENCES.transliteration,
    dailyGoalMinutes: Math.max(5, Math.min(180, storedPreferences.dailyGoalMinutes ?? DEFAULT_PREFERENCES.dailyGoalMinutes)),
    enabledTracks: Array.isArray(storedPreferences.enabledTracks)
      ? [...new Set(storedPreferences.enabledTracks.filter((track): track is AppPreferences['enabledTracks'][number] => isCourseTrack(track)))]
      : [...DEFAULT_PREFERENCES.enabledTracks],
    primaryFiqhSchool: ['hanafi','maliki','shafii','hanbali'].includes(String(storedPreferences.primaryFiqhSchool)) ? storedPreferences.primaryFiqhSchool as AppPreferences['primaryFiqhSchool'] : DEFAULT_PREFERENCES.primaryFiqhSchool,
    onboardingComplete: typeof storedPreferences.onboardingComplete === 'boolean'
      ? storedPreferences.onboardingComplete
      : false,
    onboardingVersion: Number.isFinite(storedPreferences.onboardingVersion)
      ? Math.max(0, Math.floor(Number(storedPreferences.onboardingVersion)))
      : 0,
    primaryLearningGoal: ['arabic','quran','hifz','knowledge'].includes(String(storedPreferences.primaryLearningGoal))
      ? storedPreferences.primaryLearningGoal as AppPreferences['primaryLearningGoal']
      : DEFAULT_PREFERENCES.primaryLearningGoal,
    onboardingExperience: ['none','letters','reading','basic','intermediate'].includes(String(storedPreferences.onboardingExperience))
      ? storedPreferences.onboardingExperience as AppPreferences['onboardingExperience']
      : DEFAULT_PREFERENCES.onboardingExperience,
    placementScore: Number.isFinite(storedPreferences.placementScore)
      ? Math.max(0, Math.min(100, Number(storedPreferences.placementScore)))
      : null,
    audioEnabled: storedPreferences.audioEnabled ?? DEFAULT_PREFERENCES.audioEnabled,
    audioRate: [0.75,1,1.25].includes(Number(storedPreferences.audioRate)) ? storedPreferences.audioRate as AppPreferences['audioRate'] : DEFAULT_PREFERENCES.audioRate,
    audioVoice: typeof storedPreferences.audioVoice === 'string' ? storedPreferences.audioVoice : DEFAULT_PREFERENCES.audioVoice,
    autoRecoverySnapshots: storedPreferences.autoRecoverySnapshots ?? DEFAULT_PREFERENCES.autoRecoverySnapshots,
    moduleHarakat: {
      ...DEFAULT_PREFERENCES.moduleHarakat,
      ...(storedPreferences.moduleHarakat ?? {})
    }
  };
  delete preferences.viewMode;

  const {
    currentLearningModuleId: _legacyModule,
    currentLearningPhaseId: _legacyPhase,
    currentLearningActivityId: _legacyActivity,
    currentCourseTrack: _legacyTrack,
    currentQuranLesson: _legacyQuranLesson,
    currentQuranReference: _legacyQuranReference,
    transliteration: _legacyTransliteration,
    ...storedProgress
  } = legacy ?? {};

  return {
    ...createDefaultProgress(),
    ...storedProgress,
    completedLessons: Array.isArray(legacy?.completedLessons) ? [...new Set(legacy.completedLessons)] : [],
    moduleProgress: {
      ...EMPTY_MODULE_PROGRESS,
      ...(legacy?.moduleProgress ?? {})
    },
    currentVocabularyLevelFilter: legacy?.currentVocabularyLevelFilter ?? 'current',
    currentVocabularyStatusFilter: legacy?.currentVocabularyStatusFilter ?? 'all',
    currentGrammarLevelFilter: legacy?.currentGrammarLevelFilter ?? 'current',
    currentExerciseType: isRegisteredExerciseType(legacy?.currentExerciseType)
      ? legacy.currentExerciseType
      : 'vocabulary',
    currentExerciseVariant: typeof legacy?.currentExerciseVariant === 'string' ? legacy.currentExerciseVariant : 'vocabulary_matching',
    freePracticeModuleId: typeof legacy?.freePracticeModuleId === 'string' ? legacy.freePracticeModuleId : null,
    journeyStates: normalizeJourneyStates(legacy),
    quranReaderState: normalizeQuranReaderState(legacy),
    hifzStudyState: normalizeHifzStudyState(legacy),
    quranHifzEntries: Array.isArray(legacy?.quranHifzEntries) ? legacy.quranHifzEntries.filter((entry) => entry && typeof entry === 'object' && typeof entry.reference === 'string' && ['new','learning','unstable','stable','mastered'].includes(String(entry.status))).map((entry) => ({
      reference: entry.reference,
      status: entry.status,
      repetitions: Number.isFinite(entry.repetitions) ? Math.max(0, Number(entry.repetitions)) : 0,
      errorCount: Number.isFinite(entry.errorCount) ? Math.max(0, Number(entry.errorCount)) : 0,
      lastReviewedAt: typeof entry.lastReviewedAt === 'string' ? entry.lastReviewedAt : null,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : EPOCH
    })).slice(0, 1000) : [],
    quranHifzWordEntries: Array.isArray(legacy?.quranHifzWordEntries) ? legacy.quranHifzWordEntries.filter((entry) => entry && typeof entry === 'object' && typeof entry.reference === 'string' && Number.isFinite(entry.wordIndex) && Number(entry.wordIndex) > 0 && ['new','learning','unstable','stable','mastered'].includes(String(entry.status))).map((entry) => ({
      reference: entry.reference,
      wordIndex: Math.max(1, Math.trunc(Number(entry.wordIndex))),
      status: entry.status,
      repetitions: Number.isFinite(entry.repetitions) ? Math.max(0, Number(entry.repetitions)) : 0,
      errorCount: Number.isFinite(entry.errorCount) ? Math.max(0, Number(entry.errorCount)) : 0,
      lastReviewedAt: typeof entry.lastReviewedAt === 'string' ? entry.lastReviewedAt : null,
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : EPOCH
    })).slice(0, 12000) : [],
    libraryFavorites: Array.isArray(legacy?.libraryFavorites) ? [...new Set(legacy.libraryFavorites.filter((entry): entry is string => typeof entry === 'string'))].slice(0, 100) : [],
    libraryRecent: Array.isArray(legacy?.libraryRecent) ? [...new Set(legacy.libraryRecent.filter((entry): entry is string => typeof entry === 'string'))].slice(0, 20) : [],
    dailyImpulseDate: typeof legacy?.dailyImpulseDate === 'string' ? legacy.dailyImpulseDate : null,
    dailyImpulseId: typeof legacy?.dailyImpulseId === 'string' ? legacy.dailyImpulseId : null,
    impulseRecentIds: Array.isArray(legacy?.impulseRecentIds) ? [...new Set(legacy.impulseRecentIds.filter((entry): entry is string => typeof entry === 'string'))].slice(0, 8) : [],
    impulseFavoriteIds: Array.isArray(legacy?.impulseFavoriteIds) ? [...new Set(legacy.impulseFavoriteIds.filter((entry): entry is string => typeof entry === 'string'))].slice(0, 100) : [],
    dailyChallenge: legacy?.dailyChallenge && typeof legacy.dailyChallenge === 'object' ? legacy.dailyChallenge : null,
    activeModuleExam: legacy?.activeModuleExam && typeof legacy.activeModuleExam === 'object' ? legacy.activeModuleExam : null,
    overallProgress: Number.isFinite(legacy?.overallProgress) ? Number(legacy?.overallProgress) : 0,
    preferences
  };
}
