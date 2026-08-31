import type {
  AlphabetEntry,
  ContentManifest,
  GrammarLesson,
  LearningContent,
  LearningItemDefinition,
  LearningPathStage,
  QuranLesson,
  QuranReaderRuntime,
  ReadingLesson,
  SkillDefinition,
  ExerciseTemplateDefinition,
  VocabularyEntry,
  WritingLesson,
  SourceRecord,
  CitationRecord,
  ClaimRecord,
  ClaimSourceLinkRecord,
  CourseTrack,
  QuranVocabularyLink
} from '../../types/models';
import { EXERCISE_DEFINITIONS, REGISTERED_EXERCISE_TYPES } from '../../shared/exercise-registry';
import { ISLAMIC_STUDY_TRACKS } from '../../shared/course-track-meta';

export type ContentRuntimeSource = 'auto' | 'json';
export interface ContentLoadOptions { baseUrl?: string; timeoutMs?: number; retries?: number; retryDelayMs?: number; fetchImpl?: typeof fetch; source?: ContentRuntimeSource }
export interface IslamicModuleSearchRecord { id: string; title: string; objective: string; chapterTitle: string; track: string }
class ContentLoadError extends Error { constructor(message: string, readonly retryable: boolean, readonly cause?: unknown) { super(message); this.name='ContentLoadError'; } }
const LEVEL_ORDER = ['A0','A1','A2','B1','B2','C1','C2'] as const;
const LEVELS=new Set(LEVEL_ORDER);
const PHASES=['practice','deepen','exam'];
const TYPES = REGISTERED_EXERCISE_TYPES;
const VARIANTS = new Set(EXERCISE_DEFINITIONS.map((definition) => definition.variant));
const EXERCISE_DOMAINS: Record<string, string[]> = Object.fromEntries(
  EXERCISE_DEFINITIONS.map((definition) => [`${definition.type}:${definition.variant}`, definition.contentDomains])
);
function record(value:unknown): value is Record<string,unknown>{return Boolean(value&&typeof value==='object'&&!Array.isArray(value));}
function text(value:unknown): value is string{return typeof value==='string'&&value.trim().length>0;}
function fail(source:string,detail:string):never{throw new ContentLoadError(`${source}: ${detail}`,false);}
function ids(value:unknown,label:string,source:string):string[]{if(!Array.isArray(value)||value.some((x)=>!text(x)))fail(source,`${label} muss eine ID-Liste sein.`);const out=value as string[];if(new Set(out).size!==out.length)fail(source,`${label} enthält Duplikate.`);return out;}
function validatePath(content:LearningContent,chapters:LearningPathStage[],track:'fusha'|'quran',source:string,moduleIds:Set<string>,phaseIds:Set<string>,activityIds:Set<string>):void{
  const datasetIds:Record<string,Set<string>>={alphabet:new Set(content.alphabet.map(x=>x.id)),vocabulary:new Set(content.vocabulary.map(x=>x.id)),grammar:new Set(content.grammar.map(x=>x.id)),writing:new Set(content.writing.map(x=>x.id)),reading:new Set(content.reading.map(x=>x.id)),quran:new Set(content.quran.map(x=>x.id)),courseModule:new Set([...content.learningPath,...content.quranPath,...content.islamicPaths].flatMap(chapter=>chapter.units).flatMap(unit=>unit.knowledgeQuestions??[]).map(question=>question.id))};
  const allowedContentByExercise = new Map<string, Set<string>>();
  for (const [key, domains] of Object.entries(EXERCISE_DOMAINS)) {
    allowedContentByExercise.set(key, new Set(domains.flatMap((domain) => [...(datasetIds[domain] ?? [])])));
  }
  for(const chapter of chapters){
    if(chapter.track!==track||!text(chapter.id)||!text(chapter.title)||!chapter.units.length)fail(source,`Kapitel ${chapter.id||'(ohne ID)'} ist ungültig.`);
    if(track==='quran'&&!['Q0','Q1','Q2','Q3','Q4','Q5','Q6'].includes(chapter.quranLevel??''))fail(source,`${chapter.id}: Quranstufe fehlt.`);
    const chapterExam=chapter.exam;
    if(!chapterExam||!text(chapterExam.id)||chapterExam.questionCount<20||chapterExam.questionCount>30||chapterExam.passScore<50||chapterExam.passScore>100||chapterExam.minimumSkillScore<0||chapterExam.minimumSkillScore>chapterExam.passScore||chapterExam.estimatedMinutes<=0||!Array.isArray(chapterExam.skills)||chapterExam.skills.length<2||new Set(chapterExam.skills).size!==chapterExam.skills.length||chapterExam.questionCount<chapterExam.skills.length*2)fail(source,`${chapter.id}: Kapitelprüfung ungültig.`);
    for(const unit of chapter.units){
      if(unit.track!==track||!text(unit.id)||!text(unit.title)||!text(unit.objective))fail(source,`${chapter.id}: Modul unvollständig.`);
      const intro=unit.intro;
      if(!intro||!text(intro.title)||!text(intro.summary)||!Number.isInteger(intro.estimatedMinutes)||intro.estimatedMinutes<1||intro.estimatedMinutes>5||!Array.isArray(intro.outcomes)||intro.outcomes.length<1||intro.outcomes.length>4||intro.outcomes.some((value)=>!text(value))||new Set(intro.outcomes).size!==intro.outcomes.length||!intro.example||!text(intro.example.text)||(intro.example.arabic!==undefined&&!text(intro.example.arabic)))fail(source,`${unit.id}: Einleitung ungültig.`);
      if(moduleIds.has(unit.id))fail(source,`Modul-ID ${unit.id} ist doppelt.`);moduleIds.add(unit.id);
      ids(unit.lessonIds,`${unit.id}: lessonIds`,source);ids(unit.prerequisiteIds,`${unit.id}: prerequisiteIds`,source);
      const policy=unit.practicePolicy;
      if(!policy||policy.repeatAttempts<2||policy.repeatScore<50||policy.excellentScore<policy.repeatScore||policy.excellentScore>100||policy.minimumSkillScore<0||policy.minimumSkillScore>100)fail(source,`${unit.id}: adaptive Übungsregel ungültig.`);
      if(!text(unit.learningId)||phaseIds.has(unit.learningId))fail(source,`${unit.id}: Lerncontainer-ID fehlt oder ist doppelt.`);phaseIds.add(unit.learningId);
      if(!Array.isArray(unit.learningSteps)||unit.learningSteps.length<2||unit.learningSteps.length>5)fail(source,`${unit.id}: 2 bis 5 Lernschritte erforderlich.`);
      unit.learningSteps.forEach((step,index)=>{
        if(activityIds.has(step.id))fail(source,`Lernschritt-ID ${step.id} ist doppelt.`);activityIds.add(step.id);
        if(step.order!==index+1||!['content','knowledge'].includes(step.kind)||!step.required||!text(step.title)||!text(step.description)||!text(step.objective)||step.estimatedMinutes<=0)fail(source,`${step.id}: Lernschritt ungültig.`);
        const key=step.contentModule as string|undefined;const cids=ids(step.contentIds,`${step.id}: contentIds`,source);
        if(step.kind==='content'){
          const contentSet=key?datasetIds[key]:undefined;if(!contentSet||!cids.length)fail(source,`${step.id}: Inhaltsquelle fehlt.`);cids.forEach((id)=>{if(!contentSet.has(id))fail(source,`${step.id}: Inhalt ${id} unbekannt.`);});
        } else {
          if(cids.length||key)fail(source,`${step.id}: Wissensschritt darf keine externe Inhaltsquelle besitzen.`);
          if(!Array.isArray(step.knowledge)||!step.knowledge.length||step.knowledge.some((block)=>!text(block.title)||!text(block.text)))fail(source,`${step.id}: Wissensblöcke fehlen.`);
        }
        if(!Array.isArray(step.skillIds)||!step.skillIds.length||step.skillIds.some((value)=>!text(value))||new Set(step.skillIds).size!==step.skillIds.length)fail(source,`${step.id}: Skills ungültig.`);
      });
      if(unit.phases.length!==3||unit.phases.some((p,i)=>p.type!==PHASES[i]||p.order!==i+1))fail(source,`${unit.id}: Phasen müssen Üben, Vertiefen und Modulcheck sein.`);
      unit.phases.forEach((phase)=>{
        if(phaseIds.has(phase.id))fail(source,`Phasen-ID ${phase.id} ist doppelt.`);phaseIds.add(phase.id);
        if(phase.required!==(phase.type!=='deepen')||!phase.activities.length)fail(source,`${phase.id}: Pflichtstatus oder Aktivitäten ungültig.`);
        phase.activities.forEach((activity)=>{
          if(activityIds.has(activity.id))fail(source,`Aktivitäts-ID ${activity.id} ist doppelt.`);activityIds.add(activity.id);
          if(!text(activity.title)||!text(activity.description)||!text(activity.objective)||activity.estimatedMinutes<=0)fail(source,`${activity.id}: Aktivität unvollständig.`);
          const cids=ids(activity.contentIds,`${activity.id}: contentIds`,source);
          if(activity.kind==='exercise'){
            const variant=activity.exerciseVariant??'default';
            if(!activity.exerciseType||!TYPES.has(activity.exerciseType)||!VARIANTS.has(variant))fail(source,`${activity.id}: Übungsart ungültig.`);
            if(!cids.length)fail(source,`${activity.id}: Übungsinhalte fehlen.`);
            const exerciseKey = `${activity.exerciseType}:${variant}`;
            const domains=EXERCISE_DOMAINS[exerciseKey];if(!domains)fail(source,`${activity.id}: Kombination ${activity.exerciseType}/${variant} ist nicht registriert.`);
            const allowed=allowedContentByExercise.get(exerciseKey);if(!allowed)fail(source,`${activity.id}: Kombination ${activity.exerciseType}/${variant} ist nicht registriert.`);cids.forEach((id)=>{if(!allowed.has(id))fail(source,`${activity.id}: Inhalt ${id} passt nicht zu ${activity.exerciseType}/${variant}.`);});
          }
          if(phase.type==='practice'&&activity.kind!=='exercise')fail(source,`${activity.id}: Üben muss interaktiv sein.`);
          if(phase.type==='deepen'&&activity.kind!=='exercise')fail(source,`${activity.id}: Vertiefen muss eine Transferübung sein.`);
          if(phase.type==='exam'&&activity.kind!=='exam')fail(source,`${activity.id}: Abschlussphase darf nur den Modulcheck enthalten.`);
        });
      });
      const exam=unit.exam;const examActivity=unit.phases[2]?.activities[0];
      if(!exam||!examActivity||examActivity.kind!=='exam'||exam.activityId!==examActivity.id||exam.questionCount<8||exam.questionCount>12||exam.passScore<50||exam.passScore>100||exam.minimumSkillScore<0||exam.minimumSkillScore>exam.passScore||exam.skills.length<2||new Set(exam.skills).size!==exam.skills.length||exam.questionCount<exam.skills.length*2)fail(source,`${unit.id}: Modulcheck ungültig.`);
      const quality=unit.quality;if(!quality||quality.score<85||!quality.sourceRefs?.length||!quality.reviewRequirements?.length)fail(source,`${unit.id}: Qualitäts-/Review-Gate fehlt.`);
      const sourceIds=new Set(quality.sourceRefs.map((entry)=>entry.id));
      for(const traceable of [...unit.learningSteps,...unit.phases.flatMap((phase)=>phase.activities)]) if(!traceable.sourceRefIds?.length||traceable.sourceRefIds.some((id)=>!sourceIds.has(id)))fail(source,`${traceable.id}: Quellen-Traceability fehlt.`);
    }
  }
}
function validate(content: LearningContent, source: string, includeSourceLayer = true, includeIslamicLayer = true, includeSemanticLayer = true): LearningContent {
  const m = content.manifest;
  if (m.catalogSchemaVersion < 8 || m.releaseOrder < 1210 || m.language !== 'ar-MSA' || m.arabicVariety !== 'fusha' || !m.stableIds) fail(source, 'Katalogschema 8 aus Release 0.12.1 erforderlich.');
  if ([...LEVELS].some((level) => !m.supportedLevels.includes(level as never))) fail(source, 'A0–C2-Abdeckung fehlt.');

  const sets: [keyof LearningContent, number][] = [
    ['alphabet', m.counts.alphabet], ['vocabulary', m.counts.vocabulary], ['grammar', m.counts.grammar],
    ['writing', m.counts.writing], ['reading', m.counts.reading], ['quran', m.counts.quran],
    ['learningPath', m.counts.learningPath], ['quranPath', m.counts.quranPath],
    ['skills', m.counts.skills], ['learningItems', m.counts.learningItems], ['exerciseTemplates', m.counts.exerciseTemplates]
  ];
  if (includeIslamicLayer) sets.push(['islamicPaths', m.counts.islamicPaths]);
  if (includeSemanticLayer && typeof m.counts.quranVocabularyLinks === 'number') sets.push(['quranVocabularyLinks', m.counts.quranVocabularyLinks]);
  if (includeSourceLayer) sets.push(
    ['sources', m.counts.sources], ['citations', m.counts.citations], ['claims', m.counts.claims], ['claimSourceLinks', m.counts.claimSourceLinks]
  );
  for (const [key, count] of sets) {
    const arr = content[key];
    if (!Array.isArray(arr) || arr.length !== count) fail(source, `${String(key)} enthält ${Array.isArray(arr) ? arr.length : 0} statt ${count} Einträgen.`);
  }

  const qids = new Set(content.quran.map((entry) => entry.id));
  for (const entry of content.quran) {
    if (entry.arabicVariety !== 'quranic' || !['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'].includes(entry.quranLevel)) fail(source, `${entry.id}: Quran-Metadaten ungültig.`);
    entry.prerequisites.forEach((id) => { if (!qids.has(id)) fail(source, `${entry.id}: Voraussetzung ${id} unbekannt.`); });
  }

  const moduleIds = new Set<string>();
  const phaseIds = new Set<string>();
  const activityIds = new Set<string>();
  validatePath(content, content.learningPath, 'fusha', source, moduleIds, phaseIds, activityIds);
  validatePath(content, content.quranPath, 'quran', source, moduleIds, phaseIds, activityIds);

  const skillIds = new Set(content.skills.map((entry) => entry.id));
  const templateById = new Map(content.exerciseTemplates.map((entry) => [entry.id, entry]));
  const knowledgeQuestionIds = new Set(
    [...content.learningPath, ...content.quranPath, ...content.islamicPaths]
      .flatMap((chapter) => chapter.units)
      .flatMap((unit) => unit.knowledgeQuestions ?? [])
      .map((question) => question.id)
  );
  const studyTracks = new Set<CourseTrack>(ISLAMIC_STUDY_TRACKS);

  for (const chapter of content.islamicPaths) {
    if (!studyTracks.has(chapter.track) || !['S0', 'S1', 'S2', 'S3'].includes(chapter.studyLevel ?? '') || !chapter.units.length) fail(source, `${chapter.id}: islamischer Studienpfad ungültig.`);
    for (const unit of chapter.units) {
      if (unit.track !== chapter.track || moduleIds.has(unit.id) || unit.learningSteps.length < 2 || unit.phases.length !== 3 || unit.phases.some((phase, index) => phase.type !== PHASES[index]) || !unit.knowledgeQuestions?.length) fail(source, `${unit.id}: Studienmodul ungültig.`);
      moduleIds.add(unit.id);
      for (const step of unit.learningSteps) if (step.kind !== 'knowledge' || !step.knowledge.length) fail(source, `${step.id}: Wissensinhalt fehlt.`);
      for (const phase of unit.phases.slice(0, 2)) {
        for (const activity of phase.activities) {
          const variant = activity.exerciseVariant ?? 'default';
          if (activity.kind !== 'exercise' || activity.exerciseType !== 'knowledge' || !['knowledge_quiz','hadith_analysis','fiqh_compare'].includes(variant) || !activity.contentIds.length || activity.contentIds.some((id) => !knowledgeQuestionIds.has(id))) fail(source, `${activity.id}: Wissensübung ungültig.`);
          const template = activity.exerciseTemplateId ? templateById.get(activity.exerciseTemplateId) : undefined;
          if (!template || template.runtimeStatus !== 'implemented' || template.engineType !== activity.exerciseType || template.engineVariant !== variant) fail(source, `${activity.id}: Knowledge-Template passt nicht.`);
        }
      }
      const examActivity = unit.phases[2]?.activities[0];
      if (!examActivity || examActivity.kind !== 'exam' || unit.exam.activityId !== examActivity.id) fail(source, `${unit.id}: Modulcheck ungültig.`);
      if (!unit.quality || unit.quality.score < 85 || !unit.quality.sourceRefs.length || !unit.quality.reviewRequirements.length) fail(source, `${unit.id}: Qualitäts-/Review-Gate fehlt.`);
      const sourceIds=new Set(unit.quality.sourceRefs.map((entry)=>entry.id));
      for(const traceable of [...unit.learningSteps,...unit.phases.flatMap((phase)=>phase.activities),...(unit.knowledgeQuestions??[])]) if(!traceable.sourceRefIds?.length||traceable.sourceRefIds.some((id)=>!sourceIds.has(id))) fail(source, `${traceable.id}: Quellen-Traceability fehlt.`);
    }
  }

  for (const stage of [...content.learningPath, ...content.quranPath, ...content.islamicPaths]) {
    for (const unit of stage.units) for (const id of unit.prerequisiteIds) if (!moduleIds.has(id)) fail(source, `${unit.id}: Voraussetzung ${id} unbekannt.`);
  }

  if (includeSourceLayer) {
    const sourceIds = new Set(content.sources.map((entry) => entry.id));
    const citationById = new Map(content.citations.map((entry) => [entry.id, entry]));
    const claimIds = new Set(content.claims.map((entry) => entry.id));
    const validSourceReviews = new Set(['missing','referenced','verified','approved']);
    const validSourceRelations = new Set(['direct_support','interpretation','context','contrasting_view','further_reading']);
    for (const sourceEntry of content.sources) if (!sourceIds.has(sourceEntry.id) || !text(sourceEntry.title) || !text(sourceEntry.language) || !validSourceReviews.has(sourceEntry.reviewStatus)) fail(source, `Source ${sourceEntry.id}: Metadaten ungültig.`);
    for (const citation of content.citations) if (!sourceIds.has(citation.sourceId) || !text(citation.locatorText) || !validSourceReviews.has(citation.reviewStatus)) fail(source, `Citation ${citation.id}: Metadaten ungültig.`);
    const linksByClaim = new Map<string, ClaimSourceLinkRecord[]>();
    for (const link of content.claimSourceLinks) {
      const citation = citationById.get(link.citationId);
      if (!claimIds.has(link.claimId) || !citation || !validSourceRelations.has(link.relation) || !validSourceReviews.has(link.reviewStatus)) fail(source, `ClaimSourceLink ${link.id}: ungültig.`);
      if (link.relation === 'direct_support' && !citation.exactLocatorVerified) fail(source, `${link.id}: Direktbeleg ohne verifizierte Fundstelle.`);
      linksByClaim.set(link.claimId, [...(linksByClaim.get(link.claimId) ?? []), link]);
    }
    for (const claim of content.claims) if (!text(claim.text) || !validSourceReviews.has(claim.reviewStatus) || (claim.critical && !(linksByClaim.get(claim.id)?.length))) fail(source, `Claim ${claim.id}: Quellenbezug fehlt.`);
  }

  const domainIds = {
    alphabet: new Set(content.alphabet.map((entry) => entry.id)), vocabulary: new Set(content.vocabulary.map((entry) => entry.id)),
    grammar: new Set(content.grammar.map((entry) => entry.id)), writing: new Set(content.writing.map((entry) => entry.id)),
    reading: new Set(content.reading.map((entry) => entry.id)), quran: new Set(content.quran.map((entry) => entry.id))
  };
  if (content.skills.some((skill) => !skillIds.has(skill.id) || !skill.levels.length || skill.levels.some((level) => !LEVELS.has(level)))) fail(source, 'Skill-Katalog ungültig.');
  for (const template of content.exerciseTemplates) if (!template.competencyIds.length || template.competencyIds.some((id) => !skillIds.has(id)) || !TYPES.has(template.engineType) || !VARIANTS.has(template.engineVariant)) fail(source, `ExerciseTemplate ${template.id} ungültig.`);

  const itemIds = new Set(content.learningItems.map((entry) => entry.id));
  const covered = new Set<string>();
  for (const item of content.learningItems) {
    const domain = item.contentModule as keyof typeof domainIds;
    if (!domainIds[domain]?.has(item.contentId)) fail(source, `LearningItem ${item.id}: Inhalt unbekannt.`);
    const key = `${domain}:${item.contentId}`;
    if (covered.has(key)) fail(source, `LearningItem ${item.id}: Inhalt doppelt abgebildet.`);
    covered.add(key);
    if (!item.competencyIds.length || item.competencyIds.some((id) => !skillIds.has(id)) || !item.exerciseTemplateIds.length || item.exerciseTemplateIds.some((id) => !templateById.has(id)) || item.prerequisiteItemIds.some((id) => !itemIds.has(id))) fail(source, `LearningItem ${item.id}: Semantik ungültig.`);
  }
  const expectedCoverage = Object.values(domainIds).reduce((sum, set) => sum + set.size, 0);
  if (covered.size !== expectedCoverage) fail(source, 'LearningItem-Abdeckung unvollständig.');

  for (const stage of [...content.learningPath, ...content.quranPath, ...content.islamicPaths]) {
    for (const unit of stage.units) {
      for (const step of unit.learningSteps) if (!step.competencyIds?.length || step.competencyIds.some((id) => !skillIds.has(id))) fail(source, `${step.id}: stabile Kompetenz-IDs fehlen.`);
      for (const phase of unit.phases) for (const activity of phase.activities) {
        if (activity.competencyIds?.some((id) => !skillIds.has(id))) fail(source, `${activity.id}: unbekannte Kompetenz-ID.`);
        if (activity.kind === 'exercise') {
          const template = activity.exerciseTemplateId ? templateById.get(activity.exerciseTemplateId) : undefined;
          if (!template || template.runtimeStatus === 'planned' || template.engineType !== activity.exerciseType || template.engineVariant !== (activity.exerciseVariant ?? 'default')) fail(source, `${activity.id}: ExerciseTemplate passt nicht zur Runtime.`);
        }
      }
    }
  }
  return content;
}
function baseUrl(explicit?:string):string{if(explicit)return explicit;if(typeof window!=='undefined')return new URL('/',window.location.href).toString();return 'http://localhost/';}
function wait(ms:number):Promise<void>{return new Promise(resolve=>globalThis.setTimeout(resolve,ms));}
async function fetchJson<T>(file:string,label:string,options:Required<Pick<ContentLoadOptions,'timeoutMs'|'retries'|'retryDelayMs'>>&ContentLoadOptions,check:(v:unknown)=>v is T):Promise<T>{
  const f=options.fetchImpl??fetch,url=new URL(`content/${file}`,baseUrl(options.baseUrl)).toString();let last:Error=new Error(`${label} konnten nicht geladen werden.`);
  for(let attempt=0;attempt<=options.retries;attempt++){const controller=new AbortController();let timed=false;const timeout=globalThis.setTimeout(()=>{timed=true;controller.abort();},options.timeoutMs);try{const response=await f(url,{signal:controller.signal,cache:'no-cache',headers:{Accept:'application/json'}});if(!response.ok)throw new ContentLoadError(`${label}: HTTP ${response.status}`,response.status>=500||[408,429].includes(response.status));let parsed:unknown;try{parsed=await response.json();}catch(error){throw new ContentLoadError(`${label}: Datenformat ungültig.`,false,error);}if(!check(parsed))throw new ContentLoadError(`${label}: Datenformat ungültig.`,false);return parsed;}catch(error){last=timed?new ContentLoadError(`${label}: Zeitüberschreitung.`,true,error):error instanceof ContentLoadError?error:new ContentLoadError(`${label}: ${error instanceof Error?error.message:'nicht erreichbar'}`,true,error);if(!(last instanceof ContentLoadError)||!last.retryable||attempt>=options.retries)throw last;await wait(options.retryDelayMs*(attempt+1));}finally{globalThis.clearTimeout(timeout);}}
  throw last;
}
type DatasetKey = 'alphabet' | 'vocabulary' | 'grammar' | 'writing' | 'reading' | 'quran' | 'learningPath' | 'quranPath' | 'islamicPaths' | 'skills' | 'learningItems' | 'exerciseTemplates' | 'quranVocabularyLinks' | 'sources' | 'citations' | 'claims' | 'claimSourceLinks';
const EMPTY_QURAN_READER: QuranReaderRuntime = {
  schemaVersion: 1, generatedAt: null, editorialOpen: true, datasets: [], ayahs: [], translations: [], tafsir: [], words: [], tajweed: [], mushafLines: [], audio: []
};

type SourceLayer = Pick<LearningContent, 'sources' | 'citations' | 'claims' | 'claimSourceLinks'>;
interface SourceEvidenceShard {
  schemaVersion: 1;
  sourceId: string;
  citations: CitationRecord[];
  claims: ClaimRecord[];
  claimSourceLinks: ClaimSourceLinkRecord[];
}

const CORE_DATASETS: DatasetKey[] = ['alphabet','vocabulary','grammar','writing','reading','quran','learningPath','quranPath','skills','learningItems','exerciseTemplates'];
// Keep the boot path limited to semantics that are actually consumed at runtime.
const SEMANTIC_DATASETS: DatasetKey[] = ['quranVocabularyLinks'];
const SOURCE_DATASETS: DatasetKey[] = ['sources'];
const JSON_FILE: Record<DatasetKey, string> = {
  alphabet: 'alphabet', vocabulary: 'vocabulary-index', grammar: 'grammar', writing: 'writing', reading: 'reading', quran: 'quran',
  learningPath: 'learning-path', quranPath: 'quran-path', islamicPaths: 'islamic-paths', skills: 'skills', learningItems: 'learning-items', exerciseTemplates: 'exercise-templates',
  quranVocabularyLinks: 'quran-vocabulary-links',
  sources: 'sources', citations: 'citations', claims: 'claims', claimSourceLinks: 'claim-source-links'
};
const DATASET_LABEL: Record<DatasetKey, string> = {
  alphabet:'Alphabet', vocabulary:'Vokabeln', grammar:'Grammatik', writing:'Schreiben', reading:'Lesen', quran:'Quran',
  learningPath:'Fusha-Pfad', quranPath:'Quran-Pfad', islamicPaths:'Islamische Studienpfade', skills:'Skills', learningItems:'Learning Items', exerciseTemplates:'Exercise Templates',
  quranVocabularyLinks:'Fusha-Quran-Transfer',
  sources:'Quellen', citations:'Fundstellen', claims:'Claims', claimSourceLinks:'Claim-Quellen-Verknüpfungen'
};

function emptySourceLayer(): SourceLayer {
  return { sources: [], citations: [], claims: [], claimSourceLinks: [] };
}

async function jsonDatasets(options: ContentLoadOptions, datasets: DatasetKey[]): Promise<Map<DatasetKey, unknown[]>> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  const values = await Promise.all(datasets.map(async (dataset) => [
    dataset,
    await fetchJson<unknown[]>(`${JSON_FILE[dataset]}.json`, DATASET_LABEL[dataset], resolved, Array.isArray)
  ] as const));
  return new Map(values);
}


async function optionalSemanticDatasets(options: ContentLoadOptions, datasets: DatasetKey[]): Promise<Map<DatasetKey, unknown[]>> {
  const output = new Map<DatasetKey, unknown[]>();
  await Promise.all(datasets.map(async (dataset) => {
    try {
      const loaded = await jsonDatasets(options, [dataset]);
      output.set(dataset, loaded.get(dataset) ?? []);
    } catch (error) {
      console.warn(`[Arabisch Lernen] Optionaler Semantik-Layer ${DATASET_LABEL[dataset]} nicht verfügbar; Kerninhalte bleiben nutzbar.`, error);
    }
  }));
  return output;
}

function buildContent(manifest: ContentManifest, data: Map<DatasetKey, unknown[]>, idAliases: Record<string, string>, includeSources: boolean, includeIslamic: boolean, vocabularyDetailsHydrated = false, quranReader: QuranReaderRuntime = EMPTY_QURAN_READER): LearningContent {
  const sourceLayer = includeSources ? {
    sources: (data.get('sources') ?? []) as SourceRecord[],
    citations: (data.get('citations') ?? []) as CitationRecord[],
    claims: (data.get('claims') ?? []) as ClaimRecord[],
    claimSourceLinks: (data.get('claimSourceLinks') ?? []) as ClaimSourceLinkRecord[]
  } : emptySourceLayer();
  return validate({
    manifest: { ...manifest, runtimeSource: 'json' },
    idAliases,
    vocabularyDetailsHydrated,
    alphabet: (data.get('alphabet') ?? []) as AlphabetEntry[],
    vocabulary: (data.get('vocabulary') ?? []) as VocabularyEntry[],
    grammar: (data.get('grammar') ?? []) as GrammarLesson[],
    writing: (data.get('writing') ?? []) as WritingLesson[],
    reading: (data.get('reading') ?? []) as ReadingLesson[],
    quran: (data.get('quran') ?? []) as QuranLesson[],
    quranReader,
    quranVocabularyLinks: (data.get('quranVocabularyLinks') ?? []) as QuranVocabularyLink[],
    learningPath: (data.get('learningPath') ?? []) as LearningPathStage[],
    quranPath: (data.get('quranPath') ?? []) as LearningPathStage[],
    islamicPaths: includeIslamic ? (data.get('islamicPaths') ?? []) as LearningPathStage[] : [],
    skills: (data.get('skills') ?? []) as SkillDefinition[],
    learningItems: (data.get('learningItems') ?? []) as LearningItemDefinition[],
    exerciseTemplates: (data.get('exerciseTemplates') ?? []) as ExerciseTemplateDefinition[],
    ...sourceLayer
  }, 'JSON-Katalog', includeSources, includeIslamic, data.has('quranVocabularyLinks'));
}


type VocabularyDetailRecord = Pick<VocabularyEntry, 'id'> & Partial<Pick<VocabularyEntry, 'examples' | 'collocations' | 'wordFamily' | 'translationNote' | 'usageNote' | 'hint'>>;

async function vocabularyDetailsFromJson(options: ContentLoadOptions): Promise<VocabularyDetailRecord[]> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  const shards = await Promise.all(LEVEL_ORDER.map((level) =>
    fetchJson<VocabularyDetailRecord[]>(`vocabulary-details/${level}.json`, `Vokabeldetails ${level}`, resolved, Array.isArray)
  ));
  return shards.flat();
}

function mergeVocabularyDetails(entries: VocabularyEntry[], details: VocabularyDetailRecord[]): VocabularyEntry[] {
  const byId = new Map(details.map((entry) => [entry.id, entry]));
  return entries.map((entry) => {
    const detail = byId.get(entry.id);
    if (!detail) return entry;
    return {
      ...entry,
      examples: detail.examples ?? [],
      collocations: detail.collocations ?? [],
      wordFamily: detail.wordFamily ?? [],
      translationNote: detail.translationNote,
      usageNote: detail.usageNote,
      hint: detail.hint
    };
  });
}

async function loadIdAliases(options: ContentLoadOptions): Promise<Record<string, string>> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  try {
    const payload = await fetchJson<{ aliases?: unknown }>('id-aliases.json', 'Content-ID-Aliase', resolved, record);
    const aliases = record(payload.aliases) ? payload.aliases : {};
    const output: Record<string, string> = {};
    for (const [from, to] of Object.entries(aliases)) {
      if (!text(from) || !text(to)) fail('JSON-Katalog', 'Content-ID-Alias ist ungültig.');
      output[from] = to;
    }
    return output;
  } catch (error) {
    console.warn('[Arabisch Lernen] Keine Content-ID-Aliase geladen; stabile IDs bleiben unverändert.', error);
    return {};
  }
}

interface QuranReaderSurahShard {
  schemaVersion: 1;
  generatedAt: string | null;
  surah: number;
  ayahs: QuranReaderRuntime['ayahs'];
  translations: QuranReaderRuntime['translations'];
  tafsir: QuranReaderRuntime['tafsir'];
  words: QuranReaderRuntime['words'];
  tajweed: QuranReaderRuntime['tajweed'];
  mushafLines: QuranReaderRuntime['mushafLines'];
  audio: QuranReaderRuntime['audio'];
}


async function quranReaderCoreFromJson(options: ContentLoadOptions): Promise<QuranReaderRuntime> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  try {
    return await fetchJson<QuranReaderRuntime>('quran-reader-core.json', 'Quran-Reader Core', resolved, (value): value is QuranReaderRuntime => record(value) && value.schemaVersion === 1);
  } catch (error) {
    console.warn('[Arabisch Lernen] Quran-Reader-Core nicht verfügbar; Lernpfad bleibt nutzbar.', error);
    return structuredClone(EMPTY_QURAN_READER);
  }
}

async function quranReaderSurahShardFromJson(surah: number, options: ContentLoadOptions): Promise<QuranReaderSurahShard> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  const file = `quran-reader/surah/${String(surah).padStart(3, '0')}.json`;
  try {
    return await fetchJson<QuranReaderSurahShard>(file, `Quran-Reader Sure ${surah}`, resolved, (value): value is QuranReaderSurahShard => record(value)
      && value.schemaVersion === 1
      && value.surah === surah
      && Array.isArray(value.ayahs)
      && Array.isArray(value.translations)
      && Array.isArray(value.tafsir)
      && Array.isArray(value.words)
      && Array.isArray(value.tajweed)
      && Array.isArray(value.mushafLines)
      && Array.isArray(value.audio));
  } catch (error) {
    console.warn(`[Arabisch Lernen] Quran-Daten für Sure ${surah} nicht verfügbar.`, error);
    return { schemaVersion: 1, generatedAt: null, surah, ayahs: [], translations: [], tafsir: [], words: [], tajweed: [], mushafLines: [], audio: [] };
  }
}

async function fromJson(options: ContentLoadOptions, includeSources = true, includeIslamic = true, includeVocabularyDetails = true): Promise<LearningContent> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  const manifest = await fetchJson<ContentManifest>('manifest.json', 'Manifest', resolved, (value): value is ContentManifest => record(value));
  const advertised = new Set(manifest.datasets ?? []);
  const semanticDatasets = SEMANTIC_DATASETS.filter((dataset) => advertised.has(`${JSON_FILE[dataset]}.json`));
  const [data, semanticData, idAliases, islamicPaths, vocabularyDetails, sourceLayer] = await Promise.all([
    jsonDatasets(options, CORE_DATASETS),
    optionalSemanticDatasets(options, semanticDatasets),
    loadIdAliases(options),
    includeIslamic ? islamicLayerFromJson(options) : Promise.resolve([]),
    includeVocabularyDetails ? vocabularyDetailsFromJson(options) : Promise.resolve([]),
    includeSources ? sourceLayerFromJson(options) : Promise.resolve(emptySourceLayer())
  ]);
  for (const [dataset, value] of semanticData) data.set(dataset, value);
  if (includeIslamic) data.set('islamicPaths', islamicPaths);
  if (includeSources) {
    data.set('sources', sourceLayer.sources);
    data.set('citations', sourceLayer.citations);
    data.set('claims', sourceLayer.claims);
    data.set('claimSourceLinks', sourceLayer.claimSourceLinks);
  }
  if (includeVocabularyDetails) data.set('vocabulary', mergeVocabularyDetails((data.get('vocabulary') ?? []) as VocabularyEntry[], vocabularyDetails));
  return buildContent(manifest, data, idAliases, includeSources, includeIslamic, includeVocabularyDetails, structuredClone(EMPTY_QURAN_READER));
}

async function sourceEvidenceShardFromJson(sourceId: string, options: ContentLoadOptions): Promise<SourceEvidenceShard> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  return fetchJson<SourceEvidenceShard>(
    `source-evidence/${sourceId}.json`,
    `Quellennachweise ${sourceId}`,
    resolved,
    (value): value is SourceEvidenceShard => record(value)
      && value.schemaVersion === 1
      && value.sourceId === sourceId
      && Array.isArray(value.citations)
      && Array.isArray(value.claims)
      && Array.isArray(value.claimSourceLinks)
  );
}

async function sourceLayerFromJson(options: ContentLoadOptions): Promise<SourceLayer> {
  const sources = await sourceCatalogFromJson(options);
  const shards = await Promise.all(sources.map((source) => cachedSourceEvidenceShard(source.id, options)));
  const citations = [...new Map(shards.flatMap((shard) => shard.citations).map((entry) => [entry.id, entry])).values()];
  const claims = [...new Map(shards.flatMap((shard) => shard.claims).map((entry) => [entry.id, entry])).values()];
  const claimSourceLinks = [...new Map(shards.flatMap((shard) => shard.claimSourceLinks).map((entry) => [entry.id, entry])).values()];
  return { sources, citations, claims, claimSourceLinks };
}

type IslamicTrack = Exclude<CourseTrack, 'fusha' | 'quran'>;


async function islamicLayerFromJson(options: ContentLoadOptions, track?: IslamicTrack): Promise<LearningPathStage[]> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  if (track) return fetchJson<LearningPathStage[]>(`islamic-paths/${track}.json`, `Islamischer Studienpfad ${track}`, resolved, Array.isArray);
  const shards = await Promise.all(ISLAMIC_STUDY_TRACKS.map((entry) =>
    fetchJson<LearningPathStage[]>(`islamic-paths/${entry}.json`, `Islamischer Studienpfad ${entry}`, resolved, Array.isArray)
  ));
  return shards.flat();
}

const fullLoadCache = new Map<ContentRuntimeSource, Promise<LearningContent>>();
const coreLoadCache = new Map<ContentRuntimeSource, Promise<LearningContent>>();
let sourceLayerCache: Promise<SourceLayer> | null = null;
let sourceCatalogCache: Promise<SourceRecord[]> | null = null;
const sourceEvidenceCache = new Map<string, Promise<SourceEvidenceShard>>();
const sourceEvidenceHydrated = new WeakMap<LearningContent, Set<string>>();
let islamicSearchCatalogCache: Promise<IslamicModuleSearchRecord[]> | null = null;
let vocabularyDetailCache: Promise<VocabularyDetailRecord[]> | null = null;
const islamicLayerCache = new Map<string, Promise<LearningPathStage[]>>();

function cacheable(options: ContentLoadOptions): boolean {
  return !options.fetchImpl && !options.baseUrl && options.timeoutMs === undefined && options.retries === undefined && options.retryDelayMs === undefined;
}

async function loadByMode(options: ContentLoadOptions, includeSources: boolean, includeIslamic: boolean, includeVocabularyDetails: boolean): Promise<LearningContent> {
  return fromJson(options, includeSources, includeIslamic, includeVocabularyDetails);
}

export async function loadLearningContent(options: ContentLoadOptions = {}): Promise<LearningContent> {
  const requested = options.source ?? 'auto';
  if (!cacheable(options)) return loadByMode(options, true, true, true);
  const existing = fullLoadCache.get(requested);
  if (existing) return existing;
  const pending = loadByMode({ ...options, timeoutMs: 8000 }, true, true, true).catch((error) => { fullLoadCache.delete(requested); throw error; });
  fullLoadCache.set(requested, pending);
  return pending;
}

export async function loadLearningContentCore(options: ContentLoadOptions = {}): Promise<LearningContent> {
  const requested = options.source ?? 'auto';
  if (!cacheable(options)) return loadByMode(options, false, false, false);
  const existing = coreLoadCache.get(requested);
  if (existing) return existing;
  const pending = loadByMode({ ...options, timeoutMs: 8000 }, false, false, false).catch((error) => { coreLoadCache.delete(requested); throw error; });
  coreLoadCache.set(requested, pending);
  return pending;
}



let quranReaderCoreLoadCache: Promise<QuranReaderRuntime> | null = null;
const quranReaderSurahCache = new Map<number, Promise<QuranReaderSurahShard>>();
const quranReaderHydratedSurahs = new WeakMap<LearningContent, number[]>();
const QURAN_LEXICAL_CACHE_LIMIT = 6;

function cachedQuranReaderCore(options: ContentLoadOptions): Promise<QuranReaderRuntime> {
  if (!cacheable(options)) return quranReaderCoreFromJson(options);
  if (!quranReaderCoreLoadCache) {
    const pending = quranReaderCoreFromJson(options);
    quranReaderCoreLoadCache = pending.catch((error) => { if (quranReaderCoreLoadCache === pending) quranReaderCoreLoadCache = null; throw error; });
  }
  return quranReaderCoreLoadCache;
}

function cachedQuranSurahShard(surah: number, options: ContentLoadOptions): Promise<QuranReaderSurahShard> {
  if (!cacheable(options)) return quranReaderSurahShardFromJson(surah, options);
  const existing = quranReaderSurahCache.get(surah);
  if (existing) {
    quranReaderSurahCache.delete(surah);
    quranReaderSurahCache.set(surah, existing);
    return existing;
  }
  const pending = quranReaderSurahShardFromJson(surah, options);
  quranReaderSurahCache.set(surah, pending);
  pending.catch(() => { if (quranReaderSurahCache.get(surah) === pending) quranReaderSurahCache.delete(surah); });
  while (quranReaderSurahCache.size > QURAN_LEXICAL_CACHE_LIMIT) {
    const oldest = quranReaderSurahCache.keys().next().value as number | undefined;
    if (oldest === undefined) break;
    quranReaderSurahCache.delete(oldest);
  }
  return pending;
}

function lexicalSurahFromReference(reference: string): number | null {
  const value = Number(reference.split(':', 1)[0]);
  return Number.isInteger(value) && value >= 1 && value <= 114 ? value : null;
}

export async function hydrateLearningContentQuranReader(content: LearningContent, options: ContentLoadOptions = {}, lexicalSurahs: readonly number[] = []): Promise<boolean> {
  // Preserve caller priority and cap before fetching: the runtime only retains six lexical surahs.
  const normalizedSurahs = [...new Set(lexicalSurahs.filter((surah) => Number.isInteger(surah) && surah >= 1 && surah <= 114))]
    .slice(0, QURAN_LEXICAL_CACHE_LIMIT);
  const currentRuntime = content.quranReader;
  const reconstructed = currentRuntime
    ? [...new Set(currentRuntime.ayahs.map((ayah) => ayah.surah).filter((value) => Number.isInteger(value) && value >= 1 && value <= 114))]
    : [];
  const loaded = quranReaderHydratedSurahs.get(content) ?? reconstructed;
  const missing = normalizedSurahs.filter((surah) => !loaded.includes(surah));
  const needsCore = !currentRuntime?.datasets.length;
  if (!needsCore && !missing.length) {
    const nextOrder = [...loaded.filter((surah) => !normalizedSurahs.includes(surah)), ...normalizedSurahs].slice(-QURAN_LEXICAL_CACHE_LIMIT);
    quranReaderHydratedSurahs.set(content, nextOrder);
    return false;
  }

  const [core, shards] = await Promise.all([
    needsCore ? cachedQuranReaderCore(options) : Promise.resolve(currentRuntime!),
    Promise.all(missing.map((surah) => cachedQuranSurahShard(surah, options)))
  ]);
  const nextOrder = [...loaded.filter((surah) => !missing.includes(surah) && !normalizedSurahs.includes(surah)), ...missing, ...normalizedSurahs]
    .filter((surah, index, values) => values.indexOf(surah) === index)
    .slice(-QURAN_LEXICAL_CACHE_LIMIT);
  const keep = new Set(nextOrder);
  const keepByReference = <T extends { reference: string }>(items: readonly T[]): T[] => items.filter((item) => {
    const surah = lexicalSurahFromReference(item.reference);
    return surah !== null && keep.has(surah) && !missing.includes(surah);
  });
  const existingAyahs = (currentRuntime?.ayahs ?? []).filter((item) => keep.has(item.surah) && !missing.includes(item.surah));
  const existingMushafLines = (currentRuntime?.mushafLines ?? []).filter((item) => {
    const reference = item.reference ?? item.startReference;
    const surah = item.surahNumber ?? (reference ? lexicalSurahFromReference(reference) : null);
    return surah !== null && surah !== undefined && keep.has(surah) && !missing.includes(surah);
  });
  content.quranReader = {
    ...core,
    ayahs: [...existingAyahs, ...shards.flatMap((shard) => shard.ayahs)].filter((item) => keep.has(item.surah)),
    translations: [...keepByReference(currentRuntime?.translations ?? []), ...shards.flatMap((shard) => shard.translations)],
    tafsir: [...keepByReference(currentRuntime?.tafsir ?? []), ...shards.flatMap((shard) => shard.tafsir)],
    words: [...keepByReference(currentRuntime?.words ?? []), ...shards.flatMap((shard) => shard.words)],
    tajweed: [...keepByReference(currentRuntime?.tajweed ?? []), ...shards.flatMap((shard) => shard.tajweed)],
    mushafLines: [...existingMushafLines, ...shards.flatMap((shard) => shard.mushafLines)],
    audio: [...keepByReference(currentRuntime?.audio ?? []), ...shards.flatMap((shard) => shard.audio)]
  };
  quranReaderHydratedSurahs.set(content, nextOrder);
  return true;
}
export function hasSemanticLayer(content: LearningContent): boolean {
  const expected = content.manifest.counts.quranVocabularyLinks;
  return typeof expected !== 'number' || (content.quranVocabularyLinks?.length ?? 0) === expected;
}

export function hasVocabularyDetails(content: LearningContent): boolean {
  return content.vocabularyDetailsHydrated === true;
}

export async function hydrateLearningContentVocabularyDetails(content: LearningContent, options: ContentLoadOptions = {}): Promise<LearningContent> {
  if (hasVocabularyDetails(content)) return content;
  let pending: Promise<VocabularyDetailRecord[]>;
  if (cacheable(options)) {
    pending = vocabularyDetailCache ?? vocabularyDetailsFromJson(options);
    vocabularyDetailCache = pending;
    pending.catch(() => { if (vocabularyDetailCache === pending) vocabularyDetailCache = null; });
  } else {
    pending = vocabularyDetailsFromJson(options);
  }
  const details = await pending;
  return validate({ ...content, vocabulary: mergeVocabularyDetails(content.vocabulary, details), vocabularyDetailsHydrated: true }, 'JSON-Katalog', hasSourceLayer(content), hasIslamicLayer(content), hasSemanticLayer(content));
}

export function hasIslamicLayer(content: LearningContent): boolean {
  return content.islamicPaths.length === content.manifest.counts.islamicPaths;
}

export function hasIslamicTrack(content: LearningContent, track: IslamicTrack): boolean {
  return content.islamicPaths.some((chapter) => chapter.track === track);
}

export async function hydrateLearningContentIslamic(content: LearningContent, options: ContentLoadOptions = {}, track?: IslamicTrack): Promise<LearningContent> {
  if ((!track && hasIslamicLayer(content)) || (track && hasIslamicTrack(content, track))) return content;
  let pending: Promise<LearningPathStage[]>;
  const cacheKey = track ?? 'all';
  if (cacheable(options)) {
    pending = islamicLayerCache.get(cacheKey) ?? islamicLayerFromJson(options, track);
    islamicLayerCache.set(cacheKey, pending);
    pending.catch(() => { if (islamicLayerCache.get(cacheKey) === pending) islamicLayerCache.delete(cacheKey); });
  } else {
    pending = islamicLayerFromJson(options, track);
  }
  const loaded = await pending;
  const merged = track
    ? [...content.islamicPaths.filter((chapter) => chapter.track !== track), ...loaded].sort((a, b) => a.track.localeCompare(b.track) || a.order - b.order)
    : loaded;
  const complete = merged.length === content.manifest.counts.islamicPaths;
  return validate({ ...content, islamicPaths: merged }, 'JSON-Katalog', hasSourceLayer(content), complete, hasSemanticLayer(content));
}


async function islamicSearchCatalogFromJson(options: ContentLoadOptions): Promise<IslamicModuleSearchRecord[]> {
  const resolved = { ...options, timeoutMs: options.timeoutMs ?? 8000, retries: options.retries ?? 1, retryDelayMs: options.retryDelayMs ?? 250 };
  return fetchJson<IslamicModuleSearchRecord[]>('islamic-search-index.json', 'Islamische Modulsuche', resolved, (value): value is IslamicModuleSearchRecord[] =>
    Array.isArray(value) && value.every((entry) => record(entry) && text(entry.id) && text(entry.title) && text(entry.track))
  );
}

export async function loadIslamicModuleSearchCatalog(options: ContentLoadOptions = {}): Promise<IslamicModuleSearchRecord[]> {
  if (!cacheable(options)) return islamicSearchCatalogFromJson(options);
  const pending = islamicSearchCatalogCache ?? islamicSearchCatalogFromJson(options);
  islamicSearchCatalogCache = pending;
  pending.catch(() => { if (islamicSearchCatalogCache === pending) islamicSearchCatalogCache = null; });
  return pending;
}

async function sourceCatalogFromJson(options: ContentLoadOptions): Promise<SourceRecord[]> {
  const data = await jsonDatasets(options, ['sources']);
  return (data.get('sources') ?? []) as SourceRecord[];
}

function cachedSourceEvidenceShard(sourceId: string, options: ContentLoadOptions): Promise<SourceEvidenceShard> {
  if (!cacheable(options)) return sourceEvidenceShardFromJson(sourceId, options);
  const existing = sourceEvidenceCache.get(sourceId);
  if (existing) return existing;
  const pending = sourceEvidenceShardFromJson(sourceId, options);
  sourceEvidenceCache.set(sourceId, pending);
  pending.catch(() => { if (sourceEvidenceCache.get(sourceId) === pending) sourceEvidenceCache.delete(sourceId); });
  return pending;
}

export async function hydrateLearningContentSourceCatalog(content: LearningContent, options: ContentLoadOptions = {}): Promise<LearningContent> {
  if (content.sources.length) return content;
  let pending: Promise<SourceRecord[]>;
  if (cacheable(options)) {
    pending = sourceCatalogCache ?? sourceCatalogFromJson(options);
    sourceCatalogCache = pending;
    pending.catch(() => { if (sourceCatalogCache === pending) sourceCatalogCache = null; });
  } else {
    pending = sourceCatalogFromJson(options);
  }
  const sources = await pending;
  if (sources.length !== content.manifest.counts.sources || sources.some((entry) => !text(entry.id) || !text(entry.title) || !text(entry.language))) {
    fail('JSON-Katalog', 'Quellenkatalog ist unvollständig oder ungültig.');
  }
  return { ...content, sources };
}

export function hasSourceLayer(content: LearningContent): boolean {
  return content.sources.length === content.manifest.counts.sources
    && content.citations.length === content.manifest.counts.citations
    && content.claims.length === content.manifest.counts.claims
    && content.claimSourceLinks.length === content.manifest.counts.claimSourceLinks;
}

export function hasSourceEvidence(content: LearningContent, sourceId: string): boolean {
  if (hasSourceLayer(content)) return true;
  return sourceEvidenceHydrated.get(content)?.has(sourceId) === true;
}

function mergeById<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  return [...new Map([...current, ...incoming].map((entry) => [entry.id, entry])).values()];
}

export async function hydrateLearningContentSourceEvidence(content: LearningContent, sourceId: string, options: ContentLoadOptions = {}): Promise<LearningContent> {
  if (!text(sourceId) || hasSourceEvidence(content, sourceId)) return content;
  const source = content.sources.find((entry) => entry.id === sourceId);
  if (!source) fail('JSON-Katalog', `Quelle ${sourceId} ist unbekannt.`);
  const shard = await cachedSourceEvidenceShard(sourceId, options);
  if (shard.sourceId !== sourceId || shard.citations.some((entry) => entry.sourceId !== sourceId)) {
    fail('JSON-Katalog', `Quellennachweise ${sourceId} sind inkonsistent.`);
  }
  const citationIds = new Set(shard.citations.map((entry) => entry.id));
  const claimIds = new Set(shard.claims.map((entry) => entry.id));
  if (shard.claimSourceLinks.some((entry) => !citationIds.has(entry.citationId) || !claimIds.has(entry.claimId))) {
    fail('JSON-Katalog', `Quellennachweise ${sourceId} enthalten ungültige Verknüpfungen.`);
  }
  const next: LearningContent = {
    ...content,
    citations: mergeById(content.citations, shard.citations),
    claims: mergeById(content.claims, shard.claims),
    claimSourceLinks: mergeById(content.claimSourceLinks, shard.claimSourceLinks)
  };
  const loaded = new Set(sourceEvidenceHydrated.get(content) ?? []);
  loaded.add(sourceId);
  sourceEvidenceHydrated.set(next, loaded);
  return next;
}

export async function hydrateLearningContentSources(content: LearningContent, options: ContentLoadOptions = {}, sourceId?: string): Promise<LearningContent> {
  if (sourceId) return hydrateLearningContentSourceEvidence(content, sourceId, options);
  if (hasSourceLayer(content)) return content;
  let pending: Promise<SourceLayer>;
  if (cacheable(options)) {
    pending = sourceLayerCache ?? sourceLayerFromJson(options);
    sourceLayerCache = pending;
    pending.catch(() => { sourceLayerCache = null; });
  } else {
    pending = sourceLayerFromJson(options);
  }
  const sourceLayer = await pending;
  const next = validate({ ...content, ...sourceLayer }, 'JSON-Katalog', true, hasIslamicLayer(content), hasSemanticLayer(content));
  sourceEvidenceHydrated.set(next, new Set(sourceLayer.sources.map((entry) => entry.id)));
  return next;
}
