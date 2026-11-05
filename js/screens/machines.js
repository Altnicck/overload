import { html, useState, useRef } from '../preact.js';
import { Icon } from '../icons.js';
import { Screen, Section, Thumb, GlassButton, SheetFrame, Segmented, haptic, Empty, muscleColor, muscleLabel } from '../ui.js';
import { LineChart } from '../charts.js';
import { useStore, useIndex, push, pop, openSheet, closeSheet, saveExercise, deleteExercise, savePhoto, deletePhoto, usePhoto, getState, toast, gymName, saveGym } from '../store.js';
import { MUSCLES, MODES, MODE, fmt, fmtInt, fmtDate, relDay } from '../logic.js';
import { ExerciseRow } from './common.js';
import { BodyThumb, BodyMap } from '../body.js';
import { musclesFor, muscleRoles, groupMuscles } from '../anatomy.js';
import { promptSheet } from './sheets.js';

export function MachinesScreen() {
  const { exercises, gyms } = useStore(s => ({ exercises: s.exercises, gyms: s.gyms }));
  const index = useIndex();
  const [q, setQ] = useState('');
  const [gym, setGym] = useState('all');
  const query = q.trim().toLowerCase();
  let list = exercises.filter(e => !e.archived);
  if (gym !== 'all') list = list.filter(e => (gym === 'any' ? !e.gymId : e.gymId === gym));
  if (query) list = list.filter(e => (e.name + ' ' + (e.movement || '') + ' ' + muscleLabel(e.muscle) + ' ' + gymName(e.gymId)).toLowerCase().includes(query));
  const groups = MUSCLES.map(m => ({ m, items: list.filter(e => (e.muscle || 'other') === m.id).sort((a, b) => a.name.localeCompare(b.name)) })).filter(g => g.items.length);
  const withPhoto = exercises.filter(e => e.photoId).length;
  return html`<${Screen} title="Machines" tab="machines"
      right=${html`<${GlassButton} icon="plus" title="New machine" onClick=${() => { haptic(); openSheet('machineEditor', { gymId: gym !== 'all' && gym !== 'any' ? gym : undefined }); }} />`}>
    <p class="muted lead">${exercises.length} machines · ${withPhoto} with photos</p>
    <label class="search"><${Icon} name="search" size=${18} />
      <input id="machines-search" type="search" placeholder="Search name, muscle or gym" value=${q} onInput=${e => setQ(e.currentTarget.value)} autocomplete="off" />
    </label>
    <div class="chips chips-scroll">
      <button type="button" class=${'chip ' + (gym === 'all' ? 'chip-on' : '')} onClick=${() => setGym('all')}>All</button>
      ${gyms.map(g => html`<button type="button" key=${g.id} class=${'chip ' + (gym === g.id ? 'chip-on' : '')} onClick=${() => setGym(g.id)}><${Icon} name="pin" size=${13} stroke=${2.3} /> ${g.name}</button>`)}
      <button type="button" class=${'chip ' + (gym === 'any' ? 'chip-on' : '')} onClick=${() => setGym('any')}>Any gym</button>
      <button type="button" class="chip chip-dashed" onClick=${() => promptSheet({ title: 'New Gym', label: 'Gym name', placeholder: 'e.g. World Class Băneasa', saveLabel: 'Add', onSave: v => { if (v.trim()) { const g = saveGym({ name: v.trim() }); setGym(g.id); toast(`${g.name} added`); } } })}>
        <${Icon} name="plus" size=${13} stroke=${2.6} /> Gym
      </button>
    </div>
    ${groups.map(g => html`<div key=${g.m.id}>
      <div class="group-label group-label-art"><${BodyThumb} levels=${groupMuscles(g.m.id)} size=${30} radius=${9} />${g.m.label}<span class="muted"> ${g.items.length}</span></div>
      <div class="list">${g.items.map(e => html`<${ExerciseRow} key=${e.id} ex=${e} stat=${index.stats.get(e.id)} onClick=${() => push({ name: 'machine', id: e.id }, 'machines')} showGym=${gym === 'all'} />`)}</div>
    </div>`)}
    ${!list.length && html`<div class="card"><${Empty} icon="grid" title=${query ? 'No matches' : 'No machines here yet'}
      text=${query ? `Nothing matches "${q}".` : 'Add every machine you use, at every gym, each with its own photo and history.'}
      action="New machine" onAction=${() => openSheet('machineEditor', { name: q, gymId: gym !== 'all' && gym !== 'any' ? gym : undefined })} /></div>`}
    <div class="bottom-space"></div>
  <//>`;
}

function MusclesWorked({ ex }) {
  const roles = muscleRoles(ex);
  if (!roles.main.length) return null;
  return html`<section class="card mw-card" aria-label="Muscles worked">
    <${BodyThumb} levels=${musclesFor(ex)} size=${84} radius=${18} />
    <div class="row-main">
      <div class="eyebrow">Muscles worked</div>
      <div class="mw-main">${roles.main.join(' · ')}</div>
      ${roles.helping.length > 0 && html`<div class="mw-help">Helped by ${roles.helping.join(', ').toLowerCase()}</div>`}
    </div>
  </section>`;
}

function HeroPhoto({ ex }) {
  const url = usePhoto(ex.photoId, 'full');
  const color = muscleColor(ex.muscle);
  if (url) return html`<button type="button" class="hero-photo" onClick=${() => openSheet('photo', { photoId: ex.photoId, name: ex.name })} aria-label="View photo">
    <img src=${url} alt=${ex.name} /><div class="hero-fade"></div></button>`;
  // No photo yet: show the muscles it works, with a way to add the photo.
  return html`<div class="hero-photo hero-empty hero-body">
    <div class="hero-map"><${BodyMap} levels=${musclesFor(ex)} height=${260} /></div>
    <div class="hero-fade"></div>
    <button type="button" class="glass hero-cam" onClick=${() => openSheet('machineEditor', { id: ex.id, focusPhoto: true })}><${Icon} name="camera" size=${17} /> Add photo</button>
  </div>`;
}

export function MachineScreen({ id, tab }) {
  const { ex, exercises, gyms } = useStore(s => ({ ex: s.exercises.find(e => e.id === id), exercises: s.exercises, gyms: s.gyms }));
  const index = useIndex();
  const [range, setRange] = useState('all');
  const [metric, setMetric] = useState('e1rm');
  if (!ex) return html`<${Screen} title="Machine" pushed tab=${tab}><div class="card"><${Empty} title="This machine was deleted" /></div><//>`;
  const st = index.stats.get(ex.id) || { sessions: 0 };
  const sessions = index.byEx.get(ex.id) || [];
  const mode = MODE[ex.mode] || MODE.total;
  const cutoff = range === 'all' ? 0 : Date.now() - { '3m': 92, '6m': 183, '1y': 365 }[range] * 864e5;
  const pts = sessions.filter(s => s.t >= cutoff).map(s => ({
    t: s.t, pr: s.pr, label: `${fmt(s.best.w)} × ${s.best.r}`,
    v: metric === 'e1rm' ? s.best.e : metric === 'top' ? s.top.w : s.vol,
  }));
  const same = ex.movement ? exercises.filter(e => e.id !== ex.id && e.movement && e.movement.toLowerCase() === ex.movement.toLowerCase()) : [];
  const dup = () => {
    const others = gyms.filter(g => g.id !== ex.gymId);
    const doDup = gymId => {
      const copy = saveExercise({ name: ex.name, muscle: ex.muscle, mode: ex.mode, equip: ex.equip, movement: ex.movement || ex.name, gymId, notes: '', photoId: null });
      if (!ex.movement) saveExercise({ ...ex, movement: ex.name });
      toast(`Added at ${gymName(gymId)}. Snap its photo.`);
      push({ name: 'machine', id: copy.id }, tab);
      setTimeout(() => openSheet('machineEditor', { id: copy.id, focusPhoto: true }), 350);
    };
    openSheet('actions', {
      title: 'Same exercise, different gym', message: 'Creates a separate machine with its own photo, PRs and history.',
      actions: [
        ...others.map(g => ({ label: g.name, icon: 'pin', onSelect: () => doDup(g.id) })),
        { label: 'New gym…', icon: 'plus', onSelect: () => promptSheet({ title: 'New Gym', label: 'Gym name', saveLabel: 'Add', onSave: v => { if (v.trim()) doDup(saveGym({ name: v.trim() }).id); } }) },
      ],
    });
  };
  const best = st.best;
  const gain = sessions.length > 1 && sessions[0].best.e > 0 ? (st.bestE - sessions[0].best.e) / sessions[0].best.e : 0;
  return html`<${Screen} title="" compactTitle=${ex.name} pushed tab=${tab} cls="screen-hero"
      right=${html`<${GlassButton} icon="pencil" title="Edit machine" onClick=${() => openSheet('machineEditor', { id: ex.id })} />`}>
    <${HeroPhoto} ex=${ex} />
    <div class="machine-head">
      <h1 class="machine-title">${ex.name}</h1>
      <div class="chips">
        <span class="chip chip-static"><${Icon} name="pin" size=${13} stroke=${2.3} /> ${gymName(ex.gymId)}</span>
        <span class="chip chip-static" style=${`--cc:${muscleColor(ex.muscle)}`}><i class="dot"></i>${muscleLabel(ex.muscle)}</span>
        ${mode.short && html`<span class="chip chip-static">${mode.label}</span>`}
      </div>
    </div>
    ${ex.photoId && html`<${MusclesWorked} ex=${ex} />`}

    <button type="button" class=${'card card-tap notes-card ' + (ex.notes ? '' : 'notes-empty')} onClick=${() => promptSheet({
      title: 'Machine Settings', label: ex.name, value: ex.notes || '', multiline: true, placeholder: 'Seat 4 · Back pad 2 · Handles middle',
      onSave: v => saveExercise({ ...ex, notes: v.trim() }),
    })}>
      <${Icon} name="sliders" size=${20} />
      <div class="row-main"><div class="eyebrow">Machine settings</div><div class="notes-text">${ex.notes || 'Add seat height, pin positions, grip…'}</div></div>
      <${Icon} name="pencil" size=${16} cls="muted" />
    </button>

    <div class="stat-grid">
      <div class="stat stat-hero">
        <div class="stat-label">Best est. 1RM</div>
        <div class="stat-value num tint">${st.bestE ? fmt(st.bestE) : '–'}<small> kg</small></div>
        <div class="stat-sub">${best && !st.baselineWins ? `${fmt(best.w)} × ${best.r} · ${fmtDate(best.t)}` : ex.baseline ? ex.baseline.label || 'From Jefit' : 'Log a set to start'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Heaviest set</div>
        <div class="stat-value num">${st.heavy ? fmt(st.heavy.w) : '–'}<small> kg${mode.short}</small></div>
        <div class="stat-sub">${st.heavy ? `× ${st.heavy.r} · ${fmtDate(st.heavy.t)}` : '—'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Sessions</div>
        <div class="stat-value num">${st.sessions}</div>
        <div class="stat-sub">${st.last ? relDay(st.last.t) : 'Not logged yet'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Best session volume</div>
        <div class="stat-value num">${st.bestVol ? fmtInt(st.bestVol.vol) : '–'}<small> kg</small></div>
        <div class="stat-sub">${st.bestVol ? fmtDate(st.bestVol.t) : '—'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Progress</div>
        <div class="stat-value num" style=${gain > 0.0005 ? 'color:#30d158' : ''}>${sessions.length > 1 ? (gain > 0 ? '+' : '') + (gain * 100).toFixed(gain >= 0.1 || gain <= -0.1 ? 0 : 1) + '%' : '–'}</div>
        <div class="stat-sub">${sessions.length > 1 ? 'est. 1RM since ' + fmtDate(sessions[0].t) : 'After two sessions'}</div>
      </div>
    </div>

    <${Section} title="Progress">
      <div class="card chart-card">
        <${Segmented} value=${metric} onChange=${setMetric} options=${[{ value: 'e1rm', label: 'Est. 1RM' }, { value: 'top', label: 'Top weight' }, { value: 'vol', label: 'Volume' }]} />
        <${LineChart} points=${pts} unit="kg" valueLabel=${metric === 'e1rm' ? 'Est. 1RM' : metric === 'top' ? 'Top weight' : 'Volume'}
          color=${metric === 'e1rm' ? 'var(--accent)' : metric === 'top' ? 'var(--ring-p2)' : 'var(--ring-w2)'} />
        <${Segmented} cls="seg-sm" value=${range} onChange=${setRange} options=${[{ value: '3m', label: '3M' }, { value: '6m', label: '6M' }, { value: '1y', label: '1Y' }, { value: 'all', label: 'All' }]} />
      </div>
    <//>

    ${same.length > 0 && html`<${Section} title="Same exercise at other gyms">
      <div class="list">${same.map(o => { const os = index.stats.get(o.id); const diff = os && os.bestE && st.bestE ? (os.bestE - st.bestE) / st.bestE : null;
        return html`<${ExerciseRow} key=${o.id} ex=${o} stat=${os} onClick=${() => push({ name: 'machine', id: o.id }, tab)}
          end=${diff !== null ? html`<span class="muted small num">${diff > 0 ? '+' : ''}${Math.round(diff * 100)}%</span>` : null} />`; })}</div>
    <//>`}

    <${Section} title="History" action=${sessions.length ? `${sessions.length} sessions` : null}>
      ${sessions.length ? html`<div class="history-list">
        ${sessions.slice().reverse().map(s => html`<div class="card hist-card" key=${s.wid + s.t}>
          <div class="hist-head"><b>${fmtDate(s.t, true)}</b>${s.pr && html`<span class="pr-pill"><${Icon} name="trophy" size=${12} stroke=${2.4} /> PR</span>`}${s.imported && html`<span class="muted small">Jefit</span>`}<span class="hist-gym muted small">${s.gymId && s.gymId !== ex.gymId ? gymName(s.gymId) : ''}</span></div>
          <div class="hist-sets">
            <div class="hist-row hist-cap"><span>Set</span><span>Weight × reps</span><span>1RM</span></div>
            ${s.sets.map((x, i) => html`<div class=${'hist-row ' + (x === s.best ? 'is-best' : '')}><span>${i + 1}</span><span class="num">${fmt(x.w)} kg × ${x.r}</span><span class="num">${fmt(x.e)}</span></div>`)}
          </div>
        </div>`)}
      </div>` : html`<div class="card"><${Empty} icon="history" title="No sessions yet" text="Your sets on this machine will be listed here." /></div>`}
    <//>

    <div class="btn-col">
      <button type="button" class="btn btn-glass btn-block" onClick=${dup}><${Icon} name="copy" size=${17} /> Add this exercise at another gym</button>
    </div>
    <div class="bottom-space"></div>
  <//>`;
}

// Resize a picked photo into a full image and a square thumbnail, both JPEG.
async function processPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const draw = (maxSide, square, quality) => new Promise(res => {
      const w = img.naturalWidth, h = img.naturalHeight;
      let sx = 0, sy = 0, sw = w, sh = h;
      if (square) { const s = Math.min(w, h); sx = (w - s) / 2; sy = (h - s) / 2; sw = sh = s; }
      const scale = Math.min(1, maxSide / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      c.toBlob(b => res(b), 'image/jpeg', quality);
    });
    const full = await draw(1400, false, 0.84);
    const thumb = await draw(360, true, 0.8);
    if (!full || !thumb) throw new Error('Could not read that photo');
    return { full, thumb };
  } finally { URL.revokeObjectURL(url); }
}

export function MachineEditorSheet({ sheetKey, id, gymId, name: initialName, onSaved, focusPhoto }) {
  const s0 = getState();
  const existing = id ? s0.exercises.find(e => e.id === id) : null;
  const [f, setF] = useState(() => existing ? { ...existing } : {
    name: initialName || '', muscle: 'chest', mode: 'total', gymId: gymId || s0.settings.lastGymId || (s0.gyms[0] && s0.gyms[0].id) || null,
    notes: '', movement: '', photoId: null,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileRef = useRef(null);
  const gyms = useStore(s => s.gyms);
  const photo = usePhoto(f.photoId, 'thumb');
  const set = patch => setF(x => ({ ...x, ...patch }));
  const movements = [...new Set(s0.exercises.map(e => e.movement).filter(Boolean))].sort();
  const onFile = async e => {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { full, thumb } = await processPhoto(file);
      const pid = await savePhoto(full, thumb);
      set({ photoId: pid, _newPhoto: pid });
      haptic();
    } catch (err) { toast('That photo could not be read. Try another one.'); }
    setBusy(false);
  };
  const save = () => {
    if (!f.name.trim()) { toast('Give the machine a name'); return; }
    const { _newPhoto, ...rest } = f;
    if (existing && existing.photoId && existing.photoId !== f.photoId && !s0.exercises.some(e => e.id !== existing.id && e.photoId === existing.photoId)) deletePhoto(existing.photoId);
    const saved = saveExercise({ ...rest, name: f.name.trim(), movement: (f.movement || '').trim(), notes: (f.notes || '').trim() });
    haptic('success');
    closeSheet(sheetKey);
    if (onSaved) setTimeout(() => onSaved(saved), 60);
    else if (!existing) toast(`${saved.name} added`);
  };
  const cancel = () => { if (f._newPhoto) deletePhoto(f._newPhoto); closeSheet(sheetKey); };
  const addGym = () => promptSheet({ title: 'New Gym', label: 'Gym name', placeholder: 'e.g. 18 Gym Unirii', saveLabel: 'Add', onSave: v => { if (v.trim()) { const g = saveGym({ name: v.trim() }); set({ gymId: g.id }); } } });
  return html`<${SheetFrame} sheetKey=${sheetKey} title=${existing ? 'Edit Machine' : 'New Machine'} full onClose=${cancel}
      right=${html`<button type="button" class="btn btn-accent btn-sm" onClick=${save} disabled=${busy}>Save</button>`}>
    <div class="form">
      <input ref=${fileRef} id="machine-photo-input" type="file" accept="image/*" class="visually-hidden" onChange=${onFile} />
      <button type="button" class=${'photo-pick ' + (photo ? 'has-photo' : '') + (focusPhoto && !photo ? ' pulse' : '')} onClick=${() => fileRef.current && fileRef.current.click()} style=${`--mc:${muscleColor(f.muscle)}`}>
        ${photo ? html`<img src=${photo} alt="Machine photo" />` : html`<div class="photo-pick-ph"><${Icon} name="camera" size=${32} /><b>Add Photo</b><span>Take one at the machine or pick from your library</span></div>`}
        ${busy && html`<div class="photo-busy"><div class="spinner"></div></div>`}
        ${photo && html`<span class="photo-change glass">Change</span>`}
      </button>
      ${photo && html`<button type="button" class="btn btn-danger-text btn-sm center" onClick=${() => set({ photoId: null })}>Remove photo</button>`}

      <label class="field">
        <span class="field-label">Name</span>
        <input id="machine-name" class="input" type="text" placeholder="e.g. Leg Press (Hammer Strength)" value=${f.name} onInput=${e => set({ name: e.currentTarget.value })} autocomplete="off" />
      </label>

      <div class="field">
        <span class="field-label">Gym</span>
        <div class="chips">
          ${gyms.map(g => html`<button type="button" key=${g.id} class=${'chip ' + (f.gymId === g.id ? 'chip-on' : '')} onClick=${() => set({ gymId: g.id })}><${Icon} name="pin" size=${13} stroke=${2.3} /> ${g.name}</button>`)}
          <button type="button" class=${'chip ' + (!f.gymId ? 'chip-on' : '')} onClick=${() => set({ gymId: null })}>Any gym</button>
          <button type="button" class="chip chip-dashed" onClick=${addGym}><${Icon} name="plus" size=${13} stroke=${2.6} /> Gym</button>
        </div>
        <span class="field-hint">Use "Any gym" for dumbbells and barbells that weigh the same everywhere.</span>
      </div>

      <div class="field">
        <span class="field-label">Muscle group</span>
        <div class="chips">${MUSCLES.map(m => html`<button type="button" key=${m.id} class=${'chip ' + (f.muscle === m.id ? 'chip-on' : '')} style=${`--cc:${m.color}`} onClick=${() => set({ muscle: m.id })}><i class="dot"></i>${m.label}</button>`)}</div>
      </div>

      <div class="field">
        <span class="field-label">Weight you enter</span>
        <${Segmented} value=${f.mode} onChange=${v => set({ mode: v })} options=${MODES.map(m => ({ value: m.id, label: m.label }))} />
        <span class="field-hint">${f.mode === 'perSide' ? 'Plate-loaded or single-arm: enter one side. Volume counts both sides.' : f.mode === 'perDB' ? 'Enter one dumbbell. Volume counts both.' : 'Enter the total on the stack or bar.'}</span>
      </div>

      <label class="field">
        <span class="field-label">Machine settings</span>
        <textarea id="machine-notes" class="input textarea" rows="3" placeholder="Seat 4 · Back pad 2 · Handles middle" value=${f.notes} onInput=${e => set({ notes: e.currentTarget.value })}></textarea>
      </label>

      <label class="field">
        <span class="field-label">Exercise type (to compare gyms)</span>
        <input id="machine-movement" class="input" type="text" list="movement-list" placeholder="e.g. Leg Press" value=${f.movement} onInput=${e => set({ movement: e.currentTarget.value })} autocomplete="off" />
        <datalist id="movement-list">${movements.map(m => html`<option value=${m} />`)}</datalist>
        <span class="field-hint">Machines with the same type show up side by side, so two leg presses can be compared.</span>
      </label>

      ${existing && html`<div class="mt-lg">
        ${confirmDel ? html`<div class="confirm-box">
            <p>Delete "${existing.name}"? Its sets stay inside past workouts but it disappears from your machines and routines.</p>
            <div class="btn-row">
              <button type="button" class="btn btn-glass" onClick=${() => setConfirmDel(false)}>Cancel</button>
              <button type="button" class="btn btn-danger" onClick=${() => { deleteExercise(existing.id); closeSheet(sheetKey); const st = getState().ui; const stack = st.stacks[st.tab]; if (stack.length && stack[stack.length - 1].id === existing.id) pop(st.tab); toast('Machine deleted'); }}>Delete</button>
            </div>
          </div>`
        : html`<button type="button" class="btn btn-block btn-danger-text" onClick=${() => setConfirmDel(true)}>Delete Machine</button>`}
      </div>`}
    </div>
  <//>`;
}

