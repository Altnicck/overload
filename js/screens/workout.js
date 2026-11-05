import { html, useState, useRef, useEffect } from '../preact.js';
import { Icon } from '../icons.js';
import { Screen, Section, Thumb, GlassButton, SheetFrame, Stepper, haptic, Empty, useReorder, moveItem } from '../ui.js';
import { useStore, useIndex, startWorkout, setUI, push, pop, openSheet, closeSheet, saveRoutine, deleteRoutine, moveRoutine, getState, toast, gymName } from '../store.js';
import { fmt, relDay, routineLastDone, upNext, fmtClock, plural, startOfDay } from '../logic.js';
import { BodyThumb, BodyMap } from '../body.js';
import { routineSets, levelsFrom, topRegions } from '../anatomy.js';

function repsText(reps) {
  if (!reps || !reps.length) return '';
  const allSame = reps.every(r => r === reps[0]);
  return `${reps.length} × ${allSame ? reps[0] : reps.join(', ')}`;
}

export function WorkoutScreen() {
  const { routines, workouts, exercises, active } = useStore(s => ({ routines: s.routines, workouts: s.workouts, exercises: s.exercises, active: s.active }));
  const exById = new Map(exercises.map(e => [e.id, e]));
  const next = upNext(routines, workouts);
  const listRef = useRef(null);
  useReorder(listRef, { onMove: moveRoutine, enabled: routines.length > 1 });
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
      ${routines.length ? html`<div class="routine-list" ref=${listRef}>
        ${routines.map((r, ri) => {
          const last = routineLastDone(r.id, workouts);
          const items = (r.items || []).filter(i => exById.has(i.exId));
          const isNext = next && next.id === r.id;
          const sets = items.reduce((a, i) => a + ((i.reps && i.reps.length) || 3), 0);
          return html`<div key=${r.id} class=${'card routine-card ' + (isNext ? 'is-next' : '')} data-ri=${ri}>
            <button type="button" class="routine-open" onClick=${() => { haptic(); push({ name: 'routine', id: r.id }, 'workout'); }}>
              <${BodyThumb} levels=${levelsFrom(routineSets({ items }, exById))} width=${82} height=${92} radius=${18} cls="routine-art" />
              <div class="routine-info">
                ${isNext && html`<div class="eyebrow tint">Up next</div>`}
                <div class="routine-name">${r.name}</div>
                <div class="routine-meta">${plural(items.length, 'exercise')} · ${sets} sets</div>
                <div class="routine-when"><${Icon} name="clock" size=${13} stroke=${2.2} />${last ? relDay(last) : 'Not done yet'}</div>
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

// "3 days" / "ago" for the small stat tiles.
function since(t) {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(t))) / 864e5);
  if (days <= 0) return ['Today', 'last done'];
  if (days === 1) return ['1 day', 'ago'];
  if (days < 14) return [`${days} days`, 'ago'];
  if (days < 61) return [`${Math.round(days / 7)} weeks`, 'ago'];
  return [`${Math.round(days / 30.4)} months`, 'ago'];
}

// The same exercise can appear twice in a routine, so rows are keyed by exercise plus which occurrence it is.
function itemKeys(items) {
  const seen = new Map();
  return items.map(it => { const n = seen.get(it.exId) || 0; seen.set(it.exId, n + 1); return it.exId + '#' + n; });
}

export function RoutineScreen({ id, tab }) {
  const { routine, exercises, workouts } = useStore(s => ({ routine: s.routines.find(r => r.id === id), exercises: s.exercises, workouts: s.workouts }));
  const index = useIndex();
  const listRef = useRef(null);
  // Hold an exercise and drag it: the new order is saved straight away.
  useReorder(listRef, {
    onMove: (from, to) => {
      const r = getState().routines.find(x => x.id === id);
      if (!r) return;
      const known = new Set(getState().exercises.map(e => e.id));
      const shown = (r.items || []).filter(i => known.has(i.exId));
      const rest = (r.items || []).filter(i => !known.has(i.exId));
      saveRoutine({ ...r, items: [...moveItem(shown, from, to), ...rest] });
    },
  });
  if (!routine) return html`<${Screen} title="Routine" pushed tab=${tab}><div class="card"><${Empty} title="Routine deleted" /></div><//>`;
  const exById = new Map(exercises.map(e => [e.id, e]));
  const items = (routine.items || []).filter(i => exById.has(i.exId));
  const keys = itemKeys(items);
  const last = routineLastDone(routine.id, workouts);
  const work = routineSets({ items }, exById);
  const top = topRegions(work, 6);
  const sets = items.reduce((a, i) => a + ((i.reps && i.reps.length) || 3), 0);
  return html`<${Screen} title=${routine.name} pushed tab=${tab}
      right=${html`<${GlassButton} icon="pencil" title="Edit routine" onClick=${() => openSheet('routineEditor', { id })} />`}>
    <section class="card body-card" aria-label="Muscles this routine trains">
      <${BodyMap} levels=${levelsFrom(work)} height=${232} captions />
      ${top.length > 0 && html`<div class="mtags">${top.map(t => html`<span class="mtag" key=${t.id} style=${`--l:${Math.max(0.3, t.sets / top[0].sets).toFixed(2)}`}><i></i>${t.label}<b class="num">${Math.max(1, Math.round(t.sets))}</b></span>`)}</div>`}
    </section>
    <div class="mini-stats">
      <div class="mini-stat"><${Icon} name="dumbbell" size=${18} /><b class="num">${items.length}</b><span>${items.length === 1 ? 'exercise' : 'exercises'}</span></div>
      <div class="mini-stat"><${Icon} name="list" size=${18} /><b class="num">${sets}</b><span>sets</span></div>
      <div class="mini-stat"><${Icon} name="clock" size=${18} /><b>${last ? since(last)[0] : 'New'}</b><span>${last ? since(last)[1] : 'not done yet'}</span></div>
    </div>
    ${routine.gymId && html`<p class="muted small gym-line"><${Icon} name="pin" size=${13} stroke=${2.2} /> ${gymName(routine.gymId)}</p>`}
    <button type="button" class="btn btn-accent btn-block btn-lg" onClick=${() => { haptic('success'); startWorkout({ routine }); }}>
      <${Icon} name="play" size=${18} fill /> Start ${routine.name}
    </button>
    <div class="list mt" ref=${listRef}>
      ${items.map((it, i) => {
        const ex = exById.get(it.exId);
        const st = index.stats.get(ex.id);
        return html`<button key=${keys[i]} type="button" class="row row-tap" data-ri=${i} onClick=${() => push({ name: 'machine', id: ex.id }, tab)}>
          <${Thumb} ex=${ex} size=${52} />
          <div class="row-main">
            <div class="row-title clamp2">${ex.name}</div>
            <div class="row-sub">${repsText(it.reps) || 'Sets as last time'}${st && st.bestE ? ` · best ${fmt(st.bestE)} kg` : ''}</div>
          </div>
          <div class="row-end"><${Icon} name="chevR" size=${16} cls="chev" /></div>
        </button>`;
      })}
    </div>
    ${items.length > 1 && html`<p class="list-hint">Hold an exercise and drag it to change the order.</p>`}
    <div class="bottom-space"></div>
  <//>`;
}

let rowSeq = 0;
const withKey = it => ({ ...it, _k: 'k' + (++rowSeq) });

export function RoutineEditorSheet({ sheetKey, id }) {
  const s0 = getState();
  const existing = id ? s0.routines.find(r => r.id === id) : null;
  const [name, setName] = useState(existing ? existing.name : '');
  const [items, setItems] = useState(existing ? (existing.items || []).map(i => withKey({ ...i, reps: [...(i.reps || [])] })) : []);
  const [confirmDel, setConfirmDel] = useState(false);
  const exercises = useStore(s => s.exercises);
  const exById = new Map(exercises.map(e => [e.id, e]));
  const listRef = useRef(null);
  useReorder(listRef, { onMove: (from, to) => setItems(cur => moveItem(cur, from, to)) });
  // An "Undo" offer belongs to this sheet; drop it when the sheet goes away.
  useEffect(() => () => { const t = getState().ui.toast; if (t && t.scope === sheetKey) setUI({ toast: null }); }, []);
  const save = () => {
    if (!name.trim()) { toast('Give the routine a name'); return; }
    saveRoutine({ ...(existing || {}), name: name.trim(), items: items.filter(i => exById.has(i.exId)).map(({ _k, _txt, ...it }) => it) });
    haptic('success');
    closeSheet(sheetKey);
  };
  const edit = (k, fn) => setItems(cur => cur.map(it => (it._k === k ? fn(it) : it)));
  const setSets = (k, n) => edit(k, it => {
    const reps = [...(it.reps || [])];
    while (reps.length < n) reps.push(reps[reps.length - 1] || 12);
    return { ...it, reps: reps.slice(0, n) };
  });
  const setRepsText = (k, txt) => edit(k, it => {
    const nums = txt.split(/[ ,/]+/).map(x => parseInt(x, 10)).filter(x => x > 0);
    return { ...it, reps: nums.length ? nums : it.reps, _txt: txt };
  });
  const remove = it => {
    haptic();
    const at = items.indexOf(it);
    setItems(cur => cur.filter(x => x !== it));
    const ex = exById.get(it.exId);
    toast(`Removed ${ex ? ex.name : 'exercise'}`, {
      action: 'Undo', ms: 5000, scope: sheetKey,
      onAction: () => { haptic(); setItems(cur => (cur.includes(it) ? cur : [...cur.slice(0, at), it, ...cur.slice(at)])); },
    });
  };
  const add = () => openSheet('picker', {
    title: 'Add to Routine', multi: true,
    onPick: exId => setItems(cur => [...cur, withKey({ exId, reps: [12, 12] })]),
  });
  return html`<${SheetFrame} sheetKey=${sheetKey} title=${existing ? 'Edit Routine' : 'New Routine'}
      right=${html`<button type="button" class="btn btn-accent btn-sm" onClick=${save}>Save</button>`}>
    <div class="form">
      <label class="field">
        <span class="field-label">Name</span>
        <input id="routine-name" class="input" type="text" placeholder="e.g. Push, Legs, Spate Gros" value=${name} onInput=${e => setName(e.currentTarget.value)} autocomplete="off" />
      </label>
      <div class="field-label mt">Exercises</div>
      <div class="list" ref=${listRef}>
        ${items.map((it, i) => {
          const ex = exById.get(it.exId);
          if (!ex) return null;
          return html`<div class="row edit-row" key=${it._k} data-ri=${i}>
            <${Thumb} ex=${ex} size=${40} />
            <div class="row-main">
              <div class="row-title clamp2">${ex.name}</div>
              <div class="edit-controls">
                <${Stepper} value=${(it.reps || []).length || 1} min=${1} max=${10} onChange=${n => setSets(it._k, n)} />
                <input class="input input-sm" type="text" inputmode="numeric" aria-label="Target reps" value=${it._txt ?? (it.reps || []).join(', ')}
                  onInput=${e => setRepsText(it._k, e.currentTarget.value)} placeholder="12, 10" />
                <button type="button" class="icon-btn icon-btn-sm danger" aria-label="Remove" onClick=${() => remove(it)}><${Icon} name="trash" size=${18} /></button>
              </div>
            </div>
            <span class="reorder-grip" aria-hidden="true"><${Icon} name="grip" size=${22} stroke=${1.8} /></span>
          </div>`;
        })}
        <button type="button" class="row row-tap add-row" onClick=${add}>
          <div class="row-ic" style="--ic:var(--accent)"><${Icon} name="plus" size=${20} stroke=${2.4} /></div>
          <div class="row-main"><div class="row-title tint">Add exercise</div></div>
        </button>
      </div>
      ${items.length > 1 && html`<p class="list-hint">Hold an exercise, or drag its handle, to change the order.</p>`}
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
