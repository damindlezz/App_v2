import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');

test('unified reference shell keeps every functional learning area reachable', () => {
  const header = read('src/components/shell/NurHeader.tsx');
  for (const route of ['ROUTES.today','ROUTES.learn','ROUTES.quran','ROUTES.practice','ROUTES.progress','ROUTES.hifz','ROUTES.knowledge','ROUTES.library','ROUTES.sources','ROUTES.review','ROUTES.settings']) {
    assert.ok(header.includes(route), route);
  }
  for (const token of ['ref-topbar','ref-learn-menu','ref-mobile-nav','hijriDate']) assert.ok(header.includes(token), token);
});

test('unified dashboard extras are functional local tools rather than decorative mocks', () => {
  const extras = read('src/features/home/ReferenceDashboardExtras.tsx');
  assert.match(extras, /localStorage\.setItem\(PRAYER_STORAGE_KEY/);
  assert.match(extras, /input type="time"/);
  assert.match(extras, /berechnet bewusst keine religiösen Zeiten/);
  assert.match(extras, /setCount\(value => value \+ 1\)/);
  assert.match(extras, /localStorage\.setItem\(TASBIH_STORAGE_KEY/);
  for (const route of ['ROUTES.quran','ROUTES.learn','ROUTES.hifz','ROUTES.knowledge']) assert.ok(extras.includes(route), route);
});

test('unified training exposes reference-inspired starters while retaining the complete registry', () => {
  const hub = read('src/features/practice/PracticeHub.tsx');
  for (const variant of ['vocabulary_listening','grammar_cloze','sentence_builder','vocabulary_matching','speaking_shadowing','writing_trace','quran_tajweed','reading_harakat']) {
    assert.ok(hub.includes(`variant: '${variant}'`), variant);
  }
  assert.match(hub, /EXERCISE_DEFINITIONS\.filter/);
  assert.match(hub, /Interaktiver Mix/);
  assert.match(hub, /ROUTES\.review/);
});

test('reference design layer is the final cascade and respects reduced motion', () => {
  const globals = read('app/globals.css');
  const redesign = read('src/styles/reference-redesign.css');
  assert.equal(globals.trim().split('\n').at(-1), "@import '../src/styles/reference-redesign.css';");
  for (const token of ['.ref-topbar','.ref-learn-menu','.ref-method-grid','.ref-prayer-grid','.ref-tasbih-ring','.ref-footer']) assert.ok(redesign.includes(token), token);
  assert.match(redesign, /prefers-reduced-motion:\s*reduce/);
});

test('unified shell integrates footer without covering focused learning workspaces', () => {
  const shell = read('src/components/shell/AppShell.tsx');
  const footer = read('src/components/shell/NurFooter.tsx');
  assert.match(shell, /<NurFooter\s*\/>/);
  for (const path of ['/quran','/hifz','/modul','/ueben','/wiederholen']) assert.ok(footer.includes(`'${path}'`), path);
  for (const route of ['ROUTES.learn','ROUTES.quran','ROUTES.hifz','ROUTES.knowledge','ROUTES.practice','ROUTES.review','ROUTES.library','ROUTES.sources']) assert.ok(footer.includes(route), route);
});

test('reference dashboard is mounted into the real Today runtime', () => {
  const today = read('src/features/home/TodayPage.tsx');
  assert.match(today, /ReferenceDashboardExtras/);
  assert.match(today, /<ReferenceDashboardExtras\s*\/>/);
});
