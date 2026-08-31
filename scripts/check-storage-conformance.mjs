import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const [contract, indexedDb, sqlite] = await Promise.all([
  read('src/services/storage/storage-service.ts'),
  read('src/services/storage/indexeddb-storage.ts'),
  read('src/services/storage/tauri-sqlite-storage.ts')
]);
const required = [...contract.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\([^;]*\):\s*Promise</gm)].map((match) => match[1]);
if (!required.length) throw new Error('StorageService-Vertrag konnte nicht gelesen werden.');
const failures = [];
for (const [label, source] of [['IndexedDB', indexedDb], ['SQLite', sqlite]]) {
  for (const method of required) if (!new RegExp(`\\basync\\s+${method}\\s*\\(`).test(source)) failures.push(`${label}: ${method} fehlt`);
}
for (const helper of ['createLearningTransactionArtifacts','progressAfterReset']) {
  if (!indexedDb.includes(helper) || !sqlite.includes(helper)) failures.push(`Gemeinsame Storage-Domainoperation ${helper} wird nicht von beiden Adaptern verwendet.`);
}
if (failures.length) { failures.forEach((failure) => console.error(`- ${failure}`)); process.exitCode = 1; }
else console.log(`Storage-Conformance sauber: ${required.length} Promise-Operationen in IndexedDB und SQLite.`);
