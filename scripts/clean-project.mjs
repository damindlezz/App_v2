import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  '.next',
  'out',
  'qa-artifacts',
  'public/content',
  'RELEASE_MANIFEST.json',
  'scripts/__pycache__',
  'scripts/content_build/__pycache__',
  'src-tauri/target',
  'tauri-build.log',
  'tsconfig.tsbuildinfo'
];
for (const relative of targets) await rm(resolve(root, relative), { recursive: true, force: true });
console.log('Next.js-, Content-, QA-, Python- und Rust-Buildartefakte wurden entfernt.');
