import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(p,'utf8');

test('Quran Study uses one shared canvas for verses mushaf and focus',()=>{
 const reader=read('src/features/quran/QuranReader.tsx');
 const canvas=read('src/features/quran/QuranStudyCanvas.tsx');
 for(const token of ['quran-study-commandbar','quran-study-context-rail','QuranStudyCanvas','Wort fuer Wort','Tafsir','Tajwid','Hifz','PracticeSheet']) assert.ok(reader.includes(token),token);
 for(const view of ["'verses'","'mushaf'","'focus'"]) assert.ok(canvas.includes(view),view);
 for(const interaction of ["interaction: 'listening'","interaction: 'cloze'","interaction: 'order'"]) assert.ok(reader.includes(interaction),interaction);
});

test('Quran and Hifz share QuranStudyCanvas and persistent progress',()=>{
 const reader=read('src/features/quran/QuranReader.tsx');
 const hifz=read('src/features/hifz/HifzWorkspace.tsx');
 assert.match(reader,/QuranStudyCanvas/);
 assert.match(hifz,/QuranStudyCanvas/);
 assert.match(reader,/quranHifzEntries/);
 assert.match(reader,/quranHifzWordEntries/);
 assert.match(hifz,/quranHifzEntries/);
 assert.match(hifz,/quranHifzWordEntries/);
});
