import type { ExerciseResultEntry, LearningContent, PageId, SkillProgressEntry } from '../../types/models';
import { buildLearningEvidence, type LearningEvidenceRecord } from './learning-evidence';

interface SkillSourceIndex {
  byContent: Map<string, string[]>;
}

const cache = new WeakMap<LearningContent, SkillSourceIndex>();

function sourceIndex(content: LearningContent): SkillSourceIndex {
  const cached = cache.get(content);
  if (cached) return cached;
  const byContent = new Map<string, string[]>();
  const chapters = [...content.learningPath, ...content.quranPath, ...content.islamicPaths];
  for (const chapter of chapters) for (const unit of chapter.units) {
    const unitSkills = new Set<string>();
    for (const step of unit.learningSteps) {
      for (const skill of step.skillIds) unitSkills.add(skill);
      byContent.set(`courseModule:${step.id}`, [...step.skillIds]);
      if (step.contentModule) for (const id of step.contentIds) {
        const key = `${step.contentModule}:${id}`;
        byContent.set(key, [...new Set([...(byContent.get(key) ?? []), ...step.skillIds])]);
      }
    }
    byContent.set(`courseModule:${unit.id}`, [...unitSkills]);
  }
  const created = { byContent };
  cache.set(content, created);
  return created;
}

function mappedSkills(index: SkillSourceIndex, evidence: LearningEvidenceRecord): string[] {
  if (evidence.skillIds.length) return evidence.skillIds;
  if (!evidence.contentId) return [];
  if (evidence.module) {
    const exact = index.byContent.get(`${evidence.module}:${evidence.contentId}`);
    if (exact?.length) return exact;
  }
  return index.byContent.get(`courseModule:${evidence.contentId}`) ?? [];
}

function applyEvidence(
  profileId: string,
  previous: SkillProgressEntry | undefined,
  skillId: string,
  evidence: LearningEvidenceRecord,
  now: string
): SkillProgressEntry {
  const previousCount = Math.max(0, previous?.evidenceCount ?? 0);
  const evidenceCount = previousCount + 1;
  const score = Math.max(0, Math.min(100, evidence.score));
  const previousMastery = previous?.mastery ?? score;
  const alpha = previousCount === 0 ? 1 : Math.max(0.08, Math.min(0.32, 2 / (Math.min(evidenceCount, 20) + 1)));
  const mastery = Math.round(previousMastery + (score - previousMastery) * alpha);
  const consistency = Math.max(0, 100 - Math.abs(score - previousMastery));
  const coverage = Math.min(100, evidenceCount * 8);
  const confidence = previousCount === 0
    ? Math.round(coverage * 0.55 + consistency * 0.45)
    : Math.round((previous?.confidence ?? 0) * 0.65 + coverage * 0.20 + consistency * 0.15);
  return {
    profileId,
    skillId,
    mastery: Math.max(0, Math.min(100, mastery)),
    confidence: Math.max(0, Math.min(100, confidence)),
    evidenceCount,
    lastPracticedAt: evidence.answeredAt,
    updatedAt: now
  };
}

/**
 * Incrementally folds only new canonical exercise events into persisted skill state.
 * Existing skills are preserved even when they have no evidence in the current runtime window.
 */
export function updateSkillProgressEntries(
  profileId: string,
  content: LearningContent,
  existing: readonly SkillProgressEntry[],
  newResults: readonly ExerciseResultEntry[],
  now = new Date().toISOString()
): SkillProgressEntry[] {
  const index = sourceIndex(content);
  const bySkill = new Map(existing.map((entry) => [entry.skillId, { ...entry, profileId }]));
  const evidence = buildLearningEvidence(newResults).sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  for (const item of evidence) {
    for (const skillId of mappedSkills(index, item)) {
      bySkill.set(skillId, applyEvidence(profileId, bySkill.get(skillId), skillId, item, now));
    }
  }
  return [...bySkill.values()].sort((a, b) => a.skillId.localeCompare(b.skillId));
}

/** Full-history rebuild used only for migration/repair when no persisted skill state exists. */
export function buildSkillProgressEntries(
  profileId: string,
  content: LearningContent,
  results: readonly ExerciseResultEntry[],
  now = new Date().toISOString()
): SkillProgressEntry[] {
  return updateSkillProgressEntries(profileId, content, [], results, now);
}

export function changedSkillProgressEntries(
  previous: readonly SkillProgressEntry[],
  next: readonly SkillProgressEntry[]
): SkillProgressEntry[] {
  const before = new Map(previous.map((entry) => [entry.skillId, entry]));
  return next.filter((entry) => {
    const old = before.get(entry.skillId);
    return !old
      || old.mastery !== entry.mastery
      || old.confidence !== entry.confidence
      || old.evidenceCount !== entry.evidenceCount
      || old.lastPracticedAt !== entry.lastPracticedAt
      || old.updatedAt !== entry.updatedAt;
  });
}

export function skillIdsForContent(content: LearningContent, module: PageId, contentId: string): string[] {
  const index = sourceIndex(content);
  return index.byContent.get(`${module}:${contentId}`) ?? index.byContent.get(`courseModule:${contentId}`) ?? [];
}
