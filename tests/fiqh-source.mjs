import { readFileSync } from 'node:fs';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const KEEP = (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && value.$keep === true;
const LAYER = (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && value.$layer === true;

function merge(core, overlay) {
  if (LAYER(core)) {
    if (KEEP(overlay)) throw new Error('Missing Fiqh layer value');
    return structuredClone(overlay);
  }
  if (KEEP(overlay) || overlay === undefined) return structuredClone(core);
  if (Array.isArray(core)) {
    if (!Array.isArray(overlay) || overlay.length !== core.length) throw new Error('Fiqh layer list mismatch');
    return core.map((item, index) => merge(item, overlay[index]));
  }
  if (core && typeof core === 'object') {
    const source = overlay && typeof overlay === 'object' && !Array.isArray(overlay) ? overlay : {};
    return Object.fromEntries(Object.entries(core).map(([key, value]) => [key, merge(value, source[key])]));
  }
  return structuredClone(core);
}

export function loadFiqhTrack(name) {
  const school = name.replace(/^fiqh_/, '');
  const core = json('content-src/islamic/fiqh/core.json');
  const layer = json(`content-src/islamic/fiqh/layers/${school}.json`);
  return merge(core, layer);
}

export function loadIslamicTrack(name) {
  return name.startsWith('fiqh_') ? loadFiqhTrack(name) : json(`content-src/islamic/paths/${name}.json`);
}

export function loadAllIslamicTracks() {
  return ['fiqh_hanafi', 'fiqh_maliki', 'fiqh_shafii', 'fiqh_hanbali', 'usul_fiqh', 'hadith', 'usul_hadith'].flatMap(loadIslamicTrack);
}
