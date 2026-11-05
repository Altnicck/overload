import { html, useState, useEffect, useRef } from './preact.js';
import { Icon } from './icons.js';
import { usePhoto, getState, pop, closeSheet } from './store.js';
import { MUSCLE } from './logic.js';

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

export function Thumb({ photoId, muscle, size = 48, radius, cls = '', name }) {
  const url = usePhoto(photoId, 'thumb');
  const m = MUSCLE[muscle] || MUSCLE.other;
  const r = radius ?? Math.round(size * 0.26);
  const style = `width:${size}px;height:${size}px;border-radius:${r}px;--mc:${m.color}`;
  if (url) return html`<div class=${'thumb ' + cls} style=${style}><img src=${url} alt=${name || ''} loading="lazy" decoding="async" /></div>`;
  const letters = (name || m.label).replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return html`<div class=${'thumb thumb-ph ' + cls} style=${style} aria-hidden="true">
    <span style=${`font-size:${Math.round(size * 0.34)}px`}>${letters}</span></div>`;
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

export function muscleLabel(id) { return (MUSCLE[id] || MUSCLE.other).label; }
export function muscleColor(id) { return (MUSCLE[id] || MUSCLE.other).color; }
