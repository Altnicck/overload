import { html } from '../preact.js';
import { Icon } from '../icons.js';
import { Thumb, haptic, muscleColor } from '../ui.js';
import { BodyThumb, BodyMap } from '../body.js';
import { workoutSets, levelsFrom, muscleSets, topRegions } from '../anatomy.js';
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
    <${BodyThumb} levels=${levelsFrom(workoutSets(w, exById))} size=${46} />
    <div class="row-main">
      <div class="row-title">${w.name || 'Workout'}${prs ? html` <span class="pr-dot" title="PRs"><${Icon} name="trophy" size=${13} stroke=${2.2} /> ${prs}</span>` : ''}</div>
      <div class="row-sub">${plural(sets, 'set')} · ${fmtInt(volume)} kg${dur ? ' · ' + fmtDuration(dur) : ''}</div>
    </div>
    <div class="row-end"><span class="muted small">${relDay(wTime(w))}</span><${Icon} name="chevR" size=${16} cls="chev" /></div>
  </button>`;
}

// The muscles one workout trained.
export function WorkedCard({ w, exById }) {
  const work = workoutSets(w, exById);
  const top = topRegions(work, 6);
  if (!top.length) return null;
  return html`<section class="card body-card worked-card" aria-label="Muscles worked">
    <div class="card-head"><h3>Muscles worked</h3><span class="muted small">sets per muscle</span></div>
    <${BodyMap} levels=${levelsFrom(work)} height=${210} />
    <div class="mtags">${top.map(t => html`<span class="mtag" key=${t.id} style=${`--l:${Math.max(0.3, t.sets / top[0].sets).toFixed(2)}`}><i></i>${t.label}<b class="num">${Math.max(1, Math.round(t.sets))}</b></span>`)}</div>
  </section>`;
}

// Heat map of recent training: which muscles got work, brighter = more sets.
export function MusclesCard({ list, exById, days = 7, title = 'Muscles', sub, rows = 5, target = 10, now = new Date() }) {
  const since = now.getTime() - days * 864e5;
  const recent = list.filter(w => wTime(w) >= since);
  const work = muscleSets(recent.flatMap(w => w.entries.map(en => [exById.get(en.exId), en.sets.filter(s => s.done !== false).length])));
  const top = topRegions(work, rows);
  const max = Math.max(target, ...top.map(t => t.sets));
  return html`<section class="card heat-card" aria-label=${title}>
    <div class="card-head"><h3>${title}</h3><span class="muted small">${sub || `Last ${days} days`}</span></div>
    <div class="heat-row">
      <${BodyMap} levels=${levelsFrom(work, { relative: false, target })} height=${rows > 5 ? 214 : 186} />
      <div class="heat-list">
        ${top.length ? top.map(t => html`<div class="heat-item" key=${t.id}>
          <div class="heat-top"><span>${t.label}</span><b class="num">${Math.max(1, Math.round(t.sets))}</b></div>
          <div class="heat-bar"><i style=${`width:${Math.max(6, (t.sets / max) * 100)}%`}></i></div>
        </div>`) : html`<p class="muted small">No sets in the last ${days} days. Your next workout lights this up.</p>`}
        ${top.length > 0 && html`<div class="heat-note">sets per muscle</div>`}
      </div>
    </div>
  </section>`;
}

export function ExerciseRow({ ex, stat, onClick, end, showGym = true, sub }) {
  const mode = MODE[ex.mode] || MODE.total;
  const best = stat && stat.bestE > 0 ? `${fmt(stat.bestE)} kg` : 'No sets yet';
  return html`<button type="button" class="row row-tap" onClick=${() => { haptic(); onClick(); }}>
    <${Thumb} ex=${ex} size=${52} />
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
