import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  '.gitignore', '.gitattributes', '.npmrc', 'package.json', 'package-lock.json',
  'next.config.mjs', 'tsconfig.json', 'next-env.d.ts', 'dev.bat', 'build.bat',
  'README.md', 'SOURCE_REPOSITORY.md', 'ARCHITEKTUR.md', 'QA_P0.md',
  'app/layout.tsx', 'app/page.tsx',
  'src/shared/version.ts', 'src/state/AppProvider.tsx',
  'scripts/build-content.py', 'scripts/ensure-dev-content.mjs',
  'scripts/validate-content.mjs', 'scripts/test-sqlite-migrations.py',
  'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json',
  'src-tauri/src/main.rs', 'src-tauri/src/lib.rs',
  'src-tauri/migrations/0001_initial.sql', 'src-tauri/migrations/0009_user_annotations.sql',
  'tests/architecture.test.mjs', 'tests/p0-startup.test.mjs'
];
const requiredDirs = [
  'app', 'src', 'content-src', 'scripts', 'scripts/content_build', 'public',
  'src-tauri', 'src-tauri/src', 'src-tauri/migrations', 'tests'
];
const forbidden = [
  'node_modules', '.next', 'out', 'public/content', 'src-tauri/target',
  'qa-artifacts', 'coverage', '.cache'
];

const failures = [];
for (const file of requiredFiles) {
  const path = resolve(root, file);
  if (!existsSync(path) || !statSync(path).isFile()) failures.push(`required file missing: ${file}`);
}
for (const dir of requiredDirs) {
  const path = resolve(root, dir);
  if (!existsSync(path) || !statSync(path).isDirectory()) failures.push(`required directory missing: ${dir}`);
}
for (const entry of forbidden) {
  if (existsSync(resolve(root, entry))) failures.push(`generated/local artifact present: ${entry}`);
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const tauri = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
const appVersion = readFileSync(resolve(root, 'src/shared/version.ts'), 'utf8').match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
for (const [name, value] of [['src/shared/version.ts', appVersion], ['src-tauri/tauri.conf.json', tauri.version], ['src-tauri/Cargo.toml', cargoVersion]]) {
  if (value !== pkg.version) failures.push(`version mismatch: package.json=${pkg.version}, ${name}=${value ?? 'missing'}`);
}

if (failures.length) {
  console.error('[source-check] FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`[source-check] OK: complete clean source repository v${pkg.version}.`);
