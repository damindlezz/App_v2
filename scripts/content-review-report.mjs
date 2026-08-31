import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'public/content');
const load = async (name) => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const ISLAMIC_TRACKS = ['fiqh_hanafi','fiqh_maliki','fiqh_shafii','fiqh_hanbali','usul_fiqh','hadith','usul_hadith'];
const loadIslamic = async () => (await Promise.all(ISLAMIC_TRACKS.map((track) => load(`islamic-paths/${track}.json`)))).flat();
const [manifest, fusha, quran, islamic, sources] = await Promise.all([
  load('manifest.json'), load('learning-path.json'), load('quran-path.json'), loadIslamic(),
  load('sources.json')
]);
const evidence = await Promise.all(sources.map((source) => load(`source-evidence/${source.id}.json`)));
const citations = [...new Map(evidence.flatMap((shard) => shard.citations ?? []).map((entry) => [entry.id, entry])).values()];
const claims = [...new Map(evidence.flatMap((shard) => shard.claims ?? []).map((entry) => [entry.id, entry])).values()];
const claimSourceLinks = [...new Map(evidence.flatMap((shard) => shard.claimSourceLinks ?? []).map((entry) => [entry.id, entry])).values()];

const modules = [
  ...fusha.flatMap((chapter) => chapter.units.map((unit) => ({ area: 'Fusha', chapter: chapter.title, unit }))),
  ...quran.flatMap((chapter) => chapter.units.map((unit) => ({ area: 'Quran', chapter: chapter.title, unit }))),
  ...islamic.flatMap((chapter) => chapter.units.map((unit) => ({ area: chapter.track, chapter: chapter.title, unit })))
];
const stages = new Map();
const pending = [];
let coverageSum = 0;
for (const entry of modules) {
  const quality = entry.unit.quality ?? {};
  const stage = quality.reviewStage ?? 'missing';
  stages.set(stage, (stages.get(stage) ?? 0) + 1);
  coverageSum += Number(quality.score ?? 0);
  if (stage !== 'published') {
    pending.push({
      id: entry.unit.id,
      area: entry.area,
      chapter: entry.chapter,
      stage,
      requirements: quality.reviewRequirements ?? [],
      sources: quality.sourceRefs?.length ?? 0,
      coverage: quality.score ?? 0
    });
  }
}

const exactCitations = citations.filter((entry) => entry.exactLocatorVerified).length;
const directLinks = claimSourceLinks.filter((entry) => entry.relation === 'direct_support').length;
const criticalClaims = claims.filter((entry) => entry.critical);
const approvedCriticalClaims = criticalClaims.filter((entry) => entry.reviewStatus === 'approved').length;
const citationById = new Map(citations.map((entry) => [entry.id, entry]));
const unsafeDirectLinks = claimSourceLinks.filter((entry) => entry.relation === 'direct_support' && !citationById.get(entry.citationId)?.exactLocatorVerified).length;

const report = {
  appVersion: manifest.contentVersion,
  schemaVersion: manifest.catalogSchemaVersion,
  catalogStatus: manifest.status,
  modules: modules.length,
  structuralCoverageAverage: modules.length ? Math.round(coverageSum / modules.length) : 0,
  reviewStages: Object.fromEntries([...stages.entries()].sort(([a], [b]) => a.localeCompare(b))),
  pendingReviews: pending.length,
  sources: { catalogued: sources.length, citations: citations.length, exactCitations, claims: claims.length, criticalClaims: criticalClaims.length, approvedCriticalClaims, links: claimSourceLinks.length, directLinks, unsafeDirectLinks },
  publishReady: manifest.status === 'published' && pending.length === 0 && unsafeDirectLinks === 0 && criticalClaims.length === approvedCriticalClaims,
  pending
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Content Review Report v${report.appVersion}`);
  console.log(`Module: ${report.modules}`);
  console.log(`Strukturelle Coverage: ${report.structuralCoverageAverage}%`);
  console.log(`Katalogstatus: ${report.catalogStatus}`);
  console.log(`Review-Stufen: ${Object.entries(report.reviewStages).map(([stage, count]) => `${stage}=${count}`).join(', ')}`);
  console.log(`Ausstehende Fachreviews: ${report.pendingReviews}`);
  console.log(`Quellen: ${report.sources.catalogued} Werke · ${report.sources.citations} Fundstellen (${report.sources.exactCitations} exakt geprüft) · ${report.sources.claims} Aussagen · ${report.sources.directLinks} Direktbelege`);
  console.log(`Kritische Aussagen freigegeben: ${report.sources.approvedCriticalClaims}/${report.sources.criticalClaims}`);
  console.log(`Publish-ready: ${report.publishReady ? 'ja' : 'nein'}`);
  if (pending.length) {
    console.log('\nErste ausstehende Module:');
    for (const entry of pending.slice(0, 12)) {
      console.log(`- ${entry.id} [${entry.stage}] · Coverage ${entry.coverage}% · Quellen ${entry.sources} · ${entry.requirements.join(', ')}`);
    }
  }
}

if (process.argv.includes('--require-published') && !report.publishReady) process.exitCode = 1;
