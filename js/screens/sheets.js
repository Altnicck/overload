import { html, useState, useRef, useEffect } from '../preact.js';
import { Icon } from '../icons.js';
import { SheetFrame, haptic, Thumb } from '../ui.js';
import { closeSheet, usePhoto, useStore, useIndex, openSheet } from '../store.js';
import { MUSCLES, MUSCLE, fmt } from '../logic.js';

// iOS-style action sheet: list of actions + Cancel.
export function ActionSheet({ sheetKey, title, message, actions = [] }) {
  return html`<div class="action-sheet" role="dialog" aria-modal="true" aria-label=${title || 'Actions'}>
    <div class="as-group glass-sheet">
      ${(title || message) && html`<div class="as-head">${title && html`<div class="as-title">${title}</div>`}${message && html`<div class="as-msg">${message}</div>`}</div>`}
      ${actions.map(a => html`<button type="button" class=${'as-btn ' + (a.destructive ? 'destructive' : '')} onClick=${() => { haptic(); closeSheet(sheetKey); setTimeout(() => a.onSelect && a.onSelect(), 30); }}>
        ${a.icon && html`<${Icon} name=${a.icon} size=${20} />`}<span>${a.label}</span>
      </button>`)}
    </div>
    <button type="button" class="as-btn as-cancel glass-sheet" onClick=${() => closeSheet(sheetKey)}>Cancel</button>
  </div>`;
}

export function PromptSheet({ sheetKey, title, label, value = '', placeholder = '', multiline, onSave, saveLabel = 'Save', type = 'text', inputmode }) {
  const [v, setV] = useState(value);
  const ref = useRef(null);
  useEffect(() => { const t = setTimeout(() => ref.current && ref.current.focus(), 320); return () => clearTimeout(t); }, []);
  const save = () => { onSave && onSave(v); closeSheet(sheetKey); };
  return html`<${SheetFrame} sheetKey=${sheetKey} title=${title} cls="sheet-compact"
      right=${html`<button type="button" class="btn btn-accent btn-sm" onClick=${save}>${saveLabel}</button>`}>
    <div class="form">
      <label class="field">
        ${label && html`<span class="field-label">${label}</span>`}
        ${multiline
          ? html`<textarea ref=${ref} id="prompt-input" class="input textarea" rows="4" placeholder=${placeholder} value=${v} onInput=${e => setV(e.currentTarget.value)}></textarea>`
          : html`<input ref=${ref} id="prompt-input" class="input" type=${type} inputmode=${inputmode} placeholder=${placeholder} value=${v} onInput=${e => setV(e.currentTarget.value)}
              onKeyDown=${e => { if (e.key === 'Enter') save(); }} />`}
      </label>
    </div>
  <//>`;
}

export function PhotoViewer({ sheetKey, photoId, name }) {
  const url = usePhoto(photoId, 'full');
  return html`<div class="photo-viewer" role="dialog" aria-modal="true" aria-label=${name || 'Photo'} onClick=${() => closeSheet(sheetKey)}>
    ${url ? html`<img src=${url} alt=${name || ''} />` : html`<div class="spinner"></div>`}
    <div class="pv-top"><button type="button" class="glass gbtn gbtn-round" style="width:44px;height:44px" aria-label="Close"><${Icon} name="x" size=${21} stroke=${2.1} /></button>
      <div class="pv-name">${name}</div></div>
  </div>`;
}

// Exercise picker used by workouts and routines.
export function PickerSheet({ sheetKey, title = 'Add Exercise', onPick, gymId, multi, exclude = [] }) {
  const { exercises, gyms } = useStore(s => ({ exercises: s.exercises, gyms: s.gyms }));
  const index = useIndex();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState(gymId ? 'gym' : 'all');
  const [picked, setPicked] = useState([]);
  const query = q.trim().toLowerCase();
  let list = exercises.filter(e => !e.archived);
  if (scope === 'gym' && gymId) list = list.filter(e => !e.gymId || e.gymId === gymId);
  if (query) list = list.filter(e => (e.name + ' ' + (e.movement || '') + ' ' + (MUSCLE[e.muscle] || MUSCLE.other).label).toLowerCase().includes(query));
  const lastUsed = id => { const st = index.stats.get(id); return st && st.last ? st.last.t : 0; };
  const groups = MUSCLES.map(m => ({ m, items: list.filter(e => (e.muscle || 'other') === m.id).sort((a, b) => a.name.localeCompare(b.name)) })).filter(g => g.items.length);
  const recent = query ? [] : list.filter(e => lastUsed(e.id) > Date.now() - 21 * 864e5).sort((a, b) => lastUsed(b.id) - lastUsed(a.id)).slice(0, 6);
  const pick = id => {
    haptic();
    if (multi) { setPicked(p => [...p, id]); onPick(id); return; }
    closeSheet(sheetKey);
    setTimeout(() => onPick(id), 40);
  };
  const gym = gymId && gyms.find(g => g.id === gymId);
  const row = e => {
    const st = index.stats.get(e.id);
    const n = picked.filter(x => x === e.id).length;
    return html`<button key=${e.id} type="button" class="row row-tap" onClick=${() => pick(e.id)}>
      <${Thumb} photoId=${e.photoId} muscle=${e.muscle} size=${44} name=${e.name} />
      <div class="row-main">
        <div class="row-title clamp2">${e.name}</div>
        <div class="row-sub">${e.gymId ? (gyms.find(g => g.id === e.gymId) || {}).name || 'Gym' : 'Any gym'}${st && st.bestE ? ' · ' + fmt(st.bestE) + ' kg' : ''}</div>
      </div>
      <div class="row-end">${n ? html`<span class="badge">${n > 1 ? n + '×' : ''}<${Icon} name="check" size=${14} stroke=${3} /></span>` : html`<${Icon} name="plus" size=${20} cls="tint" stroke=${2.2} />`}</div>
    </button>`;
  };
  return html`<${SheetFrame} sheetKey=${sheetKey} title=${title} full
      right=${multi ? html`<button type="button" class="btn btn-accent btn-sm" onClick=${() => closeSheet(sheetKey)}>Done</button>`
        : html`<button type="button" class="btn btn-glass btn-sm" onClick=${() => openSheet('machineEditor', { gymId, onSaved: ex => pick(ex.id) })}><${Icon} name="plus" size=${16} stroke=${2.4} /> New</button>`}>
    <div class="picker-tools">
      <label class="search"><${Icon} name="search" size=${18} />
        <input id="picker-search" type="search" placeholder="Search machines" value=${q} onInput=${e => setQ(e.currentTarget.value)} autocomplete="off" />
      </label>
      ${gym && html`<div class="chips">
        <button type="button" class=${'chip ' + (scope === 'gym' ? 'chip-on' : '')} onClick=${() => setScope('gym')}><${Icon} name="pin" size=${13} stroke=${2.3} /> ${gym.name}</button>
        <button type="button" class=${'chip ' + (scope === 'all' ? 'chip-on' : '')} onClick=${() => setScope('all')}>All gyms</button>
      </div>`}
    </div>
    ${multi && html`<button type="button" class="btn btn-glass btn-block mb" onClick=${() => openSheet('machineEditor', { gymId, onSaved: ex => pick(ex.id) })}><${Icon} name="plus" size=${16} stroke=${2.4} /> New machine</button>`}
    ${recent.length > 0 && html`<div class="group-label">Recently used</div><div class="list">${recent.map(row)}</div>`}
    ${groups.map(g => html`<div class="group-label" style=${`--gc:${g.m.color}`}><i class="dot"></i>${g.m.label}</div><div class="list">${g.items.map(row)}</div>`)}
    ${!list.length && html`<div class="empty small-empty"><p>${query ? `Nothing matches "${q}".` : 'No machines here yet.'}</p>
      <button type="button" class="btn btn-accent" onClick=${() => openSheet('machineEditor', { gymId, name: q, onSaved: ex => pick(ex.id) })}>Create ${q ? `"${q}"` : 'a machine'}</button></div>`}
    <div class="bottom-space-sm"></div>
  <//>`;
}

export function confirmSheet({ title, message, confirm = 'Delete', onConfirm, destructive = true, icon = 'trash' }) {
  openSheet('actions', { title, message, actions: [{ label: confirm, destructive, icon, onSelect: onConfirm }] });
}

export function promptSheet(opts) { openSheet('prompt', opts); }

