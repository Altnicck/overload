import { setUI, toast, flushActive } from './store.js';

export const APP_VERSION = '1.0.7';

let reg = null;

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then(r => {
    reg = r;
    const watch = sw => {
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) setUI({ update: true });
      });
    };
    if (r.waiting && navigator.serviceWorker.controller) setUI({ update: true });
    watch(r.installing);
    r.addEventListener('updatefound', () => watch(r.installing));
    // Check for a new version whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update().catch(() => {}); });
  }).catch(err => console.warn('Service worker failed', err));
  // Reload only when the person tapped "Restart" for an update. The very first install also fires
  // controllerchange (clients.claim), and reloading then would wipe a half-finished onboarding.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || reloading) return;
    reloading = true;
    location.reload();
  });
}
let updateRequested = false;
let reloading = false;

export async function applyUpdate() {
  await flushActive();
  updateRequested = true;
  if (reg && reg.waiting) reg.waiting.postMessage('skipWaiting');
  else location.reload();
}

export async function checkForUpdate() {
  if (!reg) { toast('Updates work once the app is installed'); return; }
  try {
    await reg.update();
    if (reg.waiting || reg.installing) { setUI({ update: true }); toast('Update found'); }
    else toast(`You are on the latest version (${APP_VERSION})`);
  } catch (e) { toast('Could not reach the server. Try again with signal.'); }
}
