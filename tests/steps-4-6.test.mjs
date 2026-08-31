import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(p,'utf8');

test('Quran understanding path exposes Q0-Q6 and explicit Fusha bridges',()=>{
  const path=read('src/features/learn/CoursePathView.tsx');
  const area=read('src/features/quran/QuranAreaPage.tsx');
  for(const level of ['Q0','Q1','Q2','Q3','Q4','Q5','Q6']) assert.ok(path.includes(`code:'${level}'`),level);
  const study=read('src/features/study/StudyWorkspace.tsx');
  assert.match(study,/Arabisch-Brücke/);
  assert.match(area,/showQuranRoadmap/);
  const source=JSON.parse(read('content-src/static/quran-path.json'));
  const units=new Map(source.flatMap(ch=>ch.units).map(unit=>[unit.id,unit]));
  for(const [id,bridge] of [
    ['quran_q4_grammar_bridge','fusha_a1_vocalized_texts'],
    ['q5_function_words','s6_u1'],
    ['q5_frequent_roots','fusha_a2_word_families'],
    ['q6_nominal_patterns','fusha_a2_object_pronouns'],
    ['q6_verbal_patterns','fusha_a2_weak_verbs'],
    ['q6_reference_cohesion','fusha_a2_sentence_writing']
  ]) assert.ok(units.get(id)?.prerequisiteIds.includes(bridge),`${id} -> ${bridge}`);
});

test('Hifz Study separates navigation, selection and the four-stage learning flow',()=>{
  const s=read('src/features/hifz/HifzWorkspace.tsx');
  assert.match(s,/type HifzNavigationMode = 'surah' \| 'juz' \| 'page'/);
  for(const phase of ["id: 'understand'","id: 'memorize'","id: 'recite'","id: 'test'"]) assert.ok(s.includes(phase),phase);
  assert.match(s,/selectRange\(visibleReferences, rangeAnchor, next\)/);
  assert.match(s,/QuranStudyCanvas/);
  assert.match(s,/quranHifzEntries/);
  assert.match(s,/quranHifzWordEntries/);
  assert.doesNotMatch(s,/label:'Schwachstellen'/);
});

test('Islamic sciences expose the available disciplines, study levels, progress and sources',()=>{
  const s=read('src/features/knowledge/KnowledgePage.tsx');
  for(const token of ['Fiqh','Usul al-Fiqh','Hadith','Usul al-Hadith','Studienstufen S0–S3','Kompetenz-Gates','Quellenbezug','Fortschritt']) assert.ok(s.includes(token),token);
  assert.match(s,/ensureIslamicTrack\(initial\)/);
  assert.match(s,/CoursePathView/);
  assert.match(s,/ISLAMIC_STUDY_TRACKS/);
  assert.match(s,/fiqhTrackForSchool/);
});
