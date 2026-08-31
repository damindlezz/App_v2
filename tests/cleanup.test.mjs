import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
const root=process.cwd();

test('legacy UI/editor artifacts are absent',()=>{
 for(const p of ['src/ui','src/main.tsx','vite.config.ts','index.html','content-src/editor','qa-artifacts']) assert.equal(existsSync(join(root,p)),false,p);
 const pkg=readFileSync(join(root,'package.json'),'utf8');
 assert.doesNotMatch(pkg,/vite/i);
});

test('all source modules are reachable from Next app entrypoints',()=>{
 const files=[];
 const walk=d=>{for(const n of readdirSync(d)){const p=join(d,n);const st=statSync(p);if(st.isDirectory())walk(p);else if(/\.(ts|tsx)$/.test(p))files.push(p)}};
 walk(join(root,'app')); walk(join(root,'src'));
 const set=new Set(files.map(p=>resolve(p)));
 const deps=new Map();
 for(const file of files){const text=readFileSync(file,'utf8');const list=[];for(const m of text.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)){const spec=m[1];if(!spec.startsWith('.'))continue;const base=resolve(dirname(file),spec);for(const c of [base+'.ts',base+'.tsx',join(base,'index.ts'),join(base,'index.tsx')]){if(set.has(resolve(c))){list.push(resolve(c));break}}}deps.set(resolve(file),list)}
 const stack=files.filter(p=>relative(root,p).startsWith('app/')).map(p=>resolve(p));const seen=new Set();while(stack.length){const p=stack.pop();if(seen.has(p))continue;seen.add(p);for(const d of deps.get(p)||[])if(!seen.has(d))stack.push(d)}
 const unused=files.filter(p=>relative(root,p).startsWith('src/')&&!p.endsWith('.d.ts')).map(p=>resolve(p)).filter(p=>!seen.has(p)).map(p=>relative(root,p));
 assert.deepEqual(unused,[]);
});
