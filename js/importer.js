// Import codes are "OVL1:" + base64url(deflate-raw(JSON)). Plain JSON (a backup file) also works.
export async function decodeImportText(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Paste the import code first.');
  if (t[0] === '{') return JSON.parse(t);
  const m = t.replace(/\s+/g, '').match(/OVL1:([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('That does not look like an Overload import code.');
  const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  if (typeof DecompressionStream === 'undefined') throw new Error('Update iOS to import this code.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const json = await new Response(stream).text();
  return JSON.parse(json);
}

export function summarizeImport(data) {
  return {
    exercises: (data.exercises || []).length,
    routines: (data.routines || []).length,
    workouts: (data.workouts || []).length,
    photos: (data.photos || []).length,
  };
}

export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
export function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
