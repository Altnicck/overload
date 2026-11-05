// Pure calculations: PRs, estimated 1RM, weeks, recaps, streaks, formatting.
// Est. 1RM uses the Epley formula, the same one Jefit uses, so imported numbers match.

export const MUSCLES = [
  { id: 'chest', label: 'Chest', color: '#ff6482' },
  { id: 'back', label: 'Back', color: '#4a9dff' },
  { id: 'shoulders', label: 'Shoulders', color: '#ff9f0a' },
  { id: 'biceps', label: 'Biceps', color: '#bf5af2' },
  { id: 'triceps', label: 'Triceps', color: '#8e86ff' },
  { id: 'legs', label: 'Legs', color: '#30d158' },
  { id: 'calves', label: 'Calves', color: '#40c8e0' },
  { id: 'core', label: 'Core', color: '#ffd60a' },
  { id: 'cardio', label: 'Cardio', color: '#ff453a' },
  { id: 'other', label: 'Other', color: '#98989d' },
];
export const MUSCLE = Object.fromEntries(MUSCLES.map(m => [m.id, m]));

export const MODES = [
  { id: 'total', label: 'Total', short: '' },
  { id: 'perSide', label: 'Per side', short: '/side' },
  { id: 'perDB', label: 'Per dumbbell', short: '/DB' },
];
export const MODE = Object.fromEntries(MODES.map(m => [m.id, m]));

export const VERDICTS = {
  strong: { label: 'Strong gain', color: 'var(--accent)', ink: 'var(--accent-ink)' },
  gain: { label: 'Gain', color: '#30d158', ink: '#04210b' },
  maintain: { label: 'Maintained', color: '#ffd60a', ink: '#2a2300' },
  dip: { label: 'Dip', color: '#ff7a45', ink: '#2b0f00' },
  rest: { label: 'Rest week', color: '#8e8e93', ink: '#111' },
  baseline: { label: 'Baseline', color: '#64d2ff', ink: '#001f2a' },
};

const DAY = 86400000;

export function num(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return NaN;
  return Number(s);
}

export function e1rm(w, r) {
  w = num(w); r = num(r);
  if (!(w > 0) || !(r > 0)) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

export const round2 = x => Math.round(x * 100) / 100;

export function fmt(x, max = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return '–';
  return Number(round2(x)).toLocaleString('en-US', { maximumFractionDigits: max });
}
export const fmtInt = n => Math.round(n || 0).toLocaleString('en-US');
export function fmtW(w) { const n = num(w); return Number.isNaN(n) ? '–' : fmt(n); }
export function setLabel(w, r) { return `${fmtW(w)} × ${num(r) || 0}`; }

export const plural = (n, word, many) => `${n} ${n === 1 ? word : (many || word + 's')}`;

export function pct(x, digits = 0) {
  if (!Number.isFinite(x)) return '–';
  const v = x * 100;
  const s = Math.abs(v) < 0.05 ? '0' : v.toFixed(digits);
  return (v > 0 ? '+' : '') + s + '%';
}

const pad = n => String(n).padStart(2, '0');
export function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function weekStart(d) { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
export function weekKey(d) { return ymd(weekStart(d)); }
export function keyToDate(k) { return new Date(k + 'T00:00:00'); }
export function wTime(w) { return new Date(w.startedAt).getTime(); }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function fmtDate(d, withYear) {
  const x = new Date(d);
  const y = withYear === undefined ? x.getFullYear() !== new Date().getFullYear() : withYear;
  return `${MON[x.getMonth()]} ${x.getDate()}${y ? ', ' + x.getFullYear() : ''}`;
}
export function fmtDay(d) { const x = new Date(d); return `${WD[x.getDay()]}, ${MON[x.getMonth()]} ${x.getDate()}`; }
export function fmtTime(d) { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; }
export function fmtWeekRange(k) {
  const s = keyToDate(k), e = addDays(s, 6);
  return s.getMonth() === e.getMonth()
    ? `${MON[s.getMonth()]} ${s.getDate()} – ${e.getDate()}`
    : `${MON[s.getMonth()]} ${s.getDate()} – ${MON[e.getMonth()]} ${e.getDate()}`;
}
export function relDay(d) {
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return fmtDate(d);
}
export function fmtDuration(ms) {
  if (!(ms > 0)) return '–';
  const m = Math.round(ms / 60000);
  if (m < 1) return '<1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

export function volMult(ex) { return ex && (ex.mode === 'perSide' || ex.mode === 'perDB') ? 2 : 1; }

export function isDone(w) { return !!(w && (w.endedAt || w.imported)); }

// ---------- Index of all finished workouts ----------
// Built once per workouts/exercises change. Everything else reads from it.
export function buildIndex(workouts, exercises) {
  const exById = new Map(exercises.map(e => [e.id, e]));
  const list = workouts.filter(isDone).sort((a, b) => wTime(a) - wTime(b));
  const byEx = new Map();     // exId -> sessions ascending
  const prEvents = [];        // chronological e1RM PRs
  const weeks = new Map();    // weekKey -> {workouts, volume, sets, prs}
  const running = new Map();  // exId -> best e1RM so far
  for (const ex of exercises) if (ex.baseline && ex.baseline.e1rm > 0) running.set(ex.id, ex.baseline.e1rm);

  for (const w of list) {
    const t = wTime(w);
    const wk = weekKey(t);
    let W = weeks.get(wk);
    if (!W) { W = { key: wk, workouts: 0, volume: 0, sets: 0, prs: 0, appWorkouts: 0 }; weeks.set(wk, W); }
    W.workouts++;
    if (!w.imported) W.appWorkouts++;
    for (const en of w.entries || []) {
      const ex = exById.get(en.exId);
      const mult = volMult(ex);
      const sets = [];
      for (const s of en.sets || []) {
        if (!s.done) continue;
        const wv = num(s.w), rv = num(s.r);
        if (!(rv > 0) || Number.isNaN(wv)) continue;
        sets.push({ w: wv, r: rv, e: e1rm(wv, rv) });
      }
      if (!sets.length) continue;
      let best = sets[0], vol = 0, top = sets[0];
      const prev = running.get(en.exId) || 0;
      let runBest = prev;
      const prSets = [];
      for (let i = 0; i < sets.length; i++) {
        const s = sets[i];
        vol += s.w * s.r * mult;
        if (s.e > best.e + 1e-9 || (Math.abs(s.e - best.e) < 1e-9 && s.w > best.w)) best = s;
        if (s.w > top.w || (s.w === top.w && s.r > top.r)) top = s;
        // A PR needs an earlier record to beat: the first session on a machine only sets the baseline.
        if (s.e > runBest + 1e-6) {
          if (prev > 0) prSets.push(i);
          runBest = s.e;
        }
      }
      if (prSets.length) {
        const i = prSets[prSets.length - 1];
        prEvents.push({ exId: en.exId, wid: w.id, t, w: sets[i].w, r: sets[i].r, e: sets[i].e, prev });
        W.prs++;
      }
      running.set(en.exId, runBest);
      W.volume += vol;
      W.sets += sets.length;
      const sess = { wid: w.id, t, sets, best, top, vol, pr: prSets.length > 0, imported: !!w.imported, gymId: w.gymId };
      if (!byEx.has(en.exId)) byEx.set(en.exId, []);
      byEx.get(en.exId).push(sess);
    }
  }

  const stats = new Map();
  for (const ex of exercises) {
    const ss = byEx.get(ex.id) || [];
    let best = null, heavy = null, bestVol = null;
    for (const s of ss) {
      if (!best || s.best.e > best.e + 1e-9) best = { ...s.best, t: s.t, wid: s.wid };
      if (!heavy || s.top.w > heavy.w || (s.top.w === heavy.w && s.top.r > heavy.r)) heavy = { ...s.top, t: s.t };
      if (!bestVol || s.vol > bestVol.vol) bestVol = { vol: s.vol, t: s.t };
    }
    const base = ex.baseline && ex.baseline.e1rm > 0 ? ex.baseline.e1rm : 0;
    const bestE = Math.max(best ? best.e : 0, base);
    stats.set(ex.id, {
      sessions: ss.length, best, heavy, bestVol, bestE,
      baselineWins: base > 0 && (!best || base >= best.e),
      last: ss.length ? ss[ss.length - 1] : null,
    });
  }
  return { byEx, prEvents, weeks, stats, list, exById };
}

export function lastSession(index, exId, beforeT = Infinity, excludeWid) {
  const ss = index.byEx.get(exId) || [];
  for (let i = ss.length - 1; i >= 0; i--) if (ss[i].t < beforeT && ss[i].wid !== excludeWid) return ss[i];
  return null;
}

export function bestBefore(index, exId, beforeT = Infinity, excludeWid) {
  const ex = index.exById.get(exId);
  let b = ex && ex.baseline && ex.baseline.e1rm > 0 ? ex.baseline.e1rm : 0;
  for (const s of index.byEx.get(exId) || []) if (s.t < beforeT && s.wid !== excludeWid && s.best.e > b) b = s.best.e;
  return b;
}

export function hasHistory(index, exId, excludeWid) {
  const ex = index.exById.get(exId);
  if (ex && ex.baseline && ex.baseline.e1rm > 0) return true;
  return (index.byEx.get(exId) || []).some(s => s.wid !== excludeWid);
}

export function workoutVolume(w, exById) {
  let v = 0, sets = 0;
  for (const en of w.entries || []) {
    const mult = volMult(exById.get(en.exId));
    for (const s of en.sets || []) {
      const wv = num(s.w), rv = num(s.r);
      if (s.done && rv > 0 && !Number.isNaN(wv)) { v += wv * rv * mult; sets++; }
    }
  }
  return { volume: v, sets };
}

// ---------- Lifetime count + streak ----------
export function lifetimeCount(settings, workouts) {
  const app = workouts.filter(w => w.endedAt && !w.imported).length;
  return (settings.baseBeforeJefit || 0) + (settings.baseJefit || 0) + app;
}

export function streakWeeks(index, settings, now = new Date()) {
  const base = settings.streakBase;
  const has = k => { const W = index.weeks.get(k); return !!(W && W.workouts > 0); };
  let k = weekKey(now);
  if (!has(k)) k = weekKey(addDays(keyToDate(k), -7)); // this week still open
  let count = 0;
  for (let guard = 0; guard < 600; guard++) {
    if (base && k === base.week) return count + base.weeks;
    if (base && k < base.week) return count;  // chain reached past base without hitting it
    if (!has(k)) return count;
    count++;
    k = weekKey(addDays(keyToDate(k), -7));
  }
  return count;
}

// ---------- Weekly recap ----------
export function weekRecap(index, weekK) {
  const start = keyToDate(weekK).getTime();
  const end = addDays(keyToDate(weekK), 7).getTime();
  const prevK = weekKey(addDays(keyToDate(weekK), -7));
  const W = index.weeks.get(weekK) || { workouts: 0, volume: 0, sets: 0, prs: 0 };
  const P = index.weeks.get(prevK) || { workouts: 0, volume: 0, sets: 0, prs: 0 };
  const rows = [];
  for (const [exId, ss] of index.byEx) {
    const inWeek = ss.filter(s => s.t >= start && s.t < end);
    if (!inWeek.length) continue;
    const cur = inWeek.reduce((a, b) => (b.best.e > a.best.e ? b : a));
    let before = null;
    for (let i = ss.length - 1; i >= 0; i--) if (ss[i].t < start) { before = ss[i]; break; }
    let status = 'new', de = 0, dv = 0;
    if (before) {
      de = before.best.e > 0 ? (cur.best.e - before.best.e) / before.best.e : (cur.best.e > 0 ? 1 : 0);
      dv = before.vol > 0 ? (cur.vol - before.vol) / before.vol : 0;
      // Est. 1RM decides; if it is flat, a real change in session volume (3%+) counts at half weight.
      const score = Math.abs(de) >= 0.0099 ? de : (Math.abs(dv) >= 0.03 ? dv * 0.5 : 0);
      status = score >= 0.0099 ? 'up' : score <= -0.0099 ? 'down' : 'same';
    }
    rows.push({ exId, cur, before, status, de, dv });
  }
  const up = rows.filter(r => r.status === 'up').length;
  const down = rows.filter(r => r.status === 'down').length;
  const same = rows.filter(r => r.status === 'same').length;
  const fresh = rows.filter(r => r.status === 'new').length;
  const n = up + down + same;
  const prs = index.prEvents.filter(p => p.t >= start && p.t < end);
  let verdict;
  if (!W.workouts) verdict = 'rest';
  else if (!n) verdict = 'baseline';
  else {
    const ratio = (up - down) / n;
    if (ratio >= 0.4 || (prs.length >= 3 && ratio >= 0.2)) verdict = 'strong';
    else if (ratio >= 0.1) verdict = 'gain';
    else if (ratio > -0.2) verdict = 'maintain';
    else verdict = 'dip';
  }
  const plural = (k, s) => `${k} ${s}${k === 1 ? '' : 's'}`;
  let headline;
  switch (verdict) {
    case 'strong': headline = `You beat your previous session on ${up} of ${n} exercises${prs.length ? ` and set ${plural(prs.length, 'PR')}` : ''}.`; break;
    case 'gain': headline = `You improved on ${up} of ${n} exercises${prs.length ? ` with ${plural(prs.length, 'PR')}` : ''}.`; break;
    case 'maintain': headline = `You held your numbers on ${same + up} of ${n} exercises. Push for one more rep next week.`; break;
    case 'dip': headline = `${down} of ${n} exercises came in under your previous session. Recover well and go again.`; break;
    case 'rest': headline = 'No workouts logged this week.'; break;
    default: headline = `First sessions logged for ${plural(fresh, 'exercise')}. Next week is the first comparison.`;
  }
  // plateau watch: last 3 sessions with no e1RM gain over the best before them
  const stalled = [];
  for (const r of rows) {
    const ss = index.byEx.get(r.exId).filter(s => s.t < end);
    if (ss.length < 4) continue;
    const last3 = ss.slice(-3);
    const earlier = ss.slice(0, -3).reduce((m, s) => Math.max(m, s.best.e), 0);
    if (last3.every(s => s.best.e <= earlier + 1e-9)) stalled.push({ exId: r.exId, sessions: 3, best: earlier });
  }
  rows.sort((a, b) => (b.de - a.de));
  return {
    key: weekK, prevKey: prevK, verdict, headline, rows, up, down, same, fresh, n, prs,
    workouts: W.workouts, volume: W.volume, sets: W.sets,
    prevWorkouts: P.workouts, prevVolume: P.volume,
    volDelta: P.volume > 0 ? (W.volume - P.volume) / P.volume : null,
    stalled,
  };
}

// Suggest the routine done least recently (for "Up next").
export function upNext(routines, workouts) {
  if (!routines.length) return null;
  const last = new Map();
  for (const w of workouts) if (isDone(w) && w.routineId) {
    const t = wTime(w);
    if (!last.has(w.routineId) || last.get(w.routineId) < t) last.set(w.routineId, t);
  }
  const withItems = routines.filter(r => r.items && r.items.length);
  if (!withItems.length) return null;
  return withItems.slice().sort((a, b) => (last.get(a.id) || 0) - (last.get(b.id) || 0))[0];
}

export function routineLastDone(routineId, workouts) {
  let t = 0;
  for (const w of workouts) if (isDone(w) && w.routineId === routineId) t = Math.max(t, wTime(w));
  return t || null;
}

export function uid(prefix = 'i') {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 11);
}

export function nextMilestone(n) {
  const steps = [50, 100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 4000, 5000];
  for (const s of steps) if (n < s) return s;
  return Math.ceil((n + 1) / 1000) * 1000;
}
