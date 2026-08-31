import type { ExerciseType } from './exercise-types';

export type PageId =
  | 'dashboard'
  | 'learningPath'
  | 'islamicStudies'
  | 'courseModule'
  | 'library'
  | 'sources'
  | 'quran'
  | 'alphabet'
  | 'vocabulary'
  | 'grammar'
  | 'writing'
  | 'reading'
  | 'exercises'
  | 'review'
  | 'statistics'
  | 'settings';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorScheme = 'tannengold' | 'lapis' | 'sand' | 'smaragd' | 'wein' | 'schiefer';
export type FontSizePreference = 'small' | 'normal' | 'large' | 'xlarge';
export type ArabicFontSizePreference = 'small' | 'normal' | 'large' | 'xlarge';
export type ArabicFontPreference = 'naskh' | 'uthmani' | 'turkish' | 'sans' | 'kufi' | 'system';
export type HarakatPreference = 'show' | 'hide' | 'learning';
export type HarakatModule = 'vocabulary' | 'grammar' | 'writing' | 'reading' | 'quran' | 'exercises';
export type HarakatOverride = 'inherit' | 'show' | 'hide';
export type ViewMode = 'detailed' | 'compact'; // legacy values accepted during migration
export type DisplayDensity = 'comfortable' | 'compact';
export type LearningHelpMode = 'standard' | 'detailed';
export type LearningPathMode = 'guided' | 'free';
export type PrimaryLearningGoal = 'arabic' | 'quran' | 'hifz' | 'knowledge';
export type ArabicExperience = 'none' | 'letters' | 'reading' | 'basic' | 'intermediate';
export type VocabularyDirection = 'arabic_to_german' | 'german_to_arabic' | 'mixed';
export type CefrLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type ContentLevelScope = 'current' | 'up_to_target' | 'all';
export type ArabicVariety = 'fusha' | 'quranic';
export type FiqhSchool = 'hanafi' | 'maliki' | 'shafii' | 'hanbali';
export type StudyLevel = 'S0' | 'S1' | 'S2' | 'S3';
export type ReviewStage = 'draft' | 'editorial_checked' | 'language_review' | 'source_review' | 'madhhab_review' | 'didactic_review' | 'approved' | 'published';
export type SourceReviewStatus = 'missing' | 'referenced' | 'verified' | 'approved';
export type SourceType = 'quran' | 'quran_translation' | 'hadith' | 'classical_work' | 'fiqh_work' | 'usul_work' | 'commentary' | 'modern_academic' | 'reference_work' | 'linguistic_corpus' | 'mushaf_layout' | 'audio_reference' | 'derived_dataset' | 'curriculum' | 'editorial';
export type ClaimSourceRelation = 'direct_support' | 'interpretation' | 'context' | 'contrasting_view' | 'further_reading';
export type AudioRate = 0.75 | 1 | 1.25;
export type CourseTrack = 'fusha' | 'quran' | 'fiqh_hanafi' | 'fiqh_maliki' | 'fiqh_shafii' | 'fiqh_hanbali' | 'usul_fiqh' | 'hadith' | 'usul_hadith';
export type JourneyStatus = 'locked' | 'available' | 'active' | 'completed';
export type LearningHealth = 'stable' | 'weak' | 'review_due';
export interface JourneyStateEntry {
  track: CourseTrack;
  currentChapterId: string | null;
  currentModuleId: string | null;
  currentStepId: string | null;
  currentActivityId: string | null;
  updatedAt: string;
}
export type JourneyStateMap = Partial<Record<CourseTrack, JourneyStateEntry>>;

export type QuranStudyViewState = 'verses' | 'mushaf' | 'focus';
export interface QuranReaderState {
  reference: string | null;
  view: QuranStudyViewState;
  showWordByWord: boolean;
  showTranslation: boolean;
  showTajwid: boolean;
  updatedAt: string;
}
export type HifzNavigationModeState = 'surah' | 'juz' | 'page';
export interface HifzStudyState {
  reference: string | null;
  selection: string[];
  navMode: HifzNavigationModeState;
  view: QuranStudyViewState;
  surah: number;
  juz: number;
  page: number | null;
  showWordByWord: boolean;
  showTranslation: boolean;
  showTajwid: boolean;
  mushafLayoutId: 'indopak_13_line';
  updatedAt: string;
}
export type NavigationContext = 'root' | 'course' | 'library' | 'review' | 'freePractice';
export type QuranLevel = 'Q0' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6';
export type QuranHifzStatus = 'new' | 'learning' | 'unstable' | 'stable' | 'mastered';

export interface QuranHifzEntry {
  reference: string;
  status: QuranHifzStatus;
  repetitions: number;
  errorCount: number;
  lastReviewedAt: string | null;
  updatedAt: string;
}

export interface QuranHifzWordEntry {
  reference: string;
  wordIndex: number;
  status: QuranHifzStatus;
  repetitions: number;
  errorCount: number;
  lastReviewedAt: string | null;
  updatedAt: string;
}
export type VocabularyStatusFilter = 'all' | 'new' | 'learning' | 'mastered';
export type VocabularyLevelFilter = CefrLevel | 'current' | 'up_to_target' | 'all';
export type GrammarLevelFilter = CefrLevel | 'current' | 'up_to_target' | 'all';

export type ReviewContentType = 'vocabulary' | 'reading' | 'grammar' | 'alphabet' | 'quran' | 'knowledge' | 'speaking';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewItem {
  id: string;
  profileId: string;
  contentType: ReviewContentType;
  contentId: string;
  prompt: string;
  answer: string;
  mastery: number;
  correctStreak: number;
  wrongCount: number;
  intervalDays: number;
  lastReviewedAt: string | null;
  nextReviewAt: string;
  updatedAt: string;
}

export interface ReviewResultInput {
  contentType: ReviewContentType;
  contentId: string;
  prompt: string;
  answer: string;
  correct: boolean;
  rating?: ReviewRating;
}

export interface ReviewSummary {
  dueNow: number;
  dueToday: number;
  total: number;
  mastered: number;
}

export type LearningActivityType =
  | 'lesson_completed'
  | 'lesson_reopened'
  | 'module_activity_completed'
  | 'module_exam_completed'
  | 'module_exam_failed'
  | 'vocabulary_answer'
  | 'exercise_answer'
  | 'writing_answer'
  | 'review_answer'
  | 'settings_changed'
  | 'profile_created'
  | 'backup_exported'
  | 'backup_imported'
  | 'progress_reset';

export interface LearningHistoryInput {
  module: PageId;
  activityType: LearningActivityType;
  contentId?: string;
  title: string;
  result?: 'correct' | 'wrong' | 'completed' | 'reopened' | 'changed';
  xpDelta?: number;
  details?: Record<string, unknown>;
}

export interface LearningHistoryEntry extends LearningHistoryInput {
  id: string;
  profileId: string;
  occurredAt: string;
}

export interface AppPreferences {
  themeMode: ThemeMode;
  colorScheme: ColorScheme;
  fontSize: FontSizePreference;
  arabicFontSize: ArabicFontSizePreference;
  arabicFont: ArabicFontPreference;
  transliteration: boolean;
  harakat: HarakatPreference;
  moduleHarakat: Record<HarakatModule, HarakatOverride>;
  density: DisplayDensity;
  learningHelp: LearningHelpMode;
  viewMode?: ViewMode;
  learningPathMode: LearningPathMode;
  currentLevel: CefrLevel;
  targetLevel: CefrLevel;
  contentLevelScope: ContentLevelScope;
  arabicVariety: ArabicVariety;
  dailyGoalMinutes: number;
  reducedMotion: boolean;
  highContrast: boolean;
  enabledTracks: CourseTrack[];
  primaryFiqhSchool: FiqhSchool;
  onboardingComplete: boolean;
  onboardingVersion: number;
  primaryLearningGoal: PrimaryLearningGoal;
  onboardingExperience: ArabicExperience;
  placementScore: number | null;
  audioEnabled: boolean;
  audioRate: AudioRate;
  audioVoice: string;
  autoRecoverySnapshots: boolean;
}

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  protected: boolean;
  createdAt: string;
  lastUsedAt: string;
}

export interface ProfileSummary extends Profile {
  currentLevel: CefrLevel;
  targetLevel: CefrLevel;
  progressPercent: number;
  xp: number;
  vocabularyCorrect: number;
  dueReviews: number;
  currentStreak: number;
}

export interface ModuleProgressSummary {
  alphabet: number;
  vocabulary: number;
  grammar: number;
  writing: number;
  reading: number;
  exercises: number;
  quran: number;
}

export type ExerciseVariant =
  | 'default'
  | 'alphabet_recognition'
  | 'alphabet_sound'
  | 'alphabet_positions'
  | 'alphabet_weight'
  | 'vocabulary_matching'
  | 'vocabulary_context'
  | 'vocabulary_recall'
  | 'vocabulary_listening'
  | 'vocabulary_dictation'
  | 'speaking_shadowing'
  | 'morphology_root'
  | 'register_shift'
  | 'hadith_analysis'
  | 'fiqh_compare'
  | 'grammar_rules'
  | 'grammar_cloze'
  | 'grammar_error_correction'
  | 'grammar_listening'
  | 'sentence_builder'
  | 'reading_meaning'
  | 'reading_listening'
  | 'reading_vocalized'
  | 'reading_harakat'
  | 'writing_input'
  | 'writing_dictation'
  | 'writing_trace'
  | 'writing_copy'
  | 'quran_signs'
  | 'quran_tajweed'
  | 'quran_pauses'
  | 'quran_language'
  | 'knowledge_quiz'
  | 'smart_mix';

export interface ExerciseSequenceStep {
  type: ExerciseType;
  variant: ExerciseVariant;
  contentIds: string[];
  activityId: string;
  activityTitle: string;
  minimumScore?: number;
  adaptiveBucket?: 'due' | 'current' | 'weakness' | 'interleaving' | 'transfer';
  adaptiveReason?: string;
  adaptiveMastery?: number;
}

export interface DailyChallengeState {
  id: string;
  date: string;
  track: CourseTrack;
  title: string;
  description: string;
  focusLabel: string;
  reasonLabel: string;
  itemCount: number;
  estimatedMinutes: number;
  sequence: ExerciseSequenceStep[];
  status: 'available' | 'completed';
  score: number | null;
  completedAt: string | null;
}

export interface ExerciseSessionState {
  id: string;
  type: ExerciseType;
  itemIds: string[];
  contextId?: string;
  variant?: ExerciseVariant;
  moduleId?: string;
  phaseId?: string;
  activityId?: string;
  activityTitle?: string;
  optionId?: string;
  scopeModuleId?: string;
  minimumScore?: number;
  sequence?: ExerciseSequenceStep[];
  sequenceIndex?: number;
  sequenceScores?: number[];
  sequenceCompletion?: 'phase' | 'activity' | 'free' | 'daily' | 'review';
  challengeId?: string;
  reviewItemId?: string;
  adaptiveBucket?: 'due' | 'current' | 'weakness' | 'interleaving' | 'transfer';
  adaptiveReason?: string;
  adaptiveMastery?: number;
  createdAt: string;
}

export interface ModuleExamQuestion {
  id: string;
  sourceRefIds?: string[];
  claimId?: string;
  questionKind?: 'term' | 'method' | 'case' | 'error' | 'source' | 'boundary';
  skill: string;
  prompt: string;
  arabicPrompt?: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface ModuleExamAnswer {
  questionId: string;
  skill: string;
  answer: string;
  correct: boolean;
}

export interface ModuleExamSessionState {
  id: string;
  moduleId: string;
  scope?: 'module' | 'chapter';
  chapterId?: string;
  questions: ModuleExamQuestion[];
  currentIndex: number;
  answers: ModuleExamAnswer[];
  startedAt: string;
  status: 'active' | 'finished';
  score?: number;
  passed?: boolean;
  skillScores?: Record<string, number>;
}

export interface ProgressState {
  xp: number;
  streak: number;
  completedLessons: string[];
  vocabularyCorrect: number;
  vocabularyWrong: number;
  quizCorrect: number;
  quizTotal: number;
  currentVocabulary: number;
  currentVocabularyCategory: string;
  currentVocabularyDirection: VocabularyDirection;
  currentVocabularyLevelFilter: VocabularyLevelFilter;
  currentVocabularyStatusFilter: VocabularyStatusFilter;
  currentGrammarLevelFilter: GrammarLevelFilter;
  currentAlphabetLetter: string | null;
  currentWritingLesson: string | null;
  currentGrammarLesson: string | null;
  currentReadingLesson: string | null;
  currentExerciseType: ExerciseType;
  currentExerciseVariant: ExerciseVariant;
  freePracticeModuleId: string | null;
  exercisePickerOpen: boolean;
  activeExerciseSession: ExerciseSessionState | null;
  journeyStates: JourneyStateMap;
  quranReaderState: QuranReaderState;
  hifzStudyState: HifzStudyState;
  quranHifzEntries: QuranHifzEntry[];
  quranHifzWordEntries: QuranHifzWordEntry[];
  libraryFavorites: string[];
  libraryRecent: string[];
  dailyImpulseDate: string | null;
  dailyImpulseId: string | null;
  impulseRecentIds: string[];
  impulseFavoriteIds: string[];
  dailyChallenge: DailyChallengeState | null;
  activeModuleExam: ModuleExamSessionState | null;
  overallProgress: number;
  moduleProgress: ModuleProgressSummary;
  preferences: AppPreferences;
}

export interface ProfileData {
  profile: Profile;
  progress: ProgressState;
}

export interface CreateProfileInput {
  name: string;
  avatar: string;
  pin?: string;
  currentLevel?: CefrLevel;
  targetLevel?: CefrLevel;
}

export type ContentStatus = 'not_started' | 'in_progress' | 'completed' | 'mastered';

export interface SkillProgressEntry {
  profileId: string;
  skillId: string;
  mastery: number;
  confidence: number;
  evidenceCount: number;
  lastPracticedAt: string | null;
  updatedAt: string;
}

export type UserAnnotationEntityType = 'quran_ayah' | 'quran_word' | 'course_module' | 'learning_item' | 'source' | 'reading';
export type UserAnnotationType = 'bookmark' | 'note';

export interface UserAnnotation {
  profileId: string;
  entityType: UserAnnotationEntityType;
  entityId: string;
  annotationType: UserAnnotationType;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserAnnotationInput {
  entityType: UserAnnotationEntityType;
  entityId: string;
  annotationType: UserAnnotationType;
  text?: string;
}

export interface ContentProgressEntry {
  profileId: string;
  module: PageId;
  contentId: string;
  status: ContentStatus;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  bestScore: number;
  mastery: number;
  manualCompleted: boolean;
  firstStartedAt: string;
  lastPracticedAt: string;
  completedAt: string | null;
}

export type ExerciseResultType = ExerciseType | 'module_exam' | 'chapter_exam';

export interface ExerciseResultInput {
  exerciseId: string;
  exerciseType: ExerciseResultType;
  wasCorrect: boolean;
  score?: number;
  details?: Record<string, unknown>;
}

export interface ExerciseResultEntry extends ExerciseResultInput {
  id: string;
  profileId: string;
  answeredAt: string;
}

export interface LearningSession {
  id: string;
  profileId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  activityCount: number;
}

export interface SessionSummary {
  minutesToday: number;
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  lastActiveDate: string | null;
}

export interface StoredProfileRecord extends ProfileData {
  pinHash: string | null;
  pinSalt: string | null;
  reviewItems?: ReviewItem[];
  history?: LearningHistoryEntry[];
  contentProgress?: ContentProgressEntry[];
  exerciseResults?: ExerciseResultEntry[];
  sessions?: LearningSession[];
  skillProgress?: SkillProgressEntry[];
  userAnnotations?: UserAnnotation[];
}

