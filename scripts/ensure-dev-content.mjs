import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = join(root, 'public', 'content');
const stamp = join(contentRoot, '.build-stamp');
const requiredOutputs = [
  stamp,
  join(contentRoot, 'manifest.json'),
  join(contentRoot, 'learning-path.json'),
  join(contentRoot, 'quran-path.json'),
  join(contentRoot, 'skills.json'),
  join(contentRoot, 'quran-reader-core.json')
];
const watched = [
  join(root, 'content-src'),
  join(root, 'scripts', 'build-content.py'),
  join(root, 'scripts', 'guided_sections.py'),
  join(root, 'scripts', 'content_build')
];

async function newestMtime(path) {
  const info = await stat(path);
  if (!info.isDirectory()) return info.mtimeMs;
  let newest = info.mtimeMs;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const next = join(path, entry.name);
    newest = Math.max(newest, await newestMtime(next));
  }
  return newest;
}

async function needsBuild() {
  if (requiredOutputs.some((path) => !existsSync(path))) return true;
  const builtAt = (await stat(stamp)).mtimeMs;
  for (const path of watched) {
    if (!existsSync(path)) continue;
    if (await newestMtime(path) > builtAt) return true;
  }
  return false;
}

function runBuild() {
  const candidates = process.platform === 'win32' ? ['python'] : ['python3', 'python'];
  for (const executable of candidates) {
    const result = spawnSync(executable, [join(root, 'scripts', 'build-content.py')], {
      cwd: root,
      stdio: 'inherit'
    });
    if (!result.error) return result.status ?? 1;
  }
  console.error('[CONTENT] Python was not found.');
  return 1;
}

const force = process.argv.includes('--force');
const build = process.argv.includes('--build') || force;
const stale = force || await needsBuild();

if (!stale) {
  console.log('[CONTENT] Runtime content is current.');
  process.exit(0);
}

if (!build) {
  console.log('[CONTENT] Runtime content is missing or stale.');
  process.exit(2);
}

console.log(force ? '[CONTENT] Rebuilding runtime content...' : '[CONTENT] Building runtime content once...');
process.exit(runBuild());
