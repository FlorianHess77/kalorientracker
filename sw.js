/* Service Worker: macht die App offline-fähig.
 * - App-Dateien: immer zuerst aus dem Netz (damit Updates sofort ankommen), offline aus dem Cache
 * - Modell, Bibliotheken: einmal laden, dann dauerhaft aus dem Cache
 * - Open Food Facts: immer live (keine Zwischenspeicherung hier)
 */

const VERSION = '1.5.3';
const SHELL_CACHE = `kt-shell-${VERSION}`;
const DATA_CACHE = 'kt-data-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png',
  'js/main.js',
  'js/db.js',
  'js/draft.js',
  'js/install.js',
  'js/ui.js',
  'js/off.js',
  'js/photo-flow.js',
  'js/lib/calc.js',
  'js/lib/charts.js',
  'js/lib/dates.js',
  'js/lib/export.js',
  'js/lib/image.js',
  'js/lib/nutrition.js',
  'js/lib/stats.js',
  'js/data/clip-vocab.js',
  'js/data/dish-estimates.js',
  'js/data/food-classes.js',
  'js/data/food-index.js',
  'js/data/generic-foods.js',
  'js/recognition/clip.js',
  'js/recognition/combine.js',
  'js/recognition/memory.js',
  'js/recognition/postprocess.js',
  'js/recognition/recognizer.js',
  'js/views/barcode.js',
  'js/views/camera.js',
  'js/views/capture.js',
  'js/views/food.js',
  'js/views/manual.js',
  'js/views/meal.js',
  'js/views/onboarding.js',
  'js/views/progress.js',
  'js/views/review.js',
  'js/views/search.js',
  'js/views/settings.js',
  'js/views/today.js',
];

const LONG_LIVED = [
  /\/models\//,
  /\/vendor\//,
  /^https:\/\/cdn\.jsdelivr\.net\//,
  /^https:\/\/storage\.googleapis\.com\/tfhub-lite-models\//,
  /^https:\/\/www\.gstatic\.com\/aihub\//,
];

self.addEventListener('install', (event) => {
  // cache: 'reload' umgeht den HTTP-Cache des Browsers, sonst landen alte Dateien im neuen Cache
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL_FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kt-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname.endsWith('openfoodfacts.org')) return; // immer live

  if (LONG_LIVED.some((re) => re.test(request.url))) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-cache' }).catch(() => caches.match('index.html')));
    return;
  }
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? Response.error();
  }
}
