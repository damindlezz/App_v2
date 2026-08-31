import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('UI shell lazy-loads optional search while keeping offline-critical onboarding eager', () => {
  const shell = read('src/components/shell/AppShell.tsx');
  assert.match(shell, /dynamic\(/);
  assert.match(shell, /import\('\.\.\/search\/GlobalSearch'\)/);
  assert.match(shell, /import \{ OnboardingFlow \} from '\.\.\/\.\.\/features\/onboarding\/OnboardingFlow';/);
  assert.doesNotMatch(shell, /dynamic\([\s\S]*features\/onboarding\/OnboardingFlow/);
  assert.match(shell, /\{search && <GlobalSearch/);
});

test('UI global chrome does not subscribe to the complete progress or learning payload', () => {
  const shell = read('src/components/shell/AppShell.tsx');
  const header = read('src/components/shell/NurHeader.tsx');
  const arabic = read('src/components/ui/ArabicText.tsx');
  assert.doesNotMatch(shell, /useAppProgress/);
  assert.match(shell, /useAppPreferences/);
  assert.doesNotMatch(header, /useAppProgress/);
  assert.match(header, /useAppLearningSummary/);
  assert.doesNotMatch(arabic, /useAppProgress/);
  assert.match(arabic, /useAppPreferences/);
  const runner = read('src/features/practice/ExerciseRunner.tsx');
  assert.match(runner, /function AudioPrompt[\s\S]*useAppPreferences/);
  assert.match(runner, /function SpeakingTask[\s\S]*useAppPreferences/);
});

test('UI Quran audio ticks are isolated from the full reader and long verse canvas', () => {
  const reader = read('src/features/quran/QuranReader.tsx');
  const player = read('src/features/quran/QuranAudioPlayer.tsx');
  const canvas = read('src/features/quran/QuranStudyCanvas.tsx');
  assert.match(reader, /<QuranAudioPlayer/);
  assert.doesNotMatch(reader, /timeupdate/);
  assert.match(player, /timeupdate/);
  assert.match(canvas, /memo\(function QuranStudyCanvas/);
  assert.match(reader, /const verseReferences = useMemo/);
  assert.match(reader, /const canvasReferences = useMemo/);
});

test('UI library search normalizes searchable text once and defers keystroke work', () => {
  const library = read('src/features/library/LibraryPage.tsx');
  assert.match(library, /useDeferredValue\(query\)/);
  assert.match(library, /searchText:/);
  assert.match(library, /item\.searchText\.includes\(needle\)/);
  assert.doesNotMatch(library, /`\$\{item\.title\} \$\{item\.subtitle\}.*toLocaleLowerCase\('de'\)\.includes\(needle\)/s);
});

test('UI theme catalog has one canonical definition', () => {
  const header = read('src/components/shell/NurHeader.tsx');
  const settings = read('src/features/settings/SettingsPage.tsx');
  assert.match(header, /THEME_OPTIONS/);
  assert.match(settings, /THEME_OPTIONS/);
  assert.doesNotMatch(header, /const THEMES/);
  assert.doesNotMatch(settings, /const THEME_CHOICES/);
});

test('UI long collections use browser render containment', () => {
  const css = read('src/styles/performance.css');
  for (const selector of ['.library-list>button', '.quran-study-verse', '.study-ledger-module']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /content-visibility:auto/);
  assert.match(css, /contain-intrinsic-size/);
});
