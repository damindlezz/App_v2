import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAllIslamicTracks } from './fiqh-source.mjs';

const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

function allSteps() {
  const docs = [
    json('content-src/static/learning-path.json'),
    json('content-src/static/quran-path.json'),
    loadAllIslamicTracks()
  ];
  return docs.flatMap((doc) => doc.flatMap((chapter) => chapter.units.flatMap((unit) => unit.learningSteps)));
}

test('v0.21 P0 keeps persisted skill progress incremental beyond runtime history window', () => {
  const provider = read('src/state/AppProvider.tsx');
  const service = read('src/services/learning/skill-progress-service.ts');
  const storage = read('src/services/storage/storage-service.ts');
  assert.match(service, /updateSkillProgressEntries/);
  assert.match(service, /Existing skills are preserved/);
  assert.match(storage, /upsertSkillProgress/);
  assert.match(provider, /updateSkillProgressEntries/);
  assert.match(provider, /upsertSkillProgress/);
  assert.match(provider, /listExerciseResults\(activeProfile\.id, 0\)/);
  assert.match(provider, /listExerciseResults\(activeProfile\.id, 300\)/);
});

test('v0.21 P0 removes legacy course resume fields from runtime ProgressState', () => {
  const types = read('src/types/app-models.ts');
  const progressBlock = types.slice(types.indexOf('export interface ProgressState'), types.indexOf('export interface ProfileData'));
  for (const key of ['currentLearningModuleId', 'currentLearningPhaseId', 'currentLearningActivityId', 'currentCourseTrack', 'currentQuranLesson', 'currentQuranReference']) {
    assert.doesNotMatch(progressBlock, new RegExp(key));
  }
  const journey = read('src/shared/study-journey.ts');
  assert.doesNotMatch(journey, /progress\.currentLearning|progress\.currentCourseTrack/);
  const defaults = read('src/core/defaults.ts');
  assert.match(defaults, /type LegacyProgressState/);
  assert.match(defaults, /normalizeJourneyStates/);
});

test('v0.21 P0 separates Quran Reader resume from Hifz Study resume', () => {
  const types = read('src/types/app-models.ts');
  const quran = read('src/features/quran/QuranReader.tsx');
  const hifz = read('src/features/hifz/HifzWorkspace.tsx');
  assert.match(types, /quranReaderState: QuranReaderState/);
  assert.match(types, /hifzStudyState: HifzStudyState/);
  assert.match(types, /mushafLayoutId: 'indopak_13_line'/);
  assert.match(quran, /progress\.quranReaderState/);
  assert.match(hifz, /progress\.hifzStudyState/);
  assert.doesNotMatch(quran, /currentQuranReference/);
  assert.doesNotMatch(hifz, /currentQuranReference/);
});

test('v0.21 P0 requires explicit completion policy on every learning step', () => {
  const steps = allSteps();
  assert.ok(steps.length > 0);
  const allowed = new Set(['recognition', 'recall', 'application', 'production', 'listening', 'speaking']);
  for (const step of steps) {
    assert.ok(step.completionPolicy, step.id);
    assert.ok(step.completionPolicy.minimumScore >= 50 && step.completionPolicy.minimumScore <= 100, step.id);
    assert.ok(step.completionPolicy.minimumEvidenceCount >= 2, step.id);
    assert.ok(Array.isArray(step.completionPolicy.requiredModes) && step.completionPolicy.requiredModes.length > 0, step.id);
    for (const mode of step.completionPolicy.requiredModes) assert.ok(allowed.has(mode), `${step.id}:${mode}`);
  }
});

test('v0.21 P0 micro-check records evidence but policy evaluator owns step verification', () => {
  const module = read('src/features/module/ModulePage.tsx');
  const policy = read('src/services/learning/completion-policy.ts');
  assert.match(module, /evaluateLearningStepCompletion/);
  assert.match(module, /action: 'attempt'/);
  assert.match(module, /evidenceMode: 'recognition'/);
  assert.match(module, /evidence: 'completion_policy'/);
  assert.match(policy, /successfulByExercise/);
  assert.match(policy, /requiredModes/);
  assert.match(policy, /minimumEvidenceCount/);
});
