const RUNTIME_CACHE = 'nur-runtime-v1';
const RUNTIME_CACHE_PREFIXES = ['nur-runtime-', 'fusha-immersive-v'];
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg'];

async function putRuntime(request, response) {
  if (!response || !response.ok) return response;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response.clone());
  return response;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return putRuntime(request, await fetch(request));
}

async function networkFirst(request) {
  try {
    return await putRuntime(request, await fetch(request));
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(RUNTIME_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys
      .filter(key => key !== RUNTIME_CACHE && RUNTIME_CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Next static chunks are content-hashed and safe to cache-first. Stable URLs
  // (HTML, /content/*.json, manifest, icons) must revalidate to avoid mixed releases.
  const immutableNextAsset = url.pathname.startsWith('/_next/static/');
  event.respondWith(immutableNextAsset ? cacheFirst(event.request) : networkFirst(event.request));
});
