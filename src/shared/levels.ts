import type {
  AppPreferences,
  CefrLevel,
  ContentLevelScope,
  ContentMetadata,
  LearningContent
} from '../types/models';

export interface CefrLevelInfo {
  id: CefrLevel;
  label: string;
  shortDescription: string;
  objective: string;
}

export const CEFR_LEVELS: readonly CefrLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export const CEFR_LEVEL_INFO: readonly CefrLevelInfo[] = [
  { id: 'A0', label: 'A0 · Einstieg', shortDescription: 'Schrift und erste Wörter', objective: 'Alphabet, Lautsystem, Lesen mit Harakat und grundlegende Fusha-Ausdrücke.' },
  { id: 'A1', label: 'A1 · Grundlagen', shortDescription: 'Einfache Alltagssätze', objective: 'Kurze Aussagen, Fragen und Standardsituationen in modernem Hocharabisch.' },
  { id: 'A2', label: 'A2 · Grundstufe', shortDescription: 'Verbundene Kommunikation', objective: 'Häufige Verben, Beschreibungen, Reisen, Lernen und einfache zusammenhängende Texte.' },
  { id: 'B1', label: 'B1 · Mittelstufe', shortDescription: 'Selbstständig verstehen', objective: 'Nachrichtennahe Texte, Erzählungen, Begründungen und längere Gesprächsthemen.' },
  { id: 'B2', label: 'B2 · Gute Mittelstufe', shortDescription: 'Komplexe Inhalte', objective: 'Abstrakte Themen, formelle Argumentation und differenzierter schriftlicher Ausdruck.' },
  { id: 'C1', label: 'C1 · Fortgeschritten', shortDescription: 'Präziser Fusha-Gebrauch', objective: 'Anspruchsvolle Texte, Nuancen, gehobener Stil und akademisch-berufliche Kommunikation.' },
  { id: 'C2', label: 'C2 · Annähernd muttersprachlich', shortDescription: 'Stilsicherheit', objective: 'Feine Bedeutungsunterschiede, Rhetorik, idiomatische Präzision und komplexe Textsorten.' }
] as const;

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && CEFR_LEVELS.includes(value as CefrLevel);
}

export function levelRank(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

export function compareLevels(left: CefrLevel, right: CefrLevel): number {
  return levelRank(left) - levelRank(right);
}

export function levelAtMost(level: CefrLevel, maximum: CefrLevel): boolean {
  return compareLevels(level, maximum) <= 0;
}

export function levelAtLeast(level: CefrLevel, minimum: CefrLevel): boolean {
  return compareLevels(level, minimum) >= 0;
}

export function normalizeLevel(value: unknown, fallback: CefrLevel): CefrLevel {
  return isCefrLevel(value) ? value : fallback;
}

export function normalizeLevelPair(currentValue: unknown, targetValue: unknown): { currentLevel: CefrLevel; targetLevel: CefrLevel } {
  const currentLevel = normalizeLevel(currentValue, 'A0');
  const targetCandidate = normalizeLevel(targetValue, 'A2');
  return {
    currentLevel,
    targetLevel: levelAtLeast(targetCandidate, currentLevel) ? targetCandidate : currentLevel
  };
}

export function levelLabel(level: CefrLevel): string {
  return CEFR_LEVEL_INFO.find((item) => item.id === level)?.label ?? level;
}

export function levelDescription(level: CefrLevel): string {
  return CEFR_LEVEL_INFO.find((item) => item.id === level)?.objective ?? '';
}

export function matchesLevelScope(
  level: CefrLevel,
  preferences: Pick<AppPreferences, 'currentLevel' | 'targetLevel' | 'contentLevelScope'>,
  scope: ContentLevelScope = preferences.contentLevelScope
): boolean {
  if (scope === 'all') return true;
  if (scope === 'current') return level === preferences.currentLevel;
  return levelAtLeast(level, preferences.currentLevel) && levelAtMost(level, preferences.targetLevel);
}

export function filterByTarget<T extends Pick<ContentMetadata, 'cefrLevel'>>(
  items: readonly T[],
  preferences: Pick<AppPreferences, 'targetLevel'>
): T[] {
  return items.filter((item) => levelAtMost(item.cefrLevel, preferences.targetLevel));
}

export function isBelowCurrentLevel(
  level: CefrLevel,
  preferences: Pick<AppPreferences, 'currentLevel'>
): boolean {
  return compareLevels(level, preferences.currentLevel) < 0;
}

export function matchesLearningPlan(
  level: CefrLevel,
  preferences: Pick<AppPreferences, 'currentLevel' | 'targetLevel'>
): boolean {
  return levelAtLeast(level, preferences.currentLevel) && levelAtMost(level, preferences.targetLevel);
}

export function filterByLearningPlan<T extends Pick<ContentMetadata, 'cefrLevel'>>(
  items: readonly T[],
  preferences: Pick<AppPreferences, 'currentLevel' | 'targetLevel'>
): T[] {
  return items.filter((item) => matchesLearningPlan(item.cefrLevel, preferences));
}

export function filterLearningContentForPlan(content: LearningContent, preferences: AppPreferences): LearningContent {
  return {
    ...content,
    alphabet: filterByLearningPlan(content.alphabet, preferences),
    vocabulary: filterByLearningPlan(content.vocabulary, preferences),
    grammar: filterByLearningPlan(content.grammar, preferences),
    writing: filterByLearningPlan(content.writing, preferences),
    reading: filterByLearningPlan(content.reading, preferences),
    quran: content.quran,
    learningPath: filterByLearningPlan(content.learningPath, preferences),
    quranPath: content.quranPath
  };
}

export function filterLearningContentForTarget(content: LearningContent, preferences: AppPreferences): LearningContent {
  return {
    ...content,
    alphabet: filterByTarget(content.alphabet, preferences),
    vocabulary: filterByTarget(content.vocabulary, preferences),
    grammar: filterByTarget(content.grammar, preferences),
    writing: filterByTarget(content.writing, preferences),
    reading: filterByTarget(content.reading, preferences),
    quran: content.quran,
    learningPath: filterByTarget(content.learningPath, preferences),
    quranPath: content.quranPath
  };
}

export function availableLevelsUntil(targetLevel: CefrLevel): CefrLevel[] {
  return CEFR_LEVELS.filter((level) => levelAtMost(level, targetLevel));
}
