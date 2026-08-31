const CACHE_NAME = 'quran-audio-v1';
const META_CACHE_NAME = 'quran-audio-meta-v1';
const META_KEY = 'https://nur.local/__quran_audio_meta_v1__';
export const QURAN_AUDIO_CACHE_MAX_BYTES = 256 * 1024 * 1024;
export const QURAN_AUDIO_CACHE_MAX_FILES = 640;

interface AudioCacheMetaEntry {
  size: number;
  lastAccess: number;
}

type AudioCacheMeta = Record<string, AudioCacheMetaEntry>;

export interface QuranAudioPlayback { url: string; cached: boolean; revoke(): void }
export interface QuranAudioCacheStats { files: number; bytes: number; maxFiles: number; maxBytes: number }

let mutationQueue: Promise<void> = Promise.resolve();
let indexedSession = false;

function remoteHttp(url: string): boolean { return /^https?:\/\//i.test(url); }

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function readMeta(): Promise<AudioCacheMeta> {
  const cache = await caches.open(META_CACHE_NAME);
  const response = await cache.match(META_KEY);
  if (!response) return {};
  try {
    const value = await response.json() as AudioCacheMeta;
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

async function writeMeta(meta: AudioCacheMeta): Promise<void> {
  const cache = await caches.open(META_CACHE_NAME);
  await cache.put(META_KEY, new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
}

async function responseSize(response: Response): Promise<number> {
  const headerSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(headerSize) && headerSize > 0) return headerSize;
  try { return (await response.clone().blob()).size; } catch { return 0; }
}

async function ensureMetadataIndex(audioCache: Cache, meta: AudioCacheMeta): Promise<AudioCacheMeta> {
  if (indexedSession) return meta;
  const requests = await audioCache.keys();
  const present = new Set(requests.map((request) => request.url));
  for (const key of Object.keys(meta)) if (!present.has(key)) delete meta[key];
  for (const request of requests) {
    if (meta[request.url]) continue;
    const response = await audioCache.match(request);
    if (!response) continue;
    meta[request.url] = { size: await responseSize(response), lastAccess: Date.now() };
  }
  await writeMeta(meta);
  indexedSession = true;
  return meta;
}

async function prune(
  audioCache: Cache,
  meta: AudioCacheMeta,
  protectedUrl?: string,
  reserveBytes = 0,
  reserveFiles = 0
): Promise<void> {
  const entries = Object.entries(meta).sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  let files = entries.length + reserveFiles;
  let bytes = entries.reduce((sum, [, entry]) => sum + Math.max(0, entry.size), reserveBytes);
  for (const [url, entry] of entries) {
    if (files <= QURAN_AUDIO_CACHE_MAX_FILES && bytes <= QURAN_AUDIO_CACHE_MAX_BYTES) break;
    if (url === protectedUrl) continue;
    await audioCache.delete(url);
    delete meta[url];
    files -= 1;
    bytes -= Math.max(0, entry.size);
  }
}

async function touchCached(sourceUrl: string, response: Response): Promise<void> {
  await serialize(async () => {
    const audioCache = await caches.open(CACHE_NAME);
    const meta = await ensureMetadataIndex(audioCache, await readMeta());
    const current = meta[sourceUrl];
    meta[sourceUrl] = { size: current?.size || await responseSize(response), lastAccess: Date.now() };
    await writeMeta(meta);
  });
}

export async function cacheQuranAudioSource(sourceUrl: string): Promise<boolean> {
  if (!remoteHttp(sourceUrl) || typeof caches === 'undefined') return false;
  const audioCache = await caches.open(CACHE_NAME);
  const existing = await audioCache.match(sourceUrl);
  if (existing) {
    await touchCached(sourceUrl, existing);
    return true;
  }

  const response = await fetch(sourceUrl, { cache: 'no-store' });
  if (!response.ok) return false;
  const size = await responseSize(response);
  if (size > QURAN_AUDIO_CACHE_MAX_BYTES) return false;

  return serialize(async () => {
    const cache = await caches.open(CACHE_NAME);
    const meta = await ensureMetadataIndex(cache, await readMeta());
    const alreadyCached = await cache.match(sourceUrl);
    if (!alreadyCached) {
      await prune(cache, meta, undefined, size, 1);
      try {
        await cache.put(sourceUrl, response.clone());
      } catch {
        return false;
      }
    }
    meta[sourceUrl] = {
      size: alreadyCached ? (meta[sourceUrl]?.size || await responseSize(alreadyCached)) : size,
      lastAccess: Date.now()
    };
    await prune(cache, meta, sourceUrl);
    await writeMeta(meta);
    return true;
  });
}

export async function resolveQuranAudioPlayback(sourceUrl: string): Promise<QuranAudioPlayback> {
  if (!remoteHttp(sourceUrl) || typeof caches === 'undefined') return { url: sourceUrl, cached: false, revoke: () => undefined };
  const audioCache = await caches.open(CACHE_NAME);
  let response = await audioCache.match(sourceUrl);
  if (!response) {
    const stored = await cacheQuranAudioSource(sourceUrl);
    if (!stored) throw new Error('Quran-Audio konnte nicht geladen werden.');
    response = await audioCache.match(sourceUrl);
  } else {
    await touchCached(sourceUrl, response);
  }
  if (!response) throw new Error('Quran-Audio konnte nicht aus dem Cache gelesen werden.');
  const objectUrl = URL.createObjectURL(await response.blob());
  return { url: objectUrl, cached: true, revoke: () => URL.revokeObjectURL(objectUrl) };
}

export async function getQuranAudioCacheStats(): Promise<QuranAudioCacheStats> {
  if (typeof caches === 'undefined') return { files: 0, bytes: 0, maxFiles: QURAN_AUDIO_CACHE_MAX_FILES, maxBytes: QURAN_AUDIO_CACHE_MAX_BYTES };
  return serialize(async () => {
    const audioCache = await caches.open(CACHE_NAME);
    const meta = await ensureMetadataIndex(audioCache, await readMeta());
    await prune(audioCache, meta);
    await writeMeta(meta);
    return {
      files: Object.keys(meta).length,
      bytes: Object.values(meta).reduce((sum, entry) => sum + Math.max(0, entry.size), 0),
      maxFiles: QURAN_AUDIO_CACHE_MAX_FILES,
      maxBytes: QURAN_AUDIO_CACHE_MAX_BYTES
    };
  });
}

export async function clearQuranAudioCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await serialize(async () => {
    await Promise.all([caches.delete(CACHE_NAME), caches.delete(META_CACHE_NAME)]);
    indexedSession = false;
  });
}
