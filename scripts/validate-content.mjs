import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const QURAN_LEVELS = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'];
const ISLAMIC_TRACKS = ['fiqh_hanafi','fiqh_maliki','fiqh_shafii','fiqh_hanbali','usul_fiqh','hadith','usul_hadith'];
const STATUS = ['draft', 'prototype-reviewed', 'published'];
const DATASETS = ['alphabet', 'vocabulary', 'grammar', 'writing', 'reading', 'quran', 'learningPath', 'quranPath', 'islamicPaths', 'skills', 'learningItems', 'exerciseTemplates', 'sources', 'citations', 'claims', 'claimSourceLinks'];
const MODULE_PHASES = ['practice', 'deepen', 'exam'];
const ACTIVITY_KINDS = new Set(['content', 'exercise', 'knowledge', 'exam']);
const EXERCISE_TYPES = new Set(['alphabet', 'vocabulary', 'grammar', 'sentence', 'reading', 'writing', 'quran', 'knowledge', 'speaking']);
const EXERCISE_VARIANTS = new Set([
  'default',
  'alphabet_recognition', 'alphabet_positions', 'alphabet_weight', 'alphabet_sound',
  'vocabulary_matching', 'vocabulary_recall', 'vocabulary_listening', 'vocabulary_dictation', 'vocabulary_context', 'speaking_shadowing', 'morphology_root', 'register_shift', 'grammar_rules', 'grammar_cloze', 'grammar_error_correction', 'grammar_listening', 'sentence_builder',
  'reading_meaning', 'reading_listening', 'reading_vocalized', 'reading_harakat',
  'writing_input', 'writing_dictation', 'writing_trace', 'writing_copy',
  'quran_signs', 'quran_tajweed', 'quran_pauses', 'quran_language',
  'knowledge_quiz', 'hadith_analysis', 'fiqh_compare', 'smart_mix'
]);
const ARABIC = /[\u0600-\u06ff\ufb50-\ufdff\ufe70-\ufeff]/u;

const EXERCISE_CONTENT_DOMAINS = {
  'alphabet:alphabet_recognition': ['alphabet'],
  'alphabet:alphabet_positions': ['alphabet'],
  'alphabet:alphabet_weight': ['alphabet'],
  'alphabet:alphabet_sound': ['alphabet'],
  'vocabulary:vocabulary_matching': ['vocabulary'],
  'vocabulary:vocabulary_recall': ['vocabulary'],
  'vocabulary:vocabulary_listening': ['vocabulary'],
  'vocabulary:vocabulary_dictation': ['vocabulary'],
  'vocabulary:vocabulary_context': ['vocabulary'],
  'vocabulary:morphology_root': ['vocabulary'],
  'vocabulary:register_shift': ['vocabulary'],
  'speaking:speaking_shadowing': ['vocabulary', 'grammar', 'reading', 'writing'],
  'sentence:sentence_builder': ['grammar'],
  'grammar:grammar_rules': ['grammar'],
  'grammar:grammar_cloze': ['grammar'],
  'grammar:grammar_error_correction': ['grammar'],
  'grammar:grammar_listening': ['grammar'],
  'reading:reading_meaning': ['reading'],
  'reading:reading_listening': ['reading'],
  'reading:reading_vocalized': ['reading'],
  'reading:reading_harakat': ['reading'],
  'writing:writing_input': ['writing', 'vocabulary'],
  'writing:writing_dictation': ['writing'],
  'writing:writing_trace': ['writing', 'alphabet'],
  'writing:writing_copy': ['writing'],
  'quran:quran_signs': ['quran'],
  'quran:quran_tajweed': ['quran'],
  'quran:quran_pauses': ['quran'],
  'quran:quran_language': ['quran'],
  'quran:reading_vocalized': ['quran'],
  'knowledge:knowledge_quiz': ['courseModule'],
  'knowledge:hadith_analysis': ['courseModule'],
  'knowledge:fiqh_compare': ['courseModule']
};

async function load(name) {
  return JSON.parse(await readFile(resolve(root, 'public', 'content', name), 'utf8'));
}

async function loadVocabulary() {
  const index = await load('vocabulary-index.json');
  const shards = await Promise.all(LEVELS.map((level) => load(`vocabulary-details/${level}.json`)));
  const details = new Map(shards.flat().map((entry) => [entry.id, entry]));
  return index.map((entry) => ({ ...entry, ...(details.get(entry.id) ?? {}), examples: details.get(entry.id)?.examples ?? [], collocations: details.get(entry.id)?.collocations ?? [], wordFamily: details.get(entry.id)?.wordFamily ?? [] }));
}

async function loadIslamic() {
  return (await Promise.all(ISLAMIC_TRACKS.map((track) => load(`islamic-paths/${track}.json`)))).flat();
}

async function loadSourceEvidence(sources) {
  const shards = await Promise.all(sources.map((source) => load(`source-evidence/${source.id}.json`)));
  const citations = [...new Map(shards.flatMap((shard) => shard.citations ?? []).map((entry) => [entry.id, entry])).values()];
  const claims = [...new Map(shards.flatMap((shard) => shard.claims ?? []).map((entry) => [entry.id, entry])).values()];
  const claimSourceLinks = [...new Map(shards.flatMap((shard) => shard.claimSourceLinks ?? []).map((entry) => [entry.id, entry])).values()];
  return { citations, claims, claimSourceLinks };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const REVIEW_STAGES = ['draft','editorial_checked','language_review','source_review','madhhab_review','didactic_review','approved','published'];
function validateModuleQuality(unit, manifest, label) {
  const quality = unit.quality;
  assert(quality && Number.isInteger(quality.score) && quality.score >= 85 && quality.score <= 100, `${label}: Qualitäts-Score >=85 fehlt`);
  assert(REVIEW_STAGES.includes(quality.reviewStage), `${label}: Review-Status ungültig`);
  assert(Array.isArray(quality.reviewRequirements) && quality.reviewRequirements.length > 0 && quality.reviewRequirements.every((stage) => REVIEW_STAGES.includes(stage)), `${label}: Review-Anforderungen fehlen`);
  assert(Array.isArray(quality.sourceRefs) && quality.sourceRefs.length > 0, `${label}: Quellenreferenzen fehlen`);
  quality.sourceRefs.forEach((source) => {
    assert(source?.id && source?.sourceId && source?.label && ['editorial','book','collection','quran','curriculum'].includes(source.kind), `${label}: Quellenreferenz unvollständig`);
    assert(['direct_support','interpretation','context','contrasting_view','further_reading'].includes(source.relation), `${label}: Quellenrelation ungültig`);
    assert(['missing','referenced','verified','approved'].includes(source.reviewStatus), `${label}: Quellenreview ungültig`);
    assert(typeof source.exactLocatorVerified === 'boolean', `${label}: Fundstellenstatus fehlt`);
    assert(typeof source.reviewRequired === 'boolean', `${label}: Quellen-Reviewflag fehlt`);
    if (source.relation === 'direct_support') assert(source.exactLocatorVerified === true, `${label}: Direktbeleg ohne geprüfte Fundstelle`);
  });
  const sourceIds = new Set(quality.sourceRefs.map((source) => source.id));
  const traceables = [
    ...(unit.learningSteps ?? []),
    ...(unit.phases ?? []).flatMap((phase) => phase.activities ?? []),
    ...(unit.knowledgeQuestions ?? [])
  ];
  traceables.forEach((entry) => assert(Array.isArray(entry.sourceRefIds) && entry.sourceRefIds.length > 0 && entry.sourceRefIds.every((id) => sourceIds.has(id)), `${label}: Quellen-Traceability fehlt bei ${entry.id ?? 'Eintrag'}`));
  const coverage = quality.coverage ?? {};
  for (const key of ['objectives','teaching','examples','practice','deepen','exam','sources']) assert(coverage[key] === true, `${label}: Coverage ${key} fehlt`);
  if (manifest.status === 'published') assert(quality.reviewStage === 'published', `${label}: veröffentlichter Katalog enthält ungeprüftes Modul`);
}

function validateUniqueIds(items, label, globalIds) {
  const ids = new Set();
  for (const item of items) {
    assert(typeof item.id === 'string' && item.id.trim(), `${label}: Eintrag ohne ID`);
    assert(!ids.has(item.id), `${label}: doppelte ID ${item.id}`);
    ids.add(item.id);
    if (globalIds) {
      assert(!globalIds.has(item.id), `${label}: global doppelte ID ${item.id}`);
      globalIds.add(item.id);
    }
  }
  return ids;
}

function validateMetadata(items, label, manifest, options = {}) {
  for (const item of items) {
    assert(item.contentVersion === manifest.contentVersion, `${label} ${item.id}: Inhaltsversion fehlt oder weicht ab`);
    assert(STATUS.includes(item.status), `${label} ${item.id}: Status ungültig`);
    assert(typeof item.source === 'string' && item.source.trim(), `${label} ${item.id}: Quelle fehlt`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(item.lastUpdated), `${label} ${item.id}: Änderungsdatum ungültig`);
    assert(Array.isArray(item.learningObjectives) && item.learningObjectives.length > 0, `${label} ${item.id}: Lernziel fehlt`);
    assert(Array.isArray(item.reviewTags), `${label} ${item.id}: Wiederholungs-Tags fehlen`);
    assert(LEVELS.includes(item.cefrLevel), `${label} ${item.id}: CEFR-Niveau fehlt oder ist ungültig`);
    if (options.quran) {
      if (item.quranLevel !== undefined) assert(QURAN_LEVELS.includes(item.quranLevel), `${label} ${item.id}: Quran-Niveau ungültig`);
      assert(['quranic', 'fusha'].includes(item.arabicVariety), `${label} ${item.id}: Sprachvariante ungültig`);
    } else {
      assert(item.arabicVariety === 'fusha', `${label} ${item.id}: Inhalt ist nicht als Fusha gekennzeichnet`);
    }
  }
}

function validateAcyclic(graph, label) {
  const visiting = new Set();
  const visited = new Set();
  function visit(node, path) {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      throw new Error(`${label}: kreisförmige Voraussetzung ${[...path.slice(Math.max(0, start)), node].join(' -> ')}`);
    }
    visiting.add(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency, [...path, node]);
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) visit(node, []);
}

function validateLevelCoverage(items, label, requiredLevels = LEVELS) {
  const counts = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  for (const item of items) counts[item.cefrLevel] = (counts[item.cefrLevel] ?? 0) + 1;
  for (const level of requiredLevels) assert(counts[level] > 0, `${label}: keine Inhalte für ${level}`);
  return counts;
}

const [manifest, alphabet, vocabulary, grammar, writing, reading, quran, learningPath, quranPath, islamicPaths, skills, learningItems, exerciseTemplates, sources] = await Promise.all([
  load('manifest.json'), load('alphabet.json'), loadVocabulary(), load('grammar.json'),
  load('writing.json'), load('reading.json'), load('quran.json'), load('learning-path.json'), load('quran-path.json'), loadIslamic(),
  load('skills.json'), load('learning-items.json'), load('exercise-templates.json'), load('sources.json')
]);
const { citations, claims, claimSourceLinks } = await loadSourceEvidence(sources);

assert(manifest.contentVersion === '0.12.1', 'Manifest: Version 0.12.1 erwartet');
assert(manifest.catalogSchemaVersion === 8, 'Manifest: Katalogschema 8 erwartet');
assert(manifest.releaseOrder === 1210, 'Manifest: releaseOrder 1210 erwartet');
assert(manifest.language === 'ar-MSA' && manifest.arabicVariety === 'fusha', 'Manifest: Fusha/ar-MSA erwartet');
assert(manifest.stableIds === true, 'Manifest: stabile IDs müssen aktiviert sein');
assert(JSON.stringify(manifest.supportedLevels) === JSON.stringify(LEVELS), 'Manifest: A0–C2 müssen vollständig unterstützt werden');
assert(typeof manifest.editorialNotice === 'string' && /Quran|Tajw/i.test(manifest.editorialNotice), 'Manifest: Quran-/Tajwīd-Prüfhinweis fehlt');
assert(typeof manifest.showEditorialNotice === 'boolean', 'Manifest: showEditorialNotice-Flag fehlt');

const content = { alphabet, vocabulary, grammar, writing, reading, quran, learningPath, quranPath, islamicPaths, skills, learningItems, exerciseTemplates, sources, citations, claims, claimSourceLinks };
for (const dataset of DATASETS) {
  assert(Array.isArray(content[dataset]), `${dataset}: Datensatz ist kein Array`);
  assert(manifest.counts[dataset] === content[dataset].length, `Manifest: Anzahl für ${dataset} stimmt nicht`);
  const fileNames = { learningPath: 'learning-path.json', quranPath: 'quran-path.json', learningItems: 'learning-items.json', exerciseTemplates: 'exercise-templates.json' };
  if (dataset === 'vocabulary') {
    assert(manifest.datasets.includes('vocabulary-index.json'), 'Manifest: vocabulary-index.json fehlt');
    for (const level of LEVELS) assert(manifest.datasets.includes(`vocabulary-details/${level}.json`), `Manifest: Vokabeldetail-Shard ${level} fehlt`);
    continue;
  }
  if (dataset === 'islamicPaths') {
    for (const track of ISLAMIC_TRACKS) assert(manifest.datasets.includes(`islamic-paths/${track}.json`), `Manifest: islamischer Shard ${track} fehlt`);
  } else if (dataset === 'citations' || dataset === 'claims' || dataset === 'claimSourceLinks') {
    assert(manifest.datasets.includes('source-evidence/*.json'), 'Manifest: Source-Evidence-Shards fehlen');
  } else {
    const fileName = fileNames[dataset] ?? `${dataset}.json`;
    assert(manifest.datasets.includes(fileName), `Manifest: ${dataset} fehlt`);
  }
}

validateUniqueIds(alphabet, 'Alphabet');
validateUniqueIds(vocabulary, 'Vokabeln');
const grammarIds = validateUniqueIds(grammar, 'Grammatik');
validateUniqueIds(writing, 'Schreiben');
validateUniqueIds(reading, 'Lesen');
const quranIds = validateUniqueIds(quran, 'Quran');
const skillIds = validateUniqueIds(skills, 'Skills');
const learningItemIds = validateUniqueIds(learningItems, 'Learning Items');
const exerciseTemplateIds = validateUniqueIds(exerciseTemplates, 'Exercise Templates');
const sourceIds = validateUniqueIds(sources, 'Quellen');
const citationIds = validateUniqueIds(citations, 'Fundstellen');
const claimIds = validateUniqueIds(claims, 'Aussagen');
validateUniqueIds(claimSourceLinks, 'Aussage-Quellen-Verknüpfungen');
validateMetadata(alphabet, 'Alphabet', manifest);
validateMetadata(vocabulary, 'Vokabeln', manifest);
validateMetadata(grammar, 'Grammatik', manifest);
validateMetadata(writing, 'Schreiben', manifest);
validateMetadata(reading, 'Lesen', manifest);
validateMetadata(quran, 'Quran', manifest, { quran: true });
validateMetadata(learningPath, 'Fusha-Lernpfad', manifest);
validateMetadata(quranPath, 'Quran-Lernpfad', manifest, { quran: true });
validateMetadata(islamicPaths, 'Islamische Lernpfade', manifest);
validateMetadata(skills, 'Skills', manifest);
validateMetadata(learningItems, 'Learning Items', manifest, { quran: true });
validateMetadata(exerciseTemplates, 'Exercise Templates', manifest);

assert(alphabet.length === 28, `Alphabet: 28 Einträge erwartet, gefunden ${alphabet.length}`);
alphabet.forEach((entry) => {
  assert(entry.letter && entry.name && entry.sound && entry.group, `Alphabet ${entry.id}: Pflichtfeld fehlt`);
  assert(ARABIC.test(entry.letter), `Alphabet ${entry.id}: arabischer Buchstabe fehlt`);
  assert(entry.forms?.isolated && entry.forms?.initial && entry.forms?.medial && entry.forms?.final, `Alphabet ${entry.id}: Formen fehlen`);
});

assert(vocabulary.length >= 800, `Vokabeln: mindestens 800 erwartet, gefunden ${vocabulary.length}`);
const vocabularyLevelCounts = validateLevelCoverage(vocabulary, 'Vokabeln');
const vocabularyExampleIds = new Set();
const vocabularyExampleArabic = new Set();
const vocabularyExampleTransliterations = new Set();
const vocabularyExampleSkeletons = new Map();
const stripArabicDiacritics = (value) => String(value).normalize('NFC').replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu, '').replace(/\s+/g, ' ').trim();
const normalizeExampleText = (value) => String(value).normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
vocabulary.forEach((entry) => {
  assert(entry.arabicVocalized && entry.arabicUnvocalized && entry.transliteration && entry.german, `Vokabel ${entry.id}: Pflichtfeld fehlt`);
  assert(entry.lemmaVocalized && entry.lemmaUnvocalized && ['neutral','formal','academic','literary','quranic'].includes(entry.register) && typeof entry.activeUse === 'boolean', `Vokabel ${entry.id}: Lexikonfelder fehlen`);
  assert(Array.isArray(entry.wordFamily) && Array.isArray(entry.collocations), `Vokabel ${entry.id}: Wortfamilie/Kollokationen müssen Arrays sein`);
  assert(ARABIC.test(entry.arabicVocalized) && Array.isArray(entry.examples) && entry.examples.length >= 2, `Vokabel ${entry.id}: mindestens zwei Kontextbeispiele erforderlich`);
  entry.examples.forEach((example, index) => {
    const label = `Vokabel ${entry.id}/Beispiel ${index + 1}`;
    assert(example.id === `${entry.id}_example_${index + 1}`, `${label}: stabile Beispiel-ID fehlt`);
    assert(!vocabularyExampleIds.has(example.id), `${label}: doppelte Beispiel-ID ${example.id}`);
    vocabularyExampleIds.add(example.id);
    assert(example.arabicVocalized && example.arabicUnvocalized && example.transliteration && example.german, `${label}: Arabisch, Transliteration oder Deutsch fehlt`);
    assert(ARABIC.test(example.arabicVocalized) && ARABIC.test(example.arabicUnvocalized), `${label}: arabischer Beispielsatz fehlt`);
    assert(!/نستعمل\s*[«"]?/u.test(example.arabicUnvocalized), `${label}: generisches Alt-Muster ist nicht zulässig`);
    const arabicKey = normalizeExampleText(stripArabicDiacritics(example.arabicUnvocalized));
    const transliterationKey = normalizeExampleText(example.transliteration);
    assert(!vocabularyExampleArabic.has(arabicKey), `${label}: doppelter arabischer Beispielsatz`);
    assert(!vocabularyExampleTransliterations.has(transliterationKey), `${label}: doppelte Beispiel-Transliteration`);
    vocabularyExampleArabic.add(arabicKey);
    vocabularyExampleTransliterations.add(transliterationKey);
    const target = normalizeExampleText(stripArabicDiacritics(entry.arabicUnvocalized));
    if (target && arabicKey.includes(target)) {
      const skeleton = arabicKey.replaceAll(target, '<wort>');
      vocabularyExampleSkeletons.set(skeleton, (vocabularyExampleSkeletons.get(skeleton) ?? 0) + 1);
    }
  });
});
assert(vocabularyExampleIds.size >= vocabulary.length * 2, 'Vokabeln: Beispielabdeckung ist unvollständig');
for (const [skeleton, count] of vocabularyExampleSkeletons) {
  assert(count <= 12, `Vokabeln: zu häufig wiederverwendetes Beispielsatzmuster (${count}x): ${skeleton}`);
}

assert(grammar.length >= 37, `Grammatik: mindestens 37 Lektionen erwartet, gefunden ${grammar.length}`);
const grammarLevelCounts = validateLevelCoverage(grammar, 'Grammatik');
const grammarGraph = new Map();
for (const entry of grammar) {
  assert(Array.isArray(entry.prerequisiteLessonIds), `Grammatik ${entry.id}: Voraussetzungen fehlen`);
  entry.prerequisiteLessonIds.forEach((id) => assert(grammarIds.has(id), `Grammatik ${entry.id}: unbekannte Voraussetzung ${id}`));
  grammarGraph.set(entry.id, entry.prerequisiteLessonIds);
  assert(Array.isArray(entry.quiz) && entry.quiz.length >= 10, `Grammatik ${entry.id}: Fragenpool zu klein`);
  validateUniqueIds(entry.quiz, `Grammatik-Quiz ${entry.id}`);
  entry.quiz.forEach((question) => {
    assert(question.prompt && question.explanation, `Grammatik ${entry.id}/${question.id}: Frage oder Erklärung fehlt`);
    assert(Array.isArray(question.options) && question.options.includes(question.correctAnswer), `Grammatik ${entry.id}/${question.id}: richtige Antwort fehlt`);
  });
}
validateAcyclic(grammarGraph, 'Grammatik');

validateLevelCoverage(writing, 'Schreiben');
writing.forEach((entry) => {
  assert(entry.title && entry.targetVocalized && entry.targetUnvocalized, `Schreiben ${entry.id}: Pflichtfeld fehlt`);
  assert(typeof entry.prompt === 'string' && entry.prompt.trim(), `Schreiben ${entry.id}: expliziter Prompt fehlt`);
  assert(typeof entry.expectedAnswer === 'string' && entry.expectedAnswer.trim(), `Schreiben ${entry.id}: erwartete Antwort fehlt`);
  assert(['letter', 'word', 'sentence', 'free_text'].includes(entry.taskType), `Schreiben ${entry.id}: Aufgabentyp ungültig`);
  assert(entry.expectedAnswer === entry.targetUnvocalized, `Schreiben ${entry.id}: expectedAnswer und Ziel widersprechen sich`);
  assert(Array.isArray(entry.strokeSteps) && entry.strokeSteps.length > 0, `Schreiben ${entry.id}: Strichfolge fehlt`);
});

validateLevelCoverage(reading, 'Lesen');
reading.forEach((entry) => {
  assert(entry.title && entry.strategy && Array.isArray(entry.examples) && entry.examples.length > 0, `Lesen ${entry.id}: Pflichtfeld fehlt`);
  assert(Array.isArray(entry.methodSteps) && entry.methodSteps.length >= 3, `Lesen ${entry.id}: Methodenschritte fehlen`);
});

assert(quran.length >= 23, `Quran: mindestens 23 Lektionen erwartet, gefunden ${quran.length}`);
const quranLevelCounts = Object.fromEntries(QURAN_LEVELS.map((level) => [level, 0]));
const quranGraph = new Map();
for (const entry of quran) {
  quranLevelCounts[entry.quranLevel] += 1;
  assert(entry.title && entry.objective && Array.isArray(entry.rules) && entry.rules.length > 0, `Quran ${entry.id}: Pflichtfeld fehlt`);
  assert(Array.isArray(entry.examples) && entry.examples.length > 0, `Quran ${entry.id}: Beispiel fehlt`);
  assert(Array.isArray(entry.prerequisites), `Quran ${entry.id}: Voraussetzungen fehlen`);
  entry.prerequisites.forEach((id) => assert(quranIds.has(id), `Quran ${entry.id}: unbekannte Voraussetzung ${id}`));
  quranGraph.set(entry.id, entry.prerequisites);
}
QURAN_LEVELS.forEach((level) => assert(quranLevelCounts[level] > 0, `Quran: keine Inhalte für ${level}`));
validateAcyclic(quranGraph, 'Quran-Inhalte');

assert(skills.length >= 20, `Skills: mindestens 20 erwartet, gefunden ${skills.length}`);
assert(exerciseTemplates.length >= 19, `Exercise Templates: mindestens 19 erwartet, gefunden ${exerciseTemplates.length}`);
const skillDomains = new Set(['script','phonology','vocabulary','grammar','morphology','reading','writing','listening','speaking','interaction','discourse','register','quran','fiqh','usul_fiqh','hadith','usul_hadith']);
for (const skill of skills) {
  assert(skillDomains.has(skill.domain), `Skill ${skill.id}: Domäne ungültig`);
  assert(Array.isArray(skill.levels) && skill.levels.length > 0 && skill.levels.every((level) => LEVELS.includes(level)), `Skill ${skill.id}: Levelabdeckung ungültig`);
}
const templateById = new Map(exerciseTemplates.map((template) => [template.id, template]));
for (const template of exerciseTemplates) {
  assert(Array.isArray(template.competencyIds) && template.competencyIds.length > 0 && template.competencyIds.every((id) => skillIds.has(id)), `ExerciseTemplate ${template.id}: Kompetenzen ungültig`);
  assert(EXERCISE_TYPES.has(template.engineType) && EXERCISE_VARIANTS.has(template.engineVariant), `ExerciseTemplate ${template.id}: Runtime-Mapping ungültig`);
  assert(['implemented','content_ready','planned'].includes(template.runtimeStatus), `ExerciseTemplate ${template.id}: Runtime-Status ungültig`);
  assert(LEVELS.includes(template.minLevel) && LEVELS.includes(template.maxLevel) && LEVELS.indexOf(template.minLevel) <= LEVELS.indexOf(template.maxLevel), `ExerciseTemplate ${template.id}: Levelspanne ungültig`);
}
const semanticContentIds = {
  alphabet: new Set(alphabet.map((item) => item.id)), vocabulary: new Set(vocabulary.map((item) => item.id)),
  grammar: new Set(grammar.map((item) => item.id)), writing: new Set(writing.map((item) => item.id)),
  reading: new Set(reading.map((item) => item.id)), quran: new Set(quran.map((item) => item.id))
};
const semanticCoverage = new Set();
for (const item of learningItems) {
  assert(semanticContentIds[item.contentModule]?.has(item.contentId), `LearningItem ${item.id}: Inhaltsreferenz ungültig`);
  const key = `${item.contentModule}:${item.contentId}`;
  assert(!semanticCoverage.has(key), `LearningItem ${item.id}: Inhalt doppelt abgebildet`); semanticCoverage.add(key);
  assert(Array.isArray(item.competencyIds) && item.competencyIds.length > 0 && item.competencyIds.every((id) => skillIds.has(id)), `LearningItem ${item.id}: Kompetenzbezug ungültig`);
  assert(Array.isArray(item.exerciseTemplateIds) && item.exerciseTemplateIds.length > 0 && item.exerciseTemplateIds.every((id) => exerciseTemplateIds.has(id)), `LearningItem ${item.id}: Templatebezug ungültig`);
  assert(Array.isArray(item.prerequisiteItemIds) && item.prerequisiteItemIds.every((id) => learningItemIds.has(id)), `LearningItem ${item.id}: Voraussetzung ungültig`);
}
const semanticExpected = Object.values(semanticContentIds).reduce((sum, set) => sum + set.size, 0);
assert(semanticCoverage.size === semanticExpected, `Learning Items: ${semanticCoverage.size}/${semanticExpected} Inhalte abgedeckt`);

const contentIdsByModule = {
  alphabet: new Set(alphabet.map((item) => item.id)),
  vocabulary: new Set(vocabulary.map((item) => item.id)),
  grammar: grammarIds,
  writing: new Set(writing.map((item) => item.id)),
  reading: new Set(reading.map((item) => item.id)),
  quran: quranIds,
  courseModule: new Set([...learningPath, ...quranPath, ...islamicPaths].flatMap((chapter) => chapter.units).flatMap((unit) => unit.knowledgeQuestions ?? []).map((question) => question.id))
};
const allContentIds = new Set(Object.values(contentIdsByModule).flatMap((ids) => [...ids]));

function validatePaths(paths) {
  const allChapters = [...paths.fusha, ...paths.quran];
  const allUnits = allChapters.flatMap((chapter) => chapter.units);
  const allUnitIds = validateUniqueIds(allUnits, 'Kursmodule');
  const globalPhaseIds = new Set();
  const globalActivityIds = new Set();
  const graph = new Map();

  assert(paths.fusha.length === 17, `Fusha-Lernpfad: 17 Kapitel erwartet, gefunden ${paths.fusha.length}`);
  assert(paths.quran.length >= 7, `Quran-Lernpfad: mindestens 7 Kapitel erwartet, gefunden ${paths.quran.length}`);
  assert(allUnits.filter((unit) => unit.track === 'fusha').length >= 76, 'Fusha-Lernpfad: mindestens 76 Module erwartet');
  assert(allUnits.filter((unit) => unit.track === 'quran').length >= 23, 'Quran-Lernpfad: mindestens 23 Module erwartet');

  for (const chapter of allChapters) {
    assert(chapter.track === 'fusha' || chapter.track === 'quran', `Kapitel ${chapter.id}: Track ungültig`);
    assert(Array.isArray(chapter.units) && chapter.units.length > 0, `Kapitel ${chapter.id}: Module fehlen`);
    if (chapter.track === 'quran') assert(QURAN_LEVELS.includes(chapter.quranLevel), `Kapitel ${chapter.id}: Quran-Niveau ungültig`);
    const exam = chapter.exam;
    assert(exam?.id && exam.title && exam.description, `Kapitel ${chapter.id}: Kapitelprüfung fehlt`);
    assert(Number.isInteger(exam.questionCount) && exam.questionCount >= 20 && exam.questionCount <= 30, `Kapitel ${chapter.id}: Kapitelprüfung muss 20–30 Aufgaben enthalten`);
    assert(Number.isInteger(exam.passScore) && exam.passScore >= 50 && exam.passScore <= 100, `Kapitel ${chapter.id}: Bestehensgrenze ungültig`);
    assert(exam.minimumSkillScore === 60, `Kapitel ${chapter.id}: Kompetenzgrenze muss 60 sein`);
    assert(Number.isInteger(exam.estimatedMinutes) && exam.estimatedMinutes > 0, `Kapitel ${chapter.id}: Prüfungsdauer fehlt`);
    assert(Array.isArray(exam.skills) && exam.skills.length >= 2 && new Set(exam.skills).size === exam.skills.length, `Kapitel ${chapter.id}: Prüfungskompetenzen ungültig`);
    assert(exam.questionCount >= exam.skills.length * 2, `Kapitel ${chapter.id}: zu wenige Fragen für die Kompetenzabdeckung`);
  }

  for (const unit of allUnits) {
    assert(unit.track === 'fusha' || unit.track === 'quran', `Lernpfad ${unit.id}: Track fehlt`);
    assert(unit.title && unit.objective && Number.isInteger(unit.estimatedMinutes) && unit.estimatedMinutes > 0, `Lernpfad ${unit.id}: Pflichtfeld fehlt`);
    validateModuleQuality(unit, manifest, `Lernpfad ${unit.id}`);
    const intro = unit.intro;
    assert(intro && typeof intro === 'object' && intro.title && intro.summary && Number.isInteger(intro.estimatedMinutes) && intro.estimatedMinutes >= 1 && intro.estimatedMinutes <= 5, `Lernpfad ${unit.id}: Einleitung unvollständig`);
    assert(Array.isArray(intro.outcomes) && intro.outcomes.length >= 1 && intro.outcomes.length <= 4 && new Set(intro.outcomes).size === intro.outcomes.length && intro.outcomes.every((value) => typeof value === 'string' && value.trim()), `Lernpfad ${unit.id}: Einleitungsziele ungültig`);
    assert(intro.example && typeof intro.example === 'object' && typeof intro.example.text === 'string' && intro.example.text.trim() && (intro.example.arabic === undefined || (typeof intro.example.arabic === 'string' && intro.example.arabic.trim())), `Lernpfad ${unit.id}: Einleitungsbeispiel ungültig`);
    assert(Array.isArray(unit.prerequisiteIds), `Lernpfad ${unit.id}: Voraussetzungen fehlen`);
    unit.prerequisiteIds.forEach((id) => assert(allUnitIds.has(id), `Lernpfad ${unit.id}: unbekannte Voraussetzung ${id}`));
    graph.set(unit.id, unit.prerequisiteIds);

    const policy = unit.practicePolicy;
    assert(policy?.excellentScore === 85 && policy?.repeatScore === 75 && policy?.repeatAttempts === 2 && policy?.minimumSkillScore === 60,
      `Lernpfad ${unit.id}: adaptive Übungsregel muss 85 / 2×75 / 60 verwenden`);
    assert(typeof policy.critical === 'boolean', `Lernpfad ${unit.id}: critical-Flag fehlt`);

    assert(typeof unit.learningId === 'string' && unit.learningId.trim() && !globalPhaseIds.has(unit.learningId), `Lernpfad ${unit.id}: Lerncontainer-ID fehlt oder ist doppelt`);
    globalPhaseIds.add(unit.learningId);
    assert(Array.isArray(unit.learningSteps) && unit.learningSteps.length >= 2 && unit.learningSteps.length <= 5, `Lernpfad ${unit.id}: 2 bis 5 Lernschritte erforderlich`);
    unit.learningSteps.forEach((step, index) => {
      assert(step.id && !globalActivityIds.has(step.id), `Lernpfad ${unit.id}: doppelte Lernschritt-ID ${step.id}`);
      globalActivityIds.add(step.id);
      assert(step.order === index + 1, `Lernpfad ${unit.id}/${step.id}: Lernschrittreihenfolge ungültig`);
      assert((step.kind === 'content' || step.kind === 'knowledge') && step.required === true, `Lernpfad ${unit.id}/${step.id}: Lernschritt muss verpflichtender Lerninhalt sein`);
      assert(step.title && step.description && step.objective && Number.isInteger(step.estimatedMinutes) && step.estimatedMinutes > 0, `Lernpfad ${unit.id}/${step.id}: Lernschritt unvollständig`);
      assert(Array.isArray(step.contentIds), `Lernpfad ${unit.id}/${step.id}: contentIds fehlen`);
      assert(Array.isArray(step.sections) && step.sections.length > 0, `Lernpfad ${unit.id}/${step.id}: Reader-Abschnitte fehlen`);
      const sectionIds = new Set();
      const sectionContentIds = [];
      const blockIds = new Set();
      for (const section of step.sections) {
        assert(section?.id && section?.title && !sectionIds.has(section.id), `Lernpfad ${unit.id}/${step.id}: Abschnitts-ID fehlt oder ist doppelt`);
        sectionIds.add(section.id);
        assert(Array.isArray(section.contentIds) && Array.isArray(section.blocks), `Lernpfad ${unit.id}/${step.id}/${section.id}: contentIds/blocks fehlen`);
        assert(section.contentIds.length + section.blocks.length > 0, `Lernpfad ${unit.id}/${step.id}/${section.id}: leerer Reader-Abschnitt`);
        sectionContentIds.push(...section.contentIds);
        for (const block of section.blocks) {
          assert(block?.id && block?.type && !blockIds.has(block.id), `Lernpfad ${unit.id}/${step.id}/${section.id}: Block-ID fehlt oder ist doppelt`);
          blockIds.add(block.id);
          assert(['lead','definition','explanation','rule','example','contrast','steps','warning','remember','audio','checkpoint','summary'].includes(block.type), `Lernpfad ${unit.id}/${step.id}/${section.id}: unbekannter Blocktyp ${block.type}`);
          assert((typeof block.text === 'string' && block.text.trim()) || (Array.isArray(block.items) && block.items.length > 0) || (typeof block.arabic === 'string' && block.arabic.trim()), `Lernpfad ${unit.id}/${step.id}/${section.id}/${block.id}: Block ohne Inhalt`);
        }
      }
      assert(new Set(sectionContentIds).size === sectionContentIds.length, `Lernpfad ${unit.id}/${step.id}: Inhalts-ID mehrfach in Reader-Abschnitten`);
      if (step.kind === 'content') {
        const ids = contentIdsByModule[step.contentModule];
        assert(ids && step.contentIds.length > 0, `Lernpfad ${unit.id}/${step.id}: Inhaltsquelle fehlt`);
        step.contentIds.forEach((id) => assert(ids.has(id), `Lernpfad ${unit.id}/${step.id}: unbekannte Inhalts-ID ${id}`));
        assert(sectionContentIds.length === step.contentIds.length && step.contentIds.every((id) => sectionContentIds.includes(id)), `Lernpfad ${unit.id}/${step.id}: Reader-Abschnitte decken externe Inhalte nicht vollständig ab`);
      } else {
        assert(!step.contentModule && step.contentIds.length === 0, `Lernpfad ${unit.id}/${step.id}: Wissensschritt darf keine externe Inhaltsquelle besitzen`);
        assert(Array.isArray(step.knowledge) && step.knowledge.length > 0 && step.knowledge.every((block) => block?.title && block?.text), `Lernpfad ${unit.id}/${step.id}: Wissensblöcke fehlen`);
      }
      assert(Array.isArray(step.skillIds) && step.skillIds.length > 0 && new Set(step.skillIds).size === step.skillIds.length, `Lernpfad ${unit.id}/${step.id}: Skills fehlen`);
      assert(Array.isArray(step.competencyIds) && step.competencyIds.length > 0 && step.competencyIds.every((id) => skillIds.has(id)), `Lernpfad ${unit.id}/${step.id}: stabile Kompetenz-IDs fehlen`);
      const completion = step.completionPolicy;
      assert(Number.isInteger(completion?.minimumScore) && completion.minimumScore >= 50 && completion.minimumScore <= 100, `Lernpfad ${unit.id}/${step.id}: Completion-Mindestscore fehlt`);
      assert(Number.isInteger(completion?.minimumEvidenceCount) && completion.minimumEvidenceCount >= 2 && completion.minimumEvidenceCount <= 10, `Lernpfad ${unit.id}/${step.id}: mindestens zwei Evidenzen erforderlich`);
      assert(Array.isArray(completion?.requiredModes) && completion.requiredModes.length > 0 && completion.requiredModes.every((mode) => ['recognition','recall','application','production','listening','speaking'].includes(mode)), `Lernpfad ${unit.id}/${step.id}: Completion-Evidenzmodi ungueltig`);
    });

    assert(Array.isArray(unit.phases) && JSON.stringify(unit.phases.map((phase) => phase.type)) === JSON.stringify(MODULE_PHASES),
      `Lernpfad ${unit.id}: Phasen müssen Üben, Vertiefen und Modulcheck enthalten`);
    unit.phases.forEach((phase, phaseIndex) => {
      assert(phase.id && !globalPhaseIds.has(phase.id), `Lernpfad ${unit.id}: doppelte Phasen-ID ${phase.id}`);
      globalPhaseIds.add(phase.id);
      assert(phase.order === phaseIndex + 1, `Lernpfad ${unit.id}: Phasenreihenfolge ungültig`);
      assert(phase.required === (phase.type !== 'deepen'), `Lernpfad ${unit.id}: Pflichtstatus der Phase ${phase.id} ungültig`);
      assert(Array.isArray(phase.activities) && phase.activities.length > 0, `Lernpfad ${unit.id}/${phase.id}: Aktivitäten fehlen`);
      for (const activity of phase.activities) {
        assert(activity.id && !globalActivityIds.has(activity.id), `Lernpfad ${unit.id}: doppelte Aktivitäts-ID ${activity.id}`);
        globalActivityIds.add(activity.id);
        assert(ACTIVITY_KINDS.has(activity.kind) && activity.kind !== 'content', `Lernpfad ${unit.id}/${activity.id}: Aktivitätsart ungültig`);
        if (phase.type === 'practice') assert(activity.kind === 'exercise', `Lernpfad ${unit.id}/${activity.id}: Üben muss interaktiv sein`);
        if (phase.type === 'deepen') assert(activity.kind === 'exercise', `Lernpfad ${unit.id}/${activity.id}: Vertiefen muss eine Transferübung sein`);
        if (phase.type === 'exam') assert(activity.kind === 'exam', `Lernpfad ${unit.id}/${activity.id}: Abschlussphase darf nur den Modulcheck enthalten`);
        assert(activity.title && activity.description && activity.objective && Number.isInteger(activity.estimatedMinutes), `Lernpfad ${unit.id}/${activity.id}: Pflichtfeld fehlt`);
        assert(Array.isArray(activity.contentIds) && Array.isArray(activity.knowledge), `Lernpfad ${unit.id}/${activity.id}: contentIds oder knowledge fehlt`);
        if (activity.kind === 'exercise') {
          assert(EXERCISE_TYPES.has(activity.exerciseType), `Lernpfad ${unit.id}/${activity.id}: Übungsart ungültig`);
          const variant = activity.exerciseVariant ?? 'default';
          assert(EXERCISE_VARIANTS.has(variant), `Lernpfad ${unit.id}/${activity.id}: Übungsvariante ungültig`);
          assert(activity.contentIds.length > 0, `Lernpfad ${unit.id}/${activity.id}: Übungsinhalte fehlen`);
          activity.contentIds.forEach((id) => assert(allContentIds.has(id), `Lernpfad ${unit.id}/${activity.id}: unbekannter Übungsinhalt ${id}`));
          const domains = EXERCISE_CONTENT_DOMAINS[`${activity.exerciseType}:${variant}`];
          assert(domains, `Lernpfad ${unit.id}/${activity.id}: Kombination ${activity.exerciseType}/${variant} ist nicht registriert`);
          const allowedIds = new Set(domains.flatMap((domain) => [...contentIdsByModule[domain]]));
          activity.contentIds.forEach((id) => assert(allowedIds.has(id), `Lernpfad ${unit.id}/${activity.id}: ${id} passt nicht zu ${activity.exerciseType}/${variant}`));
          assert(Number.isInteger(activity.minimumScore) && activity.minimumScore >= 50 && activity.minimumScore <= 100, `Lernpfad ${unit.id}/${activity.id}: Mindestleistung ungültig`);
          assert(Array.isArray(activity.competencyIds) && activity.competencyIds.length > 0 && activity.competencyIds.every((id) => skillIds.has(id)), `Lernpfad ${unit.id}/${activity.id}: Kompetenz-IDs fehlen`);
          const template = templateById.get(activity.exerciseTemplateId);
          assert(template && template.runtimeStatus !== 'planned' && template.engineType === activity.exerciseType && template.engineVariant === variant, `Lernpfad ${unit.id}/${activity.id}: ExerciseTemplate passt nicht zur Runtime`);
        }
        if (activity.kind === 'knowledge') assert(activity.knowledge.length > 0, `Lernpfad ${unit.id}/${activity.id}: Vertiefungswissen fehlt`);
        if (activity.kind === 'exam') assert(phase.type === 'exam', `Lernpfad ${unit.id}/${activity.id}: Modulcheck liegt außerhalb der Abschlussphase`);
      }
    });

    const exam = unit.exam;
    assert(exam && typeof exam === 'object', `Lernpfad ${unit.id}: Modulcheck-Konfiguration fehlt`);
    const examActivities = unit.phases[2].activities.filter((activity) => activity.kind === 'exam');
    assert(examActivities.length === 1 && examActivities[0].id === exam.activityId, `Lernpfad ${unit.id}: Modulcheck fehlt oder ist mehrdeutig`);
    assert(Number.isInteger(exam.questionCount) && exam.questionCount >= 8 && exam.questionCount <= 12, `Lernpfad ${unit.id}: Modulcheck muss 8–12 Aufgaben enthalten`);
    assert(Number.isInteger(exam.passScore) && exam.passScore >= 50 && exam.passScore <= 100, `Lernpfad ${unit.id}: Bestehensgrenze ungültig`);
    assert(exam.minimumSkillScore === 60, `Lernpfad ${unit.id}: Kompetenzgrenze muss 60 sein`);
    assert(Array.isArray(exam.skills) && exam.skills.length >= 2 && new Set(exam.skills).size === exam.skills.length, `Lernpfad ${unit.id}: Modulkompetenzen ungültig`);
  }
  validateAcyclic(graph, 'Gesamter Lernpfad');

  const firstQuran = allUnits.find((unit) => unit.id === 'quran_q0_mushaf_bridge');
  const bridge = ['fusha_a0_alphabet', 'fusha_a0_harakat', 'fusha_a0_long_vowels', 'fusha_a0_first_words'];
  assert(firstQuran && bridge.every((id) => firstQuran.prerequisiteIds.includes(id)), 'Quran-Brücke: Voraussetzungen aus den Fusha-Schriftgrundlagen fehlen');
  return { allUnits, globalPhaseIds, globalActivityIds };
}


function validateIslamicPaths(chapters, skillIds) {
  const TRACKS = ['fiqh_hanafi', 'fiqh_maliki', 'fiqh_shafii', 'fiqh_hanbali', 'usul_fiqh', 'hadith', 'usul_hadith'];
  const LEVELS = ['S0', 'S1', 'S2', 'S3'];
  const chaptersByTrack = new Map(TRACKS.map((track) => [track, []]));
  const moduleIds = new Set();
  const graph = new Map();
  let moduleCount = 0;

  assert(chapters.length === 28, `Islamische Lernpfade: 28 Kapitel erwartet, gefunden ${chapters.length}`);
  for (const chapter of chapters) {
    assert(TRACKS.includes(chapter.track), `Islamische Lernpfade ${chapter.id}: unbekannter Track ${chapter.track}`);
    assert(LEVELS.includes(chapter.studyLevel), `Islamische Lernpfade ${chapter.id}: Study-Level S0-S3 fehlt`);
    assert(chapter.status === 'draft', `Islamische Lernpfade ${chapter.id}: vor Fachreview muss Status draft sein`);
    assert((chapter.reviewTags ?? []).includes('scholar-review-required'), `Islamische Lernpfade ${chapter.id}: scholar-review-required fehlt`);
    assert(chapter.exam?.questionCount >= 20 && chapter.exam?.questionCount <= 30, `Islamische Lernpfade ${chapter.id}: Kapitelprüfung ungültig`);
    chaptersByTrack.get(chapter.track).push(chapter);
    assert(Array.isArray(chapter.units) && chapter.units.length === 4, `Islamische Lernpfade ${chapter.id}: genau 4 Module erwartet`);
    for (const unit of chapter.units) {
      moduleCount += 1;
      assert(unit.track === chapter.track, `Islamische Lernpfade ${unit.id}: Track stimmt nicht mit Kapitel überein`);
      validateModuleQuality(unit, manifest, `Islamische Lernpfade ${unit.id}`);
      assert(!moduleIds.has(unit.id), `Islamische Lernpfade: doppelte Modul-ID ${unit.id}`);
      moduleIds.add(unit.id);
      graph.set(unit.id, unit.prerequisiteIds ?? []);
      assert(Array.isArray(unit.learningSteps) && unit.learningSteps.length === 4, `Islamische Lernpfade ${unit.id}: 4 Lernschritte erwartet`);
      assert(unit.learningSteps.every((step) => step.kind === 'knowledge' && step.required === true), `Islamische Lernpfade ${unit.id}: Lernschritte müssen verpflichtendes Wissen sein`);
      let teachingWordCount = 0;
      for (const [stepIndex, step] of unit.learningSteps.entries()) {
        const minimumBlocks = stepIndex === 3 ? 5 : 4;
        assert(Array.isArray(step.knowledge) && step.knowledge.length >= minimumBlocks, `Islamische Lernpfade ${unit.id}/${step.id}: mindestens ${minimumBlocks} fachliche Wissensblöcke erwartet`);
        assert(Array.isArray(step.competencyIds) && step.competencyIds.length >= 2 && step.competencyIds.every((id) => skillIds.has(id)), `Islamische Lernpfade ${unit.id}/${step.id}: Kompetenzen fehlen`);
        const uniqueTitles = new Set(step.knowledge.map((block) => String(block.title ?? '').trim()).filter(Boolean));
        assert(uniqueTitles.size === step.knowledge.length, `Islamische Lernpfade ${unit.id}/${step.id}: doppelte Wissensblöcke`);
        for (const block of step.knowledge) {
          assert(String(block.title ?? '').trim().length >= 3 && String(block.text ?? '').trim().length >= 24, `Islamische Lernpfade ${unit.id}/${step.id}: Wissensblock ist inhaltlich zu kurz`);
          teachingWordCount += String(block.text ?? '').trim().split(/\s+/).filter(Boolean).length;
        }
      }
      assert(teachingWordCount >= 170, `Islamische Lernpfade ${unit.id}: Lehrinhalt zu dünn (${teachingWordCount} Wörter, mindestens 170 erwartet)`);
      assert(Array.isArray(unit.phases) && JSON.stringify(unit.phases.map((phase) => phase.type)) === JSON.stringify(MODULE_PHASES), `Islamische Lernpfade ${unit.id}: Üben, Vertiefen und Modulcheck erwartet`);
      assert(unit.phases[0].activities?.length >= 2 && unit.phases[0].activities.every((activity) => activity.kind === 'exercise' && activity.exerciseType === 'knowledge' && activity.exerciseVariant === 'knowledge_quiz'), `Islamische Lernpfade ${unit.id}: Wissensübungen fehlen`);
      assert(unit.phases[1].activities?.length >= 1 && unit.phases[1].activities.every((activity) => activity.kind === 'exercise' && activity.exerciseType === 'knowledge' && ['knowledge_quiz','hadith_analysis','fiqh_compare'].includes(activity.exerciseVariant)), `Islamische Lernpfade ${unit.id}: Vertiefungsübung fehlt`);
      assert(unit.phases[2].activities?.length === 1 && unit.phases[2].activities[0].kind === 'exam', `Islamische Lernpfade ${unit.id}: eindeutiger Modulcheck fehlt`);
      for (const phase of unit.phases.slice(0, 2)) for (const activity of phase.activities) {
        assert(Array.isArray(activity.contentIds) && activity.contentIds.length > 0 && activity.contentIds.every((id) => contentIdsByModule.courseModule.has(id)), `Islamische Lernpfade ${unit.id}/${activity.id}: Wissensfragen fehlen oder sind unbekannt`);
        const template = templateById.get(activity.exerciseTemplateId);
        assert(template && template.runtimeStatus === 'implemented' && template.engineType === 'knowledge' && template.engineVariant === activity.exerciseVariant, `Islamische Lernpfade ${unit.id}/${activity.id}: Knowledge-Template fehlt`);
      }
      assert(unit.exam?.activityId === unit.phases[2].activities[0].id, `Islamische Lernpfade ${unit.id}: Exam-Aktivität stimmt nicht`);
      assert(unit.exam?.questionCount >= 8 && unit.exam?.questionCount <= 12, `Islamische Lernpfade ${unit.id}: 8-12 Modulfragen erwartet`);
      assert(Array.isArray(unit.knowledgeQuestions) && unit.knowledgeQuestions.length === 12, `Islamische Lernpfade ${unit.id}: genau 12 kuratierte Wissensfragen erwartet`);
      const forbiddenPromptFragments = ['Was ist das Lernziel von', 'Welcher Kernpunkt gehört zu'];
      const forbiddenOptions = ['Eine persönliche Fatwā erzeugen.', 'Quellenhinweise entfernen.', 'Kontext ignorieren.'];
      const kindCounts = new Map();
      for (const q of unit.knowledgeQuestions) {
        assert(q.id && q.prompt && Array.isArray(q.options) && q.options.length >= 3, `Islamische Lernpfade ${unit.id}: Wissensfrage unvollständig`);
        assert(q.options.includes(q.correctAnswer), `Islamische Lernpfade ${unit.id}/${q.id}: richtige Antwort nicht in Optionen`);
        assert(!forbiddenPromptFragments.some((fragment) => q.prompt.includes(fragment)), `Islamische Lernpfade ${unit.id}/${q.id}: generische Platzhalterfrage gefunden`);
        assert(!q.options.some((option) => forbiddenOptions.includes(option)), `Islamische Lernpfade ${unit.id}/${q.id}: generischer Distraktor gefunden`);
        assert(['term','method','case','error','source','boundary'].includes(q.questionKind), `Islamische Lernpfade ${unit.id}/${q.id}: questionKind fehlt`);
        kindCounts.set(q.questionKind, (kindCounts.get(q.questionKind) ?? 0) + 1);
      }
      assert((kindCounts.get('term') ?? 0) >= 3 && (kindCounts.get('method') ?? 0) >= 3 && (kindCounts.get('case') ?? 0) >= 2 && (kindCounts.get('error') ?? 0) >= 2 && (kindCounts.get('source') ?? 0) >= 1 && (kindCounts.get('boundary') ?? 0) >= 1, `Islamische Lernpfade ${unit.id}: Fragenmix unvollständig`);
      const practiceQuestionIds = unit.phases.slice(0, 2).flatMap((phase) => phase.activities ?? []).flatMap((activity) => activity.contentIds ?? []);
      assert(practiceQuestionIds.length === 12 && new Set(practiceQuestionIds).size === 12, `Islamische Lernpfade ${unit.id}: Üben/Vertiefen muss alle 12 Fragen genau einmal abdecken`);
      assert(unit.knowledgeQuestions.every((question) => practiceQuestionIds.includes(question.id)), `Islamische Lernpfade ${unit.id}: nicht jede Wissensfrage ist in Üben/Vertiefen erreichbar`);
    }
  }
  assert(moduleCount === 112, `Islamische Lernpfade: 112 Module erwartet, gefunden ${moduleCount}`);
  for (const track of TRACKS) {
    const chaptersForTrack = chaptersByTrack.get(track);
    assert(chaptersForTrack.length === 4, `Islamische Lernpfade ${track}: 4 Kapitel erwartet`);
    assert(JSON.stringify(chaptersForTrack.map((c) => c.studyLevel).sort()) === JSON.stringify(LEVELS), `Islamische Lernpfade ${track}: S0-S3 unvollständig`);
    assert(chaptersForTrack.reduce((sum, c) => sum + c.units.length, 0) === 16, `Islamische Lernpfade ${track}: 16 Module erwartet`);
  }
  for (const [id, deps] of graph) for (const dep of deps) assert(moduleIds.has(dep), `Islamische Lernpfade ${id}: unbekannte Voraussetzung ${dep}`);
  validateAcyclic(graph, 'Islamische Lernpfade');
  return { moduleCount, tracks: TRACKS.length };
}

function validateSourceLayer() {
  const reviewStates = new Set(['missing','referenced','verified','approved']);
  const relations = new Set(['direct_support','interpretation','context','contrasting_view','further_reading']);
  const sourceById = new Map(sources.map((entry) => [entry.id, entry]));
  const citationById = new Map(citations.map((entry) => [entry.id, entry]));
  const claimById = new Map(claims.map((entry) => [entry.id, entry]));
  const linksByClaim = new Map();
  for (const source of sources) {
    assert(source.title && source.language && reviewStates.has(source.reviewStatus), `Quelle ${source.id}: Metadaten/Review fehlen`);
    assert(['verified','edition_pending','internal'].includes(source.bibliographicStatus), `Quelle ${source.id}: Bibliographiestatus ungültig`);
  }
  for (const citation of citations) {
    assert(sourceById.has(citation.sourceId), `Fundstelle ${citation.id}: unbekannte Quelle ${citation.sourceId}`);
    assert(typeof citation.locatorText === 'string' && citation.locatorText.trim(), `Fundstelle ${citation.id}: Locator fehlt`);
    assert(typeof citation.exactLocatorVerified === 'boolean' && reviewStates.has(citation.reviewStatus), `Fundstelle ${citation.id}: Status fehlt`);
  }
  for (const claim of claims) {
    assert(claim.moduleId && claim.text && reviewStates.has(claim.reviewStatus), `Aussage ${claim.id}: unvollständig`);
    assert(['teaching_summary','definition','method','case','boundary','source_note'].includes(claim.claimKind), `Aussage ${claim.id}: Typ ungültig`);
  }
  for (const link of claimSourceLinks) {
    const claim = claimById.get(link.claimId);
    const citation = citationById.get(link.citationId);
    assert(claim && citation, `Quellenlink ${link.id}: unbekannte Aussage/Fundstelle`);
    assert(relations.has(link.relation) && reviewStates.has(link.reviewStatus), `Quellenlink ${link.id}: Relation/Review ungültig`);
    if (link.relation === 'direct_support') {
      assert(citation.exactLocatorVerified === true, `Quellenlink ${link.id}: Direktbeleg ohne geprüfte Fundstelle`);
      assert(['verified','approved'].includes(link.reviewStatus), `Quellenlink ${link.id}: Direktbeleg nicht geprüft`);
    }
    const bucket = linksByClaim.get(link.claimId) ?? [];
    bucket.push(link); linksByClaim.set(link.claimId, bucket);
  }
  for (const claim of claims) {
    if (claim.critical) assert((linksByClaim.get(claim.id) ?? []).length > 0, `Kritische Aussage ${claim.id}: ohne Quellenverknüpfung`);
    if (manifest.status === 'published' && claim.critical) {
      assert(claim.reviewStatus === 'approved', `Veröffentlichte kritische Aussage ${claim.id}: nicht freigegeben`);
      assert((linksByClaim.get(claim.id) ?? []).some((link) => link.relation === 'direct_support' && link.reviewStatus === 'approved'), `Veröffentlichte kritische Aussage ${claim.id}: kein freigegebener Direktbeleg`);
    }
  }
  const allUnits = [...learningPath, ...quranPath, ...islamicPaths].flatMap((chapter) => chapter.units);
  for (const unit of allUnits) {
    const moduleCitations = new Set(citations.filter((entry) => entry.moduleId === unit.id).map((entry) => entry.id));
    assert(moduleCitations.size > 0, `Quellen ${unit.id}: keine modulbezogene Fundstelle`);
    for (const sourceRef of unit.quality?.sourceRefs ?? []) assert(moduleCitations.has(sourceRef.id), `Quellen ${unit.id}: Qualitätsreferenz ${sourceRef.id} ist keine Citation`);
    for (const step of unit.learningSteps ?? []) {
      for (const block of step.knowledge ?? []) if (block.claimId) assert(claimById.has(block.claimId), `Quellen ${unit.id}/${step.id}: unbekannte Claim-ID ${block.claimId}`);
      for (const section of step.sections ?? []) {
        for (const block of section.blocks ?? []) {
          if (block.claimId) assert(claimById.has(block.claimId), `Quellen ${unit.id}/${step.id}/${section.id}: unbekannte Reader-Claim-ID ${block.claimId}`);
          assert(Array.isArray(block.sourceRefIds) && block.sourceRefIds.every((id) => moduleCitations.has(id)), `Quellen ${unit.id}/${step.id}/${section.id}: Reader-Quellenreferenz ungültig`);
        }
      }
    }
  }
  assert(!claimSourceLinks.some((link) => link.relation === 'direct_support' && !citationById.get(link.citationId)?.exactLocatorVerified), 'Quellen: unsicherer Direktbeleg vorhanden');
  return { exact: citations.filter((entry) => entry.exactLocatorVerified).length, direct: claimSourceLinks.filter((entry) => entry.relation === 'direct_support').length };
}

const sourceInfo = validateSourceLayer();

const pathInfo = validatePaths({ fusha: learningPath, quran: quranPath });
const islamicPathInfo = validateIslamicPaths(islamicPaths, skillIds);

console.log('Inhaltsvalidierung erfolgreich:');
console.log(`  Fusha-Lernpfad: ${learningPath.length} Kapitel / ${pathInfo.allUnits.filter((unit) => unit.track === 'fusha').length} Module`);
console.log(`  Quran-Lernpfad: ${quranPath.length} Kapitel / ${pathInfo.allUnits.filter((unit) => unit.track === 'quran').length} Module`);
console.log(`  Islamische Lernpfade: ${islamicPaths.length} Kapitel / ${islamicPathInfo.moduleCount} Module / ${islamicPathInfo.tracks} Tracks`);
console.log(`  Vokabeln A0-C2: ${JSON.stringify(vocabularyLevelCounts)}`);
console.log(`  Grammatik A0-C2: ${JSON.stringify(grammarLevelCounts)}`);
console.log(`  Quran Q0-Q6: ${JSON.stringify(quranLevelCounts)}`);
console.log(`  Phasen: ${pathInfo.globalPhaseIds.size}, Aktivitäten: ${pathInfo.globalActivityIds.size}`);
console.log(`  Quellenlayer: ${sources.length} Quellen / ${citations.length} Fundstellen (${sourceInfo.exact} exakt geprüft) / ${claims.length} Aussagen / ${claimSourceLinks.length} Links (${sourceInfo.direct} Direktbelege)`);
