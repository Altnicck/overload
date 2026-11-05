import { setUI, toast, flushActive, flushSnapshot, getState } from './store.js';
import { close as closeDatabase } from './db.js';

export const APP_VERSION = '1.1.1';

let reg = null;
let updateReady = false;     // a newer version is in charge; this page is still running the old code
let updateRequested = false;
let reloading = false;
const openedAt = Date.now();
// Pages that started without a service worker are on their very first install, not an update. Reloading them
// would wipe a half-finished onboarding.
const hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);

function reloadNow() {
  if (reloading) return;
  reloading = true;
  flushSnapshot();
  closeDatabase();   // let the new page open its own database connection cleanly
  location.reload();
}

// Reloading is safe while starting up, or with no workout running while the app has just opened or is out of
// sight. Otherwise the "A new version is ready" toast lets the person choose the moment.
function safeToReload() {
  const s = getState();
  if (!s.ready) return true;
  if (s.active) return false;
  return document.visibilityState === 'hidden' || Date.now() - openedAt < 10000;
}

function onUpdateActive() {
  if (!hadController) return;
  updateReady = true;
  if (updateRequested || safeToReload()) reloadNow();
  else setUI({ update: true });
}

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // A new version announces itself once it is in charge. Answer, so it knows this page handles the switch.
  navigator.serviceWorker.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'overload-updated') return;
    if (e.ports && e.ports[0]) e.ports[0].postMessage({ ok: true });
    onUpdateActive();
  });
  try { navigator.serviceWorker.startMessages(); } catch (e) { /* older engines start them on load */ }
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then(r => {
    reg = r;
    const watch = sw => {
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller && !reloading) setUI({ update: true });
      });
    };
    if (r.waiting && navigator.serviceWorker.controller) setUI({ update: true });
    watch(r.installing);
    r.addEventListener('updatefound', () => watch(r.installing));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (updateReady && safeToReload()) { reloadNow(); return; }
        r.update().catch(() => {});
      } else if (updateReady && !getState().active) {
        reloadNow();   // switch to the new version while the app is out of sight
      }
    });
  }).catch(err => console.warn('Service worker failed', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested) reloadNow();
  });
}

export async function applyUpdate() {
  updateRequested = true;
  flushSnapshot();
  // Save the workout, but never let a slow database hold up the update.
  await Promise.race([flushActive().catch(() => {}), new Promise(r => setTimeout(r, 800))]);
  if (reg && reg.waiting) {
    reg.waiting.postMessage('skipWaiting');
    setTimeout(reloadNow, 2500);   // in case the switch never announces itself
  } else reloadNow();
}

export async function checkForUpdate() {
  if (!reg) { toast('Updates work once the app is installed'); return; }
  try {
    await reg.update();
    if (reg.waiting || reg.installing || updateReady) { setUI({ update: true }); toast('Update found'); }
    else toast(`You are on the latest version (${APP_VERSION})`);
  } catch (e) { toast('Could not reach the server. Try again with signal.'); }
}
