// Bump this string on every deploy that changes the app shell. Changing it
// makes `activate` drop every older cache.
const CACHE_NAME = "fluence-cache-v4";

// Only truly static, rarely-changing files are precached. The HTML and the
// JS/CSS bundles are deliberately NOT in here: caching those with a
// stale-while-revalidate strategy is what made a refresh keep showing the old
// build (and, with it, stale data) until the second reload.
const PRECACHE_URLS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/fluence_logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// Vite emits content-hashed filenames under /assets/, so those are immutable
// and safe to serve from cache forever.
const isImmutableAsset = (url) =>
  url.pathname.startsWith("/assets/") || /\.(png|jpe?g|svg|webp|woff2?)$/.test(url.pathname);

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // A navigation with nothing cached: fall back to the shell if we have one.
    if (request.mode === "navigate") {
      const shell = await cache.match("/index.html");
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200 && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Let everything cross-origin through untouched. Most importantly the
  // Supabase REST and realtime calls: caching those would serve stale scores.
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith("http")) return;

  event.respondWith(isImmutableAsset(url) ? cacheFirst(request) : networkFirst(request));
});
