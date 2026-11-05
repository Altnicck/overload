import { html, render, useState, useEffect, useRef } from './preact.js';
import { Icon } from './icons.js';
import { haptic, useSwipeBack } from './ui.js';
import {
  boot, useStore, go, pop, setUI, getState, dismissBanner, closeSheet, openSheet, push, updateSettings,
  getIndex, recapKeyToShow, flushActive, banner,
} from './store.js';
import { weekRecap, fmt, fmtClock, VERDICTS } from './logic.js';
import { registerSW, applyUpdate } from './version.js';
import { initViewportFit } from './viewport.js';
import { initRefraction } from './refraction.js';
import { SummaryScreen } from './screens/summary.js';
import { WorkoutScreen, RoutineScreen, RoutineEditorSheet } from './screens/workout.js';
import { MachinesScreen, MachineScreen, MachineEditorSheet } from './screens/machines.js';
import { ProgressScreen, RecapsScreen, RecapSheet } from './screens/progress.js';
import { HistoryScreen, WorkoutDetailScreen, WorkoutEditSheet } from './screens/history.js';
import { ActiveWorkout, FinishedSheet, DateTimeSheet } from './screens/active.js';
import { ActionSheet, PromptSheet, PhotoViewer, PickerSheet } from './screens/sheets.js';
import { SettingsSheet } from './screens/settings.js';
import { Onboarding } from './screens/onboarding.js';

const TABS = [
  { id: 'summary', label: 'Summary', icon: 'gauge', Root: SummaryScreen },
  { id: 'workout', label: 'Workout', icon: 'dumbbell', Root: WorkoutScreen },
  { id: 'machines', label: 'Machines', icon: 'grid', Root: MachinesScreen },
  { id: 'progress', label: 'Progress', icon: 'chart', Root: ProgressScreen },
];
const ROUTES = {
  machine: MachineScreen, routine: RoutineScreen, history: HistoryScreen,
  workoutDetail: WorkoutDetailScreen, recaps: RecapsScreen,
};
const SHEETS = {
  settings: SettingsSheet, recap: RecapSheet, machineEditor: MachineEditorSheet, routineEditor: RoutineEditorSheet,
  picker: PickerSheet, actions: ActionSheet, prompt: PromptSheet, photo: PhotoViewer, finished: FinishedSheet,
  workoutEdit: WorkoutEditSheet, datetime: DateTimeSheet,
};
const BARE_SHEETS = new Set(['actions', 'photo']);

function Layer({ route, tab, under, leaving }) {
  const ref = useRef(null);
  const C = ROUTES[route.name];
  useSwipeBack(ref, () => pop(tab), !leaving && !under);
  return html`<div ref=${ref} class=${`layer layer-pushed ${under ? 'layer-under' : ''} ${leaving ? 'layer-leave' : 'layer-enter'}`}>
    ${C ? html`<${C} ...${route} tab=${tab} />` : null}
  </div>`;
}

// Items removed from `list` stay in the returned array for `ms` so they can animate out.
// Worked out during render, not in an effect: an effect would leave one render without the item, which unmounts it
// and re-creates it from scratch (a swiped-away screen would jump back and re-render).
function useLeaving(list, ms = 320) {
  const prev = useRef(list);
  const leaving = useRef([]);
  const alive = useRef(true);
  const [, force] = useState(0);
  useEffect(() => () => { alive.current = false; }, []);
  if (prev.current !== list) {
    const removed = prev.current.filter(r => !list.some(x => x.key === r.key));
    leaving.current = leaving.current.filter(r => !list.some(x => x.key === r.key));
    if (removed.length) {
      leaving.current = [...leaving.current, ...removed];
      setTimeout(() => {
        leaving.current = leaving.current.filter(r => !removed.includes(r));
        if (alive.current) force(x => x + 1);
      }, ms);
    }
    prev.current = list;
  }
  return leaving.current;
}

function TabStack({ tab, Root, active }) {
  const stack = useStore(s => s.ui.stacks[tab]);
  const leaving = useLeaving(stack, 380);
  // One keyed list: a screen that is popped keeps its DOM node (and its swipe position) while it slides away,
  // instead of being re-created from scratch.
  const items = [
    ...stack.map((r, i) => ({ r, under: i < stack.length - 1, leaving: false })),
    ...leaving.map(r => ({ r, under: false, leaving: true })),
  ];
  return html`<div class=${'tabview ' + (active ? 'is-active' : '')} data-tab=${tab} aria-hidden=${!active}>
    <div class=${'layer layer-root ' + (stack.length ? 'layer-under' : '')}><${Root} /></div>
    ${items.map(({ r, under, leaving: lv }) => html`<${Layer} key=${r.key} route=${r} tab=${tab} under=${under} leaving=${lv} />`)}
  </div>`;
}

function TabBar() {
  const { tab, stacks } = useStore(s => ({ tab: s.ui.tab, stacks: s.ui.stacks }));
  const i = TABS.findIndex(t => t.id === tab);
  return html`<nav class="tabbar glass" aria-label="Tabs" style=${`--i:${i};--n:${TABS.length}`}>
    <div class="tab-lens" aria-hidden="true"></div>
    ${TABS.map(t => html`<button type="button" key=${t.id} class=${'tab ' + (t.id === tab ? 'on' : '')} aria-current=${t.id === tab ? 'page' : undefined}
        onClick=${() => { haptic(); go(t.id); }}>
      <${Icon} name=${t.icon} size=${25} stroke=${t.id === tab ? 2.2 : 1.9} />
      <span>${t.label}</span>
    </button>`)}
  </nav>`;
}

function Accessory() {
  const { active, open } = useStore(s => ({ active: s.active, open: s.ui.workoutOpen }));
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!active || open) return null;
  const done = active.entries.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);
  return html`<button type="button" class="accessory glass" onClick=${() => { haptic(); setUI({ workoutOpen: true }); }} aria-label="Open active workout">
    <span class="pulse-dot" aria-hidden="true"></span>
    <span class="acc-main"><b class="clamp1">${active.name}</b><small class="num">${fmtClock(Date.now() - new Date(active.startedAt))} · ${done} sets</small></span>
    <${Icon} name="chevU" size=${20} stroke=${2.3} />
  </button>`;
}

function SheetHost() {
  const sheets = useStore(s => s.ui.sheets);
  const leaving = useLeaving(sheets, 300);
  const all = [...sheets.map(s => ({ s, leaving: false })), ...leaving.map(s => ({ s, leaving: true }))];
  if (!all.length) return null;
  return html`<div class="sheet-host">
    ${all.map(({ s, leaving: lv }, i) => {
      const C = SHEETS[s.name];
      const bare = BARE_SHEETS.has(s.name);
      return html`<div key=${s.key} class=${`sheet-layer ${bare ? 'sheet-layer-bare sheet-' + s.name : ''} ${lv ? 'is-leaving' : 'is-entering'}`} style=${`z-index:${10 + i}`}>
        <div class="sheet-backdrop" onClick=${() => !lv && closeSheet(s.key)}></div>
        ${C ? html`<${C} ...${s.props} sheetKey=${s.key} />` : null}
      </div>`;
    })}
  </div>`;
}

function Banner({ b }) {
  const ref = useRef(null);
  const st = useRef(null);
  const open = () => {
    dismissBanner(b.key);
    if (b.kind === 'pr') { const s = getState(); if (s.ui.workoutOpen) return; push({ name: 'machine', id: b.exId }); }
    if (b.kind === 'recap') openSheet('recap', { week: b.week });
  };
  return html`<div ref=${ref} class=${'banner glass banner-' + b.kind} role="status" aria-live="polite" onClick=${open}
      onTouchStart=${e => { st.current = e.touches[0].clientY; }}
      onTouchMove=${e => { const dy = e.touches[0].clientY - st.current; if (dy < 0 && ref.current) ref.current.style.transform = `translateY(${dy}px)`; }}
      onTouchEnd=${e => { const dy = (e.changedTouches[0].clientY - st.current); if (dy < -30) { e.preventDefault(); dismissBanner(b.key); } else if (ref.current) ref.current.style.transform = ''; }}>
    <img class="banner-app" src="icons/icon-192.png" alt="" width="38" height="38" />
    <div class="banner-main">
      <div class="banner-top"><span>OVERLOAD</span><span>now</span></div>
      ${b.kind === 'pr' ? html`
        <div class="banner-title"><${Icon} name="trophy" size=${15} stroke=${2.4} /> New PR · ${b.exName}</div>
        <div class="banner-text"><b class="num">${b.text}</b> → est. 1RM <b class="num">${fmt(b.e)} kg</b> <span class="banner-gain num">+${fmt(b.gain)}</span></div>`
      : html`
        <div class="banner-title">${b.title}</div>
        <div class="banner-text">${b.text}</div>`}
    </div>
  </div>`;
}

function Banners() {
  const banners = useStore(s => s.ui.banners);
  return html`<div class="banners">${banners.map(b => html`<${Banner} key=${b.key} b=${b} />`)}</div>`;
}

function Toast() {
  const { toast, update } = useStore(s => ({ toast: s.ui.toast, update: s.ui.update }));
  return html`<div class="toasts" aria-live="polite">
    ${update && html`<div class="toast glass toast-update"><${Icon} name="sparkle" size=${17} /><span>A new version is ready</span>
      <button type="button" class="btn btn-accent btn-xs" onClick=${() => { setUI({ update: false }); applyUpdate(); }}>Restart</button></div>`}
    ${toast && html`<div key=${toast.key} class="toast glass">${toast.text}</div>`}
  </div>`;
}

function maybeShowRecap() {
  const s = getState();
  if (!s.settings.onboarded) return;
  const k = recapKeyToShow();
  if (s.settings.lastRecapSeen === k) return;
  const idx = getIndex();
  const r = weekRecap(idx, k);
  updateSettings({ lastRecapSeen: k });
  if (!r.workouts && !idx.list.length) return;
  setTimeout(() => banner({
    kind: 'recap', week: k, ms: 9000,
    title: `Weekly Recap · ${(VERDICTS[r.verdict] || {}).label || ''}`,
    text: r.headline,
  }), 900);
}

function App() {
  const { ready, error, onboarded, tab, sheets, workoutOpen, hasActive } = useStore(s => ({
    ready: s.ready, error: s.error, onboarded: s.settings.onboarded, tab: s.ui.tab,
    sheets: s.ui.sheets, workoutOpen: s.ui.workoutOpen, hasActive: !!s.active,
  }));
  useEffect(() => {
    if (!ready || !onboarded) return;
    maybeShowRecap();
    const onVis = () => { if (document.visibilityState === 'visible') maybeShowRecap(); else flushActive(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flushActive);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flushActive); };
  }, [ready, onboarded]);
  if (!ready) return html`<div class="boot"><img src="icons/icon-192.png" alt="" width="72" height="72" /></div>`;
  if (error) return html`<div class="boot boot-error"><h2>Overload could not open its data</h2><p class="muted">${error}</p>
    <p class="muted small">Close the app from the app switcher and open it again. If this keeps happening, restore a backup from Settings.</p></div>`;
  if (!onboarded) return html`<${Onboarding} /><${Toast} />`;
  const pageSheet = sheets.some(s => !BARE_SHEETS.has(s.name));
  return html`
    <div class=${`app ${pageSheet || (workoutOpen && hasActive) ? 'app-behind' : ''}`}>
      ${TABS.map(t => html`<${TabStack} key=${t.id} tab=${t.id} Root=${t.Root} active=${t.id === tab} />`)}
      <div class="bottom-chrome">
        <${Accessory} />
        <${TabBar} />
      </div>
    </div>
    <${ActiveWorkout} />
    <${SheetHost} />
    <${Banners} />
    <${Toast} />`;
}

// Keep the active workout safe if iOS suspends or kills the app.
window.addEventListener('beforeunload', () => { flushActive(); });

render(html`<${App} />`, document.getElementById('app'));
initViewportFit();
boot();
registerSW();
initRefraction();
