// Liquid Glass refraction for the floating glass bars (tab bar and the workout-in-progress pill).
//
// iOS bends whatever is behind its glass: near the rim the content is pulled in from beyond the edge, mirrored and
// squeezed, and the middle is slightly magnified. Safari gives web pages no way to bend the backdrop
// (backdrop-filter: url(#svg) is Chromium-only), so this draws its own copy of the screen behind each bar and bends
// that copy with transforms:
//
//   host (fixed under the bar, clipped to its pill shape)
//     band (masks: centre, top rim, bottom rim, left cap, right cap)
//       warp (static bend: magnify, or mirror + squeeze about an edge)
//         scroll (follows the screen's scroll position)
//           clone (a copy of the screen's content, ids stripped, inert)
//
// The scroll layer is driven by a CSS scroll timeline on the screen's scroller, which Safari 26.4+ runs on the
// scrolling thread, so the copy never lags behind a fling. Older engines fall back to a scroll listener.
// Each bar's own backdrop-filter then tints and softens the bent copy.
import { subscribe, getState } from './store.js';

const TARGETS = [
  { key: 'tabbar', selector: '.tabbar', bands: ['center', 'top', 'bottom', 'left', 'right'] },
  { key: 'accessory', selector: '.accessory', bands: ['center', 'top', 'bottom'] },
];
const H_SCROLLERS = '.hscroll, .chips-scroll';
let timelineOK = false;
let current = null;           // state for the screen currently behind the bars
const hostsByScroller = new WeakMap();
let scheduled = false;
let paused = false;

export const refraction = { enabled: false, mode: 'off' };

function supportsTimeline() {
  try { return !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: --rf')); } catch (e) { return false; }
}

function wantsRefraction() {
  try {
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return false;
  } catch (e) { /* older engines */ }
  return true;
}

export function initRefraction() {
  if (!wantsRefraction()) return;
  timelineOK = supportsTimeline();
  refraction.enabled = true;
  refraction.mode = timelineOK ? 'scroll-timeline' : 'scroll-listener';
  document.documentElement.classList.add('has-refraction');
  if (timelineOK) document.documentElement.classList.add('rf-timeline');
  subscribe(() => schedule());
  window.addEventListener('resize', () => schedule(true));
  // Layer slide animations finishing change which screen is on top.
  document.addEventListener('animationend', e => { if (e.target && e.target.classList && e.target.classList.contains('layer')) schedule(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(true); });
  schedule();
}

function schedule(force) {
  if (force && current) current.forceGeometry = true;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => requestAnimationFrame(() => { scheduled = false; update(); }));
}

function topScroller() {
  const view = document.querySelector('.tabview.is-active');
  if (!view) return null;
  const layers = view.querySelectorAll(':scope > .layer:not(.layer-leave)');
  const top = layers[layers.length - 1];
  return top ? top.querySelector(':scope > .screen > .scroller') : null;
}

function update() {
  const st = getState();
  // Nothing to bend while the workout cover or a sheet hides the bars; catch up when they show again.
  paused = !document.querySelector('.tabbar') || (st.ui.workoutOpen && !!st.active) || st.ui.sheets.length > 0;
  if (paused) { if (current) current.dirty = true; return; }
  const scroller = topScroller();
  if (!scroller) return;
  if (!current || current.scroller !== scroller) { attach(scroller); return; }
  const changed = syncTargets();
  // A bar that just appeared is still sliding in; measure it again once it settles.
  if (changed) setTimeout(() => schedule(true), 450);
  let shown = false;
  if (current.forceGeometry || changed) { current.forceGeometry = false; shown = place(); }
  if (current.dirty || changed || shown) rebuild();
}

function makeHost(target) {
  const host = document.createElement('div');
  host.className = `rf-host rf-host-${target.key}`;
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  for (const name of target.bands) {
    const band = document.createElement('div');
    band.className = `rf-band rf-${name}`;
    const warp = document.createElement('div');
    warp.className = 'rf-warp';
    const scroll = document.createElement('div');
    scroll.className = 'rf-scroll';
    warp.appendChild(scroll);
    band.appendChild(warp);
    host.appendChild(band);
  }
  return host;
}

function hostsFor(scroller) {
  let hosts = hostsByScroller.get(scroller);
  if (!hosts) { hosts = {}; hostsByScroller.set(scroller, hosts); }
  for (const t of TARGETS) {
    if (!hosts[t.key] || !hosts[t.key].isConnected) {
      hosts[t.key] = makeHost(t);
      scroller.appendChild(hosts[t.key]);
    }
  }
  return hosts;
}

// Which bars are on screen right now. Returns true when that set changed.
function syncTargets() {
  const present = TARGETS.filter(t => document.querySelector(t.selector)).map(t => t.key).join(',');
  const changed = present !== current.present;
  current.present = present;
  return changed;
}

function detach() {
  if (!current) return;
  // Copies under screens in other tabs are never seen; drop them to save memory.
  if (!current.scroller.closest('.tabview.is-active')) {
    Object.values(current.hosts).forEach(h => h.querySelectorAll('.rf-scroll').forEach(el => el.replaceChildren()));
  }
  current.mo && current.mo.disconnect();
  current.ro && current.ro.disconnect();
  clearTimeout(current.timer);
  current.offs.forEach(off => off());
  current = null;
}

function attach(scroller) {
  detach();
  const hosts = hostsFor(scroller);
  const inner = scroller.querySelector(':scope > .scroller-inner');
  current = { scroller, hosts, inner, offs: [], dirty: true, forceGeometry: false, timer: 0, rects: {}, present: '' };
  if (!inner) return;
  // Rebuild the copy when the screen's content changes (debounced; the bars only show a sliver of it).
  current.mo = new MutationObserver(() => markDirty());
  current.mo.observe(inner, { subtree: true, childList: true, attributes: true, characterData: true });
  current.ro = new ResizeObserver(() => setMaxScroll());
  current.ro.observe(inner);
  current.ro.observe(scroller);
  syncTargets();
  place();
  // Building five copies of a screen is real work; never do it while screens are sliding, or the slide stutters.
  const wait = settleDelay(scroller);
  if (wait > 0) {
    current.settleUntil = performance.now() + wait;
    if (!current.hosts.tabbar.querySelector('.rf-clone')) Object.values(current.hosts).forEach(h => h.classList.add('rf-pending'));
    current.timer = setTimeout(() => { if (current && current.scroller === scroller) rebuild(); }, wait + 30);
  } else {
    rebuild();
  }
  if (timelineOK) watchTimeline(scroller);
}

// Milliseconds until the screen's slide (push, pop or swipe-back) has finished.
function settleDelay(scroller) {
  const layer = scroller.closest('.layer');
  if (!layer || !layer.getAnimations) return 0;
  let wait = 0;
  for (const a of layer.getAnimations()) {
    if (a.playState !== 'running' || !a.effect || !a.effect.getComputedTiming) continue;
    const t = a.effect.getComputedTiming();
    const left = (t.endTime || 0) - (t.localTime || 0);
    if (left > wait) wait = left;
  }
  return Math.min(wait, 600);
}

// Verifies once per screen that the scroll timeline really moves the copy with the content.
function watchTimeline(scroller) {
  let t = 0;
  const check = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!current || current.scroller !== scroller || !timelineOK) return;
      const y = scroller.scrollTop;
      if (y < 24) return;
      const el = scroller.querySelector(':scope > .rf-host:not([hidden]) .rf-scroll');
      if (!el) return;
      const moved = new DOMMatrix(getComputedStyle(el).transform).m42;
      scroller.removeEventListener('scroll', check);
      if (Math.abs(moved + y) > 4) fallBackToListener();
    }, 180);
  };
  scroller.addEventListener('scroll', check, { passive: true });
}

function fallBackToListener() {
  timelineOK = false;
  refraction.mode = 'scroll-listener';
  document.documentElement.classList.remove('rf-timeline');
  if (current) rebuild();
}

function markDirty() {
  if (!current) return;
  current.dirty = true;
  clearTimeout(current.timer);
  const delay = Math.max(140, (current.settleUntil || 0) - performance.now());
  current.timer = setTimeout(() => { if (!paused && current) rebuild(); }, delay);
}

// Put each host exactly under its bar, in the coordinates of the screen's layer.
// Returns true when a bar that had no copy yet became measurable (so the caller rebuilds).
function place() {
  if (!current) return false;
  const app = document.querySelector('.app');
  // While a sheet scales the app down (or it is animating back), rects are distorted; retry shortly.
  const tr = app ? getComputedStyle(app).transform : 'none';
  if (app && (app.classList.contains('app-behind') || (tr && tr !== 'none' && tr !== 'matrix(1, 0, 0, 1, 0, 0)'))) {
    current.forceGeometry = true;
    current.dirty = true;
    setTimeout(() => schedule(true), 500);
    return false;
  }
  let shown = false;
  for (const t of TARGETS) {
    const host = current.hosts[t.key];
    const el = document.querySelector(t.selector);
    if (!el) { host.hidden = true; current.rects[t.key] = null; continue; }
    const r = el.getBoundingClientRect();
    host.hidden = false;
    const h = host.style;
    h.left = `${r.left}px`;
    h.top = `${r.top}px`;
    h.width = `${r.width}px`;
    h.height = `${r.height}px`;
    h.borderRadius = getComputedStyle(el).borderRadius;
    h.setProperty('--rf-r', `${r.height / 2}px`);
    if (!current.rects[t.key]) shown = true;
    current.rects[t.key] = { left: r.left, top: r.top };
  }
  positionClones();
  setMaxScroll(true);
  return shown;
}

function setMaxScroll(force) {
  if (!current) return;
  const max = Math.max(0, current.scroller.scrollHeight - current.scroller.clientHeight);
  if (max !== current.max || force) {
    current.max = max;
    for (const t of TARGETS) {
      const host = current.hosts[t.key];
      host.style.setProperty('--rf-max', String(max));
      // Restart the animation so the end keyframe picks up the new distance.
      host.classList.remove('rf-live');
      void host.offsetWidth;
      host.classList.add('rf-live');
    }
  }
  if (!timelineOK) followScroll();
}

function followScroll() {
  if (!current || current.raf) return;
  current.raf = requestAnimationFrame(() => {
    if (!current) return;
    current.raf = 0;
    const y = -current.scroller.scrollTop;
    current.scroller.querySelectorAll(':scope > .rf-host .rf-scroll').forEach(el => { el.style.transform = `translateY(${y}px)`; });
  });
}

function positionClones() {
  if (!current) return;
  const width = current.scroller.clientWidth;
  for (const t of TARGETS) {
    const rect = current.rects[t.key];
    if (!rect) continue;
    current.hosts[t.key].querySelectorAll('.rf-clone').forEach(c => {
      c.style.left = `${-rect.left}px`;
      c.style.top = `${-rect.top}px`;
      c.style.width = `${width}px`;
    });
  }
}

function cloneContent(inner) {
  const c = inner.cloneNode(true);
  c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  c.querySelectorAll('label[for]').forEach(n => n.removeAttribute('for'));
  c.querySelectorAll('img').forEach(n => { n.loading = 'eager'; });
  return c;
}

function rebuild() {
  if (!current || !current.inner) return;
  current.dirty = false;
  clearTimeout(current.timer);
  Object.values(current.hosts).forEach(h => h.classList.remove('rf-pending'));
  const { inner, scroller } = current;
  const origH = [...inner.querySelectorAll(H_SCROLLERS)];
  current.offs.splice(0).forEach(off => off());
  if (!timelineOK) {
    const onScroll = () => followScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    current.offs.push(() => scroller.removeEventListener('scroll', onScroll));
  }
  const clonesH = [];
  for (const t of TARGETS) {
    const host = current.hosts[t.key];
    const visible = !!current.rects[t.key];
    host.querySelectorAll('.rf-scroll').forEach(scroll => {
      if (!visible) { scroll.replaceChildren(); return; }
      const wrap = document.createElement('div');
      wrap.className = 'rf-clone';
      wrap.appendChild(cloneContent(inner));
      scroll.replaceChildren(wrap);
      clonesH.push([...wrap.querySelectorAll(H_SCROLLERS)]);
    });
  }
  positionClones();
  // Keep sideways-scrolling rows (PR medals, gym chips) lined up with the real ones.
  origH.forEach((orig, i) => {
    const sync = () => clonesH.forEach(list => { if (list[i]) list[i].scrollLeft = orig.scrollLeft; });
    sync();
    orig.addEventListener('scroll', sync, { passive: true });
    current.offs.push(() => orig.removeEventListener('scroll', sync));
  });
  setMaxScroll();
  if (!timelineOK) followScroll();
}
