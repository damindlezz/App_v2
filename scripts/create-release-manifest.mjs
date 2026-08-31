import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = join(root, 'public', 'content');
async function files(directory) {
  const output=[];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name);
    if (entry.isDirectory()) output.push(...await files(path)); else output.push(path);
  }
  return output;
}
const manifest=JSON.parse(await readFile(join(contentRoot,'manifest.json'),'utf8'));
const contentFiles=(await files(contentRoot)).sort();
const artifacts=[];
for (const path of contentFiles) {
  const bytes=await readFile(path); artifacts.push({ path: relative(contentRoot,path).replaceAll('\\','/'), bytes:(await stat(path)).size, sha256:createHash('sha256').update(bytes).digest('hex') });
}
const release={ schemaVersion:1, appVersion:'0.20.5', contentVersion:manifest.contentVersion, releaseOrder:manifest.releaseOrder, catalogSchemaVersion:manifest.catalogSchemaVersion, stableIds:manifest.stableIds, counts:manifest.counts, artifacts };
await writeFile(join(root,'RELEASE_MANIFEST.json'),JSON.stringify(release,null,2)+'\n');
console.log(`Release-Manifest: ${artifacts.length} Content-Artefakte mit SHA-256.`);
