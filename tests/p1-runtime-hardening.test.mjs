import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

test('P1 Quran core is metadata-only and Surah payloads own reader records', () => {
  const corePath = 'public/content/quran-reader-core.json';
  const core = json(corePath);
  assert.ok(fs.statSync(corePath).size < 100_000);
  for (const key of ['ayahs','translations','tafsir','words','tajweed','mushafLines','audio']) assert.deepEqual(core[key], []);
  const shard = json('public/content/quran-reader/surah/002.json');
  assert.ok(shard.ayahs.length > 200);
  assert.ok(shard.words.length > 1000);
});

test('P1 source evidence is sharded and selected-source hydration is used by SourcesPage', () => {
  assert.equal(fs.existsSync('public/content/citations.json'), false);
  assert.equal(fs.existsSync('public/content/claims.json'), false);
  assert.equal(fs.existsSync('public/content/claim-source-links.json'), false);
  const shards = fs.readdirSync('public/content/source-evidence').filter((name) => name.endsWith('.json'));
  assert.ok(shards.length >= 30);
  const page = read('src/features/library/SourcesPage.tsx');
  assert.match(page, /ensureSources\(selected\.id\)/);
});

test('P1 browser storage uses indexed event stores instead of growing history/result arrays', () => {
  const storage = read('src/services/storage/indexeddb-storage.ts');
  assert.match(storage, /const DATABASE_VERSION = 6/);
  assert.match(storage, /createIndex\(HISTORY_INDEX, \['profileId', 'occurredAt'\]\)/);
  assert.match(storage, /createIndex\(EXERCISE_INDEX, \['profileId', 'answeredAt'\]\)/);
  assert.match(storage, /readEvents<LearningHistoryEntry>/);
  assert.match(storage, /readEvents<ExerciseResultEntry>/);
  assert.doesNotMatch(storage, /getSegment\(profileId, 'history'\)/);
  assert.doesNotMatch(storage, /getSegment\(profileId, 'exerciseResults'\)/);
});

test('P1 SQLite Hifz persistence uses deltas for normal saves and commits', () => {
  const storage = read('src/services/storage/tauri-sqlite-storage.ts');
  assert.match(storage, /private hifzDeltaStatements/);
  assert.match(storage, /ON CONFLICT\(profile_id, reference\) DO UPDATE SET/);
  assert.match(storage, /ON CONFLICT\(profile_id, reference, word_index\) DO UPDATE SET/);
  assert.match(storage, /previousProgress \? this\.hifzDeltaStatements/);
  assert.match(storage, /saveProgress\(profileId: string, progress: ProgressState, previousProgress\?: ProgressState\)/);
});

test('P1 progress updates clone only requested mutable branches', () => {
  const provider = read('src/state/AppProvider.tsx');
  const copy = read('src/state/progress-copy.ts');
  assert.doesNotMatch(provider, /structuredClone\(progressRef\.current\)/);
  assert.match(provider, /cloneProgressForUpdate\(progressRef\.current, branches\)/);
  assert.match(copy, /requested\.has\('preferences'\)/);
  assert.match(copy, /requested\.has\('quranHifzWordEntries'\)/);
});

test('P1 app state is split into focused contexts and internal UI no longer uses useApp', () => {
  const provider = read('src/state/AppProvider.tsx');
  for (const name of ['AppRuntimeContext','AppContentContext','AppProfileContext','AppProgressContext','AppLearningContext','AppAnnotationContext']) assert.match(provider, new RegExp(`const ${name} = createContext`));
  for (const path of fs.readdirSync('src/components', { recursive: true }).filter((name) => name.endsWith('.tsx')).map((name) => `src/components/${name}`)) {
    assert.doesNotMatch(read(path), /\buseApp\(\)/, path);
  }
  for (const path of fs.readdirSync('src/features', { recursive: true }).filter((name) => name.endsWith('.tsx')).map((name) => `src/features/${name}`)) {
    assert.doesNotMatch(read(path), /\buseApp\(\)/, path);
  }
});

test('P1 Quran audio cache has a bounded LRU budget', () => {
  const cache = read('src/services/audio/quran-audio-cache.ts');
  assert.match(cache, /QURAN_AUDIO_CACHE_MAX_BYTES = 256 \* 1024 \* 1024/);
  assert.match(cache, /QURAN_AUDIO_CACHE_MAX_FILES = 640/);
  assert.match(cache, /lastAccess/);
  assert.match(cache, /async function prune/);
  assert.match(cache, /await audioCache\.delete\(url\)/);
});

test('P1 event retention skips the retained window instead of scanning every retained event', () => {
  const storage = read('src/services/storage/indexeddb-storage.ts');
  assert.match(storage, /cursor\.advance\(retention\)/);
  assert.doesNotMatch(storage, /seen \+= 1/);
});

test('P1 IndexedDB reset replaces event streams only after the clear cursor is exhausted', () => {
  const storage = read('src/services/storage/indexeddb-storage.ts');
  assert.match(storage, /private replaceEventsInTransaction/);
  assert.match(storage, /if \(cursor\) \{[\s\S]*cursor\.continue\(\);[\s\S]*return;[\s\S]*\}[\s\S]*for \(const entry of entries\) store\.put\(entry\)/);
  assert.match(storage, /if \(events\.clearHistory\) \{[\s\S]*this\.replaceEventsInTransaction/);
});

test('P1 audio cache reserves budget before writes and rejects oversized files', () => {
  const cache = read('src/services/audio/quran-audio-cache.ts');
  assert.match(cache, /if \(size > QURAN_AUDIO_CACHE_MAX_BYTES\) return false/);
  assert.match(cache, /await prune\(cache, meta, undefined, size, 1\)/);
  assert.match(cache, /try \{[\s\S]*await cache\.put\(sourceUrl, response\.clone\(\)\);[\s\S]*\} catch \{[\s\S]*return false/);
});

test('P1 TSX maintainability guard prevents reintroducing giant single-line components', () => {
  const roots = ['src/components', 'src/features'];
  for (const root of roots) {
    const files = fs.readdirSync(root, { recursive: true })
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => `${root}/${name}`);
    for (const path of files) {
      const maxLine = Math.max(...read(path).split(/\r?\n/).map((line) => line.length));
      assert.ok(maxLine <= 900, `${path} has a ${maxLine}-character line`);
    }
  }
});
