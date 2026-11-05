import { html, useState, useEffect, useRef } from '../preact.js';
import { Icon } from '../icons.js';
import { Thumb, GlassButton, SheetFrame, haptic, chime, useReorder, moveItem } from '../ui.js';
import {
  useStore, useIndex, getState, setUI, updateActive, newEntry, checkSetPR, finishActive, discardActive,
  openSheet, closeSheet, banner, toast, saveExercise, gymName, getIndex, updateSettings, push, flushActive,
} from '../store.js';
import { fmt, fmtInt, fmtClock, fmtDate, fmtDuration, lastSession, num, e1rm, MODE, workoutVolume, wTime, lifetimeCount, fmtTime, ymd } from '../logic.js';
import { confirmSheet, promptSheet } from './sheets.js';
import { Delta } from './common.js';

function Timer({ since }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  return html`<span class="num">${fmtClock(Date.now() - new Date(since).getTime())}</span>`;
}

function placeholderFor(entry, si, last) {
  const ls = last && (last.sets[si] || last.sets[last.sets.length - 1]);
  let w = ls ? String(ls.w) : '';
  let r = ls ? String(ls.r) : (entry.target && entry.target[si] ? String(entry.target[si]) : '');
  if (!w && si > 0) { const p = entry.sets[si - 1]; if (p && p.w !== '') w = String(p.w); }
  if (!r && si > 0) { const p = entry.sets[si - 1]; if (p && p.r !== '') r = String(p.r); }
  return { w, r };
}

function toggleSet(ei, si, last) {
  const a = getState().active;
  if (!a) return;
  const en = a.entries[ei];
  const s = en.sets[si];
  if (s.done) {
    haptic();
    updateActive(x => setSet(x, ei, si, { done: false, pr: false }));
    return;
  }
  const ph = placeholderFor(en, si, last);
  const w = s.w !== '' && s.w != null ? String(s.w) : ph.w;
  const r = s.r !== '' && s.r != null ? String(s.r) : ph.r;
  if (w === '' || r === '' || Number.isNaN(num(w)) || !(num(r) > 0)) {
    haptic();
    toast(w === '' || Number.isNaN(num(w)) ? 'Enter the kg first' : 'Enter the reps first');
    const row = document.querySelector(`[data-set="${ei}-${si}"]`);
    if (row) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); row.querySelector(w === '' ? '.in-w' : '.in-r')?.focus(); }
    return;
  }
  let next = setSet(a, ei, si, { w, r, done: true, pr: false });
  const pr = checkSetPR(next, ei, si);
  if (pr) {
    next = setSet(next, ei, si, { pr: true });
    // clear older PR flags on this exercise in this workout (only the latest best counts)
    next = { ...next, entries: next.entries.map((en2, i) => (en2.exId !== en.exId ? en2 : { ...en2, sets: en2.sets.map((s2, j) => (i === ei && j === si ? s2 : { ...s2, pr: false })) })) };
    const ex = getState().exercises.find(e => e.id === en.exId);
    banner({
      kind: 'pr', exId: en.exId, title: 'New PR', exName: ex ? ex.name : 'Exercise',
      text: `${fmt(pr.w)} kg × ${pr.r}`, e: pr.e, gain: pr.e - pr.prev, prev: pr.prev,
    });
    haptic('success');
    chime();
  } else haptic();
  updateActive(() => next);
}

// A ticked set whose numbers were corrected afterwards: re-run the PR check once the edit is committed.
function recheckDoneSet(ei, si) {
  const a = getState().active;
  if (!a) return;
  const en = a.entries[ei];
  const s = en && en.sets[si];
  if (!s || !s.done) return;
  if (Number.isNaN(num(s.w)) || !(num(s.r) > 0)) { updateActive(x => setSet(x, ei, si, { done: false, pr: false })); return; }
  const pr = checkSetPR(a, ei, si);
  if (!!pr === !!s.pr) return;
  let next = setSet(a, ei, si, { pr: !!pr });
  if (pr) {
    next = { ...next, entries: next.entries.map((en2, i) => (en2.exId !== en.exId ? en2 : { ...en2, sets: en2.sets.map((s2, j) => (i === ei && j === si ? s2 : { ...s2, pr: false })) })) };
    const ex = getState().exercises.find(e => e.id === en.exId);
    banner({ kind: 'pr', exId: en.exId, title: 'New PR', exName: ex ? ex.name : 'Exercise', text: `${fmt(pr.w)} kg × ${pr.r}`, e: pr.e, gain: pr.e - pr.prev, prev: pr.prev });
    haptic('success');
    chime();
  }
  updateActive(() => next);
}

function setSet(a, ei, si, patch) {
  return { ...a, entries: a.entries.map((en, i) => (i !== ei ? en : { ...en, sets: en.sets.map((s, j) => (j !== si ? s : { ...s, ...patch })) })) };
}

function SetRow({ en, ei, s, si, last, mode }) {
  const ph = placeholderFor(en, si, last);
  const prev = last && last.sets[si];
  const onW = e => { const v = e.currentTarget.value; updateActive(a => setSet(a, ei, si, { w: v })); };
  const onR = e => { const v = e.currentTarget.value; updateActive(a => setSet(a, ei, si, { r: v })); };
  const onCommit = () => { if (s.done) recheckDoneSet(ei, si); };
  const copyPrev = () => { if (!prev) return; haptic(); updateActive(a => setSet(a, ei, si, { w: String(prev.w), r: String(prev.r) })); };
  const setMenu = () => openSheet('actions', {
    title: `Set ${si + 1}`, actions: [
      { label: 'Delete set', icon: 'trash', destructive: true, onSelect: () => updateActive(a => ({ ...a, entries: a.entries.map((x, i) => (i !== ei ? x : { ...x, sets: x.sets.filter((_, j) => j !== si) })) })) },
    ],
  });
  return html`<div class=${'set-row ' + (s.done ? 'is-done ' : '') + (s.pr ? 'is-pr' : '')} data-set=${ei + '-' + si}>
    <button type="button" class="set-no" onClick=${setMenu} aria-label=${`Set ${si + 1} options`}>
      ${s.pr ? html`<${Icon} name="trophy" size=${15} stroke=${2.3} />` : si + 1}
    </button>
    <button type="button" class="set-prev" onClick=${copyPrev} disabled=${!prev} aria-label="Copy previous">${prev ? `${fmt(prev.w)} × ${prev.r}` : '–'}</button>
    <input class="set-in in-w" type="text" inputmode="decimal" enterkeyhint="next" aria-label=${`Set ${si + 1} kg${mode.short ? ' ' + mode.label.toLowerCase() : ''}`} placeholder=${ph.w} value=${s.w}
      onInput=${onW} onChange=${onCommit} onFocus=${e => e.currentTarget.select()} />
    <input class="set-in in-r" type="text" inputmode="numeric" enterkeyhint="done" aria-label=${`Set ${si + 1} reps`} placeholder=${ph.r} value=${s.r}
      onInput=${onR} onChange=${onCommit} onFocus=${e => e.currentTarget.select()} />
    <button type="button" class=${'set-check ' + (s.done ? 'on' : '')} aria-pressed=${s.done} aria-label=${s.done ? 'Mark set not done' : 'Complete set'}
      onClick=${() => toggleSet(ei, si, last)}><${Icon} name="check" size=${20} stroke=${3} /></button>
  </div>`;
}

function ExerciseBlock({ en, ei, total, ex, last, workoutId }) {
  const mode = MODE[ex ? ex.mode : 'total'] || MODE.total;
  const doneSets = en.sets.filter(s => s.done);
  const sessionBest = doneSets.reduce((m, s) => Math.max(m, e1rm(s.w, s.r)), 0);
  const menu = () => openSheet('actions', {
    title: ex ? ex.name : 'Exercise', actions: [
      { label: 'Machine details & history', icon: 'chart', onSelect: () => { setUI({ workoutOpen: false }); push({ name: 'machine', id: en.exId }, 'machines'); setUI({ tab: 'machines' }); } },
      { label: ex && ex.notes ? 'Edit machine settings' : 'Add machine settings', icon: 'sliders', onSelect: () => editNotes(ex) },
      ...(total > 1 ? [{ label: 'Reorder exercises', icon: 'grip', onSelect: () => openSheet('reorderExercises', {}) }] : []),
      { label: 'Replace exercise', icon: 'swap', onSelect: () => openSheet('picker', { title: 'Replace With', gymId: getState().active.gymId, onPick: id => updateActive(a => ({ ...a, entries: a.entries.map((x, i) => (i !== ei ? x : newEntry(id, x.target, x.sets.length))) })) }) },
      { label: 'Remove from workout', icon: 'trash', destructive: true, onSelect: () => removeEntry(en.id, ex) },
    ],
  });
  return html`<section class="card ex-block">
    <div class="ex-head">
      <button type="button" class="ex-thumb-btn" onClick=${() => ex && ex.photoId ? openSheet('photo', { photoId: ex.photoId, name: ex.name }) : editPhotoHint(ex)} aria-label="Machine photo">
        <${Thumb} photoId=${ex && ex.photoId} muscle=${ex && ex.muscle} size=${56} name=${ex ? ex.name : ''} />
      </button>
      <div class="ex-title">
        <h3 class="clamp2">${ex ? ex.name : 'Deleted exercise'}</h3>
        <div class="row-sub"><span class="gym-tag"><${Icon} name="pin" size=${12} stroke=${2.2} />${gymName(ex && ex.gymId)}</span>${mode.short ? ' · ' + mode.label.toLowerCase() : ''}</div>
      </div>
      <button type="button" class="icon-btn" aria-label="Exercise options" onClick=${menu}><${Icon} name="dots" size=${22} stroke=${3} /></button>
    </div>
    ${ex && ex.notes ? html`<button type="button" class="ex-notes" onClick=${() => editNotes(ex)}><${Icon} name="sliders" size=${15} /> <span>${ex.notes}</span></button>` : ''}
    <div class="ex-last">${last
      ? html`<span>Last · ${fmtDate(last.t)}</span><b>${last.sets.map(s => `${fmt(s.w)}×${s.r}`).join('  ')}</b>`
      : html`<span>First time on this machine. This session sets your baseline.</span>`}</div>
    <div class="set-head" aria-hidden="true"><span>Set</span><span>Previous</span><span>kg${mode.short}</span><span>Reps</span><span></span></div>
    ${en.sets.map((s, si) => html`<${SetRow} key=${si} en=${en} ei=${ei} s=${s} si=${si} last=${last} mode=${mode} />`)}
    <div class="ex-foot">
      <button type="button" class="btn btn-glass btn-sm" onClick=${() => { haptic(); updateActive(a => ({ ...a, entries: a.entries.map((x, i) => (i !== ei ? x : { ...x, sets: [...x.sets, { w: '', r: '', done: false }] })) })); }}>
        <${Icon} name="plus" size=${15} stroke=${2.6} /> Add Set
      </button>
      ${sessionBest > 0 && html`<span class="muted small num">Best today ${fmt(sessionBest)} kg</span>`}
    </div>
  </section>`;
}

// Removing an exercise also drops its logged sets, so it can be undone for a few seconds.
function removeEntry(entryId, ex) {
  const a = getState().active;
  if (!a) return;
  const at = a.entries.findIndex(x => x.id === entryId);
  if (at < 0) return;
  const entry = a.entries[at];
  updateActive(x => ({ ...x, entries: x.entries.filter(y => y.id !== entryId) }));
  toast(`Removed ${ex ? ex.name : 'exercise'}`, {
    action: 'Undo', ms: 5000,
    onAction: () => updateActive(x => (x.entries.some(y => y.id === entryId) ? x : { ...x, entries: [...x.entries.slice(0, at), entry, ...x.entries.slice(at)] })),
  });
}
function editNotes(ex) {
  if (!ex) return;
  promptSheet({
    title: 'Machine Settings', label: `${ex.name}`, value: ex.notes || '', multiline: true,
    placeholder: 'Seat 4 · Back pad 2 · Handles middle',
    onSave: v => { saveExercise({ ...ex, notes: v.trim() }); toast('Settings saved'); },
  });
}
function editPhotoHint(ex) {
  if (!ex) return;
  openSheet('machineEditor', { id: ex.id });
}

export function ActiveWorkout() {
  const { active, open, exercises } = useStore(s => ({ active: s.active, open: s.ui.workoutOpen, exercises: s.exercises }));
  const index = useIndex();
  const [shown, setShown] = useState(false);
  useEffect(() => { if (active && open) { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); } setShown(false); }, [open, !!active]);
  if (!active) return null;
  const exById = new Map(exercises.map(e => [e.id, e]));
  const { volume, sets } = workoutVolume(active, exById);
  const finish = () => {
    const a = getState().active;
    const any = a.entries.some(en => en.sets.some(s => s.done));
    if (!any) {
      openSheet('actions', {
        title: 'No completed sets', message: 'Tick at least one set to save this workout.',
        actions: [{ label: 'Discard workout', icon: 'trash', destructive: true, onSelect: () => { discardActive(); toast('Workout discarded'); } }],
      });
      return;
    }
    const unticked = a.entries.reduce((n, en) => n + en.sets.filter(s => !s.done && (s.w !== '' || s.r !== '')).length, 0);
    const doFinish = () => {
      const w = finishActive();
      setUI({ workoutOpen: false });
      haptic('success');
      if (w) setTimeout(() => openSheet('finished', { id: w.id }), 280);
    };
    if (unticked) {
      openSheet('actions', {
        title: 'Finish workout?', message: `${unticked} set${unticked === 1 ? ' has' : 's have'} numbers but ${unticked === 1 ? "isn't" : "aren't"} ticked. Unticked sets are not saved.`,
        actions: [{ label: 'Finish anyway', icon: 'check', onSelect: doFinish }],
      });
    } else doFinish();
  };
  const menu = () => openSheet('actions', {
    title: active.name, actions: [
      { label: 'Rename workout', icon: 'pencil', onSelect: () => promptSheet({ title: 'Workout Name', value: active.name, onSave: v => v.trim() && updateActive(a => ({ ...a, name: v.trim() })) }) },
      { label: 'Change date & time', icon: 'calendar', onSelect: () => openSheet('datetime', {}) },
      ...(active.entries.length > 1 ? [{ label: 'Reorder exercises', icon: 'grip', onSelect: () => openSheet('reorderExercises', {}) }] : []),
      { label: 'Discard workout', icon: 'trash', destructive: true, onSelect: () => confirmSheet({ title: 'Discard this workout?', message: 'Logged sets in this session will be lost.', confirm: 'Discard', onConfirm: () => { discardActive(); toast('Workout discarded'); } }) },
    ],
  });
  const changeGym = () => {
    const gyms = getState().gyms;
    openSheet('actions', {
      title: 'Which gym are you at?', actions: gyms.map(g => ({ label: g.name + (g.id === active.gymId ? '  ✓' : ''), icon: 'pin', onSelect: () => { updateActive(a => ({ ...a, gymId: g.id })); updateSettings({ lastGymId: g.id }); } })),
    });
  };
  const addExercise = () => openSheet('picker', {
    gymId: active.gymId,
    onPick: id => { updateActive(a => ({ ...a, entries: [...a.entries, newEntry(id, null, 0)] })); setTimeout(() => document.querySelector('.cover .ex-block:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); },
  });
  const started = new Date(active.startedAt);
  const isToday = ymd(started) === ymd(new Date());
  return html`<div class=${'cover ' + (open && shown ? 'cover-open' : '')} aria-hidden=${!open} role="dialog" aria-label="Active workout">
    <div class="cover-bar">
      <div class="topbar-edge" aria-hidden="true"></div>
      <div class="topbar-row">
        <div class="topbar-side"><${GlassButton} icon="chevD" title="Minimize workout" onClick=${() => { flushActive(); setUI({ workoutOpen: false }); }} /></div>
        <button type="button" class="cover-title" onClick=${menu}>
          <span class="clamp1">${active.name}</span>
          <small>${isToday ? html`<${Timer} since=${active.startedAt} />` : fmtDate(started) + ' · ' + fmtTime(started)}</small>
        </button>
        <div class="topbar-side topbar-right"><${GlassButton} label="Finish" tint onClick=${finish} /></div>
      </div>
    </div>
    <div class="scroller cover-scroller">
      <div class="scroller-inner">
        <div class="cover-meta">
          <button type="button" class="chip" onClick=${changeGym}><${Icon} name="pin" size=${14} stroke=${2.3} /> ${gymName(active.gymId)}</button>
          <span class="chip chip-static num">${sets} sets · ${fmtInt(volume)} kg</span>
          <button type="button" class="chip" onClick=${menu} aria-label="Workout options"><${Icon} name="dots" size=${16} stroke=${3} /></button>
        </div>
        ${active.entries.map((en, ei) => html`<${ExerciseBlock} key=${en.id} en=${en} ei=${ei} total=${active.entries.length} ex=${exById.get(en.exId)}
            last=${lastSession(index, en.exId, Infinity, active.id)} workoutId=${active.id} />`)}
        ${!active.entries.length && html`<div class="card cover-empty">
          <div class="empty-ic"><${Icon} name="dumbbell" size=${28} /></div>
          <h3>Add your first machine</h3>
          <p class="muted">Pick from your machines at ${gymName(active.gymId)}, or create a new one with a photo.</p>
        </div>`}
        <button type="button" class="glass btn-add-ex" onClick=${addExercise}><${Icon} name="plus" size=${20} stroke=${2.6} /> Add Exercise</button>
        <div class="bottom-space"></div>
      </div>
    </div>
  </div>`;
}

// Exercise order during a workout: a compact list to drag, since the full set cards are too tall to move around.
export function ReorderExercisesSheet({ sheetKey }) {
  const { active, exercises } = useStore(s => ({ active: s.active, exercises: s.exercises }));
  const listRef = useRef(null);
  useReorder(listRef, { onMove: (from, to) => updateActive(a => ({ ...a, entries: moveItem(a.entries, from, to) })) });
  const done = html`<button type="button" class="btn btn-accent btn-sm" onClick=${() => closeSheet(sheetKey)}>Done</button>`;
  if (!active) return html`<${SheetFrame} sheetKey=${sheetKey} title="Exercise Order" right=${done}><div class="list" ref=${listRef}></div><//>`;
  const exById = new Map(exercises.map(e => [e.id, e]));
  return html`<${SheetFrame} sheetKey=${sheetKey} title="Exercise Order" cls="sheet-compact" right=${done}>
    <div class="list" ref=${listRef}>
      ${active.entries.map((en, i) => {
        const ex = exById.get(en.exId);
        const ticked = en.sets.filter(s => s.done).length;
        return html`<div class="row" key=${en.id} data-ri=${i}>
          <${Thumb} photoId=${ex && ex.photoId} muscle=${ex && ex.muscle} size=${40} name=${ex ? ex.name : ''} />
          <div class="row-main">
            <div class="row-title clamp2">${ex ? ex.name : 'Exercise'}</div>
            <div class="row-sub">${ticked ? `${ticked} of ${en.sets.length} sets done` : `${en.sets.length} ${en.sets.length === 1 ? 'set' : 'sets'}`}</div>
          </div>
          <span class="reorder-grip" aria-hidden="true"><${Icon} name="grip" size=${22} stroke=${1.8} /></span>
        </div>`;
      })}
    </div>
    <p class="list-hint">Hold an exercise, or drag its handle, to change the order.</p>
  <//>`;
}

export function DateTimeSheet({ sheetKey }) {
  const a = getState().active;
  const d = new Date(a ? a.startedAt : Date.now());
  const pad = n => String(n).padStart(2, '0');
  const [val, setVal] = useState(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  const save = () => {
    const nd = new Date(val);
    if (Number.isNaN(nd.getTime())) { toast('Pick a valid date'); return; }
    if (nd > new Date()) { toast('That time is in the future'); return; }
    updateActive(x => ({ ...x, startedAt: nd.toISOString() }));
    closeSheet(sheetKey);
  };
  return html`<${SheetFrame} sheetKey=${sheetKey} title="Date & Time" cls="sheet-compact" right=${html`<button type="button" class="btn btn-accent btn-sm" onClick=${save}>Save</button>`}>
    <div class="form">
      <p class="muted">Logging a workout you did earlier? Set when it started.</p>
      <input id="workout-datetime" class="input" type="datetime-local" value=${val} max=${new Date().toISOString().slice(0, 16)} onInput=${e => setVal(e.currentTarget.value)} />
    </div>
  <//>`;
}

// Shown right after finishing.
export function FinishedSheet({ sheetKey, id }) {
  const { workout, settings, workouts, exercises } = useStore(s => ({ workout: s.workouts.find(w => w.id === id), settings: s.settings, workouts: s.workouts, exercises: s.exercises }));
  const index = useIndex();
  if (!workout) return null;
  const exById = new Map(exercises.map(e => [e.id, e]));
  const { volume, sets } = workoutVolume(workout, exById);
  const appDone = workouts.filter(w => w.endedAt && !w.imported).sort((a, b) => wTime(a) - wTime(b));
  const number = (settings.baseBeforeJefit || 0) + (settings.baseJefit || 0) + appDone.findIndex(w => w.id === id) + 1;
  const prs = index.prEvents.filter(p => p.wid === id);
  const rows = workout.entries.map(en => {
    const ss = index.byEx.get(en.exId) || [];
    const cur = ss.find(s => s.wid === id);
    const prev = lastSession(index, en.exId, wTime(workout), id);
    return { en, ex: exById.get(en.exId), cur, prev, d: cur && prev && prev.best.e > 0 ? (cur.best.e - prev.best.e) / prev.best.e : null };
  }).filter(r => r.cur);
  return html`<${SheetFrame} sheetKey=${sheetKey} title="" full left=${null} right=${html`<button type="button" class="btn btn-accent btn-sm" onClick=${() => closeSheet(sheetKey)}>Done</button>`}>
    <div class="finished-hero">
      <div class="finished-badge"><${Icon} name=${prs.length ? 'trophy' : 'check'} size=${40} stroke=${2.2} /></div>
      <div class="eyebrow">Workout</div>
      <div class="finished-num num">#${fmtInt(number)}</div>
      <h2>${workout.name}</h2>
      <p class="muted">${fmtDate(workout.startedAt, true)} · ${gymName(workout.gymId)}</p>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Duration</div><div class="stat-value num">${fmtDuration(new Date(workout.endedAt) - new Date(workout.startedAt))}</div></div>
      <div class="stat"><div class="stat-label">Volume</div><div class="stat-value num">${fmtInt(volume)}<small> kg</small></div></div>
      <div class="stat"><div class="stat-label">Sets</div><div class="stat-value num">${sets}</div></div>
      <div class="stat"><div class="stat-label">New PRs</div><div class="stat-value num" style=${prs.length ? 'color:var(--ring-p2)' : ''}>${prs.length}</div></div>
    </div>
    ${prs.length > 0 && html`<div class="group-label">Personal records</div>
      <div class="list">${prs.map(p => html`<div class="row" key=${p.exId}>
        <div class="row-ic" style="--ic:var(--ring-p2)"><${Icon} name="trophy" size=${20} /></div>
        <div class="row-main"><div class="row-title clamp2">${(exById.get(p.exId) || {}).name}</div>
          <div class="row-sub">${fmt(p.w)} kg × ${p.r} · est. 1RM ${fmt(p.e)} kg</div></div>
        <div class="row-end"><span class="delta delta-up">+${fmt(p.e - p.prev)} kg</span></div>
      </div>`)}</div>`}
    <div class="group-label">Compared with last time</div>
    <div class="list">${rows.map(r => html`<div class="row" key=${r.en.id}>
      <${Thumb} photoId=${r.ex && r.ex.photoId} muscle=${r.ex && r.ex.muscle} size=${40} name=${r.ex ? r.ex.name : ''} />
      <div class="row-main"><div class="row-title clamp2">${r.ex ? r.ex.name : 'Exercise'}</div>
        <div class="row-sub">Best ${fmt(r.cur.best.w)} × ${r.cur.best.r}${r.prev ? ` · last ${fmt(r.prev.best.w)} × ${r.prev.best.r}` : ' · first time'}</div></div>
      <div class="row-end">${r.prev ? html`<${Delta} d=${r.d} digits=${1} />` : html`<span class="muted small">New</span>`}</div>
    </div>`)}</div>
    <div class="bottom-space-sm"></div>
  <//>`;
}
