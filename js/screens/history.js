import { html, useState } from '../preact.js';
import { Icon } from '../icons.js';
import { Screen, Thumb, SheetFrame, GlassButton, haptic, Empty } from '../ui.js';
import { useStore, useIndex, push, pop, openSheet, closeSheet, saveWorkout, deleteWorkout, toast, gymName, getState } from '../store.js';
import { fmt, fmtInt, fmtDate, fmtDuration, fmtTime, workoutVolume, wTime, isDone, num, e1rm, MODE } from '../logic.js';
import { WorkoutRow } from './common.js';
import { confirmSheet } from './sheets.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
    ${imported > 0 && html`<p class="muted lead">${imported} sessions were imported from your Jefit recording. They only include the exercises that were visible in it.</p>`}
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
    <div class="history-list mt">
      ${w.entries.map(en => {
        const ex = exById.get(en.exId);
        const mode = MODE[ex ? ex.mode : 'total'] || MODE.total;
        const done = en.sets.filter(s => s.done);
        const bestE = done.reduce((m, s) => Math.max(m, e1rm(s.w, s.r)), 0);
        return html`<button type="button" key=${en.id || en.exId} class="card card-tap hist-card" onClick=${() => ex && push({ name: 'machine', id: ex.id }, tab)}>
          <div class="hist-ex">
            <${Thumb} photoId=${ex && ex.photoId} muscle=${ex && ex.muscle} size=${40} name=${ex ? ex.name : ''} />
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
          <${Thumb} photoId=${ex && ex.photoId} muscle=${ex && ex.muscle} size=${44} name=${ex ? ex.name : ''} />
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
