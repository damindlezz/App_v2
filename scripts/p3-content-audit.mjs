import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contentDir = path.join(root, 'public', 'content');
const read = (name) => JSON.parse(fs.readFileSync(path.join(contentDir, name), 'utf8'));
const learning = read('learning-path.json');
const quran = read('quran-path.json');
const evidenceDir = path.join(contentDir, 'source-evidence');
const evidence = fs.readdirSync(evidenceDir)
  .filter((name) => name.endsWith('.json'))
  .flatMap((name) => [read(path.join('source-evidence', name))]);
const uniqueById = (items) => [...new Map(items.map((item) => [item.id, item])).values()];
const claims = uniqueById(evidence.flatMap((shard) => shard.claims ?? []));
const citations = uniqueById(evidence.flatMap((shard) => shard.citations ?? []));
const sources = read('sources.json');
const islamicDir = path.join(contentDir, 'islamic-paths');
const islamic = fs.readdirSync(islamicDir).filter((name) => name.endsWith('.json')).flatMap((name) => read(path.join('islamic-paths', name)));

const units = (chapters) => chapters.flatMap((chapter) => chapter.units ?? []);
const allUnits = [...units(learning), ...units(quran), ...units(islamic)];
const fushaUnits = units(learning);
const variants = (unit) => new Set((unit.phases ?? []).flatMap((phase) => phase.activities ?? []).map((activity) => activity.exerciseVariant));
const listeningVariants = new Set(['vocabulary_listening', 'grammar_listening', 'reading_listening', 'writing_dictation', 'alphabet_sound']);
const listening = fushaUnits.filter((unit) => [...variants(unit)].some((variant) => listeningVariants.has(variant))).length;
const speaking = fushaUnits.filter((unit) => variants(unit).has('speaking_shadowing')).length;
const editorialChecked = allUnits.filter((unit) => unit.quality?.reviewStage === 'editorial_checked' && unit.quality?.automatedEditorialReview?.passed === true).length;
const expertRequired = allUnits.filter((unit) => unit.quality?.expertReviewRequired === true).length;
const exactCitations = citations.filter((item) => item.exactLocatorVerified === true).length;
const approvedCriticalClaims = claims.filter((item) => item.critical && item.reviewStatus === 'approved').length;
const criticalClaims = claims.filter((item) => item.critical).length;

const report = {
  modules: allUnits.length,
  editorialChecked,
  expertReviewRequired: expertRequired,
  sources: sources.length,
  citations: citations.length,
  exactCitations,
  criticalClaims,
  approvedCriticalClaims,
  fushaModules: fushaUnits.length,
  fushaListeningCoverage: listening,
  fushaSpeakingCoverage: speaking,
  scholarlyApprovalBoundary: 'Exakte Fundstellen/Fachfreigaben werden nicht automatisch erzeugt.'
};
console.log(JSON.stringify(report, null, 2));

const failures = [];
if (allUnits.length !== 211) failures.push(`Module ${allUnits.length}/211`);
if (editorialChecked !== allUnits.length) failures.push(`Editorial ${editorialChecked}/${allUnits.length}`);
if (expertRequired !== allUnits.length) failures.push(`Expert-Review-Gate ${expertRequired}/${allUnits.length}`);
if (fushaUnits.length !== 76) failures.push(`Fusha ${fushaUnits.length}/76`);
if (listening !== fushaUnits.length) failures.push(`Listening ${listening}/${fushaUnits.length}`);
if (speaking !== fushaUnits.length) failures.push(`Speaking ${speaking}/${fushaUnits.length}`);
if (failures.length) {
  console.error(`P3-Audit fehlgeschlagen: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('P3-Audit: PASS');
