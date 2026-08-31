import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadFiqhTrack } from './fiqh-source.mjs';

const read = (path) => readFileSync(path, 'utf8');

test('P1 factors Fiqh into one core plus four sparse Madhhab layers without changing track contracts', () => {
  assert.equal(existsSync('content-src/islamic/fiqh/core.json'), true);
  for (const school of ['hanafi', 'maliki', 'shafii', 'hanbali']) {
    assert.equal(existsSync(`content-src/islamic/fiqh/layers/${school}.json`), true);
    assert.equal(existsSync(`content-src/islamic/paths/fiqh_${school}.json`), false);
    const chapters = loadFiqhTrack(`fiqh_${school}`);
    assert.equal(chapters.length, 4);
    assert.ok(chapters.every((chapter) => chapter.track === `fiqh_${school}`));
    assert.ok(chapters.every((chapter) => chapter.units.length > 0));
  }
  const build = read('scripts/build-content.py');
  assert.match(build, /load_fiqh_paths/);
  const study = read('src/features/study/StudyWorkspace.tsx');
  assert.match(study, /Madhhab Layer/);
  assert.match(study, /FIQH_STUDY_TRACKS/);
});

test('P1 uses real analysis and comparison task types for Hadith and Fiqh', () => {
  const tasks = read('src/features/practice/tasks.ts');
  const runner = read('src/features/practice/ExerciseRunner.tsx');
  assert.match(tasks, /TaskKind = .*'analysis'/);
  assert.match(tasks, /fiqhComparisonTask/);
  assert.match(tasks, /hadith_analysis.*analysisTask/s);
  assert.match(tasks, /fiqh_compare.*fiqhComparisonTask/s);
  assert.match(tasks, /Madhahib.*kind:'match'|kind:'match'.*Madh[a-zA-Z]*/s);
  assert.match(runner, /function AnalysisTask/);
  assert.match(runner, /Analyse pruefen|Analyse prüfen/);
});

test('P1 Hifz chains ranges and stores objective Ayah and word evidence', () => {
  const hifz = read('src/features/hifz/HifzWorkspace.tsx');
  const recall = read('src/features/hifz/HifzRecallTask.tsx');
  const utils = read('src/features/quran/quran-utils.ts');
  assert.match(hifz, /mode: 'ayah' \| 'chain'/);
  assert.match(hifz, /session\.references\.slice\(0, session\.index \+ 1\)/);
  assert.match(hifz, /hifz_range_chain/);
  assert.match(hifz, /objectiveEvidence: true/);
  assert.match(recall, /HifzRecallTask/);
  assert.match(recall, /Rekonstruiere die Ayah Wort fuer Wort/);
  assert.match(utils, /applyAyahRecallEvidence/);
  assert.match(utils, /applyWordRecallEvidence/);
  assert.doesNotMatch(hifz, /finishTest\((true|false)\)/);
});

test('P1 routes SRS, Hifz Ayah and Hifz word items through one prioritized Review Planner', () => {
  const planner = read('src/services/review/review-planner.ts');
  const review = read('src/features/review/ReviewWorkspace.tsx');
  const today = read('src/features/home/TodayPage.tsx');
  for (const kind of ['srs', 'hifz_ayah', 'hifz_word']) assert.ok(planner.includes(`'${kind}'`), kind);
  assert.match(planner, /buildUnifiedReviewQueue/);
  assert.match(review, /buildUnifiedReviewQueue/);
  assert.match(review, /HifzRecallTask/);
  assert.match(review, /HifzWordRecallTask/);
  assert.match(review, /objectiveEvidence: true/);
  assert.match(today, /buildUnifiedReviewQueue/);
});

test('P2 Context Rail is a single-state machine and all learning ledgers share primitives', () => {
  const context = read('src/features/study/StudyContextRail.tsx');
  const primitives = read('src/features/study/StudyLedgerPrimitives.tsx');
  const study = read('src/features/study/StudyWorkspace.tsx');
  const module = read('src/features/module/ModulePage.tsx');
  const hifz = read('src/features/hifz/HifzWorkspace.tsx');
  assert.match(context, /StudyContextKind = 'focus' \| 'evidence' \| 'error' \| 'review' \| 'prerequisite' \| 'word' \| 'source'/);
  assert.match(context, /data-context-state/);
  for (const source of [study, module, hifz]) {
    assert.match(source, /StudyLedgerShell/);
    assert.match(source, /StudyContextRail|ContextRail/);
  }
  assert.match(primitives, /StudyLedgerHeader/);
  assert.match(primitives, /StudyLedgerProgress/);
  assert.match(primitives, /StudyLedgerReview/);
});

test('NUR global navigation and journey state keep resume behavior without a second Study rail', () => {
  const nav = read('src/components/shell/NurHeader.tsx');
  const journey = read('src/shared/study-journey.ts');
  const shell = read('src/components/shell/AppShell.tsx');
  const today = read('src/features/home/TodayPage.tsx');
  assert.match(nav, /Heute/);
  assert.match(nav, /Lernen/);
  assert.match(nav, /Muṣḥaf/);
  assert.match(nav, /Training/);
  assert.match(nav, /Fortschritt/);
  assert.match(journey, /mostRecentStudyTarget/);
  assert.match(today, /journeyStateFor/);
  assert.match(shell, /NurHeader/);
  assert.doesNotMatch(shell, /StudyNavRail/);
  for (const page of ['app/bibliothek/page.tsx', 'app/quellen/page.tsx', 'app/bereich/page.tsx']) assert.match(read(page), /StudyUtilityFrame active="library"/);
});
