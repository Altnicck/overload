import { html } from '../preact.js';
import { Icon } from '../icons.js';
import { Thumb, haptic, muscleColor } from '../ui.js';
import { push, openSheet, useStore, gymName } from '../store.js';
import { fmt, fmtInt, fmtDate, fmtDuration, relDay, VERDICTS, MODE, workoutVolume, wTime, num, plural } from '../logic.js';

export function VerdictChip({ verdict, size = 'md' }) {
  const v = VERDICTS[verdict] || VERDICTS.maintain;
  return html`<span class=${'verdict verdict-' + size} style=${`--vc:${v.color};--vi:${v.ink}`}>
    <${Icon} name=${verdict === 'dip' ? 'down' : verdict === 'maintain' ? 'equal' : verdict === 'rest' ? 'clock' : verdict === 'baseline' ? 'sparkle' : 'up'} size=${size === 'lg' ? 18 : 14} stroke=${2.6} />
    ${v.label}
  </span>`;
}

export function WorkoutRow({ w, exById, tab }) {
  const { volume, sets } = workoutVolume(w, exById);
  const n = w.entries.filter(e => e.sets.some(s => s.done)).length;
  const prs = w.entries.reduce((a, e) => a + e.sets.filter(s => s.pr).length, 0);
  const dur = w.endedAt && !w.imported ? new Date(w.endedAt) - new Date(w.startedAt) : 0;
  return html`<button type="button" class="row row-tap" onClick=${() => { haptic(); push({ name: 'workoutDetail', id: w.id }, tab); }}>
    <div class="row-ic" style="--ic:var(--ring-w1)"><${Icon} name="dumbbell" size=${20} /></div>
    <div class="row-main">
      <div class="row-title">${w.name || 'Workout'}${prs ? html` <span class="pr-dot" title="PRs"><${Icon} name="trophy" size=${13} stroke=${2.2} /> ${prs}</span>` : ''}</div>
      <div class="row-sub">${plural(n, 'exercise')} · ${plural(sets, 'set')} · ${fmtInt(volume)} kg${dur ? ' · ' + fmtDuration(dur) : ''}${w.imported ? ' · Jefit' : ''}</div>
    </div>
    <div class="row-end"><span class="muted small">${relDay(wTime(w))}</span><${Icon} name="chevR" size=${16} cls="chev" /></div>
  </button>`;
}

export function ExerciseRow({ ex, stat, onClick, end, showGym = true, sub }) {
  const mode = MODE[ex.mode] || MODE.total;
  const best = stat && stat.bestE > 0 ? `${fmt(stat.bestE)} kg` : 'No sets yet';
  return html`<button type="button" class="row row-tap" onClick=${() => { haptic(); onClick(); }}>
    <${Thumb} photoId=${ex.photoId} muscle=${ex.muscle} size=${52} name=${ex.name} />
    <div class="row-main">
      <div class="row-title clamp2">${ex.name}</div>
      <div class="row-sub">${sub || html`${showGym ? html`<span class="gym-tag"><${Icon} name="pin" size=${12} stroke=${2.2} />${gymName(ex.gymId)}</span> · ` : ''}${mode.short ? mode.label.toLowerCase() + ' · ' : ''}${best}`}</div>
    </div>
    <div class="row-end">${end}<${Icon} name="chevR" size=${16} cls="chev" /></div>
  </button>`;
}

export function PRMedal({ p, ex, onClick }) {
  return html`<button type="button" class="medal-card" onClick=${onClick} style=${`--mc:${ex ? muscleColor(ex.muscle) : 'var(--ring-p2)'}`}>
    <div class="medal"><${Icon} name="trophy" size=${26} stroke=${2} /></div>
    <div class="medal-name clamp2">${ex ? ex.name : 'Exercise'}</div>
    <div class="medal-val num">${fmt(p.e)}<small> kg</small></div>
    <div class="medal-sub">${fmt(p.w)} × ${p.r} · ${fmtDate(p.t)}</div>
  </button>`;
}

export function StatTile({ label, value, unit, sub, color }) {
  return html`<div class="stat">
    <div class="stat-label">${label}</div>
    <div class="stat-value num" style=${color ? `color:${color}` : ''}>${value}${unit && html`<small> ${unit}</small>`}</div>
    ${sub && html`<div class="stat-sub">${sub}</div>`}
  </div>`;
}

export function Delta({ d, digits = 0 }) {
  if (d === null || d === undefined || !Number.isFinite(d)) return html`<span class="delta delta-flat">–</span>`;
  const cls = d > 0.0049 ? 'up' : d < -0.0049 ? 'down' : 'flat';
  const v = d * 100;
  return html`<span class=${'delta delta-' + cls}>
    <${Icon} name=${cls === 'up' ? 'up' : cls === 'down' ? 'down' : 'equal'} size=${12} stroke=${2.8} />${Math.abs(v).toFixed(digits)}%
  </span>`;
}

export function setsSummary(sets) {
  return sets.map(s => `${fmt(num(s.w))}×${num(s.r)}`).join('  ·  ');
}

export function useExMap() {
  return useStore(s => s.exercises);
}

export function openExercise(id, tab) { push({ name: 'machine', id }, tab); }
export function openRecap(week) { openSheet('recap', { week }); }
