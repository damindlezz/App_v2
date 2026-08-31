import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(p,'utf8');

test('exercise runner contains all interactive primitives',()=>{
 const s=read('src/features/practice/ExerciseRunner.tsx');
 for(const fn of ['ChoiceTask','TextTask','OrderTask','MatchTask','ClozeTask','TraceTask','SpeakingTask']) assert.match(s,new RegExp(`function ${fn}`),fn);
 assert.match(s,/onDragStart/); assert.match(s,/onDrop/); assert.match(s,/onPointerDown/); assert.match(s,/startRecording/);
});

test('task generator maps learning goals to non-MC interactions',()=>{
 const s=read('src/features/practice/tasks.ts');
 for(const kind of ["kind:'match'","kind:'order'","kind:'trace'","kind:'speaking'","kind:'cloze'","kind:'text'"]) assert.ok(s.includes(kind),kind);
 for(const ayah of ['ayah-listen','ayah-dictation','ayah-match','ayah-cloze','ayah-order']) assert.ok(s.includes(ayah),ayah);
});

test('Quran contextual practice lazy-loads requested surah outside render',()=>{
 const s=read('src/features/practice/PracticeHub.tsx');
 assert.match(s,/query\.mode\s*!==\s*'ayah'.*ensureQuranReader/s);
 assert.doesNotMatch(s,/if\(!ayahTasks\.length\)\{void ensureQuranReader/);
});

test('chapter exams are executable competency gates',()=>{
 const hub=read('src/features/practice/PracticeHub.tsx');
 const tasks=read('src/features/practice/tasks.ts');
 const runner=read('src/features/practice/ExerciseRunner.tsx');
 assert.match(hub,/chapterId/);
 assert.match(hub,/buildChapterExamTasks/);
 assert.match(tasks,/export function buildChapterExamTasks/);
 assert.match(runner,/chapterExamEntryId/);
 assert.match(runner,/chapterPassScore/);
});
