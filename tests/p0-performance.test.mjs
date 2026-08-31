import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('P0 search and library use lightweight catalogs instead of multi-megabyte evidence layers', () => {
  const search = read('src/components/search/GlobalSearch.tsx');
  const library = read('src/features/library/LibraryPage.tsx');
  assert.match(search, /ensureSourceCatalog/);
  assert.match(search, /loadIslamicModuleSearchCatalog/);
  assert.doesNotMatch(search, /ensureSources/);
  assert.doesNotMatch(search, /ensureIslamicTrack/);
  assert.match(library, /ensureSourceCatalog/);
  assert.doesNotMatch(library, /ensureSources/);
  assert.ok(existsSync('public/content/islamic-search-index.json'));
});

test('P0 Quran lexical loader caps requested surahs before starting shard fetches', () => {
  const service = read('src/services/content/content-service.ts');
  const cap = service.indexOf('.slice(0, QURAN_LEXICAL_CACHE_LIMIT)');
  const fetches = service.indexOf('Promise.all(missing.map((surah) => cachedQuranSurahShard');
  assert.ok(cap >= 0 && fetches > cap);
});

test('P0 browser storage separates profile core from large data segments', () => {
  const storage = read('src/services/storage/indexeddb-storage.ts');
  assert.match(storage, /const DATABASE_VERSION = 6/);
  assert.match(storage, /const HISTORY_STORE = 'history-events'/);
  assert.match(storage, /const EXERCISE_STORE = 'exercise-events'/);
  assert.match(storage, /const SEGMENT_STORE = 'profile-segments'/);
  assert.match(storage, /segmentStore\.put/);
  assert.doesNotMatch(storage, /getAllSegments/);
});

test('P0 runtime no longer ships the unused content relation graph', () => {
  const manifest = JSON.parse(read('public/content/manifest.json'));
  assert.ok(!manifest.datasets.includes('content-relations.json'));
  assert.equal(existsSync('public/content/content-relations.json'), false);
  const builder = read('scripts/build-content.py');
  assert.doesNotMatch(builder, /write_json\(OUTPUT\/'content-relations\.json'/);
});

test('P0 SQLite learning commit batches touched progress and review reads', () => {
  const storage = read('src/services/storage/tauri-sqlite-storage.ts');
  assert.match(storage, /const uniqueKeys = \[\.\.\.new Map\(input\.contentUpdates/);
  assert.match(storage, /const uniqueReviews = \[\.\.\.new Map\(input\.reviews/);
  assert.doesNotMatch(storage, /for \(const reviewInput of input\.reviews \?\? \[\]\)/);
});

test('P0 lazy content hydration is serialized and uses the latest content snapshot', () => {
  const provider = read('src/state/AppProvider.tsx');
  assert.match(provider, /const contentRef = useRef<LearningContent \| null>/);
  assert.match(provider, /const contentHydrationQueue = useRef<Promise<void>>/);
  assert.match(provider, /const current = contentRef\.current/);
  assert.match(provider, /contentHydrationQueue\.current\.then\(execute, execute\)/);
  assert.match(provider, /\[queueContentHydration\]/);
});

test('P0 SQLite markings reset preserves separately stored Hifz progress', () => {
  const storage = read('src/services/storage/tauri-sqlite-storage.ts');
  assert.match(storage, /const current = await this\.hydrateHifz\(profileId, parsed\)/);
  assert.match(storage, /this\.progressStatements\(profileId, next, now, current\)/);
});

test('P0 IndexedDB commit skips untouched large event segments', () => {
  const storage = read('src/services/storage/indexeddb-storage.ts');
  assert.doesNotMatch(storage, /getSegment\(profileId, 'exerciseResults'\)/);
  assert.doesNotMatch(storage, /getSegment\(profileId, 'history'\)/);
  assert.match(storage, /exerciseResults: artifacts\.exerciseResults\.length \? artifacts\.exerciseResults : undefined/);
  assert.match(storage, /history: historyEntry \? \[historyEntry\] : undefined/);
});

test('P0 offline Quran audio cache uses bounded concurrency', () => {
  const service = read('src/services/storage/offline-content-service.ts');
  assert.match(service, /const AUDIO_CACHE_CONCURRENCY = 4/);
  assert.match(service, /Promise\.all\(Array\.from\(\{ length: workers \}, \(\) => worker\(\)\)\)/);
});

test('P0 service worker prevents mixed releases and preserves the Quran audio cache', () => {
  const worker = read('public/sw.js');
  assert.match(worker, /const RUNTIME_CACHE = 'nur-runtime-v1'/);
  assert.match(worker, /immutableNextAsset \? cacheFirst\(event\.request\) : networkFirst\(event\.request\)/);
  assert.match(worker, /RUNTIME_CACHE_PREFIXES\.some\(prefix => key\.startsWith\(prefix\)\)/);
  assert.doesNotMatch(worker, /keys\.filter\(key => key !== CACHE\)/);
  assert.doesNotMatch(worker, /quran-audio-v1/);
});

test('P0 global search validates Quran references and avoids redundant title normalization', () => {
  const search = read('src/components/search/GlobalSearch.tsx');
  assert.match(search, /const\s+direct\s*=\s*validReference\(query\.trim\(\)\)/);
  assert.match(search, /index\.filter\(item => item\.text\.includes\(normalizedQuery\)\)/);
  assert.doesNotMatch(search, /norm\(x\.title\)/);
});
