import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');

test('P0 pins Turbopack to the project root',()=>{
  const config=read('next.config.mjs');
  assert.match(config,/fileURLToPath\(import\.meta\.url\)/);
  assert.match(config,/turbopack:\s*\{\s*root:\s*projectRoot/s);
});

test('P0 dev start reuses the server and does not rebuild content on every start',()=>{
  const bat=read('dev.bat');
  const pkg=JSON.parse(read('package.json'));
  assert.match(bat,/curl -s -o nul --max-time 1 %URL%/);
  assert.match(bat,/goto open_app/);
  assert.match(bat,/npm run content:ensure/);
  assert.match(bat,/npm run content:rebuild/);
  assert.equal(pkg.scripts.dev,'next dev -H 0.0.0.0 -p 1420');
  assert.doesNotMatch(pkg.scripts.dev,/build:content/);
});

test('P0 content cache uses a success stamp',()=>{
  const helper=read('scripts/ensure-dev-content.mjs');
  const builder=read('scripts/build-content.py');
  assert.match(helper,/\.build-stamp/);
  assert.match(helper,/Runtime content is current/);
  assert.match(builder,/OUTPUT \/ '\.build-stamp'/);
});

test('P0 renders final shell immediately and hydrates profile details progressively',()=>{
  const shell=read('src/components/shell/AppShell.tsx');
  const provider=read('src/state/AppProvider.tsx');
  const today=read('src/features/home/TodayPage.tsx');
  assert.match(shell,/if\s*\(\s*!ready\s*\)\s*return <BootShell\s*\/>/);
  assert.match(shell,/NurHeader onSearch/);
  assert.match(provider,/const contentPromise = loadLearningContentCore\(\)/);
  assert.match(provider,/const servicePromise = \(async \(\) =>/);
  assert.match(provider,/setReady\(true\);\s*void hydrate/s);
  assert.match(today,/!content \|\| !profile \|\| !hydrated/);
  assert.match(today,/primaryGoal === 'knowledge'/);
});
