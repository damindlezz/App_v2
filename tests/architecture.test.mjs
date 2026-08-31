import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root=process.cwd();
const read=(p)=>readFileSync(join(root,p),'utf8');

test('Next.js static export replaces Vite frontend',()=>{
  assert.equal(existsSync(join(root,'vite.config.ts')),false);
  assert.equal(existsSync(join(root,'src/ui')),false);
  assert.equal(existsSync(join(root,'src/main.tsx')),false);
  assert.match(read('next.config.mjs'),/output:\s*['"]export['"]/);
  assert.match(read('src-tauri/tauri.conf.json'),/"frontendDist"\s*:\s*"\.\.\/out"/);
  assert.match(read('package.json'),/"next"\s*:/);
});

test('primary navigation represents the five product areas',()=>{
  const shell=read('src/components/shell/NurHeader.tsx');
  const primary=shell.match(/<nav className="nur-main-nav ref-main-nav"[\s\S]*?<\/nav>/);
  assert.ok(primary);
  for(const label of ['Heute','Lernen','Muṣḥaf','Training','Fortschritt']) assert.ok(primary[0].includes(`<span>${label}</span>`),label);
  for(const hidden of ['>Hifz<','>Wissen<','>Entdecken<']) assert.ok(!primary[0].includes(hidden),hidden);
});

test('app router exposes clear core areas without legacy discover/reader pages',()=>{
  for(const page of ['app/page.tsx','app/lernen/page.tsx','app/quran/page.tsx','app/hifz/page.tsx','app/wissen/page.tsx','app/wiederholen/page.tsx','app/ueben/page.tsx','app/bibliothek/page.tsx','app/fortschritt/page.tsx','app/einstellungen/page.tsx','app/modul/page.tsx','app/bereich/page.tsx','app/quellen/page.tsx']) assert.ok(existsSync(join(root,page)),page);
  assert.equal(existsSync(join(root,'app/lesen/page.tsx')),false);
  assert.equal(existsSync(join(root,'app/entdecken/page.tsx')),false);
});

test('Arabisch path is explicit from zero to C2 and uses chapter gates',()=>{
  const learn=read('src/features/learn/LearnPage.tsx');
  const path=read('src/features/learn/CoursePathView.tsx');
  const study=read('src/features/study/StudyWorkspace.tsx');
  for(const token of ['Von 0 bis C2','Alphabet','Lesen','Wortschatz','Grammatik','Satzbau','Hörverstehen']) assert.ok(learn.includes(token)||path.includes(token),token);
  assert.match(study,/Kompetenz-Gate/);
  assert.match(study,/Kapitel-Check/);
});

test('styles are clean layered design-system files',()=>{
  const css=read('app/globals.css');
  for(const file of ['tokens.css','base.css','shell.css','reader.css','features.css','practice.css','responsive.css']) assert.ok(css.includes(file));
  assert.doesNotMatch(css,/override/i);
});
