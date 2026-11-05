import { html } from '../preact.js';
import { Icon } from '../icons.js';
import { Screen, Section, Rings, GlassButton, haptic, Empty } from '../ui.js';
import { useStore, useIndex, openSheet, startWorkout, setUI, push, recapKeyToShow } from '../store.js';
import { fmtInt, fmt, weekKey, addDays, keyToDate, weekRecap, lifetimeCount, streakWeeks, nextMilestone, upNext, routineLastDone, relDay, fmtWeekRange, fmtClock, wTime, isDone, pct } from '../logic.js';
import { VerdictChip, WorkoutRow, PRMedal, openExercise, openRecap } from './common.js';

export function weekRings(index, settings, now = new Date()) {
  const k = weekKey(now);
  const W = index.weeks.get(k) || { workouts: 0, volume: 0, prs: 0 };
  const prevK = weekKey(addDays(keyToDate(k), -7));
  const P = index.weeks.get(prevK);
  let volGoal = P && P.volume > 0 ? P.volume : 0;
  if (!volGoal) {
    const recent = [...index.weeks.values()].filter(x => x.key < k && x.volume > 0).slice(-4);
    volGoal = recent.length ? recent.reduce((a, b) => a + b.volume, 0) / recent.length : 20000;
  }
  return {
    key: k,
    workouts: W.workouts, workoutsGoal: settings.weekGoal || 4,
    volume: W.volume, volumeGoal: volGoal, volumeIsLastWeek: !!(P && P.volume > 0),
    prs: W.prs, prsGoal: settings.prGoal || 3,
  };
}

export function SummaryScreen() {
  const { settings, workouts, routines, exercises, active } = useStore(s => ({ settings: s.settings, workouts: s.workouts, routines: s.routines, exercises: s.exercises, active: s.active }));
  const index = useIndex();
  const now = new Date();
  const r = weekRings(index, settings, now);
  const lifetime = lifetimeCount(settings, workouts);
  const streak = streakWeeks(index, settings, now);
  const recapK = recapKeyToShow(now);
  const recap = weekRecap(index, recapK);
  const ms = nextMilestone(lifetime);
  const prevMs = [0, 50, 100, 250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 4000, 5000].filter(x => x <= lifetime).pop() || 0;
  const recentPRs = index.prEvents.slice(-12).reverse();
  const exById = index.exById;
  const recent = index.list.slice(-3).reverse();
  const next = upNext(routines, workouts);
  const nextLast = next ? routineLastDone(next.id, workouts) : null;
  const eyebrow = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
  const initial = (settings.name || 'You').trim().charAt(0).toUpperCase();

  return html`<${Screen} title="Summary" eyebrow=${eyebrow} tab="summary"
      right=${html`<button type="button" class="glass avatar" aria-label="Settings" onClick=${() => { haptic(); openSheet('settings'); }}>${initial}</button>`}>

    <section class="card rings-card" aria-label="This week">
      <div class="card-head"><h3>This Week</h3><span class="muted small">${fmtWeekRange(r.key)}</span></div>
      <div class="rings-row">
        <${Rings} size=${136} stroke=${16} rings=${[
          { label: 'Workouts', p: r.workouts / r.workoutsGoal, c1: 'var(--ring-w1)', c2: 'var(--ring-w2)' },
          { label: 'Volume', p: r.volume / Math.max(1, r.volumeGoal), c1: 'var(--ring-v1)', c2: 'var(--ring-v2)' },
          { label: 'PRs', p: r.prs / r.prsGoal, c1: 'var(--ring-p1)', c2: 'var(--ring-p2)' },
        ]} />
        <div class="rings-legend">
          <div class="rl">
            <div class="rl-label">Workouts</div>
            <div class="rl-val num" style="color:var(--ring-w2)">${r.workouts}<span>/${r.workoutsGoal}</span></div>
          </div>
          <div class="rl">
            <div class="rl-label">Volume ${r.volumeIsLastWeek ? 'vs last week' : ''}</div>
            <div class="rl-val num" style="color:var(--ring-v1)">${fmtInt(r.volume)}<span class="rl-long">/${fmtInt(r.volumeGoal)} kg</span><span class="rl-short">/${r.volumeGoal >= 10000 ? fmt(r.volumeGoal / 1000, 1) + 'k' : fmtInt(r.volumeGoal)}</span></div>
          </div>
          <div class="rl">
            <div class="rl-label">New PRs</div>
            <div class="rl-val num" style="color:var(--ring-p2)">${r.prs}<span>/${r.prsGoal}</span></div>
          </div>
        </div>
      </div>
    </section>

    ${active ? html`<button type="button" class="card card-tap resume-card" onClick=${() => { haptic(); setUI({ workoutOpen: true }); }}>
        <div class="pulse-dot" aria-hidden="true"></div>
        <div class="row-main">
          <div class="eyebrow tint">Workout in progress</div>
          <div class="resume-title">${active.name}</div>
          <div class="muted small">Started ${fmtClock(Date.now() - new Date(active.startedAt))} ago · ${active.entries.length} exercises</div>
        </div>
        <span class="btn btn-accent btn-sm">Resume</span>
      </button>`
    : html`<div class="card start-card">
        <div class="row-main">
          <div class="eyebrow">Up next</div>
          <div class="resume-title">${next ? next.name : 'Empty workout'}</div>
          <div class="muted small">${next ? `${next.items.length} exercises · ${nextLast ? 'last done ' + relDay(nextLast).toLowerCase() : 'not done yet'}` : 'Add machines as you go'}</div>
        </div>
        <button type="button" class="btn btn-accent" onClick=${() => { haptic('success'); startWorkout({ routine: next }); }}>
          <${Icon} name="play" size=${16} fill /> Start
        </button>
      </div>`}

    <${Section} title="Weekly Recap" action="Past weeks" onAction=${() => push({ name: 'recaps' }, 'summary')}>
      <button type="button" class="card card-tap recap-card" onClick=${() => { haptic(); openRecap(recapK); }}>
        <div class="recap-top">
          <${VerdictChip} verdict=${recap.verdict} />
          <span class="muted small">${fmtWeekRange(recapK)}</span>
        </div>
        <p class="recap-headline">${recap.headline}</p>
        <div class="recap-mini">
          <div><b class="num">${recap.workouts}</b><span>workouts</span></div>
          <div><b class="num">${recap.up}</b><span>improved</span></div>
          <div><b class="num">${recap.prs.length}</b><span>PRs</span></div>
          <div><b class="num">${recap.volDelta === null ? '–' : pct(recap.volDelta)}</b><span>volume</span></div>
        </div>
        <div class="card-foot">See full recap<${Icon} name="chevR" size=${15} /></div>
      </button>
    <//>

    <section class="card lifetime-card" aria-label="Lifetime workouts">
      <div class="lifetime-main">
        <div>
          <div class="eyebrow">Lifetime workouts</div>
          <div class="lifetime-num num">${fmtInt(lifetime)}</div>
        </div>
        <div class="streak">
          <${Icon} name="flame" size=${26} fill cls="flame" />
          <div><b class="num">${streak}</b><span>week streak</span></div>
        </div>
      </div>
      <div class="milestone">
        <div class="milestone-bar"><div style=${`width:${Math.min(100, ((lifetime - prevMs) / Math.max(1, ms - prevMs)) * 100)}%`}></div></div>
        <div class="muted small">${fmtInt(ms - lifetime)} to go until ${fmtInt(ms)}</div>
      </div>
    </section>

    <${Section} title="Recent PRs" action=${recentPRs.length ? 'All records' : null} onAction=${() => setUI({ tab: 'progress' })}>
      ${recentPRs.length ? html`<div class="hscroll">
          ${recentPRs.map(p => html`<${PRMedal} key=${p.exId + p.t} p=${p} ex=${exById.get(p.exId)} onClick=${() => { haptic(); openExercise(p.exId, 'summary'); }} />`)}
        </div>`
      : html`<div class="card"><${Empty} icon="trophy" title="No PRs yet" text="Beat your best estimated 1RM on any machine and it shows up here." /></div>`}
    <//>

    <${Section} title="Recent Workouts" action=${recent.length ? 'Show all' : null} onAction=${() => push({ name: 'history' }, 'summary')}>
      ${recent.length ? html`<div class="list">${recent.map(w => html`<${WorkoutRow} key=${w.id} w=${w} exById=${exById} tab="summary" />`)}</div>`
        : html`<div class="card"><${Empty} icon="dumbbell" title="No workouts yet" text="Start one from a routine or empty, and it lands here." /></div>`}
    <//>
    <div class="bottom-space"></div>
  <//>`;
}
