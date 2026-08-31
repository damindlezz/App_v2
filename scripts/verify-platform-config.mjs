import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root=process.cwd();
const fail=(message)=>{throw new Error(`[platform-check] ${message}`)};
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const tauri=JSON.parse(readFileSync(join(root,'src-tauri/tauri.conf.json'),'utf8'));
if(tauri.build.frontendDist!=='../out')fail('Tauri frontendDist muss ../out sein.');
if(tauri.build.beforeBuildCommand!=='npm run build')fail('Tauri muss vor jedem nativen Build npm run build ausfuehren.');
if(!String(tauri.build.devUrl).includes(':1420'))fail('Tauri Dev-URL stimmt nicht mit Next Dev-Port ueberein.');
if(!pkg.scripts['android:build']?.includes('tauri android build'))fail('Android Buildscript fehlt.');
if(!pkg.scripts['desktop:build']?.includes('tauri build'))fail('Desktop Buildscript fehlt.');
for(const file of ['src-tauri/src/lib.rs','src-tauri/tauri.conf.json','next.config.mjs','scripts/verify-next-export.mjs'])if(!existsSync(join(root,file)))fail(`${file} fehlt.`);
if(!tauri.app?.security?.csp?.includes("script-src 'self'"))fail('Production-CSP ist nicht strikt genug.');
console.log('[platform-check] OK: Next Export, Tauri Desktop und Android Build-Vertrag konsistent.');
