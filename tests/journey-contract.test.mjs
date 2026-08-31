import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIslamicTrack } from './fiqh-source.mjs';

const json=(path)=>JSON.parse(readFileSync(path,'utf8'));

function assertCourse(chapters,label){
  assert.ok(chapters.length>0,`${label}: chapters`);
  for(const chapter of chapters){
    assert.ok(chapter.exam?.id,`${label}/${chapter.id}: chapter exam`);
    assert.ok(chapter.exam.passScore>=75,`${label}/${chapter.id}: pass score`);
    assert.ok(chapter.units?.length,`${label}/${chapter.id}: units`);
    for(const unit of chapter.units){
      assert.ok(unit.learningSteps?.length,`${label}/${unit.id}: learning steps`);
      const phases=new Set((unit.phases??[]).map((phase)=>phase.type));
      for(const phase of ['practice','exam'])assert.ok(phases.has(phase),`${label}/${unit.id}: ${phase}`);
      const examPhase=(unit.phases??[]).find((phase)=>phase.type==='exam');
      assert.ok(examPhase?.id,`${label}/${unit.id}: module exam phase`);
      assert.ok(examPhase.activities?.length,`${label}/${unit.id}: module exam activities`);
      assert.ok(unit.exam?.activityId,`${label}/${unit.id}: executable module exam`);
      assert.ok(unit.exam.passScore>=75,`${label}/${unit.id}: module pass score`);
    }
  }
}

test('Arabic and Quran curricula form executable gated journeys',()=>{
  assertCourse(json('content-src/static/learning-path.json'),'fusha');
  assertCourse(json('content-src/static/quran-path.json'),'quran');
});

test('Islamic science tracks also retain executable chapter and module gates',()=>{
  for(const name of ['fiqh_hanafi','fiqh_maliki','fiqh_shafii','fiqh_hanbali','usul_fiqh','hadith','usul_hadith']){
    assertCourse(loadIslamicTrack(name),name);
  }
});
