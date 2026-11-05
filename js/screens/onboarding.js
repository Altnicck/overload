import { html, useState, useRef } from '../preact.js';
import { Icon } from '../icons.js';
import { haptic } from '../ui.js';
import { useStore, updateSettings, saveGym, applyImport, getState, toast } from '../store.js';
import { decodeImportText, summarizeImport, isStandalone, isIOS } from '../importer.js';
import { fmtInt } from '../logic.js';

function Steps({ n, i }) {
  return html`<div class="ob-steps" aria-hidden="true">${Array.from({ length: n }, (_, k) => html`<i class=${k === i ? 'on' : k < i ? 'done' : ''}></i>`)}</div>`;
}

export function InstallGuide() {
  return html`<div class="onboard">
    <div class="ob-body">
      <img class="ob-icon" src="icons/icon-512.png" alt="" width="96" height="96" />
      <h1>Put Overload on your Home Screen</h1>
      <p class="muted">It then opens full screen like a real app, works with no signal in the gym, and keeps your data in one place.</p>
      <ol class="ob-list">
        <li><span class="ob-num">1</span><div>In Safari, tap <b>⋯</b> next to the address bar, then <b>Share</b> <${Icon} name="share" size=${17} />.</div></li>
        <li><span class="ob-num">2</span><div>Tap <b>Add to Home Screen</b>. Keep <b>Open as Web App</b> switched on.</div></li>
        <li><span class="ob-num">3</span><div>Open <b>Overload</b> from your Home Screen and set it up there.</div></li>
      </ol>
      <p class="ob-note"><${Icon} name="info" size=${16} /> Data saved here in Safari does not carry over to the Home Screen app.</p>
    </div>
    <div class="ob-actions">
      <button type="button" class="btn btn-glass btn-block" onClick=${() => updateSettings({ installSkipped: true })}>Continue in Safari anyway</button>
    </div>
  </div>`;
}

export function Onboarding() {
  const { settings, gyms } = useStore(s => ({ settings: s.settings, gyms: s.gyms }));
  const [step, setStep] = useState(0);
  const [gymNameV, setGymName] = useState('');
  const [code, setCode] = useState('');
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(settings.importedJefit ? { done: true } : null);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  if (isIOS() && !isStandalone() && !settings.installSkipped) return html`<${InstallGuide} />`;

  const next = () => { haptic(); setStep(s => s + 1); };
  const pasteFromClipboard = async () => {
    setErr('');
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setCode(t); await doImport(t); }
      else setErr('Clipboard is empty. Copy the code in Claude first.');
    } catch (e) { setErr('Could not read the clipboard. Long-press the box below and choose Paste.'); }
  };
  const doImport = async text => {
    setImporting(true); setErr('');
    try {
      const data = await decodeImportText(text);
      await applyImport(data, { replace: false });
      const s = summarizeImport(data);
      setImported({ ...s, done: true });
      haptic('success');
    } catch (e) { setErr(e.message || 'Import failed'); }
    setImporting(false);
  };
  const onFile = async e => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    await doImport(await f.text());
  };
  const finish = () => {
    const st = getState();
    const name = gymNameV.trim();
    if (st.gyms.length) {
      if (name) saveGym({ ...st.gyms[0], name });
    } else saveGym({ name: name || 'My Gym' });
    const g = getState().gyms[0];
    updateSettings({ onboarded: true, lastGymId: g ? g.id : null });
    haptic('success');
    toast('You are all set');
  };

  const total = (settings.baseBeforeJefit || 0) + (settings.baseJefit || 0);
  const N = 4;
  return html`<div class="onboard">
    <${Steps} n=${N} i=${step} />
    ${step === 0 && html`<div class="ob-body">
      <img class="ob-icon" src="icons/icon-512.png" alt="" width="96" height="96" />
      <h1>Overload</h1>
      <p class="muted">Every machine, at every gym, with its own photo, history and PRs.</p>
      <ul class="ob-feats">
        <li><span class="ob-fi" style="--c:var(--ring-v1)"><${Icon} name="camera" size=${20} /></span><div><b>Unlimited machines</b><small>Snap a photo of each one so you always know which leg press it was.</small></div></li>
        <li><span class="ob-fi" style="--c:var(--ring-p2)"><${Icon} name="trophy" size=${20} /></span><div><b>PR alerts</b><small>A banner pops up the moment you beat your best estimated 1RM.</small></div></li>
        <li><span class="ob-fi" style="--c:var(--ring-w2)"><${Icon} name="chart" size=${20} /></span><div><b>Weekly recap</b><small>Strong gain, held steady or a dip, exercise by exercise.</small></div></li>
      </ul>
    </div>
    <div class="ob-actions"><button type="button" class="btn btn-accent btn-block btn-lg" onClick=${next}>Get Started</button></div>`}

    ${step === 1 && html`<div class="ob-body">
      <div class="ob-hero-ic"><${Icon} name="pin" size=${34} /></div>
      <h1>Your main gym</h1>
      <p class="muted">Machines belong to a gym, so the same exercise on a different machine keeps its own records. You can add more gyms later.</p>
      <input id="ob-gym" class="input input-lg" type="text" placeholder="Gym name" value=${gymNameV} onInput=${e => setGymName(e.currentTarget.value)} autocomplete="off" />
    </div>
    <div class="ob-actions"><button type="button" class="btn btn-accent btn-block btn-lg" onClick=${next}>${gymNameV.trim() ? 'Continue' : 'Skip for now'}</button></div>`}

    ${step === 2 && html`<div class="ob-body">
      <div class="ob-hero-ic"><${Icon} name="inbox" size=${34} /></div>
      <h1>Bring your Jefit data</h1>
      ${imported ? html`<div class="card ob-success">
          <${Icon} name="check" size=${26} stroke=${2.8} />
          <div><b>Imported</b>${imported.exercises ? html`<small>${imported.exercises} machines · ${imported.routines} routines · ${imported.workouts} past sessions</small>` : html`<small>Your Jefit data is already here.</small>`}</div>
        </div>
        <p class="muted small">Lifetime counter starts at ${fmtInt((getState().settings.baseBeforeJefit || 0) + (getState().settings.baseJefit || 0))} workouts.</p>`
      : html`<p class="muted">Paste the import code Claude gave you. It holds your PRs, routines and recent history from the screen recording.</p>
        <button type="button" class="btn btn-accent btn-block" onClick=${pasteFromClipboard} disabled=${importing}><${Icon} name="copy" size=${18} /> ${importing ? 'Importing…' : 'Paste code from clipboard'}</button>
        <textarea id="ob-code" class="input textarea code" rows="4" placeholder="…or long-press here and choose Paste" value=${code} onInput=${e => setCode(e.currentTarget.value)}></textarea>
        ${code.trim() && html`<button type="button" class="btn btn-glass btn-block" onClick=${() => doImport(code)} disabled=${importing}>Import pasted code</button>`}
        <input ref=${fileRef} id="ob-file" type="file" accept=".json,application/json,text/plain" class="visually-hidden" onChange=${onFile} />
        <button type="button" class="btn btn-glass btn-block" onClick=${() => fileRef.current && fileRef.current.click()} disabled=${importing}><${Icon} name="inbox" size=${18} /> Choose import file instead</button>
        ${err && html`<p class="ob-err">${err}</p>`}`}
    </div>
    <div class="ob-actions"><button type="button" class="btn ${imported ? 'btn-accent' : 'btn-glass'} btn-block btn-lg" onClick=${next}>${imported ? 'Continue' : 'Skip, start fresh'}</button></div>`}

    ${step === 3 && html`<div class="ob-body">
      <div class="ob-hero-ic"><${Icon} name="shield" size=${34} /></div>
      <h1>Keep your data safe</h1>
      <p class="muted">Everything stays on this iPhone. No account, no cloud.</p>
      <ul class="ob-feats">
        <li><span class="ob-fi" style="--c:#ff7a45"><${Icon} name="trash" size=${20} /></span><div><b>Removing the icon erases the data</b><small>Deleting Overload from your Home Screen deletes its workouts and photos.</small></div></li>
        <li><span class="ob-fi" style="--c:var(--ring-v1)"><${Icon} name="shield" size=${20} /></span><div><b>Back up from Settings</b><small>Save a backup file to iCloud Drive. The weekly recap reminds you.</small></div></li>
        <li><span class="ob-fi" style="--c:var(--ring-p2)"><${Icon} name="bolt" size=${20} /></span><div><b>Works offline</b><small>No signal in the gym is fine. Updates install by themselves.</small></div></li>
      </ul>
      ${total > 0 && html`<p class="muted small">Workout #${fmtInt(total + 1)} is waiting.</p>`}
    </div>
    <div class="ob-actions"><button type="button" class="btn btn-accent btn-block btn-lg" onClick=${finish}>Start Training</button></div>`}
  </div>`;
}

