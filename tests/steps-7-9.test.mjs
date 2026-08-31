import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');

test('onboarding creates a persisted personal learning plan and remains reopenable',()=>{
  assert.ok(existsSync('src/features/onboarding/OnboardingFlow.tsx'));
  const flow=read('src/features/onboarding/OnboardingFlow.tsx');
  const shell=read('src/components/shell/AppShell.tsx');
  const settings=read('src/features/settings/SettingsPage.tsx');
  const path=read('src/shared/learning-path.ts');
  for(const goal of ["id: 'arabic'","id: 'quran'","id: 'hifz'","id: 'knowledge'"]) assert.ok(flow.includes(goal),goal);
  for(const token of ['DAILY_MINUTES','PLACEMENT','placementScore','dailyGoalMinutes','primaryLearningGoal','onboardingExperience','currentLevel','targetLevel']) assert.ok(flow.includes(token),token);
  assert.match(flow,/draft\.preferences\.onboardingComplete = true/);
  assert.match(flow,/draft\.preferences\.onboardingVersion = 1/);
  assert.match(shell,/!preferences\.onboardingComplete\s*\|\|\s*preferences\.onboardingVersion\s*<\s*1[\s\S]*<OnboardingFlow\s*\/>/);
  assert.match(settings,/Persoenlichen Lernplan neu einrichten/);
  assert.match(settings,/onboardingComplete\s*=\s*false/);
  assert.match(path,/assumedByPlacement/);
  assert.match(path,/compareLevels\(chapter\.cefrLevel, progress\.preferences\.currentLevel\) < 0/);
});

test('today page has one dominant next step and only secondary daily signals',()=>{
  const source=read('src/features/home/TodayPage.tsx');
  assert.equal((source.match(/<section className="today-focus">/g)||[]).length,1);
  assert.match(source,/primaryLearningGoal/);
  assert.match(source,/focusFor\(primaryGoal/);
  assert.match(source,/aria-label="Heute zusätzlich"/);
  assert.match(source,/ROUTES\.review/);
  assert.match(source,/ROUTES\.hifz/);
  assert.doesNotMatch(source,/Heute geplant|today-plan|today-main-grid/);
  for(const title of ['Arabisch lernen','Quran verstehen','Hifz','Islamische Wissenschaften']) assert.ok(source.includes(title),title);
});

test('practice engine uses interaction-specific scoring instead of MC fallback',()=>{
  const runner=read('src/features/practice/ExerciseRunner.tsx');
  const tasks=read('src/features/practice/tasks.ts');
  const scoring=read('src/features/practice/scoring.ts');
  const audio=read('src/services/audio/audio-service.ts');
  for(const fn of ['ChoiceTask','TextTask','OrderTask','MatchTask','ClozeTask','TraceTask','SpeakingTask']) assert.match(runner,new RegExp(`function ${fn}`),fn);
  assert.match(runner,/scoreTextTask/);
  assert.match(runner,/tokenScore/);
  assert.match(runner,/scoreTrace/);
  assert.match(runner,/startArabicRecognition/);
  assert.match(runner,/speech-rubric/);
  assert.match(scoring,/textSimilarityScore/);
  assert.match(scoring,/arabic_tolerant/);
  assert.match(scoring,/vocalization/);
  for(const kind of ["kind:'match'","kind:'order'","kind:'cloze'","kind:'text'","kind:'trace'","kind:'speaking'"]) assert.ok(tasks.includes(kind),kind);
  assert.match(audio,/webkitSpeechRecognition/);
});

test('canonical Arabic curriculum contains substantial non-choice practice',()=>{
  const path=JSON.parse(read('content-src/static/learning-path.json'));
  const variants=new Map();
  const visit=(value)=>{
    if(Array.isArray(value)){for(const item of value)visit(item);return;}
    if(!value||typeof value!=='object')return;
    if(typeof value.exerciseVariant==='string')variants.set(value.exerciseVariant,(variants.get(value.exerciseVariant)||0)+1);
    for(const item of Object.values(value))visit(item);
  };
  visit(path);
  assert.ok((variants.get('sentence_builder')||0)>=50,'sentence builder coverage');
  assert.ok((variants.get('writing_input')||0)>=30,'writing input coverage');
  assert.ok((variants.get('grammar_cloze')||0)>=10,'cloze coverage');
  assert.ok((variants.get('vocabulary_matching')||0)>=10,'matching coverage');
  assert.ok((variants.get('writing_trace')||0)>=1,'trace coverage');
  assert.ok((variants.get('speaking_shadowing')||0)>=1,'speaking coverage');
});
