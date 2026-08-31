import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('Tauri and Next dev assets use one explicit dev-server origin', () => {
  const next = read('next.config.mjs');
  const pkg = JSON.parse(read('package.json'));
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.match(next, /TAURI_DEV_HOST/);
  assert.match(next, /TAURI_DEV_PORT/);
  assert.match(next, /assetPrefix:\s*isProduction\s*\?\s*undefined\s*:\s*`http:\/\/\$\{devHost\}:\$\{devPort\}`/);
  const nextPort = next.match(/TAURI_DEV_PORT \|\| '(\d+)'/)?.[1];
  const packagePort = pkg.scripts.dev.match(/-p (\d+)/)?.[1];
  const tauriPort = new URL(tauri.build.devUrl).port;
  assert.equal(nextPort, packagePort);
  assert.equal(packagePort, tauriPort);
});

test('root layout has no base tag that can corrupt static-export routes', () => {
  const layout = read('app/layout.tsx');
  assert.doesNotMatch(layout, /<base\b/i);
  assert.match(layout, /data-theme="tannengold"/);
  assert.match(layout, /data-mode="dark"/);
});

test('runtime content URLs resolve from application root without a base tag', () => {
  const service = read('src/services/content/content-service.ts');
  assert.match(service, /new URL\('\/'\s*,\s*window\.location\.href\)/);
  assert.doesNotMatch(service, /document\.baseURI/);
});

test('development CSP supports Next HMR while production CSP stays strict', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  const { csp, devCsp } = config.app.security;
  assert.match(devCsp, /'unsafe-eval'/);
  assert.match(devCsp, /ws:/);
  assert.match(devCsp, /http:/);
  assert.doesNotMatch(csp, /'unsafe-eval'/);
  assert.match(csp, /script-src 'self'/);
});

test('service worker is disabled in dev and inside Tauri', () => {
  const providers = read('app/providers.tsx');
  assert.match(providers, /process\.env\.NODE_ENV === 'production'/);
  assert.match(providers, /window\.__TAURI_INTERNALS__/);
  assert.match(providers, /getRegistrations\(\)/);
  assert.match(providers, /unregister\(\)/);
});

test('production build verifies the complete Next static export', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.build, /next build/);
  assert.match(pkg.scripts.build, /verify:export/);
  assert.equal(pkg.scripts['verify:export'], 'node scripts/verify-next-export.mjs');
});
