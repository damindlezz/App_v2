import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const out = join(root, 'out');
const fail = (message) => { throw new Error(`[export-check] ${message}`); };
const expectedRoutes = ['','lernen','quran','hifz','wissen','wiederholen','ueben','bibliothek','fortschritt','einstellungen','modul','bereich','quellen'];

if (!existsSync(out) || !statSync(out).isDirectory()) fail('out/ fehlt. next build hat keinen statischen Export erzeugt.');
if (!existsSync(join(out, '_next'))) fail('out/_next fehlt. JS/CSS-Bundles wurden nicht exportiert.');
if (!existsSync(join(out, 'content'))) fail('out/content fehlt. Runtime-Lerninhalte wurden nicht exportiert.');

const walk = (dir, predicate) => {
  const result = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...walk(path, predicate));
    else if (predicate(path)) result.push(path);
  }
  return result;
};

const routeFiles = expectedRoutes.map((route) => ({ route: route || '/', file: route ? join(out, route, 'index.html') : join(out, 'index.html') }));
for (const item of routeFiles) if (!existsSync(item.file)) fail(`Route ${item.route} fehlt im Static Export (${relative(root, item.file)}).`);

const htmlFiles = walk(out, (path) => path.endsWith('.html'));
const jsFiles = walk(join(out, '_next'), (path) => path.endsWith('.js'));
const cssFiles = walk(join(out, '_next'), (path) => path.endsWith('.css'));
if (!jsFiles.length) fail('Keine JavaScript-Bundles im Export.');
if (!cssFiles.length) fail('Keine CSS-Bundles im Export.');

const missing = new Set();
let nextRefs = 0;
let routeRefs = 0;
for (const { route, file } of routeFiles) {
  const html = readFileSync(file, 'utf8');
  if (/<base\b/i.test(html)) fail(`${relative(root, file)} enthaelt ein <base>-Element.`);
  const routeAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]).filter((ref) => ref.startsWith('/_next/'));
  if (!routeAssets.some((ref) => /\.js(?:[?#]|$)/.test(ref))) fail(`${route} referenziert kein Next-JavaScript.`);
  if (!routeAssets.some((ref) => /\.css(?:[?#]|$)/.test(ref))) fail(`${route} referenziert kein Next-CSS.`);
  routeRefs += routeAssets.length;
  for (const ref of routeAssets) {
    nextRefs += 1;
    const clean = ref.slice(1).split(/[?#]/, 1)[0];
    const local = join(out, clean);
    if (!existsSync(local)) missing.add(`${relative(root, file)} -> ${ref}`);
  }
}
if (!nextRefs) fail('HTML referenziert keine /_next/-Assets.');
if (missing.size) fail(`Fehlende exportierte Assets:\n${[...missing].join('\n')}`);

for (const required of ['manifest.json','learning-path.json','quran-path.json','quran-reader-core.json']) {
  if (!existsSync(join(out, 'content', required))) fail(`Runtime-Content ${required} fehlt.`);
}
if (!existsSync(join(out, 'manifest.webmanifest'))) fail('PWA Manifest fehlt im Export.');

const index = readFileSync(join(out, 'index.html'), 'utf8');
if (!/class=["'][^"']*boot/.test(index)) fail('Der statische Boot-Screen fehlt in out/index.html.');

console.log(`[export-check] OK: ${expectedRoutes.length} Routen, ${htmlFiles.length} HTML, ${jsFiles.length} JS, ${cssFiles.length} CSS; ${routeRefs} Route-Assets validiert.`);
