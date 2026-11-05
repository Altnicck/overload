import { html, useState, useEffect, useRef } from './preact.js';
import { Icon } from './icons.js';
import { usePhoto, getState, pop, closeSheet } from './store.js';
import { MUSCLE } from './logic.js';
import { BodyThumb } from './body.js';
import { musclesFor } from './anatomy.js';

// ---------- haptics + sound ----------
let hapticLabel = null;
export function haptic(kind = 'light') {
  if (getState().settings.haptics === false) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(kind === 'success' ? [12, 60, 18] : 10); return; }
    // iOS Safari 18+: toggling a native switch fires the system haptic.
    if (!hapticLabel) {
      hapticLabel = document.createElement('label');
      hapticLabel.setAttribute('aria-hidden', 'true');
      hapticLabel.style.cssText = 'position:fixed;left:-200px;top:0;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      hapticLabel.appendChild(input);
      document.body.appendChild(hapticLabel);
    }
    hapticLabel.click();
    if (kind === 'success') setTimeout(() => hapticLabel && hapticLabel.click(), 110);
  } catch (e) { /* no haptics */ }
}

let audioCtx = null;
export function chime() {
  if (getState().settings.sound === false) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [[1318.5, 0], [1975.5, 0.09], [2637, 0.18]].forEach(([f, d]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + d + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.55);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d); o.stop(t0 + d + 0.6);
    });
  } catch (e) { /* no audio */ }
}

// ---------- building blocks ----------
export function GlassButton({ icon, label, onClick, tint, cls = '', size = 44, title, disabled }) {
  const round = !label;
  return html`<button type="button" class=${`glass gbtn ${round ? 'gbtn-round' : 'gbtn-pill'} ${tint ? 'gbtn-tint' : ''} ${cls}`}
    style=${round ? `width:${size}px;height:${size}px` : `height:${size}px`} onClick=${onClick} aria-label=${title || label} disabled=${disabled}>
    ${icon && html`<${Icon} name=${icon} size=${round ? 21 : 18} stroke=${2.1} />`}
    ${label && html`<span>${label}</span>`}
  </button>`;
}

// An exercise's picture: the machine photo when there is one, otherwise the muscles it works.
export function Thumb({ ex, photoId, muscle, size = 48, radius, cls = '', name, movement }) {
  if (ex) { photoId = ex.photoId; muscle = ex.muscle; name = ex.name; movement = ex.movement; }
  const url = usePhoto(photoId, 'thumb');
  const m = MUSCLE[muscle] || MUSCLE.other;
  const r = radius ?? Math.round(size * 0.26);
  if (url) return html`<div class=${'thumb ' + cls} style=${`width:${size}px;height:${size}px;border-radius:${r}px;--mc:${m.color}`}><img src=${url} alt=${name || ''} loading="lazy" decoding="async" /></div>`;
  return html`<${BodyThumb} levels=${musclesFor(ex || { muscle, name, movement })} size=${size} radius=${r} cls=${'thumb ' + cls} />`;
}

export function Segmented({ options, value, onChange, cls = '' }) {
  const i = Math.max(0, options.findIndex(o => o.value === value));
  return html`<div class=${'seg ' + cls} role="tablist" style=${`--n:${options.length};--i:${i}`}>
    <div class="seg-thumb" aria-hidden="true"></div>
    ${options.map(o => html`<button type="button" role="tab" aria-selected=${o.value === value} class=${o.value === value ? 'on' : ''}
      onClick=${() => { if (o.value !== value) { haptic(); onChange(o.value); } }}>${o.label}</button>`)}
  </div>`;
}

export function Toggle({ checked, onChange, label, id }) {
  return html`<label class="toggle" for=${id}>
    <input id=${id} type="checkbox" checked=${checked} onChange=${e => onChange(e.currentTarget.checked)} aria-label=${label} />
    <span class="toggle-track"><span class="toggle-knob"></span></span>
  </label>`;
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1, id }) {
  return html`<div class="stepper" id=${id}>
    <button type="button" aria-label="Decrease" disabled=${value <= min} onClick=${() => { haptic(); onChange(Math.max(min, value - step)); }}><${Icon} name="minus" size=${18} stroke=${2.4} /></button>
    <span class="stepper-val">${value}</span>
    <button type="button" aria-label="Increase" disabled=${value >= max} onClick=${() => { haptic(); onChange(Math.min(max, value + step)); }}><${Icon} name="plus" size=${18} stroke=${2.4} /></button>
  </div>`;
}

export function Section({ title, action, onAction, children, cls = '' }) {
  return html`<section class=${'section ' + cls}>
    ${(title || action) && html`<div class="section-head">
      <h2>${title}</h2>
      ${action && html`<button type="button" class="link" onClick=${onAction}>${action}</button>`}
    </div>`}
    ${children}
  </section>`;
}

export function Empty({ icon = 'sparkle', title, text, action, onAction }) {
  return html`<div class="empty">
    <div class="empty-ic"><${Icon} name=${icon} size=${28} /></div>
    <h3>${title}</h3>
    ${text && html`<p>${text}</p>`}
    ${action && html`<button type="button" class="btn btn-accent" onClick=${onAction}>${action}</button>`}
  </div>`;
}

// Concentric progress rings drawn to scale.
export function Rings({ rings, size = 132, stroke = 15, gap = 3, animate = true }) {
  const c = size / 2;
  const [on, setOn] = useState(!animate);
  useEffect(() => { if (animate) { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t); } }, []);
  return html`<svg class="rings" width=${size} height=${size} viewBox=${`0 0 ${size} ${size}`} role="img" aria-label=${rings.map(r => `${r.label} ${Math.round(r.p * 100)}%`).join(', ')}>
    <defs>${rings.map((r, i) => html`<linearGradient id=${'rg' + i} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color=${r.c1} /><stop offset="1" stop-color=${r.c2} /></linearGradient>`)}</defs>
    ${rings.map((r, i) => {
      const rad = c - stroke / 2 - i * (stroke + gap);
      const circ = 2 * Math.PI * rad;
      const p = Math.max(0, r.p);
      const shown = Math.min(p, 1);
      return html`<g transform=${`rotate(-90 ${c} ${c})`}>
        <circle cx=${c} cy=${c} r=${rad} fill="none" stroke=${r.c1} stroke-opacity="0.2" stroke-width=${stroke} />
        <circle class="ring-arc" cx=${c} cy=${c} r=${rad} fill="none" stroke=${`url(#rg${i})`} stroke-width=${stroke} stroke-linecap="round"
          stroke-dasharray=${`${circ} ${circ}`} stroke-dashoffset=${on ? circ * (1 - shown) + (shown >= 1 ? 0 : 0) : circ} />
        ${p > 1 && html`<circle class="ring-arc" cx=${c} cy=${c} r=${rad} fill="none" stroke=${r.c2} stroke-width=${stroke} stroke-linecap="round"
          stroke-dasharray=${`${circ} ${circ}`} stroke-dashoffset=${on ? circ * (1 - Math.min(p - 1, 1)) : circ} opacity="0.9" />`}
      </g>`;
    })}
  </svg>`;
}

// ---------- screen chrome ----------
// Large-title screen with iOS-style compact title that fades in on scroll.
export function Screen({ title, eyebrow, left, right, children, cls = '', tab, compactTitle, onBack, pushed }) {
  const ref = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const onScroll = e => {
    const y = e.currentTarget.scrollTop;
    const s = y > 38;
    if (s !== scrolled) setScrolled(s);
  };
  return html`<div class=${`screen ${cls} ${scrolled ? 'is-scrolled' : ''}`}>
    <div class="topbar">
      <div class="topbar-edge" aria-hidden="true"></div>
      <div class="topbar-row">
        <div class="topbar-side">${pushed ? html`<${GlassButton} icon="back" title="Back" onClick=${onBack || (() => pop(tab))} />` : left}</div>
        <div class="topbar-title" aria-hidden=${!scrolled}>${compactTitle || title}</div>
        <div class="topbar-side topbar-right">${right}</div>
      </div>
    </div>
    <div class="scroller" ref=${ref} onScroll=${onScroll}>
      <div class="scroller-inner">
        ${title && html`<header class="large-title">
          ${eyebrow && html`<div class="eyebrow">${eyebrow}</div>`}
          <h1>${title}</h1>
        </header>`}
        ${children}
      </div>
    </div>
  </div>`;
}

// Bottom sheet frame with grabber, title row and drag-to-dismiss.
export function SheetFrame({ sheetKey, title, left, right, children, cls = '', onClose, full }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const close = onClose || (() => closeSheet(sheetKey));
  const start = e => {
    const sc = ref.current.querySelector('.sheet-body');
    if (sc && sc.scrollTop > 0 && !e.currentTarget.classList.contains('sheet-grab-zone')) return;
    drag.current = { y: e.touches[0].clientY, dy: 0, t: Date.now() };
  };
  const move = e => {
    if (!drag.current) return;
    const dy = e.touches[0].clientY - drag.current.y;
    drag.current.dy = dy;
    if (dy > 0) { ref.current.style.transition = 'none'; ref.current.style.transform = `translateY(${dy}px)`; }
  };
  const end = () => {
    if (!drag.current) return;
    const { dy, t } = drag.current;
    drag.current = null;
    const fast = dy / Math.max(1, Date.now() - t) > 0.6;
    ref.current.style.transition = '';
    if (dy > 140 || (fast && dy > 40)) { ref.current.style.transform = 'translateY(110%)'; setTimeout(close, 180); }
    else ref.current.style.transform = '';
  };
  return html`<div class=${`sheet ${full ? 'sheet-full' : ''} ${cls}`} ref=${ref} role="dialog" aria-modal="true" aria-label=${typeof title === 'string' ? title : undefined}>
    <div class="sheet-grab-zone" onTouchStart=${start} onTouchMove=${move} onTouchEnd=${end}>
      <div class="sheet-grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <div class="sheet-side">${left !== undefined ? left : html`<${GlassButton} icon="x" title="Close" onClick=${close} size=${40} />`}</div>
        <div class="sheet-title">${title}</div>
        <div class="sheet-side sheet-right">${right}</div>
      </div>
    </div>
    <div class="sheet-body">${children}</div>
  </div>`;
}

// Swipe back for pushed screens (Home Screen web apps have no system back gesture).
// Works like iOS 26: start at the left edge, or anywhere with a clearly sideways drag. The screen follows the finger
// 1:1 from the first frame (transforms only, so the compositor moves it), and on release it finishes with the
// finger's speed, so a quick flick snaps back as fast as a native app.
const NO_SWIPE = '.chart, .hscroll, .chips-scroll, input, textarea, select, .seg, .stepper, .toggle';
const UNDER_X = -0.28;     // the screen below sits 28% to the left, as in UIKit
const UNDER_OPACITY = 0.72;

function clearInline(node) {
  if (!node) return;
  node.style.transition = '';
  node.style.transform = '';
  node.style.opacity = '';
}

export function useSwipeBack(ref, onBack, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let st = null;
    const underOf = () => {
      const prev = el.previousElementSibling;
      return prev && prev.classList.contains('layer') ? prev : null;
    };
    const paint = (dx) => {
      const p = Math.min(1, dx / st.w);
      el.style.transform = `translate3d(${dx}px,0,0)`;
      if (st.u) {
        st.u.style.transform = `translate3d(${(UNDER_X * (1 - p)) * 100}%,0,0)`;
        st.u.style.opacity = String(UNDER_OPACITY + (1 - UNDER_OPACITY) * p);
      }
    };
    const ts = e => {
      if (e.touches.length !== 1) { st = null; return; }
      const t = e.touches[0];
      const edge = t.clientX <= 32;
      if (!edge && e.target && e.target.closest && e.target.closest(NO_SWIPE)) { st = null; return; }
      st = { x0: t.clientX, y0: t.clientY, edge, locked: false, dx: 0, w: el.offsetWidth || window.innerWidth, samples: [[e.timeStamp, t.clientX]] };
    };
    const tm = e => {
      if (!st) return;
      const t = e.touches[0];
      const dx = t.clientX - st.x0, dy = t.clientY - st.y0;
      if (!st.locked) {
        if (document.documentElement.classList.contains('drag-active')) { st = null; return; }   // a row is being reordered
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (ady > 10 && ady >= adx) { st = null; return; }     // vertical: let the list scroll
        if (dx < -8) { st = null; return; }                     // leftward: not a back swipe
        if (dx < (st.edge ? 6 : 12) || (!st.edge && adx < ady * 1.4)) return;
        st.locked = true;
        st.u = underOf();
        // Stop a slide-in that is still running so it can't hold the screen in place, then follow the finger.
        el.style.animation = 'none';
        el.style.transition = 'none';
        el.classList.add('is-swiping');
        if (st.u) st.u.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      st.dx = Math.max(0, dx);
      paint(st.dx);
      st.samples.push([e.timeStamp, t.clientX]);
      if (st.samples.length > 6) st.samples.shift();
    };
    const te = e => {
      if (!st) return;
      const s = st;
      st = null;
      if (!s.locked) return;
      if (e.cancelable) e.preventDefault();   // no click on whatever row the finger ended on
      // Release speed from the last ~100 ms of movement, in px per ms.
      const last = s.samples[s.samples.length - 1];
      const first = s.samples.find(([t]) => last[0] - t <= 100) || s.samples[0];
      const v = last[0] > first[0] ? (last[1] - first[1]) / (last[0] - first[0]) : 0;
      const p = s.dx / s.w;
      const done = e.type !== 'touchcancel' && ((p > 0.4 && v > -0.15) || (v > 0.3 && s.dx > 20));
      const ease = 'cubic-bezier(0.22, 0.9, 0.32, 1)';
      if (done) {
        const ms = Math.round(Math.min(300, Math.max(150, (s.w - s.dx) / Math.max(v, 1.3))));
        el.style.transition = `transform ${ms}ms ${ease}`;
        el.style.transform = `translate3d(${s.w}px,0,0)`;
        el.dataset.swiped = '1';
        if (s.u) {
          const u = s.u;
          u.style.transition = `transform ${ms}ms ${ease}, opacity ${ms}ms ${ease}`;
          u.style.transform = 'translate3d(0,0,0)';
          u.style.opacity = '1';
          setTimeout(() => clearInline(u), ms + 40);
        }
        onBack();   // navigate now; the screen stays mounted while it finishes sliding away
      } else {
        const ms = 220;
        el.style.transition = `transform ${ms}ms ${ease}`;
        el.style.transform = 'translate3d(0,0,0)';
        if (s.u) {
          s.u.style.transition = `transform ${ms}ms ${ease}, opacity ${ms}ms ${ease}`;
          s.u.style.transform = `translate3d(${UNDER_X * 100}%,0,0)`;
          s.u.style.opacity = String(UNDER_OPACITY);
        }
        // Keep animation: none, or clearing it would replay the slide-in.
        setTimeout(() => { el.classList.remove('is-swiping'); clearInline(el); clearInline(s.u); }, ms + 40);
      }
    };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te, { passive: false });
    el.addEventListener('touchcancel', te, { passive: false });
    return () => {
      el.removeEventListener('touchstart', ts); el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te); el.removeEventListener('touchcancel', te);
    };
  }, [enabled]);
}

// ---------- hold-and-drag reordering ----------
// The list's children with data-ri (the item's index in the data) can be reordered: hold one, or touch its grip, and
// it lifts under the finger; the other rows slide out of its way and the list scrolls by itself near the edges.
// Letting go drops it into the gap. Only transforms move while dragging, and the new order is committed once, after
// the drop has settled, so the re-render lands exactly where the rows already are.
const LIFT_MS = 340;     // hold time before a row lifts
const SLOP = 8;          // finger movement (px) that turns a hold into a scroll
const EDGE = 76;         // auto-scroll zone (px) at the top and bottom of the visible list

export function moveItem(arr, from, to) {
  const c = [...arr];
  const [x] = c.splice(from, 1);
  c.splice(to, 0, x);
  return c;
}

export function useReorder(ref, { onMove, enabled = true, handle = '.reorder-grip', ignore = 'input, textarea, select' } = {}) {
  const cb = useRef(onMove);
  cb.current = onMove;
  useEffect(() => {
    const list = ref.current;
    if (!list || !enabled) return;
    const root = document.documentElement;
    let pend = null;        // a hold that has not lifted yet
    let drag = null;        // the lifted row
    let busy = false;       // a drop is settling
    let quietUntil = 0;     // swallow the click a drop would otherwise cause
    let lastTouch = -1e9;

    const rowsOf = () => [...list.children].filter(n => n.hasAttribute('data-ri'));
    const byId = (touches, id) => { for (const t of touches) if (t.identifier === id) return t; return null; };
    // The part of the scroller the person can actually see: below the top bar and above the floating tab bar.
    const bandOf = sc => {
      const r = sc.getBoundingClientRect();
      let top = Math.max(0, r.top), bottom = Math.min(window.innerHeight, r.bottom);
      const screen = sc.closest('.screen');
      if (screen) {
        const bar = screen.querySelector(':scope > .topbar');
        if (bar) top = Math.max(top, bar.getBoundingClientRect().bottom);
        const chrome = document.querySelector('.bottom-chrome');
        if (chrome) { const c = chrome.getBoundingClientRect(); if (c.height > 0) bottom = Math.min(bottom, c.top); }
      }
      return { top, bottom };
    };

    const begin = (target, x, y, id) => {
      if (busy || drag || pend || !target || !target.closest) return;
      const row = target.closest('[data-ri]');
      if (!row || row.parentElement !== list) return;
      const grip = !!target.closest(handle);
      if (!grip && target.closest(ignore)) return;
      pend = { row, x0: x, y0: y, x, y, id, timer: 0 };
      if (grip) lift();
      else pend.timer = setTimeout(lift, LIFT_MS);
    };
    const cancelPend = () => { if (pend) { clearTimeout(pend.timer); pend = null; } };

    const lift = () => {
      const p = pend;
      pend = null;
      if (!p) return;
      clearTimeout(p.timer);
      const { row } = p;
      // A back swipe that already took this touch keeps it.
      if (!row.isConnected || row.closest('.is-swiping') || root.classList.contains('drag-active')) return;
      const rows = rowsOf();
      const from = rows.indexOf(row);
      if (from < 0 || rows.length < 2) return;
      const sc = list.closest('.sheet-body, .scroller');
      const s0 = sc ? sc.scrollTop : 0;
      const rects = rows.map(r => r.getBoundingClientRect());
      const tops = rects.map(r => r.top + s0);       // content coordinates: unaffected by later scrolling
      const hs = rects.map(r => r.height);
      const gap = Math.max(0, tops[1] - tops[0] - hs[0]);
      drag = { row, rows, from, to: from, tops, hs, gap, sc, s0, y0: p.y, y: p.y, id: p.id, off: 0, raf: 0, band: sc ? bandOf(sc) : null };
      root.classList.add('drag-active');
      list.classList.add('is-reordering');
      row.classList.add('is-lifted');
      window.addEventListener('touchstart', stale, true);
      document.addEventListener('visibilitychange', hidden);
      haptic();
    };

    // Rows keep their separator lines in the order they now appear in.
    const markSeparators = d => {
      if (!d.row.classList.contains('row')) return;
      d.rows.forEach((r, i) => {
        if (i === d.from) return;
        const vis = i < d.from ? (i >= d.to ? i + 1 : i) : (i <= d.to ? i - 1 : i);
        if (vis === 0) r.dataset.sep = '0';
        else if (i === 0) r.dataset.sep = '1';
        else r.removeAttribute('data-sep');
      });
    };

    const paint = () => {
      const d = drag;
      const n = d.rows.length;
      const scrolled = d.sc ? d.sc.scrollTop - d.s0 : 0;
      const lo = d.tops[0] - d.tops[d.from] - 6;
      const hi = d.tops[n - 1] + d.hs[n - 1] - d.hs[d.from] - d.tops[d.from] + 6;
      d.off = Math.max(lo, Math.min(hi, d.y - d.y0 + scrolled));
      d.row.style.translate = `0 ${d.off}px`;
      // Take a neighbour's place once the row's leading edge passes the middle of it.
      const top = d.tops[d.from] + d.off, bottom = top + d.hs[d.from];
      let to = d.from;
      for (let i = d.from + 1; i < n && bottom > d.tops[i] + d.hs[i] / 2; i++) to = i;
      for (let i = d.from - 1; i >= 0 && top < d.tops[i] + d.hs[i] / 2; i--) to = i;
      if (to === d.to) return;
      d.to = to;
      const shift = d.hs[d.from] + d.gap;
      d.rows.forEach((r, i) => {
        if (i === d.from) return;
        const y = i > d.from && i <= to ? -shift : i < d.from && i >= to ? shift : 0;
        r.style.translate = y ? `0 ${y}px` : '';
      });
      markSeparators(d);
      haptic();
    };

    // Near the top or bottom edge the list scrolls by itself, faster the closer the finger gets (up to ~1100 px/s).
    const autoScroll = () => {
      const d = drag;
      if (!d || !d.sc || !d.band || d.raf) return;
      if (!d.moved) { if (Math.abs(d.y - d.y0) < 12) return; d.moved = true; }   // not for a row merely held at the edge
      let last = performance.now();
      const tick = now => {
        d.raf = 0;
        if (drag !== d) return;
        const dt = Math.min(48, Math.max(1, now - last));
        last = now;
        const { top, bottom } = d.band;
        let k = 0;
        if (d.y < top + EDGE) k = -Math.min(1, (top + EDGE - d.y) / EDGE);
        else if (d.y > bottom - EDGE) k = Math.min(1, (d.y - (bottom - EDGE)) / EDGE);
        if (!k) return;
        const max = d.sc.scrollHeight - d.sc.clientHeight;
        const cur = d.sc.scrollTop;
        if ((k < 0 && cur <= 0) || (k > 0 && cur >= max - 0.5)) return;
        d.acc = (d.acc || 0) + Math.sign(k) * k * k * 1.15 * dt;
        const step = Math.trunc(d.acc);
        if (step) { d.acc -= step; d.sc.scrollTop = Math.max(0, Math.min(max, cur + step)); paint(); }
        d.raf = requestAnimationFrame(tick);
      };
      d.raf = requestAnimationFrame(tick);
    };

    const drop = cancelled => {
      const d = drag;
      if (!d) return;
      drag = null;
      cancelAnimationFrame(d.raf);
      window.removeEventListener('touchstart', stale, true);
      document.removeEventListener('visibilitychange', hidden);
      busy = true;
      if (!cancelled) haptic();   // runs inside touchend, where iOS allows the haptic tick
      const to = cancelled ? d.from : d.to;
      if (to !== d.to) d.rows.forEach((r, i) => { if (i !== d.from) r.style.translate = ''; });
      const end = (to > d.from ? d.tops[to] + d.hs[to] - d.hs[d.from] : d.tops[to]) - d.tops[d.from];
      const ms = Math.round(Math.min(280, 170 + Math.abs(end - d.off) * 0.4));
      const ease = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
      d.row.style.transition = `translate ${ms}ms ${ease}, scale ${ms}ms ${ease}, box-shadow ${ms}ms ease, background-color ${ms}ms ease, border-radius ${ms}ms ease`;
      d.row.classList.remove('is-lifted');
      d.row.classList.add('is-settling');
      d.row.style.translate = `0 ${end}px`;
      quietUntil = performance.now() + ms + 350;
      setTimeout(() => {
        // Commit. The list re-renders in the new order before the next frame, so clearing the offsets is invisible.
        if (to !== d.from && cb.current) cb.current(+d.row.dataset.ri, +d.rows[to].dataset.ri);
        d.rows.forEach(r => { r.style.translate = ''; r.style.transition = ''; r.removeAttribute('data-sep'); });
        d.row.classList.remove('is-settling');
        list.classList.remove('is-reordering');
        root.classList.remove('drag-active');
        window.dispatchEvent(new Event('reorder-end'));
        busy = false;
      }, ms + 16);
    };
    // A touch that ended without telling us (the system took it) must not leave a row floating.
    const stale = e => { if (drag && typeof drag.id === 'number' && !byId(e.touches, drag.id)) drop(true); };
    const hidden = () => { if (document.visibilityState === 'hidden') drop(true); };

    const ts = e => {
      lastTouch = performance.now();
      if (e.touches.length > 1) { cancelPend(); return; }
      const t = e.changedTouches[0];
      begin(e.target, t.clientX, t.clientY, t.identifier);
    };
    const tm = e => {
      lastTouch = performance.now();
      if (pend) {
        const t = byId(e.touches, pend.id);
        if (!t) return;
        pend.x = t.clientX; pend.y = t.clientY;
        if (Math.abs(t.clientX - pend.x0) > SLOP || Math.abs(t.clientY - pend.y0) > SLOP) cancelPend();   // it's a scroll
        return;
      }
      if (!drag) return;
      const t = byId(e.touches, drag.id);
      if (!t) return;
      if (e.cancelable) e.preventDefault();   // the list must not scroll under the finger
      e.stopPropagation();                    // nor may a back swipe start
      drag.y = t.clientY;
      paint();
      autoScroll();
    };
    const te = e => {
      lastTouch = performance.now();
      if (pend) { if (byId(e.changedTouches, pend.id)) cancelPend(); return; }
      if (!drag || !byId(e.changedTouches, drag.id)) return;
      if (e.cancelable) e.preventDefault();   // no tap on the row that was just dropped
      e.stopPropagation();
      drop(e.type === 'touchcancel');
    };

    // Mouse (iPad trackpad, desktop): same gestures, with the button held.
    const mm = e => {
      if (pend) {
        pend.x = e.clientX; pend.y = e.clientY;
        if (Math.abs(e.clientX - pend.x0) > SLOP || Math.abs(e.clientY - pend.y0) > SLOP) { cancelPend(); unbindMouse(); }
        return;
      }
      if (!drag) return;
      e.preventDefault();
      drag.y = e.clientY;
      paint();
      autoScroll();
    };
    const mu = () => { unbindMouse(); if (pend) cancelPend(); else if (drag && drag.id === 'mouse') drop(false); };
    const unbindMouse = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    const md = e => {
      if (e.button !== 0 || performance.now() - lastTouch < 900) return;   // ignore the mouse events a tap imitates
      begin(e.target, e.clientX, e.clientY, 'mouse');
      if (pend || drag) { window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); }
      if (drag) e.preventDefault();
    };

    const click = e => { if (busy || performance.now() < quietUntil) { e.preventDefault(); e.stopPropagation(); } };
    const menu = e => { if (pend || drag) e.preventDefault(); };

    list.addEventListener('touchstart', ts, { passive: true });
    list.addEventListener('touchmove', tm, { passive: false });
    list.addEventListener('touchend', te, { passive: false });
    list.addEventListener('touchcancel', te, { passive: false });
    list.addEventListener('mousedown', md);
    list.addEventListener('click', click, true);
    list.addEventListener('contextmenu', menu);
    return () => {
      list.removeEventListener('touchstart', ts);
      list.removeEventListener('touchmove', tm);
      list.removeEventListener('touchend', te);
      list.removeEventListener('touchcancel', te);
      list.removeEventListener('mousedown', md);
      list.removeEventListener('click', click, true);
      list.removeEventListener('contextmenu', menu);
      unbindMouse();
      cancelPend();
      if (drag) {
        cancelAnimationFrame(drag.raf);
        drag = null;
        window.removeEventListener('touchstart', stale, true);
        document.removeEventListener('visibilitychange', hidden);
        root.classList.remove('drag-active');
      }
    };
  }, [enabled]);
}

export function muscleLabel(id) { return (MUSCLE[id] || MUSCLE.other).label; }
export function muscleColor(id) { return (MUSCLE[id] || MUSCLE.other).color; }
