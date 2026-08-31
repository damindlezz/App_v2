import type { ExerciseType, ExerciseVariant, LearningContent } from '../types/models';

export type ExerciseContentDomain = 'alphabet' | 'vocabulary' | 'grammar' | 'writing' | 'reading' | 'quran' | 'courseModule';
export type ExerciseScoringStrategy = 'binary' | 'ratio' | 'self_assessment' | 'practice_only';
export type ExerciseInputCapability = 'Maus' | 'Touch' | 'Tastatur' | 'Stift';

export interface ExerciseDefinition {
  type: ExerciseType;
  variant: ExerciseVariant;
  contentDomains: ExerciseContentDomain[];
  skill: string;
  scoringStrategy: ExerciseScoringStrategy;
  allowedInput: ExerciseInputCapability[];
  minCoverage: number;
}

const POINTER_AND_KEYS: ExerciseInputCapability[] = ['Maus', 'Touch', 'Tastatur'];

export const EXERCISE_DEFINITIONS: ExerciseDefinition[] = [
  { type: 'alphabet', variant: 'alphabet_recognition', contentDomains: ['alphabet'], skill: 'Buchstabenerkennung', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 4 },
  { type: 'alphabet', variant: 'alphabet_sound', contentDomains: ['alphabet'], skill: 'Laut-Zeichen-Zuordnung', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 4 },
  { type: 'alphabet', variant: 'alphabet_positions', contentDomains: ['alphabet'], skill: 'Buchstabenformen', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 4 },
  { type: 'alphabet', variant: 'alphabet_weight', contentDomains: ['alphabet'], skill: 'Lautgruppen', scoringStrategy: 'ratio', allowedInput: POINTER_AND_KEYS, minCoverage: 6 },
  { type: 'vocabulary', variant: 'vocabulary_matching', contentDomains: ['vocabulary'], skill: 'Wortbedeutung', scoringStrategy: 'ratio', allowedInput: POINTER_AND_KEYS, minCoverage: 4 },
  { type: 'vocabulary', variant: 'vocabulary_context', contentDomains: ['vocabulary'], skill: 'Wort im Kontext', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 3 },
  { type: 'vocabulary', variant: 'vocabulary_recall', contentDomains: ['vocabulary'], skill: 'Aktiver Wortabruf', scoringStrategy: 'binary', allowedInput: ['Tastatur'], minCoverage: 1 },
  { type: 'vocabulary', variant: 'vocabulary_listening', contentDomains: ['vocabulary'], skill: 'Hörverständnis', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 4 },
  { type: 'vocabulary', variant: 'vocabulary_dictation', contentDomains: ['vocabulary'], skill: 'Hördiktat', scoringStrategy: 'binary', allowedInput: ['Tastatur'], minCoverage: 1 },
  { type: 'vocabulary', variant: 'morphology_root', contentDomains: ['vocabulary'], skill: 'Wortwurzel', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 4 },
  { type: 'vocabulary', variant: 'register_shift', contentDomains: ['vocabulary'], skill: 'Register', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'speaking', variant: 'speaking_shadowing', contentDomains: ['vocabulary', 'grammar', 'reading', 'writing'], skill: 'Aussprache und Produktion', scoringStrategy: 'self_assessment', allowedInput: ['Maus', 'Touch', 'Tastatur'], minCoverage: 1 },
  { type: 'sentence', variant: 'sentence_builder', contentDomains: ['grammar'], skill: 'Satzbau', scoringStrategy: 'ratio', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'grammar', variant: 'grammar_rules', contentDomains: ['grammar'], skill: 'Grammatikregel', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'grammar', variant: 'grammar_cloze', contentDomains: ['grammar'], skill: 'Lückensatz anwenden', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'grammar', variant: 'grammar_error_correction', contentDomains: ['grammar'], skill: 'Fehler erkennen und korrigieren', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'grammar', variant: 'grammar_listening', contentDomains: ['grammar'], skill: 'Grammatik hoerend verstehen', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'reading', variant: 'reading_harakat', contentDomains: ['reading'], skill: 'Harakat ergänzen', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'reading', variant: 'reading_vocalized', contentDomains: ['reading'], skill: 'Vokalisiertes Wortbild', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'reading', variant: 'reading_meaning', contentDomains: ['reading'], skill: 'Leseverständnis', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'reading', variant: 'reading_listening', contentDomains: ['reading'], skill: 'Hoerverstehen im Satz', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'writing', variant: 'writing_trace', contentDomains: ['writing', 'alphabet'], skill: 'Schreibmotorik', scoringStrategy: 'practice_only', allowedInput: ['Maus', 'Touch', 'Stift'], minCoverage: 1 },
  { type: 'writing', variant: 'writing_copy', contentDomains: ['writing'], skill: 'Abschreiben', scoringStrategy: 'binary', allowedInput: ['Tastatur'], minCoverage: 1 },
  { type: 'writing', variant: 'writing_input', contentDomains: ['writing', 'vocabulary'], skill: 'Aktive Schriftproduktion', scoringStrategy: 'binary', allowedInput: ['Tastatur'], minCoverage: 1 },
  { type: 'writing', variant: 'writing_dictation', contentDomains: ['writing'], skill: 'Hoerdiktat und Schriftproduktion', scoringStrategy: 'binary', allowedInput: ['Tastatur'], minCoverage: 1 },
  { type: 'quran', variant: 'quran_signs', contentDomains: ['quran'], skill: 'Muṣḥaf-Zeichen', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'quran', variant: 'quran_tajweed', contentDomains: ['quran'], skill: 'Tajwīd-Regeln', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'quran', variant: 'quran_pauses', contentDomains: ['quran'], skill: 'Pausenzeichen', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'quran', variant: 'quran_language', contentDomains: ['quran'], skill: 'Quranische Sprachstruktur', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'quran', variant: 'reading_vocalized', contentDomains: ['quran'], skill: 'Quran-Leseregeln', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'knowledge', variant: 'knowledge_quiz', contentDomains: ['courseModule'], skill: 'Fachwissen anwenden', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'knowledge', variant: 'hadith_analysis', contentDomains: ['courseModule'], skill: 'Hadith analysieren', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 },
  { type: 'knowledge', variant: 'fiqh_compare', contentDomains: ['courseModule'], skill: 'Fiqh vergleichen', scoringStrategy: 'binary', allowedInput: POINTER_AND_KEYS, minCoverage: 1 }
];

const DEFINITIONS = new Map(EXERCISE_DEFINITIONS.map((definition) => [`${definition.type}:${definition.variant}`, definition]));
export const REGISTERED_EXERCISE_TYPES = new Set<ExerciseType>(EXERCISE_DEFINITIONS.map((definition) => definition.type));

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  vocabulary: 'Vokabeln',
  sentence: 'Satzbau',
  grammar: 'Grammatik',
  reading: 'Lesen',
  alphabet: 'Buchstaben',
  writing: 'Schreiben',
  quran: 'Quran/Tajwīd',
  knowledge: 'Fachwissen',
  speaking: 'Sprechen'
};

export const FREE_PRACTICE_EXERCISE_TYPES = [...new Set(
  EXERCISE_DEFINITIONS
    .filter((definition) => !definition.contentDomains.includes('courseModule'))
    .map((definition) => definition.type)
)];

export function isRegisteredExerciseType(value: unknown): value is ExerciseType {
  return typeof value === 'string' && REGISTERED_EXERCISE_TYPES.has(value as ExerciseType);
}


export function exerciseDefinition(type: ExerciseType, variant: ExerciseVariant = 'default'): ExerciseDefinition | null {
  return DEFINITIONS.get(`${type}:${variant}`) ?? null;
}

function idsForDomain(content: LearningContent, domain: ExerciseContentDomain): Set<string> {
  if (domain === 'courseModule') {
    return new Set([...content.learningPath, ...content.quranPath, ...content.islamicPaths]
      .flatMap((chapter) => chapter.units)
      .flatMap((unit) => unit.knowledgeQuestions ?? [])
      .map((question) => question.id));
  }
  return new Set(content[domain].map((entry) => entry.id));
}

export function contentIdsMatchExercise(content: LearningContent, type: ExerciseType, variant: ExerciseVariant, contentIds: string[]): boolean {
  const definition = exerciseDefinition(type, variant);
  if (!definition || !contentIds.length) return false;
  const allowed = new Set<string>();
  for (const domain of definition.contentDomains) {
    for (const id of idsForDomain(content, domain)) allowed.add(id);
  }
  return contentIds.every((id) => allowed.has(id));
}
