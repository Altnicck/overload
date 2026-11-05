import { html, useState } from '../preact.js';
import { Icon } from '../icons.js';
import { Screen, Section, Thumb, SheetFrame, Segmented, haptic, Empty, muscleColor } from '../ui.js';
import { BarChart, Sparkline } from '../charts.js';
import { useStore, useIndex, push, openSheet, recapKeyToShow, gymName } from '../store.js';
import { fmt, fmtInt, fmtDate, weekKey, addDays, keyToDate, weekRecap, fmtWeekRange, pct, plural, ymd, weekStart } from '../logic.js';
import { VerdictChip, Delta, MusclesCard, openRecap } from './common.js';

function lastNWeeks(n, now = new Date()) {
  const out = [];
  let k = weekKey(now);
  for (let i = 0; i < n; i++) { out.unshift(k); k = weekKey(addDays(keyToDate(k), -7)); }
  return out;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Every day of the last few months as a square, brighter the more sets you did.
function ConsistencyCard({ list, weeks = 18, onDay }) {
  const now = new Date();
  const start = addDays(weekStart(now), -7 * (weeks - 1));
  const byDay = new Map();
  for (const w of list) {
    const k = ymd(w.startedAt);
    const n = w.entries.reduce((a, en) => a + en.sets.filter(x => x.done !== false).length, 0);
    byDay.set(k, (byDay.get(k) || 0) + Math.max(1, n));
  }
  const today = ymd(now);
  let count = 0;
  const cols = [];
  for (let c = 0; c < weeks; c++) {
    const colStart = addDays(start, c * 7);
    const label = colStart.getDate() <= 7 ? MONTH_SHORT[colStart.getMonth()] : '';
    const cells = [];
    for (let r = 0; r < 7; r++) {
      const d = addDays(colStart, r);
      const k = ymd(d);
      const n = byDay.get(k) || 0;
      if (n && k <= today) count++;
      const lvl = k > today ? 'f' : !n ? '0' : n < 10 ? '1' : n < 18 ? '2' : '3';
      cells.push(html`<i key=${k} class=${'cg-' + lvl} title=${n ? `${fmtDate(d)} · ${n} sets` : fmtDate(d)}></i>`);
    }
    cols.push(html`<div class="cg-col" key=${c}><span class="cg-m">${label}</span>${cells}</div>`);
  }
  return html`<section class="card cg-card" aria-label="Training days">
    <div class="card-head"><h3>Consistency</h3><span class="muted small">${plural(count, 'day')} trained · ${weeks} weeks</span></div>
    <div class="cg-grid">${cols}</div>
    <div class="cg-legend"><span>Less</span><i class="cg-0"></i><i class="cg-1"></i><i class="cg-2"></i><i class="cg-3"></i><span>More sets</span></div>
  </section>`;
}

export function ProgressScreen() {
  const { exercises } = useStore(s => ({ exercises: s.exercises, workouts: s.workouts }));
  const index = useIndex();
  const [view, setView] = useState('records');
  const [sort, setSort] = useState('recent');
  const recs = exercises.map(ex => ({ ex, st: index.stats.get(ex.id) })).filter(r => r.st && r.st.bestE > 0);
  const lastPrT = new Map();
  for (const p of index.prEvents) lastPrT.set(p.exId, p.t);
  const sorted = recs.slice().sort((a, b) => {
    if (sort === 'best') return b.st.bestE - a.st.bestE;
    if (sort === 'az') return a.ex.name.localeCompare(b.ex.name);
    const ta = lastPrT.get(a.ex.id) || (a.st.best ? a.st.best.t : 0), tb = lastPrT.get(b.ex.id) || (b.st.best ? b.st.best.t : 0);
    return tb - ta;
  });
  const weeks = lastNWeeks(12);
  const volBars = weeks.map(k => { const W = index.weeks.get(k); return { v: W ? W.volume : 0, label: 'Week of ' + fmtWeekRange(k), short: fmtDate(keyToDate(k), false), sub: W ? `${W.workouts} workouts · ${W.sets} sets` : 'No workouts' }; });
  const wkBars = weeks.map(k => { const W = index.weeks.get(k); return { v: W ? W.workouts : 0, label: 'Week of ' + fmtWeekRange(k), short: fmtDate(keyToDate(k), false), sub: W ? `${fmtInt(W.volume)} kg` : '' }; });
  const firstApp = index.list.find(w => !w.imported);
  const importedOnly = index.list.some(w => w.imported);
  // most improved over 90 days
  const since = Date.now() - 90 * 864e5;
  const improved = [];
  for (const ex of exercises) {
    const ss = (index.byEx.get(ex.id) || []).filter(s => s.t >= since);
    if (ss.length < 2) continue;
    const first = ss[0].best.e, best = Math.max(...ss.map(s => s.best.e));
    if (first > 0) improved.push({ ex, d: (best - first) / first, first, best });
  }
  improved.sort((a, b) => b.d - a.d);
  const recapWeeks = lastNWeeks(9).slice(0, -1).reverse();
  const totalPRs = index.prEvents.length;
  return html`<${Screen} title="Progress" tab="progress">
    <${Segmented} value=${view} onChange=${setView} options=${[{ value: 'records', label: 'Records' }, { value: 'trends', label: 'Trends' }]} />
    ${view === 'records' ? html`
      <div class="pr-summary">
        <div style="--ic:var(--accent)"><i><${Icon} name="dumbbell" size=${18} stroke=${2.2} /></i><b class="num">${recs.length}</b><span>machines with a record</span></div>
        <div style="--ic:var(--ring-p2)"><i><${Icon} name="trophy" size=${18} stroke=${2.2} /></i><b class="num">${totalPRs}</b><span>PRs logged</span></div>
      </div>
      <div class="sort-row">
        <span class="muted small">Sort</span>
        <${Segmented} cls="seg-sm" value=${sort} onChange=${setSort} options=${[{ value: 'recent', label: 'Recent' }, { value: 'best', label: 'Heaviest' }, { value: 'az', label: 'A–Z' }]} />
      </div>
      ${sorted.length ? html`<div class="list">${sorted.map(({ ex, st }) => {
        const ss = index.byEx.get(ex.id) || [];
        const spark = ss.slice(-8).map(s => s.best.e);
        return html`<button key=${ex.id} type="button" class="row row-tap rec-row" onClick=${() => { haptic(); push({ name: 'machine', id: ex.id }, 'progress'); }}>
          <${Thumb} ex=${ex} size=${46} />
          <div class="row-main">
            <div class="row-title clamp2">${ex.name}</div>
            <div class="row-sub">${st.best && !st.baselineWins ? `${fmt(st.best.w)} × ${st.best.r} · ${fmtDate(st.best.t)}` : (ex.baseline && ex.baseline.label) || ''}${ex.gymId ? '' : ''}</div>
          </div>
          <div class="rec-end">
            <${Sparkline} values=${spark} color=${muscleColor(ex.muscle)} />
            <div class="rec-val num">${fmt(st.bestE)}<small> kg</small></div>
          </div>
        </button>`;
      })}</div>` : html`<div class="card"><${Empty} icon="trophy" title="No records yet" text="Log sets and your best estimated 1RM per machine appears here." /></div>`}
    ` : html`
      <${ConsistencyCard} list=${index.list} />
      <${MusclesCard} list=${index.list} exById=${index.exById} days=${30} rows=${6} target=${36} title="Muscle balance" sub="Last 30 days" />
      <${Section} title="Volume per week">
        <div class="card chart-card"><${BarChart} bars=${volBars} unit="kg" color="var(--ring-v1)" title="This week" format=${v => fmtInt(v)} />
          ${importedOnly && html`<p class="muted small chart-note">Weeks before ${firstApp ? fmtDate(firstApp.startedAt) : 'your first Overload workout'} only include the Jefit sessions visible in your recording.</p>`}</div>
      <//>
      <${Section} title="Workouts per week">
        <div class="card chart-card"><${BarChart} bars=${wkBars} unit="" color="var(--ring-w2)" title="This week" format=${v => fmt(v, 1)} /></div>
      <//>
      <${Section} title="Most improved · 90 days">
        ${improved.length ? html`<div class="list">${improved.slice(0, 6).map(r => html`<button key=${r.ex.id} type="button" class="row row-tap" onClick=${() => push({ name: 'machine', id: r.ex.id }, 'progress')}>
          <${Thumb} ex=${r.ex} size=${40} />
          <div class="row-main"><div class="row-title clamp2">${r.ex.name}</div><div class="row-sub num">${fmt(r.first)} → ${fmt(r.best)} kg est. 1RM</div></div>
          <div class="row-end"><${Delta} d=${r.d} digits=${1} /></div>
        </button>`)}</div>` : html`<div class="card"><${Empty} icon="chart" title="Not enough data yet" text="After two sessions on a machine, its gain shows up here." /></div>`}
      <//>
      <${Section} title="Weekly recaps" action="All" onAction=${() => push({ name: 'recaps' }, 'progress')}>
        <div class="list">${recapWeeks.slice(0, 5).map(k => { const r = weekRecap(index, k); return html`<button key=${k} type="button" class="row row-tap" onClick=${() => openRecap(k)}>
          <div class="row-main"><div class="row-title">${fmtWeekRange(k)}</div><div class="row-sub">${plural(r.workouts, 'workout')} · ${r.up}/${r.n} improved · ${plural(r.prs.length, 'PR')}</div></div>
          <div class="row-end"><${VerdictChip} verdict=${r.verdict} size="sm" /><${Icon} name="chevR" size=${16} cls="chev" /></div>
        </button>`; })}</div>
      <//>
    `}
    <div class="bottom-space"></div>
  <//>`;
}

export function RecapsScreen({ tab }) {
  const index = useIndex();
  const weeks = lastNWeeks(27).slice(0, -1).reverse();
  return html`<${Screen} title="Weekly Recaps" pushed tab=${tab}>
    <p class="muted lead">Each week is compared with the session before it on every exercise you trained.</p>
    <div class="list">${weeks.map(k => { const r = weekRecap(index, k); return html`<button key=${k} type="button" class="row row-tap" onClick=${() => openRecap(k)}>
      <div class="row-main"><div class="row-title">${fmtWeekRange(k)}</div><div class="row-sub">${r.workouts ? `${plural(r.workouts, 'workout')} · ${r.up}/${r.n} improved · ${plural(r.prs.length, 'PR')}` : 'No workouts'}</div></div>
      <div class="row-end"><${VerdictChip} verdict=${r.verdict} size="sm" /><${Icon} name="chevR" size=${16} cls="chev" /></div>
    </button>`; })}</div>
    <div class="bottom-space"></div>
  <//>`;
}

export function RecapSheet({ sheetKey, week }) {
  const index = useIndex();
  const { settings, gyms } = useStore(s => ({ settings: s.settings, gyms: s.gyms }));
  const multiGym = gyms.length > 1;
  const k = week || recapKeyToShow();
  const r = weekRecap(index, k);
  const exById = index.exById;
  const groups = [
    { id: 'up', title: 'Improved', icon: 'up', cls: 'up' },
    { id: 'same', title: 'Held steady', icon: 'equal', cls: 'flat' },
    { id: 'down', title: 'Below last session', icon: 'down', cls: 'down' },
    { id: 'new', title: 'First time', icon: 'sparkle', cls: 'flat' },
  ];
  const backupDays = settings.lastBackup ? Math.floor((Date.now() - settings.lastBackup) / 864e5) : null;
  return html`<${SheetFrame} sheetKey=${sheetKey} title="Weekly Recap" full>
    <div class="recap-hero">
      <div class="muted">${fmtWeekRange(k)}</div>
      <${VerdictChip} verdict=${r.verdict} size="lg" />
      <p class="recap-headline big">${r.headline}</p>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Workouts</div><div class="stat-value num">${r.workouts}<small>/${settings.weekGoal || 4}</small></div><div class="stat-sub">${r.prevWorkouts} the week before</div></div>
      <div class="stat"><div class="stat-label">Volume</div><div class="stat-value num">${fmtInt(r.volume)}<small> kg</small></div><div class="stat-sub">${r.volDelta === null ? 'No week before to compare' : pct(r.volDelta) + ' vs week before'}</div></div>
      <div class="stat"><div class="stat-label">Exercises improved</div><div class="stat-value num">${r.up}<small>/${r.n}</small></div><div class="stat-sub">${r.same} held · ${r.down} lower</div></div>
      <div class="stat"><div class="stat-label">New PRs</div><div class="stat-value num" style=${r.prs.length ? 'color:var(--ring-p2)' : ''}>${r.prs.length}</div><div class="stat-sub">est. 1RM records</div></div>
    </div>
    ${r.prs.length > 0 && html`<div class="group-label">PRs this week</div>
      <div class="list">${r.prs.map(p => html`<div class="row" key=${p.exId + p.t}>
        <div class="row-ic" style="--ic:var(--ring-p2)"><${Icon} name="trophy" size=${20} /></div>
        <div class="row-main"><div class="row-title clamp2">${(exById.get(p.exId) || {}).name}</div><div class="row-sub">${fmt(p.w)} kg × ${p.r} · ${fmt(p.e)} kg est. 1RM</div></div>
        <div class="row-end"><span class="delta delta-up">+${fmt(p.e - p.prev)}</span></div>
      </div>`)}</div>`}
    ${groups.map(g => {
      const rows = r.rows.filter(x => x.status === g.id);
      if (!rows.length) return null;
      return html`<div class="group-label">${g.title} <span class="muted">${rows.length}</span></div>
        <div class="list">${rows.map(x => { const ex = exById.get(x.exId); return html`<div class="row" key=${x.exId}>
          <${Thumb} ex=${ex} size=${40} />
          <div class="row-main"><div class="row-title clamp2">${ex ? ex.name : 'Exercise'}</div>
            <div class="row-sub num">${x.before ? `${fmt(x.before.best.w)}×${x.before.best.r} → ` : ''}${fmt(x.cur.best.w)}×${x.cur.best.r}${multiGym && ex && ex.gymId ? ' · ' + gymName(ex.gymId) : ''}</div></div>
          <div class="row-end">${x.before ? html`<${Delta} d=${x.de} digits=${1} />` : html`<span class="muted small">New</span>`}</div>
        </div>`; })}</div>`;
    })}
    ${r.stalled.length > 0 && html`<div class="group-label">Plateau watch</div>
      <div class="card plateau-card"><p class="muted small">No new best in the last 3 sessions. Try one more rep or a small jump in weight.</p>
        ${r.stalled.map(s => html`<div class="plateau-row" key=${s.exId}><span>${(exById.get(s.exId) || {}).name}</span><b class="num">${fmt(s.best)} kg</b></div>`)}
      </div>`}
    ${(backupDays === null || backupDays >= 7) && html`<button type="button" class="card card-tap backup-nudge" onClick=${() => openSheet('settings', { focus: 'backup' })}>
      <${Icon} name="shield" size=${22} />
      <div class="row-main"><div class="row-title">Back up your data</div><div class="row-sub">${backupDays === null ? 'You have not made a backup yet.' : `Last backup ${backupDays} days ago.`} Save one to iCloud Drive in two taps.</div></div>
      <${Icon} name="chevR" size=${16} cls="chev" />
    </button>`}
    <div class="bottom-space-sm"></div>
  <//>`;
}

