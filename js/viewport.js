// Keeps the Home Screen app filling the whole iPhone screen.
// iOS 26+ (WebKit bug 301108) gives a Home Screen app with a translucent status bar a viewport that ends one
// status-bar height above the bottom of the screen. The CSS rule in app.css fixes that by making the page as
// tall as the screen. This module checks where fixed layers really end and, if they still stop short, sets the
// page height in pixels as a fallback. The last measurement is shown in Settings → About.
import { isIOS, isStandalone } from './importer.js';

export const screenFit = { checked: false, screen: 0, bottom: 0, gap: 0, fallback: false };

function fullHeight() {
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const a = window.screen.width, b = window.screen.height;
  return portrait ? Math.max(a, b) : Math.min(a, b);
}

function probeBottom() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;bottom:0;left:0;width:1px;visibility:hidden;pointer-events:none';
  document.body.appendChild(el);
  const bottom = el.getBoundingClientRect().bottom;
  el.remove();
  return bottom;
}

function measure() {
  const full = fullHeight();
  const bottom = probeBottom();
  screenFit.checked = true;
  screenFit.screen = Math.round(full);
  screenFit.bottom = Math.round(bottom);
  screenFit.gap = Math.max(0, Math.round(full - bottom));
  return { full, bottom };
}

let lastOrientation = null;

function check() {
  const root = document.documentElement;
  const orientation = window.matchMedia('(orientation: portrait)').matches ? 'p' : 'l';
  if (orientation !== lastOrientation) {
    // A pixel height from the other orientation would be wrong here; start clean.
    root.style.minHeight = '';
    screenFit.fallback = false;
    lastOrientation = orientation;
  }
  const { full, bottom } = measure();
  const gap = full - bottom;
  // Only a status-bar-sized gap is this bug; anything else (keyboard, split view) is left alone.
  if (gap > 1 && gap < 140 && !screenFit.fallback) {
    root.style.minHeight = `${Math.round(full)}px`;
    screenFit.fallback = true;
    requestAnimationFrame(() => requestAnimationFrame(measure));
  }
}

export function initViewportFit() {
  if (!isIOS() || !isStandalone()) return;
  const run = () => { try { check(); } catch (e) { /* measuring is best effort */ } };
  run();
  requestAnimationFrame(run);
  setTimeout(run, 500);
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', () => setTimeout(run, 300));
  window.addEventListener('pageshow', run);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(run, 100); });
}
