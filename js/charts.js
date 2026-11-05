import { html, useState, useEffect, useRef } from './preact.js';
import { fmt, fmtDate } from './logic.js';

function useWidth(ref, fallback = 340) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const cw = Math.round(entries[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

function niceTicks(min, max, count = 4) {
  if (!(max > min)) { const v = max || 1; min = v * 0.9; max = v * 1.1; }
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2.5 ? 5 : norm >= 2 ? 2.5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

// Line chart in the Health style: right-side axis, faint grid, scrubbing callout.
export function LineChart({ points, height = 220, color = 'var(--accent)', unit = 'kg', valueLabel = 'Est. 1RM' }) {
  const ref = useRef(null);
  const W = useWidth(ref);
  const [sel, setSel] = useState(null);
  if (!points.length) return html`<div class="chart-empty" ref=${ref}>No sessions in this range yet.</div>`;
  const padL = 6, padR = 44, padT = 78, padB = 26;
  const vals = points.map(p => p.v);
  const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals), 3);
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const X = t => points.length === 1 ? padL + (W - padL - padR) / 2 : padL + ((t - t0) / span) * (W - padL - padR);
  const Y = v => padT + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (height - padT - padB);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${X(t1).toFixed(1)},${height - padB} L${X(t0).toFixed(1)},${height - padB} Z`;
  const gid = 'lg' + Math.round(Math.random() * 1e6);
  const pick = clientX => {
    const r = ref.current.getBoundingClientRect();
    const x = clientX - r.left;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(X(p.t) - x); if (dd < bd) { bd = dd; best = i; } });
    setSel(best);
  };
  const shown = sel !== null ? points[sel] : points[points.length - 1];
  const best = points.reduce((a, b) => (b.v > a.v ? b : a));
  // x labels: first, middle, last (dedupe)
  const xl = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]]
    .filter((p, i, a) => a.findIndex(q => q.t === p.t) === i);
  return html`<div class="chart" ref=${ref}
      onTouchStart=${e => pick(e.touches[0].clientX)} onTouchMove=${e => pick(e.touches[0].clientX)} onTouchEnd=${() => setTimeout(() => setSel(null), 1400)}
      onPointerMove=${e => { if (e.pointerType === 'mouse') pick(e.clientX); }} onPointerLeave=${() => setSel(null)}>
    <div class="chart-callout">
      <div class="cc-label">${sel !== null ? valueLabel : (shown === best ? 'Best ' + valueLabel.toLowerCase() : 'Latest')}</div>
      <div class="cc-value"><b>${fmt(shown.v)}</b> <span>${unit}</span></div>
      <div class="cc-sub">${fmtDate(shown.t, true)}${shown.label ? ' · ' + shown.label : ''}</div>
    </div>
    <svg width=${W} height=${height} viewBox=${`0 0 ${W} ${height}`} role="img" aria-label=${`${valueLabel} over time, best ${fmt(best.v)} ${unit}`}>
      <defs><linearGradient id=${gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color=${color} stop-opacity="0.32" /><stop offset="1" stop-color=${color} stop-opacity="0" />
      </linearGradient></defs>
      ${ticks.map(v => html`<g>
        <line x1=${padL} x2=${W - padR + 4} y1=${Y(v)} y2=${Y(v)} class="grid" />
        <text x=${W - padR + 10} y=${Y(v) + 4} class="axis">${fmt(v, 1)}</text>
      </g>`)}
      ${points.length > 1 && html`<path d=${area} fill=${`url(#${gid})`} stroke="none" />`}
      ${points.length > 1 && html`<path d=${d} fill="none" stroke=${color} stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />`}
      ${points.map((p, i) => html`<circle cx=${X(p.t)} cy=${Y(p.v)} r=${i === sel ? 6 : p.pr ? 4.2 : 3} fill=${p.pr || i === sel ? color : 'var(--card)'} stroke=${color} stroke-width="2" />`)}
      ${sel !== null && html`<line x1=${X(points[sel].t)} x2=${X(points[sel].t)} y1=${padT - 6} y2=${height - padB} class="scrub" />`}
      ${xl.map(p => html`<text x=${Math.min(Math.max(X(p.t), padL + 18), W - padR - 18)} y=${height - 6} class="axis" text-anchor="middle">${fmtDate(p.t, false)}</text>`)}
    </svg>
  </div>`;
}

// Bars with rounded tops; tap/scrub to read a value.
export function BarChart({ bars, height = 200, color = 'var(--accent)', unit = '', format = v => fmt(v, 0), title }) {
  const ref = useRef(null);
  const W = useWidth(ref);
  const [sel, setSel] = useState(null);
  const padL = 4, padR = 40, padT = 76, padB = 24;
  const max = Math.max(...bars.map(b => b.v), 0);
  const { hi, ticks } = niceTicks(0, max || 1, 3);
  const n = bars.length;
  const slot = (W - padL - padR) / n;
  const bw = Math.max(4, Math.min(22, slot * 0.58));
  const Y = v => padT + (1 - v / Math.max(1e-9, hi)) * (height - padT - padB);
  const pick = clientX => {
    const r = ref.current.getBoundingClientRect();
    const i = Math.floor((clientX - r.left - padL) / slot);
    setSel(Math.max(0, Math.min(n - 1, i)));
  };
  const shown = sel !== null ? bars[sel] : bars[n - 1];
  const avg = bars.length ? bars.reduce((a, b) => a + b.v, 0) / bars.length : 0;
  return html`<div class="chart" ref=${ref}
      onTouchStart=${e => pick(e.touches[0].clientX)} onTouchMove=${e => pick(e.touches[0].clientX)} onTouchEnd=${() => setTimeout(() => setSel(null), 1400)}
      onPointerMove=${e => { if (e.pointerType === 'mouse') pick(e.clientX); }} onPointerLeave=${() => setSel(null)}>
    <div class="chart-callout">
      <div class="cc-label">${sel !== null ? shown.label : title || 'This week'}</div>
      <div class="cc-value"><b>${format(shown ? shown.v : 0)}</b> <span>${unit}</span></div>
      <div class="cc-sub">${sel !== null ? (shown.sub || '') : `Average ${format(avg)} ${unit}`}</div>
    </div>
    <svg width=${W} height=${height} viewBox=${`0 0 ${W} ${height}`} role="img" aria-label=${title || 'Bar chart'}>
      ${ticks.map(v => html`<g>
        <line x1=${padL} x2=${W - padR + 4} y1=${Y(v)} y2=${Y(v)} class="grid" />
        <text x=${W - padR + 10} y=${Y(v) + 4} class="axis">${v >= 1000 ? fmt(v / 1000, 1) + 'k' : fmt(v, 1)}</text>
      </g>`)}
      ${bars.map((b, i) => {
        const x = padL + slot * i + (slot - bw) / 2;
        const y = Y(b.v), h = Math.max(0, height - padB - y);
        const r = Math.min(bw / 2, 6, h);
        const on = sel === null ? i === n - 1 : i === sel;
        return html`<g>
          ${h > 0 && html`<path d=${`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z`}
            fill=${color} opacity=${on ? 1 : 0.42} />`}
          ${h === 0 && html`<rect x=${x} y=${height - padB - 2} width=${bw} height="2" rx="1" fill=${color} opacity="0.25" />`}
          ${((n - 1 - i) % Math.ceil(n / 5) === 0) && html`<text x=${Math.min(Math.max(x + bw / 2, padL + 16), W - padR - 16)} y=${height - 6} class="axis" text-anchor="middle">${b.short || ''}</text>`}
        </g>`;
      })}
    </svg>
  </div>`;
}

export function Sparkline({ values, width = 64, height = 26, color = 'var(--accent)' }) {
  if (!values || values.length < 2) return html`<svg width=${width} height=${height} aria-hidden="true"></svg>`;
  const min = Math.min(...values), max = Math.max(...values);
  const X = i => 2 + (i / (values.length - 1)) * (width - 4);
  const Y = v => max === min ? height / 2 : 3 + (1 - (v - min) / (max - min)) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  return html`<svg width=${width} height=${height} viewBox=${`0 0 ${width} ${height}`} aria-hidden="true">
    <path d=${d} fill="none" stroke=${color} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx=${X(values.length - 1)} cy=${Y(values[values.length - 1])} r="2.6" fill=${color} />
  </svg>`;
}
