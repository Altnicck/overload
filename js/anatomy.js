// Which muscles an exercise works, worked out from its type and name, and how many sets each muscle got.
// Feeds the body map drawings: routine and workout thumbnails, the weekly heat map and machine pages.

// Muscle regions drawn on the body map, with the shapes (per view) that light up for each.
export const REGIONS = {
  chest:      { label: 'Chest',      parts: { front: ['chest'] } },
  frontDelts: { label: 'Front delts', parts: { front: ['deltoids'] } },
  sideDelts:  { label: 'Side delts', parts: { front: ['deltoids'], back: ['deltoids'] } },
  rearDelts:  { label: 'Rear delts', parts: { back: ['deltoids'] } },
  traps:      { label: 'Traps',      parts: { front: ['trapezius'], back: ['trapezius'] } },
  lats:       { label: 'Lats',       parts: { back: ['upper-back'] } },
  lowerBack:  { label: 'Lower back', parts: { back: ['lower-back'] } },
  biceps:     { label: 'Biceps',     parts: { front: ['biceps'] } },
  triceps:    { label: 'Triceps',    parts: { front: ['triceps'], back: ['triceps'] } },
  forearms:   { label: 'Forearms',   parts: { front: ['forearm'], back: ['forearm'] } },
  abs:        { label: 'Abs',        parts: { front: ['abs'] } },
  obliques:   { label: 'Obliques',   parts: { front: ['obliques'] } },
  glutes:     { label: 'Glutes',     parts: { back: ['gluteal'] } },
  quads:      { label: 'Quads',      parts: { front: ['quadriceps'] } },
  hamstrings: { label: 'Hamstrings', parts: { back: ['hamstring'] } },
  adductors:  { label: 'Adductors',  parts: { front: ['adductors'], back: ['adductors'] } },
  calves:     { label: 'Calves',     parts: { front: ['calves'], back: ['calves'] } },
};

// First match wins. Weight 1 = main target, lower = helping muscles.
const RULES = [
  [/calf|calves|gamb/, { calves: 1 }],
  [/leg curl|hamstring curl|nordic/, { hamstrings: 1, calves: 0.2 }],
  [/leg extension/, { quads: 1 }],
  [/leg press/, { quads: 1, glutes: 0.6, adductors: 0.45, hamstrings: 0.25 }],
  [/hack squat|squat|lunge|step.?up|genuflex/, { quads: 1, glutes: 0.7, adductors: 0.4, hamstrings: 0.3 }],
  [/romanian|\brdl\b|stiff.?leg|good morning/, { hamstrings: 1, glutes: 0.8, lowerBack: 0.5 }],
  [/deadlift/, { glutes: 1, hamstrings: 0.8, lowerBack: 0.8, quads: 0.5, traps: 0.5, forearms: 0.4 }],
  [/hip thrust|glute|bridge|kickback.*(cable|glute)/, { glutes: 1, hamstrings: 0.4 }],
  [/adduct/, { adductors: 1 }],
  [/abduct/, { glutes: 1 }],
  [/hyperextension|back extension|lower back|lombar/, { lowerBack: 1, glutes: 0.6, hamstrings: 0.5 }],
  [/pull.?up|chin.?up|tractiuni/, { lats: 1, biceps: 0.55, rearDelts: 0.3, traps: 0.3, forearms: 0.3 }],
  [/pull.?down|pulldown|helcometru/, { lats: 1, biceps: 0.5, rearDelts: 0.3 }],
  [/pullover/, { lats: 1, chest: 0.45, triceps: 0.3 }],
  [/shrug/, { traps: 1, forearms: 0.3 }],
  [/upright row/, { sideDelts: 1, traps: 0.7 }],
  [/face pull/, { rearDelts: 1, traps: 0.6 }],
  [/rear delt|reverse fly|reverse pec|rear fly/, { rearDelts: 1, traps: 0.5 }],
  [/\brow\b|rowing|ramat/, { lats: 1, traps: 0.65, rearDelts: 0.45, biceps: 0.45 }],
  [/lateral raise|side raise|\blateral\b/, { sideDelts: 1, traps: 0.3 }],
  [/front raise/, { frontDelts: 1 }],
  [/shoulder press|overhead press|military|arnold|\bohp\b|umeri/, { frontDelts: 1, sideDelts: 0.6, triceps: 0.45 }],
  [/\bdips?\b/, { triceps: 1, chest: 0.6, frontDelts: 0.4 }],
  [/close.?grip.*(bench|press)|jm press/, { triceps: 1, chest: 0.7, frontDelts: 0.4 }],
  [/incline.*(press|bench)|(press|bench).*incline/, { chest: 1, frontDelts: 0.65, triceps: 0.4 }],
  [/fly|flye|pec deck|crossover|cable cross|fluture/, { chest: 1, frontDelts: 0.35 }],
  [/bench|chest press|push.?up|flotari|piept/, { chest: 1, frontDelts: 0.5, triceps: 0.5 }],
  [/tricep|pushdown|push.?down|skull|kickback|french|extension/, { triceps: 1 }],
  [/hammer curl/, { biceps: 1, forearms: 0.7 }],
  [/curl|biceps/, { biceps: 1, forearms: 0.35 }],
  [/wrist|forearm|grip|farmer/, { forearms: 1 }],
  [/crunch|sit.?up|\babs?\b|plank|leg raise|knee raise|abdomen/, { abs: 1, obliques: 0.4 }],
  [/oblique|twist|woodchop/, { obliques: 1, abs: 0.5 }],
];

const BY_GROUP = {
  chest: { chest: 1, frontDelts: 0.4, triceps: 0.3 },
  back: { lats: 1, traps: 0.6, lowerBack: 0.3, rearDelts: 0.3 },
  shoulders: { frontDelts: 1, sideDelts: 0.8, rearDelts: 0.4 },
  biceps: { biceps: 1, forearms: 0.3 },
  triceps: { triceps: 1 },
  legs: { quads: 1, hamstrings: 0.6, glutes: 0.6, adductors: 0.3 },
  calves: { calves: 1 },
  core: { abs: 1, obliques: 0.6 },
  cardio: { quads: 0.5, hamstrings: 0.4, calves: 0.4, glutes: 0.3 },
  other: {},
};
// Regions that may lead for an exercise filed under a group (a dip filed under Chest works the chest most).
const GROUP_LEAD = {
  chest: ['chest'], back: ['lats', 'lowerBack', 'traps'], shoulders: ['frontDelts', 'sideDelts', 'rearDelts'],
  biceps: ['biceps'], triceps: ['triceps'], calves: ['calves'], core: ['abs', 'obliques'],
  legs: ['quads', 'hamstrings', 'glutes', 'adductors'],
};

const cache = new Map();

export function musclesFor(ex) {
  if (!ex) return {};
  if (ex.targets && Object.keys(ex.targets).length) return ex.targets;
  const group = ex.muscle || 'other';
  const text = `${ex.movement || ''} ${ex.name || ''}`.toLowerCase();
  const key = group + '|' + text;
  if (cache.has(key)) return cache.get(key);
  let res = null;
  for (const [re, m] of RULES) if (re.test(text)) { res = { ...m }; break; }
  if (!res) res = { ...(BY_GROUP[group] || {}) };
  else if (/leg press/.test(text) && /wide|sumo/.test(text)) Object.assign(res, { adductors: 0.65, glutes: 0.75 });
  const lead = GROUP_LEAD[group];
  if (lead && Object.keys(res).length && !lead.some(r => res[r] === 1)) {
    // Filed under a different group than the name suggests: the group's muscle leads, the rest helps.
    for (const k of Object.keys(res)) res[k] = Math.min(res[k], 0.6);
    res[lead[0]] = 1;
  }
  cache.set(key, res);
  return res;
}

// Sum muscle work over a list of [exercise, sets] pairs. Returns { region: weighted sets }.
export function muscleSets(pairs) {
  const out = {};
  for (const [ex, sets] of pairs) {
    if (!ex || !(sets > 0)) continue;
    const m = musclesFor(ex);
    for (const [r, w] of Object.entries(m)) out[r] = (out[r] || 0) + w * sets;
  }
  return out;
}

// Scale weighted sets to 0..1 for drawing. relative: brightest = the most-worked muscle;
// otherwise against a weekly target (about 12 hard sets a muscle).
export function levelsFrom(sets, { relative = true, target = 12, floor = 0.16 } = {}) {
  const vals = Object.values(sets);
  const max = Math.max(0, ...vals);
  const out = {};
  if (!(max > 0)) return out;
  for (const [r, v] of Object.entries(sets)) {
    const l = relative ? v / max : v / target;
    if (relative && l < floor) continue;
    out[r] = Math.max(0.2, Math.min(1, l));
  }
  return out;
}

export function exerciseLevels(ex) { return musclesFor(ex); }
export function groupMuscles(group) { return BY_GROUP[group] || {}; }

// Main and helping muscles of one exercise, for labels.
export function muscleRoles(ex) {
  const m = musclesFor(ex);
  const sorted = Object.entries(m).sort((a, b) => b[1] - a[1]);
  const name = r => (REGIONS[r] || {}).label || r;
  return { main: sorted.filter(([, w]) => w >= 0.75).map(([r]) => name(r)), helping: sorted.filter(([, w]) => w < 0.75 && w >= 0.3).map(([r]) => name(r)) };
}

export function routineSets(routine, exById) {
  return muscleSets((routine.items || []).map(it => [exById.get(it.exId), (it.reps && it.reps.length) || 3]));
}

export function workoutSets(w, exById) {
  return muscleSets((w.entries || []).map(en => [exById.get(en.exId), en.sets.filter(s => s.done !== false).length]));
}

// Top regions by work, for labels like "Lats · Biceps".
export function topRegions(sets, n = 3) {
  return Object.entries(sets).sort((a, b) => b[1] - a[1]).slice(0, n).map(([r, v]) => ({ id: r, label: (REGIONS[r] || {}).label || r, sets: v }));
}
