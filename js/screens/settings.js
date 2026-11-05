import { html, useState, useRef, useEffect } from '../preact.js';
import { Icon } from '../icons.js';
import { SheetFrame, Stepper, Toggle, haptic } from '../ui.js';
import { useStore, updateSettings, saveGym, deleteGym, buildBackup, applyImport, eraseEverything, toast, closeSheet, setUI } from '../store.js';
import { fmtInt, lifetimeCount, ymd, fmtDate } from '../logic.js';
import { decodeImportText, summarizeImport } from '../importer.js';
import { promptSheet, confirmSheet } from './sheets.js';
import { APP_VERSION, checkForUpdate } from '../version.js';
import { screenFit } from '../viewport.js';
import { refraction } from '../refraction.js';

export function SettingsSheet({ sheetKey, focus }) {
  const { settings, gyms, workouts, exercises } = useStore(s => ({ settings: s.settings, gyms: s.gyms, workouts: s.workouts, exercises: s.exercises }));
  const [prepared, setPrepared] = useState(null);
  const [busy, setBusy] = useState(false);
  const [eraseStep, setEraseStep] = useState(0);
  const restoreRef = useRef(null);
  const backupRef = useRef(null);
  useEffect(() => { if (focus === 'backup' && backupRef.current) setTimeout(() => backupRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350); }, []);
  const appCount = workouts.filter(w => w.endedAt && !w.imported).length;
  const total = lifetimeCount(settings, workouts);

  const prepare = async () => {
    setBusy(true);
    try {
      const data = await buildBackup();
      const name = `overload-backup-${ymd(new Date())}.json`;
      const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
      setPrepared({ file, name, size: file.size });
    } catch (e) { toast('Could not build the backup'); }
    setBusy(false);
  };
  const share = async () => {
    if (!prepared) return;
    const { file, name } = prepared;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Overload backup' });
        updateSettings({ lastBackup: Date.now() });
        toast('Backup saved');
        setPrepared(null);
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    updateSettings({ lastBackup: Date.now() });
    toast('Backup downloaded');
    setPrepared(null);
  };
  const onRestore = async e => {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      const data = await decodeImportText(await file.text());
      if (data.app !== 'overload') throw new Error('Not an Overload backup');
      const s = summarizeImport(data);
      if (data.kind === 'jefit-import') {
        await applyImport(data, { replace: false });
        toast(`Imported ${s.exercises} machines and ${s.workouts} sessions`);
        return;
      }
      confirmSheet({
        title: 'Replace everything with this backup?',
        message: `${s.exercises} machines · ${s.workouts} workouts · ${s.photos} photos${data.exportedAt ? ' · saved ' + fmtDate(data.exportedAt, true) : ''}. What is on this phone now will be replaced.`,
        confirm: 'Restore backup', icon: 'inbox',
        onConfirm: async () => { try { await applyImport(data, { replace: true }); toast('Backup restored'); } catch (err) { toast(err.message || 'Restore failed'); } },
      });
    } catch (err) { toast('That file is not an Overload backup'); }
  };
  const importCode = () => promptSheet({
    title: 'Import Code', label: 'Paste the code from Claude', multiline: true, placeholder: 'OVL1:…', saveLabel: 'Import',
    onSave: async v => {
      try {
        const data = await decodeImportText(v);
        await applyImport(data, { replace: false });
        const s = summarizeImport(data);
        toast(`Imported ${s.exercises} machines and ${s.workouts} sessions`);
      } catch (err) { toast(err.message || 'Import failed'); }
    },
  });
  const renameGym = g => promptSheet({ title: 'Rename Gym', value: g.name, onSave: v => v.trim() && saveGym({ ...g, name: v.trim() }) });
  const removeGym = g => {
    const n = exercises.filter(e => e.gymId === g.id).length;
    const other = gyms.find(x => x.id !== g.id);
    confirmSheet({
      title: `Delete ${g.name}?`, message: n ? `Its ${n} machines move to ${other ? other.name : 'Any gym'}. Their history stays.` : 'No machines are assigned to it.',
      onConfirm: () => { deleteGym(g.id); toast('Gym deleted'); },
    });
  };
  const backupAge = settings.lastBackup ? Math.floor((Date.now() - settings.lastBackup) / 864e5) : null;

  return html`<${SheetFrame} sheetKey=${sheetKey} title="Settings" full left=${null} right=${html`<button type="button" class="btn btn-accent btn-sm" onClick=${() => closeSheet(sheetKey)}>Done</button>`}>
    <div class="group-label">Profile</div>
    <div class="list">
      <label class="row" for="set-name"><div class="row-main"><div class="row-title">Your name</div></div>
        <input id="set-name" class="input-inline" type="text" placeholder="Name" value=${settings.name} onChange=${e => updateSettings({ name: e.currentTarget.value.trim() })} /></label>
    </div>

    <div class="group-label">Gyms</div>
    <div class="list">
      ${gyms.map(g => html`<div class="row" key=${g.id}>
        <div class="row-ic" style="--ic:var(--accent)"><${Icon} name="pin" size=${19} /></div>
        <button type="button" class="row-main row-main-btn" onClick=${() => renameGym(g)}>
          <div class="row-title">${g.name}</div><div class="row-sub">${exercises.filter(e => e.gymId === g.id).length} machines · tap to rename</div></button>
        ${gyms.length > 1 && html`<button type="button" class="icon-btn danger" aria-label=${'Delete ' + g.name} onClick=${() => removeGym(g)}><${Icon} name="trash" size=${18} /></button>`}
      </div>`)}
      <button type="button" class="row row-tap add-row" onClick=${() => promptSheet({ title: 'New Gym', label: 'Gym name', saveLabel: 'Add', onSave: v => v.trim() && saveGym({ name: v.trim() }) })}>
        <div class="row-ic" style="--ic:var(--accent)"><${Icon} name="plus" size=${20} stroke=${2.4} /></div>
        <div class="row-main"><div class="row-title tint">Add gym</div></div>
      </button>
    </div>

    <div class="group-label">Weekly goals</div>
    <div class="list">
      <div class="row"><div class="row-main"><div class="row-title">Workouts per week</div><div class="row-sub">Red ring on Summary</div></div>
        <${Stepper} id="set-weekgoal" value=${settings.weekGoal} min=${1} max=${14} onChange=${v => updateSettings({ weekGoal: v })} /></div>
      <div class="row"><div class="row-main"><div class="row-title">PRs per week</div><div class="row-sub">Blue ring on Summary</div></div>
        <${Stepper} id="set-prgoal" value=${settings.prGoal} min=${1} max=${20} onChange=${v => updateSettings({ prGoal: v })} /></div>
    </div>

    <div class="group-label">Workout counter</div>
    <div class="list">
      <label class="row" for="set-before"><div class="row-main"><div class="row-title">Before Jefit</div></div>
        <input id="set-before" class="input-inline num" type="text" inputmode="numeric" value=${settings.baseBeforeJefit} onChange=${e => updateSettings({ baseBeforeJefit: Math.max(0, parseInt(e.currentTarget.value, 10) || 0) })} /></label>
      <label class="row" for="set-jefit"><div class="row-main"><div class="row-title">In Jefit</div></div>
        <input id="set-jefit" class="input-inline num" type="text" inputmode="numeric" value=${settings.baseJefit} onChange=${e => updateSettings({ baseJefit: Math.max(0, parseInt(e.currentTarget.value, 10) || 0) })} /></label>
      <div class="row"><div class="row-main"><div class="row-title">Logged in Overload</div></div><span class="num muted">${fmtInt(appCount)}</span></div>
      <div class="row"><div class="row-main"><div class="row-title"><b>Lifetime total</b></div></div><span class="num tint"><b>${fmtInt(total)}</b></span></div>
    </div>

    <div class="group-label" ref=${backupRef}>Backup</div>
    <div class="card backup-card">
      <p class="muted small">Your data lives only on this iPhone. Deleting the Overload icon from your Home Screen deletes it too. Save a backup to iCloud Drive or Files every week or two.</p>
      <div class="muted small">${backupAge === null ? 'No backup yet' : backupAge === 0 ? 'Last backup today' : `Last backup ${backupAge} day${backupAge === 1 ? '' : 's'} ago`}</div>
      ${prepared
        ? html`<button type="button" class="btn btn-accent btn-block" onClick=${share}><${Icon} name="share" size=${18} /> Save backup file (${Math.max(1, Math.round(prepared.size / 1024))} KB)</button>`
        : html`<button type="button" class="btn btn-accent btn-block" onClick=${prepare} disabled=${busy}><${Icon} name="shield" size=${18} /> ${busy ? 'Preparing…' : 'Back up now'}</button>`}
      <input ref=${restoreRef} id="restore-input" type="file" accept="application/json,.json,text/plain" class="visually-hidden" onChange=${onRestore} />
      <div class="btn-row">
        <button type="button" class="btn btn-glass" onClick=${() => restoreRef.current && restoreRef.current.click()}><${Icon} name="inbox" size=${17} /> Restore</button>
        <button type="button" class="btn btn-glass" onClick=${importCode}><${Icon} name="link" size=${17} /> Import code</button>
      </div>
    </div>

    <div class="group-label">PR alerts</div>
    <div class="list">
      <div class="row"><div class="row-main"><div class="row-title">Sound</div><div class="row-sub">A short chime on a new est. 1RM</div></div>
        <${Toggle} id="set-sound" label="Sound" checked=${settings.sound !== false} onChange=${v => updateSettings({ sound: v })} /></div>
      <div class="row"><div class="row-main"><div class="row-title">Haptics</div></div>
        <${Toggle} id="set-haptics" label="Haptics" checked=${settings.haptics !== false} onChange=${v => updateSettings({ haptics: v })} /></div>
    </div>

    <div class="group-label">About</div>
    <div class="list">
      <div class="row"><div class="row-main"><div class="row-title">Version</div></div><span class="muted num">${APP_VERSION}</span></div>
      <div class="row"><div class="row-main"><div class="row-title">Glass effect</div><div class="row-sub">How the tab bar bends what is behind it</div></div>
        <span class=${'num ' + (refraction.mode === 'scroll-timeline' ? 'tint' : 'muted')}>${refraction.mode === 'scroll-timeline' ? 'Refraction' : refraction.mode === 'scroll-listener' ? 'Refraction (backup sync)' : 'Frosted'}</span></div>
      ${screenFit.checked && html`<div class="row"><div class="row-main"><div class="row-title">Screen fit</div><div class="row-sub">Checks that the app reaches the bottom of the screen</div></div>
        <span class=${'num ' + (screenFit.gap ? 'muted' : 'tint')}>${screenFit.gap ? `${screenFit.gap} pt short` : 'Full screen'}</span></div>`}
      <button type="button" class="row row-tap" onClick=${checkForUpdate}><div class="row-main"><div class="row-title tint">Check for updates</div></div><${Icon} name="refresh" size=${18} cls="tint" /></button>
      <button type="button" class="row row-tap" onClick=${() => { closeSheet(sheetKey); setUI({ tab: 'summary' }); setTimeout(() => updateSettings({ onboarded: false, installSkipped: true }), 300); }}><div class="row-main"><div class="row-title">Show welcome screens again</div></div></button>
    </div>

    <div class="group-label">Danger zone</div>
    <div class="card">
      ${eraseStep === 0 && html`<button type="button" class="btn btn-block btn-danger-text" onClick=${() => setEraseStep(1)}>Erase all data</button>`}
      ${eraseStep === 1 && html`<div class="confirm-box"><p>This deletes every machine, photo, routine and workout on this phone. Make a backup first.</p>
        <div class="btn-row"><button type="button" class="btn btn-glass" onClick=${() => setEraseStep(0)}>Cancel</button>
        <button type="button" class="btn btn-danger" onClick=${() => setEraseStep(2)}>Continue</button></div></div>`}
      ${eraseStep === 2 && html`<div class="confirm-box"><p><b>Last check.</b> Erase everything now?</p>
        <div class="btn-row"><button type="button" class="btn btn-glass" onClick=${() => setEraseStep(0)}>Keep my data</button>
        <button type="button" class="btn btn-danger" onClick=${async () => { await eraseEverything(); haptic(); toast('All data erased'); }}>Erase</button></div></div>`}
    </div>
    <div class="bottom-space-sm"></div>
  <//>`;
}
