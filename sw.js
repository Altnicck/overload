// Offline-first service worker: the whole app is cached, so it opens instantly with no signal.
// Bump VERSION on every release. A new version takes over as soon as it is downloaded; the open page then
// switches to it at a safe moment (during start-up, in the background, or when the person taps Restart).
const VERSION = 'overload-v1.1.2';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/preact.js', 'js/logic.js', 'js/db.js', 'js/store.js', 'js/snapshot.js', 'js/icons.js', 'js/ui.js', 'js/charts.js',
  'js/importer.js', 'js/version.js', 'js/viewport.js', 'js/refraction.js', 'js/anatomy.js', 'js/body.js', 'js/bodydata.js',
  'js/screens/common.js', 'js/screens/summary.js', 'js/screens/workout.js', 'js/screens/active.js',
  'js/screens/machines.js', 'js/screens/progress.js', 'js/screens/history.js', 'js/screens/settings.js',
  'js/screens/onboarding.js', 'js/screens/sheets.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Tell an open page that the new version is in charge. Pages from 1.1.1 on answer and switch when it is safe.
// Older pages do not answer, and may be stuck on the loading screen, so they are reloaded into the new version.
function announce(client) {
  return new Promise(resolve => {
    let done = false;
    const finish = answered => {
      if (done) return;
      done = true;
      if (!answered && client.navigate) client.navigate(client.url).catch(() => {});   // not awaited: it needs this worker active
      resolve();
    };
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => finish(true);
      client.postMessage({ type: 'overload-updated', version: VERSION }, [ch.port2]);
      setTimeout(() => finish(false), 1500);
    } catch (e) { finish(false); }
  });
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter(k => k.startsWith('overload-') && k !== VERSION);
    await Promise.all(old.map(k => caches.delete(k)));
    await self.clients.claim();
    if (!old.length) return;   // first install, not an update
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(pages.map(announce));
  })());
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
      caches.open(VERSION).then(c => c.match('index.html')).then(hit => hit || caches.match('index.html')).then(hit => hit || fetch(req))
        .catch(() => caches.match('index.html'))
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
