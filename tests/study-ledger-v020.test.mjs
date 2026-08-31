import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path)=>readFileSync(path,'utf8');

test('NUR 4 curriculum workspace owns a three-zone learning surface',()=>{
  const study=read('src/features/study/StudyWorkspace.tsx');
  const context=read('src/features/study/StudyContextRail.tsx');
  const primitives=read('src/features/study/StudyLedgerPrimitives.tsx');
  const css=read('src/styles/nur4.css');
  for(const token of ['study-ledger','study-canvas']) assert.ok(study.includes(token),token);
  assert.match(context,/study-context/);
  assert.match(primitives,/KURRIKULUM/);
  assert.match(css,/grid-template-columns:minmax\(280px,330px\) minmax\(0,1fr\) minmax\(280px,330px\)/);
  assert.match(css,/study-ledger-module\.is-active/);
  assert.doesNotMatch(study,/ProgressRing/);
});

test('v0.20 separates journey status from learning health',()=>{
  const types=read('src/types/app-models.ts');
  const journey=read('src/shared/study-journey.ts');
  assert.match(types,/JourneyStatus = 'locked' \| 'available' \| 'active' \| 'completed'/);
  assert.match(types,/LearningHealth = 'stable' \| 'weak' \| 'review_due'/);
  assert.match(journey,/journeyStatusFor/);
  assert.match(journey,/buildModuleHealthIndex/);
});

test('v0.20 remembers a separate resume position per course track',()=>{
  const types=read('src/types/app-models.ts');
  const defaults=read('src/core/defaults.ts');
  const module=read('src/features/module/ModulePage.tsx');
  assert.match(types,/JourneyStateMap = Partial<Record<CourseTrack, JourneyStateEntry>>/);
  assert.match(types,/journeyStates: JourneyStateMap/);
  assert.match(defaults,/normalizeJourneyStates/);
  assert.match(module,/setJourneyPosition/);
});

test('v0.20.1 renders Arabic Quran and Islamic paths through one ledger engine',()=>{
  const course=read('src/features/learn/CoursePathView.tsx');
  const learn=read('src/features/learn/LearnPage.tsx');
  const quran=read('src/features/quran/QuranAreaPage.tsx');
  const knowledge=read('src/features/knowledge/KnowledgePage.tsx');
  assert.match(course,/StudyWorkspace/);
  assert.match(learn,/track="fusha"/);
  assert.match(quran,/track="quran"/);
  assert.match(knowledge,/CoursePathView track=\{track\}/);
});


test('v0.20.2 Hifz Ledger supports Surah Juz page navigation and Ayah range study',()=>{
  const hifz=read('src/features/hifz/HifzWorkspace.tsx');
  assert.match(hifz,/HifzNavigationMode = 'surah' \| 'juz' \| 'page'/);
  assert.match(hifz,/pageAyahs\(page\)/);
  assert.match(hifz,/selectRange/);
  assert.match(hifz,/Study starten/);
  for(const phase of ['understand','memorize','recite','test']) assert.ok(hifz.includes(`'${phase}'`),phase);
});

test('v0.20.3 Quran and Hifz share the same three-view QuranStudyCanvas',()=>{
  const canvas=read('src/features/quran/QuranStudyCanvas.tsx');
  const reader=read('src/features/quran/QuranReader.tsx');
  const hifz=read('src/features/hifz/HifzWorkspace.tsx');
  for(const token of ['is-verses','is-mushaf','is-focus','WordLine','TajwidLine']) assert.ok(canvas.includes(token),token);
  assert.match(reader,/QuranStudyCanvas/);
  assert.match(hifz,/QuranStudyCanvas/);
  assert.match(canvas,/showWordByWord/);
  assert.match(canvas,/showTranslation/);
  assert.match(canvas,/maskArabic/);
});

test('v0.20.4 derives adaptive context from evidence, mastery and prioritized reviews',()=>{
  const evidence=read('src/services/learning/learning-evidence.ts');
  const skills=read('src/services/learning/skill-progress-service.ts');
  const provider=read('src/state/AppProvider.tsx');
  const review=read('src/features/review/ReviewWorkspace.tsx');
  const priority=read('src/services/review/review-priority.ts');
  const exercise=read('src/features/practice/ExerciseRunner.tsx');
  const module=read('src/features/module/ModulePage.tsx');
  assert.match(evidence,/buildLearningEvidence/);
  assert.match(evidence,/responseTimeMs/);
  assert.match(skills,/buildSkillProgressEntries/);
  assert.match(provider,/syncSkillProgress/);
  assert.match(priority,/prioritizeReviews/);
  assert.match(review,/buildUnifiedReviewQueue/);
  assert.match(exercise,/skillIdsForContent/);
  assert.match(exercise,/responseTimeMs/);
  assert.match(module,/buildMasteryIndex/);
  assert.match(module,/Lern-Evidenz/);
  assert.doesNotMatch(module,/action:\s*'complete'/);
  assert.doesNotMatch(module,/Schritt abschliessen/i);
});

test('NUR 4 clean rewrite mounts only the global NUR navigation beside curriculum workspaces',()=>{
  const shell=read('src/components/shell/AppShell.tsx');
  const study=read('src/features/study/StudyWorkspace.tsx');
  const hifz=read('src/features/hifz/HifzWorkspace.tsx');
  const quran=read('src/features/quran/QuranReader.tsx');
  const module=read('src/features/module/ModulePage.tsx');
  const practice=read('src/features/practice/PracticeHub.tsx');
  const review=read('src/features/review/ReviewWorkspace.tsx');
  const today=read('src/features/home/TodayPage.tsx');
  const progress=read('src/features/progress/ProgressPage.tsx');
  const settings=read('src/features/settings/SettingsPage.tsx');
  const quranArea=read('src/features/quran/QuranAreaPage.tsx');
  const utility=read('src/features/study/StudyUtilityFrame.tsx');
  const base=read('src/styles/base.css');
  const responsive=read('src/styles/responsive.css');
  assert.match(shell,/NurHeader/);
  assert.match(shell,/app-shell--nur/);
  assert.doesNotMatch(shell,/StudyNavRail/);
  assert.doesNotMatch(`${shell}${study}${hifz}`,/data-study-workspace|studyWorkspace/);
  assert.doesNotMatch(read('src/features/study/StudyLedgerPrimitives.tsx'),/StudyNavRail/);
  for(const source of [study,hifz,module]) assert.match(source,/StudyLedgerShell|StudyLedgerPrimitives/);
  assert.doesNotMatch(utility,/StudyNavRail/);
  assert.match(today,/StudyUtilityFrame active="today"/);
  assert.match(progress,/StudyUtilityFrame active="progress"/);
  assert.match(settings,/StudyUtilityFrame active="settings"/);
  assert.doesNotMatch(quranArea,/quran-area-nav|quran-mode-switch/);
  assert.match(quran,/mode: 'verstehen'/);
  assert.match(review,/review-study-sheet/);
  assert.doesNotMatch(review,/<Surface|review-card/);
  assert.match(base,/focus-visible/);
  assert.match(base,/data-motion="reduced"/);
  assert.match(responsive,/@media\(max-width:1180px\)/);
  assert.match(responsive,/@media\(max-width:860px\)/);
  assert.doesNotMatch(module,/module-page|lesson-rail/);
});
