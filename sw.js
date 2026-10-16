/* Service Worker: macht die App offline-fähig.
 * - App-Dateien: sofort aus dem Cache, im Hintergrund aktualisiert
 * - Modell, Bibliotheken: einmal laden, dann dauerhaft aus dem Cache
 * - Open Food Facts: immer live (keine Zwischenspeicherung hier)
 */

const VERSION = '1.0.1';
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
  'js/ui.js',
  'js/off.js',
  'js/lib/calc.js',
  'js/lib/charts.js',
  'js/lib/dates.js',
  'js/lib/export.js',
  'js/lib/image.js',
  'js/lib/nutrition.js',
  'js/lib/stats.js',
  'js/data/food-classes.js',
  'js/data/generic-foods.js',
  'js/recognition/postprocess.js',
  'js/recognition/recognizer.js',
  'js/views/barcode.js',
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
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
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
    event.respondWith(fetch(request).catch(() => caches.match('index.html')));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => hit ?? Response.error());
  return hit ?? network;
}
