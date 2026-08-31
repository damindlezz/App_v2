import type {
  ArabicVariety,
  CefrLevel,
  ClaimSourceRelation,
  CourseTrack,
  ExerciseVariant,
  FiqhSchool,
  ModuleExamQuestion,
  PageId,
  QuranLevel,
  ReviewStage,
  SourceReviewStatus,
  SourceType,
  StudyLevel,
} from './app-models';
import type { ExerciseType } from './exercise-types';

export type LetterWeight = 'light' | 'dark' | 'contextual';

export interface ContentMetadata {
  contentVersion: string;
  status: 'draft' | 'prototype-reviewed' | 'published';
  source: string;
  lastUpdated: string;
  learningObjectives: string[];
  reviewTags: string[];
  cefrLevel: CefrLevel;
  arabicVariety: ArabicVariety;
}

export interface AlphabetEntry extends ContentMetadata {
  id: string;
  letter: string;
  name: string;
  sound: string;
  group: string;
  order: number;
  weight: LetterWeight;
  weightLabel: string;
  weightNote?: string;
  forms?: {
    isolated: string;
    initial: string;
    medial: string;
    final: string;
  };
}

export type VocabularyPartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'particle'
  | 'phrase'
  | 'number'
  | 'conjunction';

export interface VocabularyExample {
  id: string;
  arabicVocalized: string;
  arabicUnvocalized: string;
  transliteration: string;
  german: string;
}

export interface VocabularyEntry extends ContentMetadata {
  id: string;
  arabicVocalized: string;
  arabicUnvocalized: string;
  transliteration: string;
  german: string;
  category: string;
  categoryId: string;
  difficulty: number;
  tags: string[];
  stage: number;
  partOfSpeech: VocabularyPartOfSpeech;
  gender?: 'masculine' | 'feminine';
  pluralVocalized?: string;
  pluralUnvocalized?: string;
  root?: string;
  lemmaVocalized: string;
  lemmaUnvocalized: string;
  pattern?: string;
  wordFamily: string[];
  collocations: string[];
  register: 'neutral' | 'formal' | 'academic' | 'literary' | 'quranic';
  activeUse: boolean;
  translationNote?: string;
  usageNote?: string;
  frequencyBand?: 'core' | 'common' | 'extended' | 'advanced';
  examples: VocabularyExample[];
  audio?: string;
  image?: string;
  hint?: string;
}

export type GrammarBlockType =
  | 'article'
  | 'noun'
  | 'adjective'
  | 'pronoun'
  | 'verb'
  | 'particle'
  | 'preposition'
  | 'object';

export interface GrammarBlock {
  type: GrammarBlockType;
  label: string;
  arabicVocalized: string;
  arabicUnvocalized: string;
  german?: string;
}

export interface GrammarExample {
  id: string;
  title: string;
  translation: string;
  blocks: GrammarBlock[];
}

export type GrammarQuizQuestionType = 'multiple_choice' | 'cloze';

export interface GrammarQuizQuestion {
  id: string;
  type: GrammarQuizQuestionType;
  prompt: string;
  arabicPrompt?: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface GrammarCommonMistake {
  wrong: string;
  correct: string;
  explanation: string;
}

export interface GrammarLesson extends ContentMetadata {
  id: string;
  title: string;
  description: string;
  level: number;
  order: number;
  category: string;
  general: string[];
  rules: string[];
  exceptions: string[];
  important: string[];
  commonMistakes: GrammarCommonMistake[];
  examples: GrammarExample[];
  prerequisiteLessonIds: string[];
  quizPassScore: number;
  quizQuestionCount: number;
  quiz: GrammarQuizQuestion[];
}

export type WritingExerciseType = 'copy' | 'forms' | 'assemble' | 'dictation' | 'free';
export type WritingTaskType = 'letter' | 'word' | 'sentence' | 'free_text';

export interface WritingStrokeStep {
  step: number;
  title: string;
  instruction: string;
}

export interface WritingPracticeExample {
  arabicVocalized: string;
  arabicUnvocalized: string;
  german: string;
}

export interface WritingLesson extends ContentMetadata {
  id: string;
  title: string;
  description: string;
  targetVocalized: string;
  targetUnvocalized: string;
  prompt: string;
  expectedAnswer: string;
  taskType: WritingTaskType;
  order: number;
  level: number;
  type: WritingExerciseType;
  hints: string[];
  forms?: string[];
  pieces?: string[];
  strokeSteps: WritingStrokeStep[];
  practiceWords: WritingPracticeExample[];
  practiceSentence?: WritingPracticeExample;
}

export interface ReadingPattern {
  id: string;
  title: string;
  template: string;
  explanation: string;
  vocalized: string;
  unvocalized: string;
  german: string;
}

export interface ReadingExample {
  id: string;
  vocalized: string;
  unvocalized: string;
  transliteration: string;
  german: string;
  clue: string;
}

export interface QuranLesson extends ContentMetadata {
  id: string;
  quranLevel: QuranLevel;
  title: string;
  description: string;
  order: number;
  category: 'script' | 'reading' | 'tajweed' | 'recitation' | 'language';
  objective: string;
  rules: string[];
  signs: Array<{ symbol: string; name: string; explanation: string }>;
  examples: Array<{ id: string; arabic: string; transliteration?: string; german: string; note: string }>;
  prerequisites: string[];
  quranReferences?: string[];
}

export type QuranReaderReviewStatus = 'missing' | 'referenced' | 'verified' | 'approved';

export interface QuranReaderDatasetRuntime {
  id: string;
  layerId: 'quran_text' | 'translation' | 'tafsir' | 'word_analysis' | 'tajweed' | 'mushaf_13_line' | 'recitation_audio';
  label: string;
  sourceId: string;
  locatorText: string;
  license: string;
  licenseVerified: boolean;
  reviewStatus: QuranReaderReviewStatus;
  language: string;
  recordCount: number;
  editorialOpen: boolean;
}

export interface QuranReaderAyahRecord {
  id: string;
  datasetId: string;
  reference: string;
  surah: number;
  ayah: number;
  text: string;
}

export interface QuranReaderTranslationRecord {
  id: string;
  datasetId: string;
  reference: string;
  text: string;
}

export interface QuranReaderTafsirRecord {
  id: string;
  datasetId: string;
  reference: string;
  title?: string;
  text: string;
}

export interface QuranReaderWordRecord {
  id: string;
  datasetId: string;
  reference: string;
  wordIndex: number;
  text: string;
  translation?: string;
  translationDatasetId?: string;
  lemma?: string;
  root?: string;
  morphology?: string;
}

export interface QuranReaderTajweedRecord {
  id: string;
  datasetId: string;
  reference: string;
  rule: string;
  explanation: string;
  startWord?: number;
  endWord?: number;
  text?: string;
}

export interface QuranReaderMushafLineRecord {
  id: string;
  datasetId: string;
  page: number;
  line: number;
  reference?: string;
  startReference?: string;
  endReference?: string;
  lineType?: string;
  alignment?: string;
  firstWordId?: number;
  lastWordId?: number;
  surahNumber?: number;
  sourceAyahIndex?: number;
  sourceWordStartIndex?: number;
  text: string;
}

export interface QuranReaderAudioRecord {
  id: string;
  datasetId: string;
  reference: string;
  audioPath: string;
  qari?: string;
  label?: string;
}

export interface QuranReaderRuntime {
  schemaVersion: 1;
  generatedAt: string | null;
  editorialOpen: boolean;
  datasets: QuranReaderDatasetRuntime[];
  ayahs: QuranReaderAyahRecord[];
  translations: QuranReaderTranslationRecord[];
  tafsir: QuranReaderTafsirRecord[];
  words: QuranReaderWordRecord[];
  tajweed: QuranReaderTajweedRecord[];
  mushafLines: QuranReaderMushafLineRecord[];
  audio: QuranReaderAudioRecord[];
}


export type QuranVocabularyMatchKind = 'surface_exact' | 'lemma_exact' | 'root_exact';

export interface QuranVocabularyLink {
  id: string;
  vocabularyId: string;
  normalizedForm: string;
  matchKind: QuranVocabularyMatchKind;
  occurrenceCount: number;
  surahCount: number;
  references: string[];
  reviewFingerprint: string;
  reviewStatus: 'derived' | 'verified';
}


export interface ReadingLesson extends ContentMetadata {
  id: string;
  title: string;
  description: string;
  level: number;
  order: number;
  phase: string;
  strategy: string;
  methodSteps: string[];
  recognitionTips: string[];
  patterns: ReadingPattern[];
  examples: ReadingExample[];
}

export type ModulePhaseType = 'practice' | 'deepen' | 'exam';
export type LearningActivityKind = 'content' | 'exercise' | 'knowledge' | 'exam';

export interface LearningActivityKnowledgeBlock {
  title: string;
  text: string;
  arabic?: string;
  claimId?: string;
  sourceRefIds?: string[];
}

export type LearningContentBlockType =
  | 'lead' | 'definition' | 'explanation' | 'rule' | 'example' | 'contrast'
  | 'steps' | 'warning' | 'remember' | 'audio' | 'checkpoint' | 'summary';

export interface LearningContentBlock {
  id: string;
  type: LearningContentBlockType;
  title?: string;
  text?: string;
  arabic?: string;
  items?: string[];
  claimId?: string;
  sourceRefIds?: string[];
}

export interface LearningStepSection {
  id: string;
  title: string;
  description?: string;
  estimatedMinutes?: number;
  contentIds: string[];
  blocks: LearningContentBlock[];
}

export interface LearningActivity {
  id: string;
  title: string;
  description: string;
  objective: string;
  kind: LearningActivityKind;
  icon: string;
  required: boolean;
  estimatedMinutes: number;
  contentModule?: PageId;
  contentIds: string[];
  exerciseType?: ExerciseType;
  exerciseVariant?: ExerciseVariant;
  exerciseTemplateId?: string;
  competencyIds?: string[];
  sourceRefIds?: string[];
  minimumScore?: number;
  knowledge: LearningActivityKnowledgeBlock[];
}

export interface LearningModuleIntroExample {
  arabic?: string;
  text: string;
}

export interface LearningModuleIntro {
  title: string;
  summary: string;
  estimatedMinutes: number;
  outcomes: string[];
  example: LearningModuleIntroExample;
}

export type LearningEvidenceMode = 'recognition' | 'recall' | 'application' | 'production' | 'listening' | 'speaking';

export interface LearningStepCompletionPolicy {
  minimumScore: number;
  minimumEvidenceCount: number;
  requiredModes: LearningEvidenceMode[];
}

export interface LearningStep extends LearningActivity {
  order: number;
  skillIds: string[];
  completionPolicy: LearningStepCompletionPolicy;
  sections?: LearningStepSection[];
}

export type SkillDomain = 'script' | 'phonology' | 'vocabulary' | 'grammar' | 'morphology' | 'reading' | 'writing' | 'listening' | 'speaking' | 'interaction' | 'discourse' | 'register' | 'quran' | 'fiqh' | 'usul_fiqh' | 'hadith' | 'usul_hadith';

export interface SkillDefinition extends ContentMetadata {
  id: string;
  domain: SkillDomain;
  title: string;
  description: string;
  levels: CefrLevel[];
  parentId?: string;
  measurableBy: string[];
}

export interface LearningItemDefinition extends ContentMetadata {
  id: string;
  contentModule: 'alphabet' | 'vocabulary' | 'grammar' | 'writing' | 'reading' | 'quran';
  contentId: string;
  title: string;
  competencyIds: string[];
  exerciseTemplateIds: string[];
  prerequisiteItemIds: string[];
  productionExpected: boolean;
  quranReferences?: string[];
  relationIds?: string[];
}

export interface ExerciseTemplateDefinition extends ContentMetadata {
  id: string;
  title: string;
  description: string;
  competencyIds: string[];
  contentDomains: Array<'alphabet' | 'vocabulary' | 'grammar' | 'writing' | 'reading' | 'quran' | 'courseModule'>;
  minLevel: CefrLevel;
  maxLevel: CefrLevel;
  engineType: ExerciseType;
  engineVariant: ExerciseVariant;
  responseMode: 'choice' | 'tokens' | 'text' | 'trace' | 'self_assessment';
  feedbackMode: 'brief' | 'contrast' | 'rule' | 'context' | 'production';
  cognitiveDemand: 'recognition' | 'recall' | 'application' | 'transfer' | 'production';
  requiresAudio: boolean;
  runtimeStatus: 'implemented' | 'content_ready' | 'planned';
}

export interface LearningModulePhase {
  id: string;
  type: ModulePhaseType;
  title: string;
  description: string;
  required: boolean;
  order: number;
  activities: LearningActivity[];
}

export interface PracticePolicy {
  excellentScore: number;
  repeatScore: number;
  repeatAttempts: number;
  minimumSkillScore: number;
  critical: boolean;
}

export interface ModuleExamConfig {
  activityId: string;
  title: string;
  description: string;
  questionCount: number;
  passScore: number;
  minimumSkillScore: number;
  skills: string[];
}

export interface ChapterExamConfig {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  passScore: number;
  minimumSkillScore: number;
  estimatedMinutes: number;
  skills: string[];
}

export interface SourceRecord {
  id: string;
  type: SourceType;
  title: string;
  author?: string;
  madhhab?: FiqhSchool;
  language: string;
  edition?: string;
  publisher?: string;
  year?: string;
  canonicalUrl?: string;
  reviewStatus: SourceReviewStatus;
  bibliographicStatus: 'verified' | 'edition_pending' | 'internal';
  notes?: string;
}

export interface CitationRecord {
  id: string;
  sourceId: string;
  moduleId?: string;
  volume?: string;
  page?: string;
  chapter?: string;
  hadithNumber?: string;
  quranRef?: string;
  locatorText: string;
  exactLocatorVerified: boolean;
  reviewStatus: SourceReviewStatus;
}

export interface ClaimRecord {
  id: string;
  text: string;
  domain: 'language' | 'quran' | 'fiqh' | 'usul_fiqh' | 'hadith' | 'usul_hadith';
  track?: CourseTrack;
  madhhab?: FiqhSchool;
  moduleId: string;
  learningStepId?: string;
  claimKind: 'teaching_summary' | 'definition' | 'method' | 'case' | 'boundary' | 'source_note';
  critical: boolean;
  reviewStatus: SourceReviewStatus;
}

export interface ClaimSourceLinkRecord {
  id: string;
  claimId: string;
  citationId: string;
  relation: ClaimSourceRelation;
  note: string;
  reviewStatus: SourceReviewStatus;
}

export interface SourceReference {
  id: string;
  sourceId: string;
  label: string;
  locator?: string;
  kind: 'editorial' | 'book' | 'collection' | 'quran' | 'curriculum';
  relation: ClaimSourceRelation;
  reviewStatus: SourceReviewStatus;
  exactLocatorVerified: boolean;
  reviewRequired: boolean;
}

export interface ModuleQuality {
  score: number;
  reviewStage: ReviewStage;
  reviewRequirements: ReviewStage[];
  sourceRefs: SourceReference[];
  coverage: {
    objectives: boolean;
    teaching: boolean;
    examples: boolean;
    practice: boolean;
    deepen: boolean;
    exam: boolean;
    sources: boolean;
  };
  automatedEditorialReview?: {
    passed: boolean;
    reviewedAt: string;
    checks: ModuleQuality['coverage'];
  };
  expertReviewRequired?: boolean;
}

export type LearningModuleLayoutSection = 'title' | 'position' | 'content' | 'actions';

export interface LearningModuleLayout {
  schemaVersion: 1;
  preset: 'standard' | 'focus' | 'wide' | 'reference';
  readerWidth: 'reader' | 'wide' | 'full';
  spacing: 'compact' | 'standard' | 'relaxed';
  blockStyle: 'paper' | 'card' | 'flat';
  contentAlign: 'start' | 'center';
  sectionOrder: LearningModuleLayoutSection[];
  contentMeasure?: 'narrow' | 'standard' | 'wide';
  readerSurface?: 'paper' | 'flat';
  actionLayout?: 'split' | 'compact';
  sectionGap?: 'compact' | 'standard' | 'relaxed';
  titleScale?: 'compact' | 'standard' | 'prominent';
  showPosition?: boolean;
  showEyebrow?: boolean;
  readerWidthPx?: number;
  contentWidthPx?: number;
  readerPaddingPx?: number;
  sectionGapPx?: number;
  titleSizePx?: number;
}

export interface LearningPathUnit {
  id: string;
  track: CourseTrack;
  title: string;
  module: PageId;
  lessonIds: string[];
  objective: string;
  prerequisiteIds: string[];
  estimatedMinutes: number;
  practicePolicy: PracticePolicy;
  intro: LearningModuleIntro;
  learningId: string;
  learningSteps: LearningStep[];
  phases: LearningModulePhase[];
  exam: ModuleExamConfig;
  knowledgeQuestions?: ModuleExamQuestion[];
  quality?: ModuleQuality;
  layout?: LearningModuleLayout;
}

export interface LearningPathChapter extends ContentMetadata {
  id: string;
  track: CourseTrack;
  quranLevel?: QuranLevel;
  studyLevel?: StudyLevel;
  madhhab?: FiqhSchool;
  title: string;
  description: string;
  levelLabel: string;
  order: number;
  units: LearningPathUnit[];
  exam: ChapterExamConfig;
}

export type LearningPathStage = LearningPathChapter;

export interface LearningPathLevel {
  id: string;
  track: CourseTrack;
  cefrLevel: CefrLevel;
  quranLevel?: QuranLevel;
  studyLevel?: StudyLevel;
  madhhab?: FiqhSchool;
  title: string;
  description: string;
  order: number;
  chapters: LearningPathChapter[];
}

export interface ContentManifest {
  contentVersion: string;
  releaseOrder: number;
  catalogSchemaVersion: number;
  status: 'draft' | 'prototype-reviewed' | 'published';
  source: string;
  lastUpdated: string;
  language: string;
  languageName: string;
  arabicVariety: ArabicVariety;
  stableIds: boolean;
  supportedLevels: CefrLevel[];
  datasets: string[];
  runtimeSource?: 'json';
  editorialNotice?: string;
  showEditorialNotice?: boolean;
  editorialReviewMode?: boolean;
  counts: {
    alphabet: number;
    vocabulary: number;
    grammar: number;
    writing: number;
    reading: number;
    quran: number;
    learningPath: number;
    quranPath: number;
    islamicPaths: number;
    skills: number;
    learningItems: number;
    exerciseTemplates: number;
    sources: number;
    citations: number;
    claims: number;
    claimSourceLinks: number;
    quranVocabularyLinks?: number;
  };
}

export interface LearningContent {
  manifest: ContentManifest;
  idAliases?: Record<string, string>;
  vocabularyDetailsHydrated?: boolean;
  alphabet: AlphabetEntry[];
  vocabulary: VocabularyEntry[];
  grammar: GrammarLesson[];
  writing: WritingLesson[];
  reading: ReadingLesson[];
  quran: QuranLesson[];
  quranReader?: QuranReaderRuntime;
  quranVocabularyLinks?: QuranVocabularyLink[];
  learningPath: LearningPathStage[];
  quranPath: LearningPathStage[];
  islamicPaths: LearningPathStage[];
  skills: SkillDefinition[];
  learningItems: LearningItemDefinition[];
  exerciseTemplates: ExerciseTemplateDefinition[];
  sources: SourceRecord[];
  citations: CitationRecord[];
  claims: ClaimRecord[];
  claimSourceLinks: ClaimSourceLinkRecord[];
}

