// Body map drawings: front and back figures with the worked muscles lit in the accent colour.
// Each shape lives once in a hidden sprite and every drawing reuses it with <use>, so a list of thirty
// thumbnails stays light. Thumbnails crop to the muscles they show, like the day pictures in Jefit.
import { html } from './preact.js';
import { PARTS, OUTLINE, BOXES, FIGURE } from './bodydata.js';
import { REGIONS } from './anatomy.js';

const MUSCLE = new Set(['chest', 'obliques', 'abs', 'biceps', 'triceps', 'trapezius', 'deltoids', 'adductors', 'quadriceps',
  'tibialis', 'calves', 'forearm', 'upper-back', 'lower-back', 'gluteal', 'hamstring']);
const SLUGS = { front: Object.keys(PARTS.front), back: Object.keys(PARTS.back) };

let spriteReady = false;
function ensureSprite() {
  if (spriteReady || typeof document === 'undefined' || !document.body) return;
  spriteReady = true;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const defs = document.createElementNS(NS, 'defs');
  for (const view of ['front', 'back']) {
    for (const [slug, d] of Object.entries(PARTS[view])) {
      const p = document.createElementNS(NS, 'path');
      p.id = `bm-${view}-${slug}`;
      p.setAttribute('d', d);
      defs.appendChild(p);
    }
    const o = document.createElementNS(NS, 'path');
    o.id = `bm-${view}-outline`;
    o.setAttribute('d', OUTLINE[view]);
    o.setAttribute('vector-effect', 'non-scaling-stroke');
    defs.appendChild(o);
  }
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

// Region weights { lats: 1, biceps: 0.5 } -> shape levels per view { front: { biceps: 0.5 }, back: { 'upper-back': 1 } }.
export function partLevels(levels) {
  const out = { front: {}, back: {} };
  for (const [rid, w] of Object.entries(levels || {})) {
    const r = REGIONS[rid];
    if (!r || !(w > 0)) continue;
    for (const view of ['front', 'back']) for (const slug of r.parts[view] || []) out[view][slug] = Math.max(out[view][slug] || 0, Math.min(1, w));
  }
  return out;
}

// Muscles drawn on both sides of the body look best from one of them.
const SHARED_VIEW = { sideDelts: 'front', traps: 'back', triceps: 'back', forearms: 'front', adductors: 'front', calves: 'back' };

// Front, back or both: one view unless each side has a main muscle of its own (legs: quads in front, glutes behind).
export function pickViews(levels) {
  const max = Math.max(0, ...Object.values(levels || {}));
  if (!(max > 0)) return ['front'];
  const excl = { front: 0, back: 0 }, score = { front: 0, back: 0 };
  let top = null;
  for (const [rid, w] of Object.entries(levels)) {
    const r = REGIONS[rid];
    if (!r || !(w > 0)) continue;
    const vs = Object.keys(r.parts);
    const v = vs.length === 1 ? vs[0] : SHARED_VIEW[rid] || 'front';
    if (vs.length === 1 && w >= max * 0.6) excl[v] = Math.max(excl[v], w);
    score[v] += w;
    if (!top || w > top.w) top = { v, w };
  }
  if (excl.front && excl.back) return ['front', 'back'];
  if (score.front === score.back) return [top.v];
  return [score.front > score.back ? 'front' : 'back'];
}

// The box around the main muscles in the chosen view(s), padded to the requested width/height ratio.
export function cropBoxes(levels, aspect = 1, { minH = 440, pad = 0.2, views: forced } = {}) {
  const pl = partLevels(levels);
  const views = forced || pickViews(levels);
  const maxL = Math.max(0, ...views.flatMap(v => Object.values(pl[v])));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of views) {
    const fx = FIGURE[v][0];
    for (const [slug, l] of Object.entries(pl[v])) {
      if (l < maxL * 0.5) continue;
      const b = BOXES[v][slug];
      if (!b) continue;
      x0 = Math.min(x0, b[0] - fx); y0 = Math.min(y0, b[1]);
      x1 = Math.max(x1, b[0] - fx + b[2]); y1 = Math.max(y1, b[1] + b[3]);
    }
  }
  if (!Number.isFinite(x0)) { x0 = 150; y0 = 230; x1 = 480; y1 = 650; }   // nothing lit: the torso
  const [, FY, FW, FH] = FIGURE.front;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let w = (x1 - x0) * (1 + pad * 2), h = Math.max((y1 - y0) * (1 + pad * 2), minH);
  const a = aspect / views.length;
  if (w / h < a) w = h * a; else h = w / a;
  let bx = cx - w / 2, by = cy - h / 2;
  bx = w <= FW ? Math.max(0, Math.min(FW - w, bx)) : (FW - w) / 2;
  by = h <= FH ? Math.max(FY, Math.min(FY + FH - h, by)) : FY + (FH - h) / 2;
  return { pl, crops: views.map(v => ({ view: v, box: [FIGURE[v][0] + bx, by, w, h].map(n => Math.round(n)) })) };
}

// The shapes of one view: outline, resting muscles, then the lit ones on top.
function parts(view, pl) {
  ensureSprite();
  const base = [], lit = [];
  for (const slug of SLUGS[view]) {
    const l = pl[slug];
    if (l) lit.push(html`<use key=${slug} href=${`#bm-${view}-${slug}`} style=${`fill-opacity:${(0.32 + 0.68 * l).toFixed(2)}`} />`);
    else base.push(html`<use key=${slug} href=${`#bm-${view}-${slug}`} class=${MUSCLE.has(slug) ? 'bm-base' : 'bm-skin'} />`);
  }
  return html`<use href=${`#bm-${view}-outline`} class="bm-outline" /><g>${base}</g><g class="bm-lit">${lit}</g>`;
}

function Figure({ view, pl, box, cls = '' }) {
  return html`<svg class=${'bm-fig ' + cls} viewBox=${box.join(' ')} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    ${parts(view, pl)}
  </svg>`;
}

// Thumbnails are drawn once into a small bitmap and cached, so long lists (and the copies the glass bars
// keep of the screen) hold one <img> each instead of dozens of shapes.
const COLORS = { base: '#36363c', skin: '#2b2b30', lit: '#c6f432', line: 'rgba(255,255,255,0.08)' };
const paths = new Map();
const pathFor = (view, slug) => {
  const k = view + slug;
  if (!paths.has(k)) paths.set(k, new Path2D(slug === 'outline' ? OUTLINE[view] : PARTS[view][slug]));
  return paths.get(k);
};
const bitmaps = new Map();
let canDraw = null;

function drawThumb(levels, w, h, views) {
  const dpr = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2)));
  const key = `${JSON.stringify(levels)}|${w}x${h}@${dpr}|${views || ''}`;
  if (bitmaps.has(key)) return bitmaps.get(key);
  const { pl, crops } = cropBoxes(levels, w / h, { views });
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext('2d');
  const cellW = c.width / crops.length;
  crops.forEach(({ view, box: [bx, by, bw, bh] }, i) => {
    const s = Math.min(cellW / bw, c.height / bh);
    ctx.save();
    ctx.beginPath(); ctx.rect(i * cellW, 0, cellW, c.height); ctx.clip();
    ctx.setTransform(s, 0, 0, s, i * cellW + (cellW - bw * s) / 2 - bx * s, (c.height - bh * s) / 2 - by * s);
    for (const slug of SLUGS[view]) {
      const l = pl[view][slug];
      ctx.globalAlpha = l ? 0.32 + 0.68 * l : 1;
      ctx.fillStyle = l ? COLORS.lit : MUSCLE.has(slug) ? COLORS.base : COLORS.skin;
      ctx.fill(pathFor(view, slug));
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.2 / s;
    ctx.strokeStyle = COLORS.line;
    ctx.stroke(pathFor(view, 'outline'));
    ctx.restore();
  });
  const url = c.toDataURL('image/png');
  bitmaps.set(key, url);
  return url;
}

// Square (or w×h) picture cropped to the worked muscles. Two views side by side when both sides are worked.
export function BodyThumb({ levels, size = 48, width, height, radius, cls = '', views }) {
  const w = width || size, h = height || size;
  const style = `width:${w}px;height:${h}px;border-radius:${radius ?? Math.round(Math.min(w, h) * 0.26)}px`;
  if (canDraw === null) { try { canDraw = typeof Path2D === 'function' && !!document.createElement('canvas').getContext('2d'); } catch (e) { canDraw = false; } }
  if (canDraw) {
    let url = null;
    try { url = drawThumb(levels || {}, w, h, views); } catch (e) { canDraw = false; }
    if (url) return html`<div class=${'bm-thumb ' + cls} style=${style} aria-hidden="true"><img src=${url} alt="" draggable="false" /></div>`;
  }
  const { pl, crops } = cropBoxes(levels, w / h, { views });
  return html`<div class=${'bm-thumb ' + (crops.length > 1 ? 'bm-two ' : '') + cls} style=${style} aria-hidden="true">
    ${crops.map(c => html`<${Figure} key=${c.view} view=${c.view} pl=${pl[c.view]} box=${c.box} />`)}
  </div>`;
}

// Whole figures, front and back, for heroes and heat maps. Both views sit in one SVG (the artwork already places
// the back view to the right of the front one), drawn at an exact pixel size, so no browser has to work the size
// out from aspect ratios. `fill` makes it fill its container instead (the machine page header).
export function BodyMap({ levels, height = 220, views = ['front', 'back'], cls = '', captions = false, fill = false }) {
  const pl = partLevels(levels);
  const pad = 10;
  const boxes = views.map(v => FIGURE[v]);
  const x0 = Math.min(...boxes.map(f => f[0])) - pad;
  const x1 = Math.max(...boxes.map(f => f[0] + f[2])) + pad;
  const y0 = FIGURE.front[1] - pad, h = FIGURE.front[3] + pad * 2;
  const vb = [x0, y0, x1 - x0, h];
  const width = Math.round(height * vb[2] / vb[3]);
  return html`<div class=${'bm-map ' + (fill ? 'bm-fill ' : '') + cls} aria-hidden="true">
    <div class="bm-box" style=${fill ? '' : `width:${width}px;height:${height}px`}>
      <svg class="bm-svg" viewBox=${vb.join(' ')} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" focusable="false">
        ${views.map(v => html`<g key=${v}>${parts(v, pl[v])}</g>`)}
      </svg>
    </div>
    ${captions && html`<div class="bm-caps" style=${fill ? '' : `width:${width}px`}>
      ${views.map(v => { const f = FIGURE[v]; return html`<span key=${v} style=${`left:${(((f[0] + f[2] / 2) - x0) / vb[2] * 100).toFixed(1)}%`}>${v === 'front' ? 'Front' : 'Back'}</span>`; })}
    </div>`}
  </div>`;
}
