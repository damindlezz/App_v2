import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');

test('review session uses a stable queue snapshot and can reach the end',()=>{
  const source=read('src/features/review/ReviewWorkspace.tsx');
  assert.match(source,/const \[queue\] = useState<UnifiedReviewItem\[]>\(\(\) => structuredClone\(due\)\)/);
  assert.match(source,/structuredClone\(due\)/);
  assert.match(source,/setIndex\(\(value\) => value \+ 1\)/);
  assert.doesNotMatch(source,/Math\.min\(value\+1,Math\.max\(0,queue\.length-1\)\)/);
});

test('Quran audio resets on reference changes and obeys audio settings',()=>{
  const source=read('src/features/quran/QuranAudioPlayer.tsx');
  assert.match(source,/stopSpeech\(\)/);
  assert.match(source,/useEffect\(\(\) => \{[\s\S]*stopPlayback\(\);[\s\S]*\}, \[reference, stopPlayback\]\)/);
  assert.match(source,/!ayahText \|\| !preferences\.audioEnabled/);
  assert.match(source,/disabled=\{!preferences\.audioEnabled\}/);
});

test('visible preferences are applied to the runtime instead of only being stored',()=>{
  const provider=read('src/state/AppProvider.tsx');
  for(const token of ['dataset.fontSize','dataset.arabicSize','dataset.arabicFont','dataset.transliteration','dataset.harakat','dataset.learningHelp']) assert.ok(provider.includes(token),token);
  const settings=read('src/features/settings/SettingsPage.tsx');
  for(const token of ['App-Schriftgroesse','Harakat je Bereich','Lernhilfe','Audio aktiviert','Transliteration']) assert.ok(settings.includes(token),token);
  const arabic=read('src/components/ui/ArabicText.tsx');
  assert.match(arabic,/stripArabicMarks/);
  assert.match(arabic,/moduleHarakat/);
  assert.match(arabic,/preferences\.transliteration/);
  const module=read('src/features/module/ModulePage.tsx');
  assert.match(module,/learning-help-detail/);
  assert.match(module,/ArabicText/);
});

test('NUR 4 keeps one global navigation and removes the legacy sidebar',()=>{
  const shell=read('src/components/shell/AppShell.tsx');
  const header=read('src/components/shell/NurHeader.tsx');
  assert.match(shell,/NurHeader/);
  assert.match(shell,/app-shell--nur/);
  assert.doesNotMatch(shell,/AppSidebar|MobileNav|StudyNavRail/);
  assert.match(header,/nur-main-nav/);
  assert.match(header,/nur-mobile-nav/);
});

test('production QA has route asset and platform build gates',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'0.25.4');
  assert.equal(pkg.scripts['verify:platforms'],'node scripts/verify-platform-config.mjs');
  assert.equal(pkg.scripts['qa:release'],'npm run build && npm run verify:platforms');
  const exportCheck=read('scripts/verify-next-export.mjs');
  for(const route of ["'lernen'","'quran'","'hifz'","'wissen'","'ueben'","'modul'"]) assert.ok(exportCheck.includes(route),route);
  assert.match(exportCheck,/referenziert kein Next-JavaScript/);
  assert.match(exportCheck,/referenziert kein Next-CSS/);
  assert.ok(existsSync('scripts/verify-platform-config.mjs'));
});

test('trace and speaking use measured scoring rather than unconditional success',()=>{
  const runner=read('src/features/practice/ExerciseRunner.tsx');
  assert.match(runner,/scoreTrace\(points\.current/);
  assert.match(runner,/score >= 70/);
  assert.match(runner,/speakingScore\(result\.transcript/);
  assert.match(runner,/finalScore >= 75/);
});
