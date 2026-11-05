// Offline-first service worker: the whole app is cached, so it opens instantly with no signal.
// Bump VERSION on every release; the app shows "A new version is ready" and restarts into it.
const VERSION = 'overload-v1.1.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/preact.js', 'js/logic.js', 'js/db.js', 'js/store.js', 'js/icons.js', 'js/ui.js', 'js/charts.js',
  'js/importer.js', 'js/version.js', 'js/viewport.js', 'js/refraction.js', 'js/anatomy.js', 'js/body.js', 'js/bodydata.js',
  'js/screens/common.js', 'js/screens/summary.js', 'js/screens/workout.js', 'js/screens/active.js',
  'js/screens/machines.js', 'js/screens/progress.js', 'js/screens/history.js', 'js/screens/settings.js',
  'js/screens/onboarding.js', 'js/screens/sheets.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('overload-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then(hit => hit || fetch(req)).catch(() => caches.match('index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && (url.pathname.includes('/icons/') || url.pathname.includes('/splash/'))) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
