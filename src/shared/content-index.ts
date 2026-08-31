import { flattenCourseModules } from './course-module';
import type {
  AlphabetEntry,
  ClaimRecord,
  ClaimSourceLinkRecord,
  CitationRecord,
  GrammarLesson,
  LearningContent,
  LearningItemDefinition,
  QuranLesson,
  ReadingLesson,
  SourceRecord,
  VocabularyEntry,
  WritingLesson,
  QuranVocabularyLink
} from '../types/models';

export interface ContentIndex {
  alphabetById: Map<string, AlphabetEntry>;
  vocabularyById: Map<string, VocabularyEntry>;
  grammarById: Map<string, GrammarLesson>;
  writingById: Map<string, WritingLesson>;
  readingById: Map<string, ReadingLesson>;
  quranById: Map<string, QuranLesson>;
  sourceById: Map<string, SourceRecord>;
  citationById: Map<string, CitationRecord>;
  claimById: Map<string, ClaimRecord>;
  learningItemById: Map<string, LearningItemDefinition>;
  linksByClaimId: Map<string, ClaimSourceLinkRecord[]>;
  linksByCitationId: Map<string, ClaimSourceLinkRecord[]>;
  citationsBySourceId: Map<string, CitationRecord[]>;
  citationsByModuleId: Map<string, CitationRecord[]>;
  moduleTitleById: Map<string, string>;
  quranVocabularyByVocabularyId: Map<string, QuranVocabularyLink>;
}

const CACHE = new WeakMap<LearningContent, ContentIndex>();

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const current = map.get(key);
  if (current) current.push(value);
  else map.set(key, [value]);
}

export function contentIndex(content: LearningContent): ContentIndex {
  const cached = CACHE.get(content);
  if (cached) return cached;

  const index: ContentIndex = {
    alphabetById: new Map((content.alphabet ?? []).map((entry) => [entry.id, entry])),
    vocabularyById: new Map((content.vocabulary ?? []).map((entry) => [entry.id, entry])),
    grammarById: new Map((content.grammar ?? []).map((entry) => [entry.id, entry])),
    writingById: new Map((content.writing ?? []).map((entry) => [entry.id, entry])),
    readingById: new Map((content.reading ?? []).map((entry) => [entry.id, entry])),
    quranById: new Map((content.quran ?? []).map((entry) => [entry.id, entry])),
    sourceById: new Map((content.sources ?? []).map((entry) => [entry.id, entry])),
    citationById: new Map((content.citations ?? []).map((entry) => [entry.id, entry])),
    claimById: new Map((content.claims ?? []).map((entry) => [entry.id, entry])),
    learningItemById: new Map((content.learningItems ?? []).map((entry) => [entry.id, entry])),
    linksByClaimId: new Map(),
    linksByCitationId: new Map(),
    citationsBySourceId: new Map(),
    citationsByModuleId: new Map(),
    moduleTitleById: new Map(flattenCourseModules(content).map(({ unit }) => [unit.id, unit.title])),
    quranVocabularyByVocabularyId: new Map((content.quranVocabularyLinks ?? []).map((entry) => [entry.vocabularyId, entry]))
  };

  for (const link of content.claimSourceLinks ?? []) {
    push(index.linksByClaimId, link.claimId, link);
    push(index.linksByCitationId, link.citationId, link);
  }
  for (const citation of content.citations ?? []) {
    push(index.citationsBySourceId, citation.sourceId, citation);
    if (citation.moduleId) push(index.citationsByModuleId, citation.moduleId, citation);
  }

  CACHE.set(content, index);
  return index;
}
