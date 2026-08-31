import type { ExerciseType, ExerciseVariant, LearningActivity, LearningContent, LearningPathChapter, LearningPathUnit, PageId, ReviewContentType } from '../../types/models';
import { flattenCourseModules } from '../../shared/course-module';
import { EXERCISE_DEFINITIONS } from '../../shared/exercise-registry';

export type TaskKind = 'choice' | 'text' | 'order' | 'match' | 'cloze' | 'analysis' | 'trace' | 'speaking';
export interface Pair { left: string; right: string }
export interface AnalysisStep { id: string; prompt: string; options: string[]; correct: string; explanation?: string }
export interface ExerciseTask {
  id: string; contentId: string; module: PageId; reviewType: ReviewContentType | null; exerciseType: ExerciseType; variant: ExerciseVariant; kind: TaskKind;
  prompt: string; arabicPrompt?: string; correct?: string; options?: string[]; explanation?: string; audioText?: string; tokens?: string[]; pairs?: Pair[]; analysisSteps?: AnalysisStep[]; traceText?: string; clozeTemplate?: string; evaluation?: 'standard' | 'arabic_tolerant' | 'vocalization';
}

export function findActivity(unit: LearningPathUnit, id: string) {
  const step = unit.learningSteps.find(item => item.id === id);
  if (step) return { activity: step as LearningActivity, phaseType: 'learning', phaseId: unit.learningId };
  for (const phase of unit.phases) { const activity = phase.activities.find(item => item.id === id); if (activity) return { activity, phaseType: phase.type, phaseId: phase.id }; }
  if (unit.exam.activityId === id) return { activity: { id, title: unit.exam.title, description: unit.exam.description, objective: unit.objective, kind: 'exam', icon: 'target', required: true, estimatedMinutes: 10, contentIds: [], exerciseType: 'knowledge', exerciseVariant: 'knowledge_quiz', knowledge: [], minimumScore: unit.exam.passScore } as LearningActivity, phaseType: 'exam', phaseId: unit.phases.find(phase => phase.type === 'exam')?.id };
  return null;
}

export function buildActivityTasks(content: LearningContent, unit: LearningPathUnit, activity: LearningActivity, phaseType: string | undefined, variant: ExerciseVariant): ExerciseTask[] {
  if (phaseType === 'exam') {
    const interactivePool = unit.phases.filter(phase => phase.type !== 'exam').flatMap(phase => phase.activities).filter(item => item.kind === 'exercise' && item.exerciseType && item.exerciseVariant).flatMap(item => buildTasks(content, item.exerciseType!, item.exerciseVariant!, new Set(item.contentIds), 3));
    const knowledgePool = unit.knowledgeQuestions?.length ? knowledgeTasks(unit, 'knowledge', 'knowledge_quiz') : [];
    const mixed = interleaveByKind([...interactivePool.filter(task => task.kind !== 'trace' && task.kind !== 'speaking'), ...knowledgePool]);
    if (mixed.length) return mixed.slice(0, Math.max(1, Math.min(unit.exam.questionCount, mixed.length)));
  }
  const ids = new Set(activity.contentIds);
  let tasks = buildTasks(content, activity.exerciseType ?? 'knowledge', variant, ids, 8);
  if (!tasks.length && unit.knowledgeQuestions?.length) tasks = knowledgeTasks(unit, activity.exerciseType ?? 'knowledge', variant);
  return interleaveByKind(tasks).slice(0, Math.max(1, Math.min(8, tasks.length)));
}

export function buildChapterExamTasks(content: LearningContent, chapter: LearningPathChapter): ExerciseTask[] {
  const byUnit = chapter.units.map(unit => {
    const interactive = unit.phases
      .filter(phase => phase.type !== 'exam')
      .flatMap(phase => phase.activities)
      .filter(activity => activity.kind === 'exercise' && activity.exerciseType && activity.exerciseVariant)
      .flatMap(activity => buildTasks(content, activity.exerciseType!, activity.exerciseVariant!, new Set(activity.contentIds), 4));
    const knowledge = unit.knowledgeQuestions?.length ? knowledgeTasks(unit, 'knowledge', 'knowledge_quiz') : [];
    const safe = [...interactive, ...knowledge].filter(task => task.kind !== 'trace' && task.kind !== 'speaking');
    const seen = new Set<string>();
    return interleaveByKind(safe).filter(task => !seen.has(task.id) && seen.add(task.id));
  });
  const mixed: ExerciseTask[] = [];
  let cursor = 0;
  while (mixed.length < chapter.exam.questionCount && byUnit.some(items => items[cursor])) {
    for (const unitTasks of byUnit) {
      const task = unitTasks[cursor];
      if (task) mixed.push({ ...task, id: `chapter:${chapter.id}:${task.id}` });
      if (mixed.length >= chapter.exam.questionCount) break;
    }
    cursor += 1;
  }
  return interleaveByKind(mixed).slice(0, chapter.exam.questionCount);
}

export function buildTasks(content: LearningContent, type: ExerciseType, variant: ExerciseVariant, ids?: Set<string>, count = 10, level?: string): ExerciseTask[] {
  if (variant === 'smart_mix') {
    const variants: ExerciseVariant[] = ['vocabulary_matching','vocabulary_recall','vocabulary_context','grammar_cloze','grammar_error_correction','sentence_builder','reading_harakat','writing_copy','alphabet_positions','quran_signs'];
    return interleaveByKind(variants.flatMap(item => buildTasks(content, typeForVariant(item), item, ids, 2, level))).slice(0, count);
  }
  let tasks: ExerciseTask[] = [];
  if (type === 'alphabet') tasks = alphabetTasks(content, variant, ids);
  else if (type === 'vocabulary') tasks = vocabularyTasks(content, variant, ids, level);
  else if (type === 'grammar' || type === 'sentence') tasks = grammarTasks(content, variant, ids);
  else if (type === 'reading') tasks = readingTasks(content, variant, ids, level);
  else if (type === 'writing') tasks = writingTasks(content, variant, ids);
  else if (type === 'quran') tasks = quranTasks(content, variant, ids);
  else if (type === 'speaking') tasks = speakingTasks(content, variant, ids, level);
  else if (type === 'knowledge') tasks = knowledgeContentTasks(content, variant, ids);
  return interleaveByKind(tasks).slice(0, Math.min(count, tasks.length));
}

function alphabetTasks(content: LearningContent, variant: ExerciseVariant, ids?: Set<string>): ExerciseTask[] {
  const pool = content.alphabet.filter(item => !ids || ids.has(item.id)); const names = content.alphabet.map(item => item.name); const weights = [...new Set(content.alphabet.map(item => item.weightLabel))];
  if (variant === 'alphabet_sound' || variant === 'alphabet_positions') return chunk(shuffle(pool), 6).map((selected, group) => ({ id:`${variant}:${group}:${selected.map(item=>item.id).join('-')}`, contentId:selected[0].id, module:'alphabet', reviewType:'alphabet', exerciseType:'alphabet', variant, kind:'match', prompt:variant==='alphabet_sound'?'Ordne Laut und Buchstabe zu.':'Ordne Schreibform und Buchstabenname zu.', pairs:selected.map(item=>({left:variant==='alphabet_sound'?item.sound:(item.forms?.medial??item.forms?.initial??item.letter),right:variant==='alphabet_sound'?item.letter:item.name})) }));
  return pool.map(item => variant === 'alphabet_weight' ? makeChoice(`aw:${item.id}`,item.id,'alphabet','alphabet','alphabet',variant,'Zu welcher Lautgruppe gehört dieser Buchstabe?',item.letter,weights,item.weightLabel,item.letter,item.weightNote) : makeChoice(`ar:${item.id}`,item.id,'alphabet','alphabet','alphabet','alphabet_recognition','Wie heißt dieser Buchstabe?',item.letter,names,item.name,item.letter,`Laut: ${item.sound}`));
}
function vocabularyTasks(content: LearningContent, variant: ExerciseVariant, ids?: Set<string>, level?: string): ExerciseTask[] {
  let pool=content.vocabulary.filter(item=>!ids||ids.has(item.id)); const levelPool=pool.filter(item=>item.cefrLevel===level); if(!ids&&levelPool.length)pool=levelPool; const german=content.vocabulary.map(item=>item.german); const registers=[...new Set(content.vocabulary.map(item=>item.register))];
  if(variant==='vocabulary_matching')return chunk(shuffle(pool),6).map((selected,group)=>({id:`vm:${group}:${selected.map(item=>item.id).join('-')}`,contentId:selected[0].id,module:'vocabulary',reviewType:'vocabulary',exerciseType:'vocabulary',variant,kind:'match',prompt:'Ordne Arabisch und Deutsch zu.',pairs:selected.map(item=>({left:item.arabicVocalized,right:item.german}))}));
  return pool.map(item=>{ if(variant==='vocabulary_recall')return {...makeText(`vr:${item.id}`,item.id,'vocabulary','vocabulary','vocabulary',variant,'Schreibe das arabische Wort.',item.german,item.arabicUnvocalized,item.arabicVocalized,item.hint),evaluation:'arabic_tolerant'}; if(variant==='vocabulary_dictation')return {...makeText(`vd:${item.id}`,item.id,'vocabulary','vocabulary','vocabulary',variant,'Schreibe, was du hörst.',undefined,item.arabicUnvocalized,undefined,item.hint,item.arabicVocalized),evaluation:'arabic_tolerant'}; if(variant==='vocabulary_listening')return makeChoice(`vl:${item.id}`,item.id,'vocabulary','vocabulary','vocabulary',variant,'Was bedeutet das gehörte Wort?',undefined,german,item.german,undefined,item.translationNote,item.arabicVocalized); if(variant==='vocabulary_context'){const example=item.examples[0];const source=example?.arabicVocalized??item.arabicVocalized;const template=blankTerm(source,item.arabicVocalized,item.arabicUnvocalized);if(template!==source)return makeCloze(`vc:${item.id}`,item.id,'vocabulary','vocabulary','vocabulary',variant,`Ergänze das passende Wort: ${example?.german??item.german}`,template,item.arabicVocalized,shuffle(pool.map(entry=>entry.arabicVocalized)).slice(0,12),example?.german??item.translationNote);return makeChoice(`vc:${item.id}`,item.id,'vocabulary','vocabulary','vocabulary',variant,'Welche Bedeutung passt im Kontext?',source,german,item.german,source,example?.german);} if(variant==='morphology_root'&&item.root)return makeText(`mr:${item.id}`,item.id,'vocabulary','vocabulary','vocabulary',variant,'Welche Wurzel gehört zu diesem Wort?',item.arabicVocalized,item.root,item.arabicVocalized,item.pattern); if(variant==='register_shift')return makeChoice(`rs:${item.id}`,item.id,'vocabulary','vocabulary','vocabulary',variant,'Welches Register ist angegeben?',item.arabicVocalized,registers,item.register,item.arabicVocalized,item.usageNote); return makeChoice(`v:${item.id}`,item.id,'vocabulary','vocabulary','vocabulary','vocabulary_context','Was bedeutet dieses Wort?',item.arabicVocalized,german,item.german,item.arabicVocalized,item.translationNote); });
}
function grammarTasks(content: LearningContent, variant: ExerciseVariant, ids?: Set<string>): ExerciseTask[]{const lessons=content.grammar.filter(item=>!ids||ids.has(item.id));const allExamples=content.grammar.flatMap(item=>item.examples.map(example=>({example,arabic:example.blocks.map(block=>block.arabicVocalized).join(' '),translation:example.translation})));if(variant==='grammar_listening')return lessons.flatMap(lesson=>lesson.examples.map(example=>{const arabic=example.blocks.map(block=>block.arabicVocalized).join(' ');return makeChoice(`gl:${example.id}`,lesson.id,'grammar','grammar','grammar',variant,'Welche Bedeutung passt zum gehoerten Beispielsatz?',undefined,allExamples.map(item=>item.translation),example.translation,undefined,lesson.description,arabic);}));if(variant==='sentence_builder')return lessons.flatMap(lesson=>lesson.examples.map(example=>{const tokens=example.blocks.map(block=>block.arabicVocalized).filter(Boolean);return{id:`sb:${example.id}`,contentId:lesson.id,module:'grammar',reviewType:'grammar',exerciseType:'sentence',variant,kind:'order',prompt:`Baue den Satz: ${example.translation}`,correct:tokens.join(' '),tokens,explanation:example.title}as ExerciseTask;}).filter(task=>(task.tokens?.length??0)>1));if(variant==='grammar_error_correction')return lessons.flatMap(lesson=>lesson.commonMistakes.map((mistake,index)=>makeText(`ge:${lesson.id}:${index}`,lesson.id,'grammar','grammar','grammar',variant,'Korrigiere den Fehler.',mistake.wrong,mistake.correct,mistake.wrong,mistake.explanation)));if(variant==='grammar_rules')return lessons.flatMap(lesson=>lesson.rules.slice(0,4).map((rule,index)=>makeChoice(`gr:${lesson.id}:${index}`,lesson.id,'grammar','grammar','grammar',variant,`Welche Regel gehört zu ${lesson.title}?`,undefined,[...lesson.rules,...content.grammar.flatMap(item=>item.rules).slice(0,20)],rule,undefined,lesson.description)));const explicit=lessons.flatMap(lesson=>lesson.quiz.filter(question=>question.type==='cloze').map(question=>makeCloze(`gc:${question.id}`,lesson.id,'grammar','grammar','grammar','grammar_cloze',question.prompt,question.arabicPrompt??'___',question.correctAnswer,question.options,question.explanation)));const generated=lessons.flatMap(lesson=>lesson.examples.flatMap(example=>{const tokens=example.blocks.map(block=>block.arabicVocalized).filter(Boolean);if(tokens.length<2)return[];const blankIndex=Math.min(tokens.length-1,Math.floor(tokens.length/2));const correct=tokens[blankIndex];const template=tokens.map((token,index)=>index===blankIndex?'___':token).join(' ');const distractors=content.grammar.flatMap(item=>item.examples).flatMap(item=>item.blocks.map(block=>block.arabicVocalized)).filter(Boolean);return[makeCloze(`gcx:${example.id}`,lesson.id,'grammar','grammar','grammar','grammar_cloze',`Ergänze den Satz: ${example.translation}`,template,correct,distractors,example.title)];}));return explicit.length?explicit:generated;}
function readingTasks(content:LearningContent,variant:ExerciseVariant,ids?:Set<string>,level?:string):ExerciseTask[]{let lessons=content.reading.filter(item=>!ids||ids.has(item.id));const levelPool=lessons.filter(item=>item.cefrLevel===level);if(!ids&&levelPool.length)lessons=levelPool;const examples=content.reading.flatMap(item=>item.examples);return lessons.flatMap(lesson=>lesson.examples.map(example=>{if(variant==='reading_harakat')return {...makeText(`rh:${example.id}`,lesson.id,'reading','reading','reading',variant,'Ergänze die Harakat.',example.unvocalized,example.vocalized,example.unvocalized,example.clue),evaluation:'vocalization'};if(variant==='reading_vocalized')return {...makeText(`rv:${example.id}`,lesson.id,'reading','reading','reading',variant,'Vokalisiere diese Form.',example.unvocalized,example.vocalized,example.unvocalized,example.clue),evaluation:'vocalization'};if(variant==='reading_listening')return makeChoice(`rl:${example.id}`,lesson.id,'reading','reading','reading',variant,'Welche Bedeutung passt zum gehoerten Satz?',undefined,examples.map(item=>item.german),example.german,undefined,example.clue,example.vocalized);return makeChoice(`rm:${example.id}`,lesson.id,'reading','reading','reading','reading_meaning','Welche Bedeutung passt?',example.vocalized,examples.map(item=>item.german),example.german,example.vocalized,example.clue);}));}
function writingTasks(content:LearningContent,variant:ExerciseVariant,ids?:Set<string>):ExerciseTask[]{return content.writing.filter(item=>!ids||ids.has(item.id)).map(item=>{if(variant==='writing_dictation')return {...makeText(`wd:${item.id}`,item.id,'writing',null,'writing',variant,'Schreibe, was du hoerst.',undefined,item.targetUnvocalized,item.targetVocalized,item.hints[0],item.targetVocalized),evaluation:'arabic_tolerant'};if(variant==='writing_trace')return{id:`wt:${item.id}`,contentId:item.id,module:'writing',reviewType:null,exerciseType:'writing',variant,kind:'trace',prompt:item.prompt,traceText:item.targetVocalized,arabicPrompt:item.targetVocalized};if(variant==='writing_copy')return {...makeText(`wc:${item.id}`,item.id,'writing',null,'writing',variant,'Schreibe die Vorlage ab.',item.targetVocalized,item.targetUnvocalized,item.targetVocalized,item.hints[0]),evaluation:'arabic_tolerant'};return {...makeText(`wi:${item.id}`,item.id,'writing',null,'writing','writing_input',item.prompt,item.targetVocalized,item.expectedAnswer,item.targetVocalized,item.hints[0]),evaluation:'arabic_tolerant'};});}
function quranTasks(content:LearningContent,variant:ExerciseVariant,ids?:Set<string>):ExerciseTask[]{const lessons=content.quran.filter(item=>!ids||ids.has(item.id));const german=content.quran.flatMap(item=>item.examples.map(example=>example.german));const rules=content.quran.flatMap(item=>item.rules);if(variant==='quran_signs'||variant==='quran_pauses'){const signs=shuffle(lessons.flatMap(lesson=>lesson.signs.map(sign=>({lessonId:lesson.id,sign}))));return chunk(signs,6).map((selected,group)=>({id:`qs:${group}:${selected.map(item=>`${item.lessonId}-${item.sign.symbol}`).join('-')}`,contentId:selected[0].lessonId,module:'quran',reviewType:'quran',exerciseType:'quran',variant,kind:'match',prompt:'Ordne Zeichen und Bedeutung zu.',pairs:selected.map(item=>({left:item.sign.symbol,right:item.sign.name})),explanation:selected.map(item=>item.sign.explanation).filter(Boolean).slice(0,2).join(' ')}));}return lessons.flatMap(lesson=>{if(variant==='quran_tajweed')return lesson.rules.map((rule,index)=>makeChoice(`qt:${lesson.id}:${index}`,lesson.id,'quran','quran','quran',variant,`Welche Regel gehört zu ${lesson.title}?`,undefined,rules,rule,undefined,lesson.objective));if(variant==='reading_vocalized')return lesson.examples.map(example=>{const unvocalized=stripArabicDiacritics(example.arabic).trim();if(unvocalized&&unvocalized!==example.arabic.trim())return {...makeText(`qrv:${example.id}`,lesson.id,'quran','quran','quran','reading_vocalized','Setze die korrekte Vokalisierung.',unvocalized,example.arabic,unvocalized,example.note),evaluation:'vocalization'};return{id:`qrv:${example.id}`,contentId:lesson.id,module:'quran',reviewType:'quran',exerciseType:'quran',variant:'reading_vocalized',kind:'trace',prompt:'Zeichen aktiv nachspuren.',traceText:example.arabic,arabicPrompt:example.arabic,explanation:example.note};});return lesson.examples.map(example=>makeChoice(`ql:${example.id}`,lesson.id,'quran','quran','quran','quran_language','Welche Bedeutung passt?',example.arabic,german,example.german,example.arabic,example.note));});}
function speakingTasks(content:LearningContent,variant:ExerciseVariant,ids?:Set<string>,level?:string):ExerciseTask[]{const tasks:ExerciseTask[]=[];let vocab=content.vocabulary.filter(item=>!ids||ids.has(item.id));const levelPool=vocab.filter(item=>item.cefrLevel===level);if(!ids&&levelPool.length)vocab=levelPool;for(const item of vocab)tasks.push({id:`sp:v:${item.id}`,contentId:item.id,module:'vocabulary',reviewType:'speaking',exerciseType:'speaking',variant:'speaking_shadowing',kind:'speaking',prompt:`Sprich nach: ${item.german}`,arabicPrompt:item.arabicVocalized,correct:item.arabicVocalized});for(const lesson of content.reading.filter(item=>ids?.has(item.id)))for(const example of lesson.examples)tasks.push({id:`sp:r:${example.id}`,contentId:lesson.id,module:'reading',reviewType:'speaking',exerciseType:'speaking',variant:'speaking_shadowing',kind:'speaking',prompt:`Sprich den Satz nach: ${example.german}`,arabicPrompt:example.vocalized,correct:example.vocalized});for(const lesson of content.grammar.filter(item=>ids?.has(item.id)))for(const example of lesson.examples){const arabic=example.blocks.map(block=>block.arabicVocalized).join(' ');tasks.push({id:`sp:g:${example.id}`,contentId:lesson.id,module:'grammar',reviewType:'speaking',exerciseType:'speaking',variant:'speaking_shadowing',kind:'speaking',prompt:`Sprich den Beispielsatz nach: ${example.translation}`,arabicPrompt:arabic,correct:arabic});}for(const item of content.writing.filter(item=>ids?.has(item.id)))tasks.push({id:`sp:w:${item.id}`,contentId:item.id,module:'writing',reviewType:'speaking',exerciseType:'speaking',variant:'speaking_shadowing',kind:'speaking',prompt:`Sprich die Zielform nach: ${item.title}`,arabicPrompt:item.targetVocalized,correct:item.targetVocalized});return tasks;}
type KnowledgeQuestion = NonNullable<LearningPathUnit['knowledgeQuestions']>[number];
const FIQH_SCHOOL_LABELS: Record<string,string> = { fiqh_hanafi:'Ḥanafī', fiqh_maliki:'Mālikī', fiqh_shafii:'Šāfiʿī', fiqh_hanbali:'Ḥanbalī' };
const KNOWLEDGE_KIND_LABELS: Record<string,string> = { term:'Begriff', method:'Methode', case:'Fallanalyse', error:'Fehlerdiagnose', source:'Quellenbezug', boundary:'Grenzfall' };
function analysisTask(id:string,contentId:string,type:ExerciseType,variant:ExerciseVariant,question:KnowledgeQuestion):ExerciseTask{
  const kind=question.questionKind??'method';
  const kindLabel=KNOWLEDGE_KIND_LABELS[kind]??'Analyse';
  return {id,contentId,module:'courseModule',reviewType:'knowledge',exerciseType:type,variant,kind:'analysis',prompt:variant==='hadith_analysis'?'Analysiere die Hadith-Frage in zwei Schritten.':'Begründe die Einordnung in zwei Schritten.',arabicPrompt:question.arabicPrompt,explanation:question.explanation,analysisSteps:[
    {id:`${id}:answer`,prompt:question.prompt,options:makeOptions(question.correctAnswer,question.options),correct:question.correctAnswer,explanation:question.explanation},
    {id:`${id}:level`,prompt:'Welche Analyseebene wird hier geprüft?',options:shuffle([...new Set([kindLabel,'Begriff','Methode','Fallanalyse','Fehlerdiagnose','Quellenbezug','Grenzfall'])]).slice(0,5),correct:kindLabel,explanation:`Diese Aufgabe prüft die Ebene „${kindLabel}“.`}
  ]};
}
function unitStem(id:string):string{return id.replace(/^fiqh_(hanafi|maliki|shafii|hanbali)_/,'');}
function fiqhComparisonTask(content:LearningContent,record:ReturnType<typeof flattenCourseModules>[number],question:KnowledgeQuestion):ExerciseTask{
  const records=flattenCourseModules(content);
  const stem=unitStem(record.unit.id);
  const sourceQuestions=record.unit.knowledgeQuestions??[];
  const index=sourceQuestions.findIndex(item=>item.id===question.id);
  const pairs=Object.keys(FIQH_SCHOOL_LABELS).flatMap(track=>{
    const sibling=records.find(item=>item.track===track&&unitStem(item.unit.id)===stem);
    const candidate=sibling?.unit.knowledgeQuestions?.[index];
    return candidate?[{left:FIQH_SCHOOL_LABELS[track],right:candidate.correctAnswer}]:[];
  });
  if(pairs.length>=2&&new Set(pairs.map(pair=>pair.right)).size>=2)return{id:`fiqh-compare:${stem}:${index}`,contentId:question.id,module:'courseModule',reviewType:'knowledge',exerciseType:'knowledge',variant:'fiqh_compare',kind:'match',prompt:`Vergleiche die Madhāhib zu „${record.unit.title}“ und ordne die Aussagen korrekt zu.`,pairs,explanation:'Die Zuordnung macht schulinterne Unterschiede explizit sichtbar; gemeinsame Aussagen bleiben im Fiqh-Core.'};
  return analysisTask(`fiqh-analysis:${record.unit.id}:${question.id}`,question.id,'knowledge','fiqh_compare',question);
}
function knowledgeContentTasks(content:LearningContent,variant:ExerciseVariant,ids?:Set<string>):ExerciseTask[]{return flattenCourseModules(content).flatMap(record=>(record.unit.knowledgeQuestions??[]).filter(question=>!ids||ids.has(question.id)).map(question=>variant==='hadith_analysis'?analysisTask(`hadith:${record.unit.id}:${question.id}`,question.id,'knowledge',variant,question):variant==='fiqh_compare'?fiqhComparisonTask(content,record,question):makeChoice(`kf:${record.unit.id}:${question.id}`,question.id,'courseModule','knowledge','knowledge','knowledge_quiz',question.prompt,question.arabicPrompt,question.options,question.correctAnswer,question.arabicPrompt,question.explanation)));}
function knowledgeTasks(unit:LearningPathUnit,type:ExerciseType,variant:ExerciseVariant):ExerciseTask[]{return(unit.knowledgeQuestions??[]).map(question=>variant==='hadith_analysis'||variant==='fiqh_compare'?analysisTask(`k:${question.id}`,question.id,type,variant,question):makeChoice(`k:${question.id}`,question.id,'courseModule','knowledge',type,'knowledge_quiz',question.prompt,question.arabicPrompt,question.options,question.correctAnswer,question.arabicPrompt,question.explanation));}
function makeChoice(id:string,contentId:string,module:PageId,reviewType:ReviewContentType|null,exerciseType:ExerciseType,variant:ExerciseVariant,prompt:string,arabicPrompt:string|undefined,pool:string[],correct:string,shownArabic?:string,explanation?:string,audioText?:string):ExerciseTask{return{id,contentId,module,reviewType,exerciseType,variant,kind:'choice',prompt,arabicPrompt:shownArabic??arabicPrompt,options:makeOptions(correct,pool),correct,explanation,audioText};}
function makeText(id:string,contentId:string,module:PageId,reviewType:ReviewContentType|null,exerciseType:ExerciseType,variant:ExerciseVariant,prompt:string,arabicPrompt:string|undefined,correct:string,shownArabic?:string,explanation?:string,audioText?:string):ExerciseTask{return{id,contentId,module,reviewType,exerciseType,variant,kind:'text',prompt,arabicPrompt:shownArabic??arabicPrompt,correct,explanation,audioText};}
function makeCloze(id:string,contentId:string,module:PageId,reviewType:ReviewContentType|null,exerciseType:ExerciseType,variant:ExerciseVariant,prompt:string,template:string,correct:string,pool:string[],explanation?:string):ExerciseTask{return{id,contentId,module,reviewType,exerciseType,variant,kind:'cloze',prompt,clozeTemplate:normalizeBlank(template),correct,options:makeOptions(correct,pool),explanation};}
function chunk<T>(items:T[],size:number):T[][]{const result:T[][]=[];for(let index=0;index<items.length;index+=size){const part=items.slice(index,index+size);if(part.length)result.push(part);}return result;}
function makeOptions(correct:string,pool:string[]):string[]{return shuffle([correct,...shuffle([...new Set(pool.filter(item=>item&&item!==correct))]).slice(0,5)]).slice(0,6);}
export function shuffle<T>(items:readonly T[]):T[]{return [...items].sort(()=>Math.random()-.5);}
export function interleaveByKind(tasks:ExerciseTask[]):ExerciseTask[]{const buckets=new Map<TaskKind,ExerciseTask[]>();for(const task of shuffle(tasks))buckets.set(task.kind,[...(buckets.get(task.kind)??[]),task]);const result:ExerciseTask[]=[];while([...buckets.values()].some(items=>items.length))for(const kind of ['analysis','cloze','order','match','text','choice','speaking','trace']as TaskKind[]){const item=buckets.get(kind)?.shift();if(item)result.push(item);}return result;}
export function equivalent(left:string,right:string):boolean{return normalize(left)===normalize(right);}
function normalize(value:string):string{return value.normalize('NFKC').toLowerCase().replace(/[.,!?;:'"()\[\]-]/g,'').replace(/\s+/g,' ').trim();}
function stripArabicDiacritics(value:string):string{return value.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g,'');}
export function tokenScore(actual:string[],expected:string[]):number{if(!expected.length)return 0;return actual.filter((token,index)=>equivalent(token,expected[index]??'')).length/expected.length;}
function normalizeBlank(value:string):string{return /_{2,}/.test(value)?value.replace(/_{2,}/,'___'):`___ ${value}`;}
export function splitBlank(value:string):[string,string]{const normalized=normalizeBlank(value);const index=normalized.indexOf('___');return[normalized.slice(0,index).trim(),normalized.slice(index+3).trim()];}
function blankTerm(source:string,...terms:string[]):string{for(const term of terms)if(term&&source.includes(term))return source.replace(term,'___');return source;}
export function isVariant(value?:string|null):value is ExerciseVariant{return Boolean(value&&[...EXERCISE_DEFINITIONS.map(item=>item.variant),'smart_mix'].includes(value as ExerciseVariant));}
export function defaultVariant(type:ExerciseType):ExerciseVariant{return({vocabulary:'vocabulary_matching',sentence:'sentence_builder',grammar:'grammar_cloze',reading:'reading_harakat',alphabet:'alphabet_positions',writing:'writing_input',quran:'quran_signs',knowledge:'knowledge_quiz',speaking:'speaking_shadowing'}as const)[type];}
export function typeForVariant(variant:ExerciseVariant):ExerciseType{return EXERCISE_DEFINITIONS.find(item=>item.variant===variant)?.type??(variant==='smart_mix'?'vocabulary':'knowledge');}
export function taskKindLabel(kind:TaskKind):string{return({choice:'Auswahl',text:'Eingabe',order:'Drag & Drop',match:'Zuordnen',cloze:'Lückentext',analysis:'Analyse',trace:'Nachzeichnen',speaking:'Aufnahme'}as const)[kind];}
export function interactionLabel(value:ExerciseVariant):string{if(value==='sentence_builder')return'Drag & Drop';if(['vocabulary_matching','alphabet_sound','alphabet_positions','quran_signs','quran_pauses'].includes(value))return'Zuordnen';if(['grammar_cloze','vocabulary_context'].includes(value))return'Lückentext';if(['vocabulary_listening','grammar_listening','reading_listening'].includes(value))return'Audio + Auswahl';if(value==='writing_dictation')return'Audio + Eingabe';if(['vocabulary_recall','vocabulary_dictation','grammar_error_correction','reading_harakat','reading_vocalized','writing_input','writing_copy','morphology_root'].includes(value))return'Texteingabe';if(value==='writing_trace')return'Zeichnen';if(value==='speaking_shadowing')return'Audioaufnahme';if(value==='hadith_analysis')return'Mehrschritt-Analyse';if(value==='fiqh_compare')return'Madhhab-Vergleich';return'Auswahl';}
export function variantLabel(value:ExerciseVariant):string{return({default:'Standard',alphabet_recognition:'Buchstaben erkennen',alphabet_sound:'Laute zuordnen',alphabet_positions:'Formen zuordnen',alphabet_weight:'Lautgruppen',vocabulary_matching:'Zuordnen',vocabulary_context:'Kontext-Lücke',vocabulary_recall:'Aktiver Abruf',vocabulary_listening:'Hören',vocabulary_dictation:'Diktat',speaking_shadowing:'Shadowing',morphology_root:'Wortwurzel',register_shift:'Register',hadith_analysis:'Hadith-Analyse',fiqh_compare:'Fiqh-Vergleich',grammar_rules:'Regeln',grammar_cloze:'Lückensatz',grammar_error_correction:'Fehlerkorrektur',grammar_listening:'Grammatik hören',sentence_builder:'Satzbau',reading_meaning:'Leseverstehen',reading_listening:'Satz hören',reading_vocalized:'Vokalisieren',reading_harakat:'Harakat',writing_input:'Freies Schreiben',writing_dictation:'Diktat',writing_trace:'Nachspuren',writing_copy:'Abschreiben',quran_signs:'Muṣḥaf-Zeichen',quran_tajweed:'Tajwīd',quran_pauses:'Pausenzeichen',quran_language:'Quran-Sprache',knowledge_quiz:'Wissen',smart_mix:'Interaktiver Mix'}as const)[value]??value;}

export function buildAyahTasks(content: LearningContent, reference: string, interaction: 'listening' | 'cloze' | 'order' | 'matching' | 'dictation' = 'order'): ExerciseTask[] {
  const runtime = content.quranReader;
  if (!runtime) return [];
  const ayah = runtime.ayahs.find(item => item.reference === reference);
  if (!ayah) return [];
  const words = runtime.words.filter(item => item.reference === reference).sort((a, b) => a.wordIndex - b.wordIndex);
  const translation = runtime.translations.find(item => item.reference === reference)?.text;
  if (interaction === 'listening') {
    const nearby = runtime.ayahs.filter(item => item.surah === ayah.surah && Math.abs(item.ayah - ayah.ayah) <= 4).map(item => item.text);
    return [{ id: `ayah-listen:${reference}`, contentId: reference, module: 'quran', reviewType: 'quran', exerciseType: 'quran', variant: 'quran_language', kind: 'choice', prompt: 'Welche Ayah hast du gehoert?', correct: ayah.text, options: shuffle([...new Set([ayah.text, ...nearby])]).slice(0, 4), audioText: ayah.text, explanation: translation }];
  }
  if (interaction === 'dictation') {
    return [{ id: `ayah-dictation:${reference}`, contentId: reference, module: 'quran', reviewType: 'quran', exerciseType: 'quran', variant: 'quran_language', kind: 'text', prompt: 'Schreibe die gehoerte Ayah.', correct: ayah.text, audioText: ayah.text, explanation: translation, evaluation: 'arabic_tolerant' }];
  }
  if (interaction === 'matching') {
    const pairs = words.filter(item => item.translation).slice(0, 7).map(item => ({ left: item.text, right: item.translation! }));
    if (pairs.length >= 2) return [{ id: `ayah-match:${reference}`, contentId: reference, module: 'quran', reviewType: 'quran', exerciseType: 'quran', variant: 'quran_language', kind: 'match', prompt: 'Ordne die Woerter ihrer Bedeutung zu.', pairs, explanation: translation }];
  }
  if (interaction === 'cloze' && words.length >= 2) {
    const index = Math.min(words.length - 1, Math.max(0, Math.floor(words.length / 2)));
    const missing = words[index];
    const template = words.map((item, cursor) => cursor === index ? '___' : item.text).join(' ');
    const distractors = runtime.words.filter(item => item.reference !== reference && item.translation).slice(0, 20).map(item => item.text);
    return [{ id: `ayah-cloze:${reference}`, contentId: reference, module: 'quran', reviewType: 'quran', exerciseType: 'quran', variant: 'quran_language', kind: 'cloze', prompt: 'Ergaenze das fehlende Wort der Ayah.', correct: missing.text, clozeTemplate: template, options: shuffle([...new Set([missing.text, ...words.map(item => item.text), ...distractors])]).slice(0, 10), explanation: translation }];
  }
  const tokens = words.length > 1 ? words.map(item => item.text) : ayah.text.split(/\s+/).filter(Boolean);
  return [{ id: `ayah-order:${reference}`, contentId: reference, module: 'quran', reviewType: 'quran', exerciseType: 'sentence', variant: 'sentence_builder', kind: 'order', prompt: `Setze ${reference} aus Bausteinen zusammen.`, correct: tokens.join(' '), tokens, explanation: translation }];
}
