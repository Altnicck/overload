import { html, useState } from '../preact.js';
import { Icon } from '../icons.js';
import { Screen, Thumb, SheetFrame, GlassButton, haptic, Empty } from '../ui.js';
import { useStore, useIndex, push, pop, openSheet, closeSheet, saveWorkout, deleteWorkout, toast, gymName, getState } from '../store.js';
import { fmt, fmtInt, fmtDate, fmtDuration, fmtTime, workoutVolume, wTime, isDone, num, e1rm, MODE, ymd, plural } from '../logic.js';
import { WorkoutRow, WorkedCard } from './common.js';
import { confirmSheet } from './sheets.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Month calendar with the days you trained lit. Tap a lit day to open that workout.
function CalendarCard({ list, tab }) {
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const y = month.getFullYear(), m = month.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const byDay = new Map();
  for (const w of list) { const k = ymd(w.startedAt); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(w); }
  const today = ymd(now);
  const inMonth = list.filter(w => { const d = new Date(w.startedAt); return d.getFullYear() === y && d.getMonth() === m; });
  const oldest = list.length ? new Date(list[list.length - 1].startedAt) : now;
  const canBack = y > oldest.getFullYear() || (y === oldest.getFullYear() && m > oldest.getMonth());
  const canFwd = y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth());
  const go = n => { haptic(); setMonth(new Date(y, m + n, 1)); };
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(html`<span key=${'e' + i}></span>`);
  for (let d = 1; d <= days; d++) {
    const k = ymd(new Date(y, m, d));
    const ws = byDay.get(k);
    const cls = 'cal-day' + (k === today ? ' today' : '') + (k > today ? ' future' : '');
    cells.push(ws
      ? html`<button key=${k} type="button" class=${cls + ' on'} onClick=${() => { haptic(); push({ name: 'workoutDetail', id: ws[0].id }, tab); }} aria-label=${`${ws[0].name || 'Workout'}, ${fmtDate(ws[0].startedAt)}`}>${d}${ws.length > 1 ? html`<i>${ws.length}</i>` : ''}</button>`
      : html`<span key=${k} class=${cls}>${d}</span>`);
  }
  return html`<section class="card cal-card" aria-label="Workout calendar">
    <div class="cal-head">
      <button type="button" class="icon-btn" aria-label="Previous month" disabled=${!canBack} onClick=${() => go(-1)}><${Icon} name="back" size=${20} /></button>
      <div class="cal-title"><b>${MONTHS[m]} ${y}</b><span>${plural(inMonth.length, 'workout')}</span></div>
      <button type="button" class="icon-btn" aria-label="Next month" disabled=${!canFwd} onClick=${() => go(1)}><${Icon} name="chevR" size=${20} /></button>
    </div>
    <div class="cal-grid">
      ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => html`<span key=${'h' + i} class="cal-dow">${d}</span>`)}
      ${cells}
    </div>
  </section>`;
}

export function HistoryScreen({ tab }) {
  const { workouts, exercises } = useStore(s => ({ workouts: s.workouts, exercises: s.exercises }));
  const exById = new Map(exercises.map(e => [e.id, e]));
  const list = workouts.filter(isDone).sort((a, b) => wTime(b) - wTime(a));
  const groups = [];
  for (const w of list) {
    const d = new Date(w.startedAt);
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(w);
  }
  const imported = list.filter(w => w.imported).length;
  return html`<${Screen} title="History" pushed tab=${tab}>
    ${list.length > 0 && html`<${CalendarCard} list=${list} tab=${tab} />`}
    ${imported > 0 && html`<p class="list-hint">Includes ${imported} sessions imported from Jefit, with the exercises visible in your recording.</p>`}
    ${groups.map(g => html`<div key=${g.label}>
      <div class="group-label">${g.label} <span class="muted">${g.items.length}</span></div>
      <div class="list">${g.items.map(w => html`<${WorkoutRow} key=${w.id} w=${w} exById=${exById} tab=${tab} />`)}</div>
    </div>`)}
    ${!list.length && html`<div class="card"><${Empty} icon="history" title="No workouts yet" text="Finished workouts show up here." /></div>`}
    <div class="bottom-space"></div>
  <//>`;
}

export function WorkoutDetailScreen({ id, tab }) {
  const { w, exercises } = useStore(s => ({ w: s.workouts.find(x => x.id === id), exercises: s.exercises }));
  const index = useIndex();
  if (!w) return html`<${Screen} title="Workout" pushed tab=${tab}><div class="card"><${Empty} title="Workout deleted" /></div><//>`;
  const exById = new Map(exercises.map(e => [e.id, e]));
  const { volume, sets } = workoutVolume(w, exById);
  const prs = index.prEvents.filter(p => p.wid === w.id);
  const prEx = new Set(prs.map(p => p.exId));
  const dur = w.endedAt && !w.imported ? new Date(w.endedAt) - new Date(w.startedAt) : 0;
  const menu = () => openSheet('actions', {
    title: w.name, actions: [
      { label: 'Edit sets', icon: 'pencil', onSelect: () => openSheet('workoutEdit', { id: w.id }) },
      { label: 'Delete workout', icon: 'trash', destructive: true, onSelect: () => confirmSheet({ title: 'Delete this workout?', message: 'Its sets will be removed from your history and records.', onConfirm: () => { deleteWorkout(w.id); pop(tab); toast('Workout deleted'); } }) },
    ],
  });
  return html`<${Screen} title=${w.name || 'Workout'} pushed tab=${tab} right=${html`<${GlassButton} icon="dots" title="Workout options" onClick=${menu} />`}>
    <p class="muted lead">${fmtDate(w.startedAt, true)}${!w.imported ? ' · ' + fmtTime(w.startedAt) : ''} · ${gymName(w.gymId)}${w.imported ? ' · imported from Jefit' : ''}</p>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Volume</div><div class="stat-value num">${fmtInt(volume)}<small> kg</small></div></div>
      <div class="stat"><div class="stat-label">Sets</div><div class="stat-value num">${sets}</div></div>
      <div class="stat"><div class="stat-label">Duration</div><div class="stat-value num">${dur ? fmtDuration(dur) : '–'}</div></div>
      <div class="stat"><div class="stat-label">PRs</div><div class="stat-value num" style=${prs.length ? 'color:var(--ring-p2)' : ''}>${prs.length}</div></div>
    </div>
    <${WorkedCard} w=${w} exById=${exById} />
    <div class="history-list mt">
      ${w.entries.map(en => {
        const ex = exById.get(en.exId);
        const mode = MODE[ex ? ex.mode : 'total'] || MODE.total;
        const done = en.sets.filter(s => s.done);
        const bestE = done.reduce((m, s) => Math.max(m, e1rm(s.w, s.r)), 0);
        return html`<button type="button" key=${en.id || en.exId} class="card card-tap hist-card" onClick=${() => ex && push({ name: 'machine', id: ex.id }, tab)}>
          <div class="hist-ex">
            <${Thumb} ex=${ex} size=${40} />
            <div class="row-main"><div class="row-title clamp2">${ex ? ex.name : 'Deleted exercise'}</div>
              <div class="row-sub">${done.length} sets${mode.short ? ' · ' + mode.label.toLowerCase() : ''}</div></div>
            ${prEx.has(en.exId) && html`<span class="pr-pill"><${Icon} name="trophy" size=${12} stroke=${2.4} /> PR</span>`}
          </div>
          <div class="hist-sets">
            ${done.map((s, i) => { const e = e1rm(s.w, s.r); return html`<div class=${'hist-row ' + (e === bestE ? 'is-best' : '')}><span>${i + 1}</span><span class="num">${fmt(num(s.w))} kg × ${num(s.r)}</span><span class="num">${fmt(e)}</span></div>`; })}
          </div>
        </button>`;
      })}
    </div>
    <div class="bottom-space"></div>
  <//>`;
}

export function WorkoutEditSheet({ sheetKey, id }) {
  const w0 = getState().workouts.find(x => x.id === id);
  const [w, setW] = useState(() => w0 ? { ...w0, entries: w0.entries.map(en => ({ ...en, sets: en.sets.map(s => ({ ...s, w: String(s.w), r: String(s.r) })) })) } : null);
  const exercises = useStore(s => s.exercises);
  if (!w) return null;
  const exById = new Map(exercises.map(e => [e.id, e]));
  const setSet = (ei, si, patch) => setW(x => ({ ...x, entries: x.entries.map((en, i) => (i !== ei ? en : { ...en, sets: en.sets.map((s, j) => (j !== si ? s : { ...s, ...patch })) })) }));
  const removeSet = (ei, si) => setW(x => ({ ...x, entries: x.entries.map((en, i) => (i !== ei ? en : { ...en, sets: en.sets.filter((_, j) => j !== si) })) }));
  const addSet = ei => setW(x => ({ ...x, entries: x.entries.map((en, i) => (i !== ei ? en : { ...en, sets: [...en.sets, { w: en.sets.length ? en.sets[en.sets.length - 1].w : '', r: en.sets.length ? en.sets[en.sets.length - 1].r : '', done: true }] })) }));
  const removeEntry = ei => setW(x => ({ ...x, entries: x.entries.filter((_, i) => i !== ei) }));
  const save = () => {
    const entries = w.entries.map(en => ({ ...en, sets: en.sets.filter(s => num(s.r) > 0 && !Number.isNaN(num(s.w))).map(s => ({ ...s, w: num(s.w), r: num(s.r), done: true })) })).filter(en => en.sets.length);
    if (!entries.length) { toast('A workout needs at least one set'); return; }
    saveWorkout({ ...w, entries });
    haptic('success');
    closeSheet(sheetKey);
    toast('Workout updated');
  };
  return html`<${SheetFrame} sheetKey=${sheetKey} title="Edit Workout" full right=${html`<button type="button" class="btn btn-accent btn-sm" onClick=${save}>Save</button>`}>
    <div class="form">
      <label class="field"><span class="field-label">Name</span>
        <input id="edit-workout-name" class="input" type="text" value=${w.name} onInput=${e => { const v = e.currentTarget.value; setW(x => ({ ...x, name: v })); }} /></label>
    </div>
    ${w.entries.map((en, ei) => {
      const ex = exById.get(en.exId);
      return html`<section class="card ex-block" key=${en.id || ei}>
        <div class="ex-head">
          <${Thumb} ex=${ex} size=${44} />
          <div class="ex-title"><h3 class="clamp2">${ex ? ex.name : 'Deleted exercise'}</h3></div>
          <button type="button" class="icon-btn danger" aria-label="Remove exercise" onClick=${() => removeEntry(ei)}><${Icon} name="trash" size=${19} /></button>
        </div>
        <div class="set-head set-head-edit" aria-hidden="true"><span>Set</span><span>kg</span><span>Reps</span><span></span></div>
        ${en.sets.map((s, si) => html`<div class="set-row set-row-edit" key=${si}>
          <span class="set-no">${si + 1}</span>
          <input class="set-in" type="text" inputmode="decimal" aria-label=${`Set ${si + 1} kg`} value=${s.w} onInput=${e => setSet(ei, si, { w: e.currentTarget.value })} />
          <input class="set-in" type="text" inputmode="numeric" aria-label=${`Set ${si + 1} reps`} value=${s.r} onInput=${e => setSet(ei, si, { r: e.currentTarget.value })} />
          <button type="button" class="icon-btn danger" aria-label="Delete set" onClick=${() => removeSet(ei, si)}><${Icon} name="minus" size=${18} stroke=${2.6} /></button>
        </div>`)}
        <div class="ex-foot"><button type="button" class="btn btn-glass btn-sm" onClick=${() => addSet(ei)}><${Icon} name="plus" size=${15} stroke=${2.6} /> Add Set</button></div>
      </section>`;
    })}
    <div class="bottom-space-sm"></div>
  <//>`;
}
