import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');

test('NUR 4 curriculum is derived from the existing learning engine',()=>{
  const study=read('src/features/study/StudyWorkspace.tsx');
  const module=read('src/features/module/ModulePage.tsx');
  const primitives=read('src/features/study/StudyLedgerPrimitives.tsx');
  assert.match(primitives,/KURRIKULUM/);
  assert.match(study,/completedModules\}\/\{chapter\.modules\.length/);
  assert.match(study,/item\.unit\.estimatedMinutes/);
  assert.match(module,/evaluateLearningStepCompletion/);
  assert.match(module,/CurriculumCheckpoint/);
  assert.match(module,/continueFromCheckpoint/);
  assert.match(module,/practicePhase/);
  assert.match(module,/chapterExamReady/);
  assert.match(module,/nextCourseModule/);
});

test('practice evidence returns through a curriculum checkpoint',()=>{
  const runner=read('src/features/practice/ExerciseRunner.tsx');
  assert.match(runner,/Kurrikulum-Checkpoint/);
  assert.match(runner,/Evidenz gespeichert/);
  assert.match(runner,/Weiter im Kurrikulum/);
  assert.match(runner,/contentUpdates/);
});

test('P0-P3 themes and motion are persisted on the existing profile model',()=>{
  const themes=read('src/shared/theme-options.ts');
  const provider=read('src/state/AppProvider.tsx');
  const defaults=read('src/core/defaults.ts');
  const css=read('src/styles/nur4.css');
  for(const theme of ['tannengold','lapis','sand','smaragd','wein','schiefer']) assert.match(themes,new RegExp(`id: ['\"]${theme}['\"]`),theme);
  assert.match(provider,/dataset\.theme = preferences\.colorScheme/);
  assert.match(defaults,/indigo: 'lapis'/);
  for(const motion of ['nurFloatUp','nurPulse','nurShimmer','nurFlashFlip']) assert.ok(css.includes(motion),motion);
});
