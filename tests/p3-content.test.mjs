import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));

test('P3 gives every Fusha module listening and speaking evidence', () => {
  const chapters = readJson('public/content/learning-path.json');
  const units = chapters.flatMap((chapter) => chapter.units ?? []);
  assert.equal(units.length, 76);
  const listening = new Set(['vocabulary_listening','grammar_listening','reading_listening','writing_dictation','alphabet_sound']);
  for (const unit of units) {
    const variants = new Set((unit.phases ?? []).flatMap((phase) => phase.activities ?? []).map((activity) => activity.exerciseVariant));
    assert.ok([...variants].some((variant) => listening.has(variant)), `${unit.id}: listening fehlt`);
    assert.ok(variants.has('speaking_shadowing'), `${unit.id}: speaking fehlt`);
  }
});

test('P3 records automated editorial checks without fabricating expert approval', () => {
  const files = ['public/content/learning-path.json','public/content/quran-path.json', ...fs.readdirSync('public/content/islamic-paths').filter((name) => name.endsWith('.json')).map((name) => `public/content/islamic-paths/${name}`)];
  const units = files.flatMap((file) => readJson(file)).flatMap((chapter) => chapter.units ?? []);
  assert.equal(units.length, 211);
  for (const unit of units) {
    assert.equal(unit.quality?.reviewStage, 'editorial_checked');
    assert.equal(unit.quality?.automatedEditorialReview?.passed, true);
    assert.equal(unit.quality?.expertReviewRequired, true);
  }
  const evidenceFiles = fs.readdirSync('public/content/source-evidence').filter((name) => name.endsWith('.json'));
  const citations = new Map();
  for (const file of evidenceFiles) for (const item of readJson(`public/content/source-evidence/${file}`).citations ?? []) citations.set(item.id, item);
  assert.equal([...citations.values()].filter((item) => item.exactLocatorVerified === true).length, 0);
});

test('P3 morphology import is explicit and NUR brand routes to Heute', () => {
  const importer = fs.readFileSync('scripts/import-qac-morphology.py', 'utf8');
  const nav = fs.readFileSync('src/components/shell/NurHeader.tsx', 'utf8');
  const css = fs.readFileSync('src/styles/nur4.css', 'utf8');
  assert.match(importer, /manual-official-source-only/);
  assert.match(nav, /href=\{ROUTES\.today\}[^>]*className="[^"]*nur-brand[^"]*"/);
  assert.match(css, /\.nur-brand\{/);
});
