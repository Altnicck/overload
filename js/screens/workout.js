import { html, useState } from '../preact.js';
import { Icon } from '../icons.js';
import { Screen, Section, Thumb, GlassButton, SheetFrame, Stepper, haptic, Empty } from '../ui.js';
import { useStore, useIndex, startWorkout, setUI, push, pop, openSheet, closeSheet, saveRoutine, deleteRoutine, getState, toast, gymName } from '../store.js';
import { fmt, relDay, routineLastDone, upNext, fmtClock } from '../logic.js';

function repsText(reps) {
  if (!reps || !reps.length) return '';
  const allSame = reps.every(r => r === reps[0]);
  return `${reps.length} × ${allSame ? reps[0] : reps.join(', ')}`;
}

export function WorkoutScreen() {
  const { routines, workouts, exercises, active } = useStore(s => ({ routines: s.routines, workouts: s.workouts, exercises: s.exercises, active: s.active }));
  const exById = new Map(exercises.map(e => [e.id, e]));
  const next = upNext(routines, workouts);
  return html`<${Screen} title="Workout" tab="workout"
      right=${html`<${GlassButton} icon="plus" title="New routine" onClick=${() => { haptic(); openSheet('routineEditor', {}); }} />`}>
    ${active ? html`<button type="button" class="card card-tap resume-card" onClick=${() => { haptic(); setUI({ workoutOpen: true }); }}>
        <div class="pulse-dot" aria-hidden="true"></div>
        <div class="row-main">
          <div class="eyebrow tint">In progress · ${fmtClock(Date.now() - new Date(active.startedAt))}</div>
          <div class="resume-title">${active.name}</div>
        </div>
        <span class="btn btn-accent btn-sm">Resume</span>
      </button>`
    : html`<div class="start-grid">
        <button type="button" class="glass start-big" onClick=${() => { haptic('success'); startWorkout({}); }}>
          <span class="start-big-ic"><${Icon} name="plus" size=${24} stroke=${2.6} /></span>
          <span><b>Empty Workout</b><small>Pick machines as you go</small></span>
        </button>
      </div>`}

    <${Section} title="Routines" action="New" onAction=${() => openSheet('routineEditor', {})}>
      ${routines.length ? html`<div class="routine-list">
        ${routines.map(r => {
          const last = routineLastDone(r.id, workouts);
          const items = (r.items || []).filter(i => exById.has(i.exId));
          return html`<div key=${r.id} class=${'card routine-card ' + (next && next.id === r.id ? 'is-next' : '')}>
            <button type="button" class="routine-open" onClick=${() => { haptic(); push({ name: 'routine', id: r.id }, 'workout'); }}>
              <div class="routine-top">
                <div>
                  ${next && next.id === r.id && html`<div class="eyebrow tint">Up next</div>`}
                  <div class="routine-name">${r.name}</div>
                  <div class="muted small">${items.length} exercises · ${last ? relDay(last) : 'Not done yet'}</div>
                </div>
              </div>
              <div class="routine-thumbs">
                ${items.slice(0, 6).map(i => { const ex = exById.get(i.exId); return html`<${Thumb} key=${i.exId} photoId=${ex.photoId} muscle=${ex.muscle} size=${34} name=${ex.name} />`; })}
                ${items.length > 6 && html`<span class="more-count">+${items.length - 6}</span>`}
              </div>
            </button>
            <button type="button" class="routine-play" aria-label=${'Start ' + r.name} onClick=${() => { haptic('success'); startWorkout({ routine: r }); }}>
              <${Icon} name="play" size=${18} fill />
            </button>
          </div>`;
        })}
      </div>` : html`<div class="card"><${Empty} icon="list" title="No routines yet" text="Group the machines you always do together, like Push or Legs." action="New routine" onAction=${() => openSheet('routineEditor', {})} /></div>`}
    <//>

    <${Section}>
      <div class="list">
        <button type="button" class="row row-tap" onClick=${() => push({ name: 'history' }, 'workout')}>
          <div class="row-ic" style="--ic:#64d2ff"><${Icon} name="history" size=${20} /></div>
          <div class="row-main"><div class="row-title">Workout History</div><div class="row-sub">${workouts.filter(w => w.endedAt || w.imported).length} sessions logged</div></div>
          <div class="row-end"><${Icon} name="chevR" size=${16} cls="chev" /></div>
        </button>
      </div>
    <//>
    <div class="bottom-space"></div>
  <//>`;
}

export function RoutineScreen({ id, tab }) {
  const { routine, exercises, workouts } = useStore(s => ({ routine: s.routines.find(r => r.id === id), exercises: s.exercises, workouts: s.workouts }));
  const index = useIndex();
  if (!routine) return html`<${Screen} title="Routine" pushed tab=${tab}><div class="card"><${Empty} title="Routine deleted" /></div><//>`;
  const exById = new Map(exercises.map(e => [e.id, e]));
  const items = (routine.items || []).filter(i => exById.has(i.exId));
  const last = routineLastDone(routine.id, workouts);
  return html`<${Screen} title=${routine.name} pushed tab=${tab}
      right=${html`<${GlassButton} icon="pencil" title="Edit routine" onClick=${() => openSheet('routineEditor', { id })} />`}>
    <p class="muted lead">${items.length} exercises · ${last ? 'Last done ' + relDay(last).toLowerCase() : 'Not done yet'}${routine.gymId ? ' · ' + gymName(routine.gymId) : ''}</p>
    <button type="button" class="btn btn-accent btn-block btn-lg" onClick=${() => { haptic('success'); startWorkout({ routine }); }}>
      <${Icon} name="play" size=${18} fill /> Start ${routine.name}
    </button>
    <div class="list mt">
      ${items.map((it, i) => {
        const ex = exById.get(it.exId);
        const st = index.stats.get(ex.id);
        return html`<button key=${it.exId + i} type="button" class="row row-tap" onClick=${() => push({ name: 'machine', id: ex.id }, tab)}>
          <${Thumb} photoId=${ex.photoId} muscle=${ex.muscle} size=${52} name=${ex.name} />
          <div class="row-main">
            <div class="row-title clamp2">${ex.name}</div>
            <div class="row-sub">${repsText(it.reps) || 'Sets as last time'}${st && st.bestE ? ` · best ${fmt(st.bestE)} kg` : ''}</div>
          </div>
          <div class="row-end"><${Icon} name="chevR" size=${16} cls="chev" /></div>
        </button>`;
      })}
    </div>
    <div class="bottom-space"></div>
  <//>`;
}

export function RoutineEditorSheet({ sheetKey, id }) {
  const s0 = getState();
  const existing = id ? s0.routines.find(r => r.id === id) : null;
  const [name, setName] = useState(existing ? existing.name : '');
  const [items, setItems] = useState(existing ? (existing.items || []).map(i => ({ ...i, reps: [...(i.reps || [])] })) : []);
  const [confirmDel, setConfirmDel] = useState(false);
  const exercises = useStore(s => s.exercises);
  const exById = new Map(exercises.map(e => [e.id, e]));
  const save = () => {
    if (!name.trim()) { toast('Give the routine a name'); return; }
    saveRoutine({ ...(existing || {}), name: name.trim(), items: items.filter(i => exById.has(i.exId)) });
    haptic('success');
    closeSheet(sheetKey);
  };
  const setSets = (i, n) => setItems(items.map((it, j) => {
    if (j !== i) return it;
    const reps = [...(it.reps || [])];
    while (reps.length < n) reps.push(reps[reps.length - 1] || 12);
    return { ...it, reps: reps.slice(0, n) };
  }));
  const setRepsText = (i, txt) => setItems(items.map((it, j) => {
    if (j !== i) return it;
    const nums = txt.split(/[ ,/]+/).map(x => parseInt(x, 10)).filter(x => x > 0);
    return { ...it, reps: nums.length ? nums : it.reps, _txt: txt };
  }));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; const c = [...items]; [c[i], c[j]] = [c[j], c[i]]; setItems(c); haptic(); };
  const add = () => openSheet('picker', {
    title: 'Add to Routine', multi: true,
    onPick: exId => setItems(cur => [...cur, { exId, reps: [12, 12] }]),
  });
  return html`<${SheetFrame} sheetKey=${sheetKey} title=${existing ? 'Edit Routine' : 'New Routine'}
      right=${html`<button type="button" class="btn btn-accent btn-sm" onClick=${save}>Save</button>`}>
    <div class="form">
      <label class="field">
        <span class="field-label">Name</span>
        <input id="routine-name" class="input" type="text" placeholder="e.g. Push, Legs, Spate Gros" value=${name} onInput=${e => setName(e.currentTarget.value)} autocomplete="off" />
      </label>
      <div class="field-label mt">Exercises</div>
      <div class="list">
        ${items.map((it, i) => {
          const ex = exById.get(it.exId);
          if (!ex) return null;
          return html`<div class="row edit-row" key=${it.exId + '-' + i}>
            <${Thumb} photoId=${ex.photoId} muscle=${ex.muscle} size=${40} name=${ex.name} />
            <div class="row-main">
              <div class="row-title clamp2">${ex.name}</div>
              <div class="edit-controls">
                <${Stepper} value=${(it.reps || []).length || 1} min=${1} max=${10} onChange=${n => setSets(i, n)} />
                <input class="input input-sm" type="text" inputmode="numeric" aria-label="Target reps" value=${it._txt ?? (it.reps || []).join(', ')}
                  onInput=${e => setRepsText(i, e.currentTarget.value)} placeholder="12, 10" />
                <button type="button" class="icon-btn icon-btn-sm danger" aria-label="Remove" onClick=${() => { haptic(); setItems(items.filter((_, j) => j !== i)); }}><${Icon} name="trash" size=${18} /></button>
              </div>
            </div>
            <div class="edit-actions">
              <button type="button" class="icon-btn icon-btn-sm" aria-label="Move up" onClick=${() => move(i, -1)} disabled=${i === 0}><${Icon} name="chevU" size=${18} /></button>
              <button type="button" class="icon-btn icon-btn-sm" aria-label="Move down" onClick=${() => move(i, 1)} disabled=${i === items.length - 1}><${Icon} name="chevD" size=${18} /></button>
            </div>
          </div>`;
        })}
        <button type="button" class="row row-tap add-row" onClick=${add}>
          <div class="row-ic" style="--ic:var(--accent)"><${Icon} name="plus" size=${20} stroke=${2.4} /></div>
          <div class="row-main"><div class="row-title tint">Add exercise</div></div>
        </button>
      </div>
      ${existing && html`<div class="mt-lg">
        ${confirmDel ? html`<div class="confirm-box">
            <p>Delete "${existing.name}"? Your logged workouts stay.</p>
            <div class="btn-row">
              <button type="button" class="btn btn-glass" onClick=${() => setConfirmDel(false)}>Cancel</button>
              <button type="button" class="btn btn-danger" onClick=${() => { deleteRoutine(existing.id); closeSheet(sheetKey); const st = getState().ui.stacks.workout; if (st.length && st[st.length - 1].id === existing.id) pop('workout'); toast('Routine deleted'); }}>Delete</button>
            </div>
          </div>`
        : html`<button type="button" class="btn btn-block btn-danger-text" onClick=${() => setConfirmDel(true)}>Delete Routine</button>`}
      </div>`}
    </div>
  <//>`;
}
