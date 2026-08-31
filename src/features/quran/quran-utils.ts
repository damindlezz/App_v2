import { QURAN_AYAH_COUNTS } from '../../shared/quran-structure';
import type { QuranHifzEntry, QuranHifzWordEntry } from '../../types/models';

export function validReference(value?: string | null): string | null {
  const match = value?.match(/^(\d{1,3}):(\d{1,3})$/);
  if (!match) return null;
  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  return surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= (QURAN_AYAH_COUNTS[surah - 1] ?? 0) ? `${surah}:${ayah}` : null;
}

export function moveReference(reference: string, delta: number): string | null {
  const valid = validReference(reference);
  if (!valid) return null;
  let [surah, ayah] = valid.split(':').map(Number);
  ayah += delta;
  if (ayah < 1) {
    if (surah === 1) return null;
    surah -= 1;
    ayah = QURAN_AYAH_COUNTS[surah - 1] ?? 1;
  }
  if (ayah > (QURAN_AYAH_COUNTS[surah - 1] ?? 0)) {
    if (surah === 114) return null;
    surah += 1;
    ayah = 1;
  }
  return `${surah}:${ayah}`;
}

export function newHifz(reference: string): QuranHifzEntry {
  const now = new Date().toISOString();
  return { reference, status: 'new', repetitions: 0, errorCount: 0, lastReviewedAt: null, updatedAt: now };
}

export function newWordHifz(reference: string, wordIndex: number): QuranHifzWordEntry {
  const now = new Date().toISOString();
  return { reference, wordIndex, status: 'new', repetitions: 0, errorCount: 0, lastReviewedAt: null, updatedAt: now };
}

export function toggleWordHifzEntry(words: QuranHifzWordEntry[], reference: string, wordIndex: number): void {
  const index = words.findIndex((entry) => entry.reference === reference && entry.wordIndex === wordIndex);
  if (index >= 0) words.splice(index, 1);
  else words.push(newWordHifz(reference, wordIndex));
}

export function applyHifzResult(entry: QuranHifzEntry | QuranHifzWordEntry, correct: boolean): void {
  const now = new Date().toISOString();
  entry.repetitions += 1;
  entry.lastReviewedAt = now;
  entry.updatedAt = now;
  if (!correct) {
    entry.errorCount += 1;
    entry.status = 'unstable';
    return;
  }
  if (entry.status === 'new' || entry.status === 'unstable') entry.status = 'learning';
  else if (entry.status === 'learning' && entry.repetitions >= 3) entry.status = 'stable';
  else if (entry.status === 'stable' && entry.repetitions >= 8) entry.status = 'mastered';
}


export function applyHifzScore(entry: QuranHifzEntry | QuranHifzWordEntry, score: number): void {
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  applyHifzResult(entry, normalized >= 75);
  if (normalized >= 90 && entry.status === 'learning' && entry.repetitions >= 2) entry.status = 'stable';
  if (normalized < 50) entry.status = 'unstable';
}

export function applyAyahRecallEvidence(
  ayahs: QuranHifzEntry[],
  words: QuranHifzWordEntry[],
  reference: string,
  score: number,
  wrongWordIndexes: readonly number[] = []
): void {
  let ayah = ayahs.find((entry) => entry.reference === reference);
  if (!ayah) { ayah = newHifz(reference); ayahs.push(ayah); }
  applyHifzScore(ayah, score);
  const wrong = new Set(wrongWordIndexes);
  for (const wordIndex of wrong) {
    let word = words.find((entry) => entry.reference === reference && entry.wordIndex === wordIndex);
    if (!word) { word = newWordHifz(reference, wordIndex); words.push(word); }
    applyHifzScore(word, 0);
  }
  for (const word of words.filter((entry) => entry.reference === reference && !wrong.has(entry.wordIndex))) applyHifzScore(word, score);
}

export function applyWordRecallEvidence(words: QuranHifzWordEntry[], reference: string, wordIndex: number, score: number): void {
  let word = words.find((entry) => entry.reference === reference && entry.wordIndex === wordIndex);
  if (!word) { word = newWordHifz(reference, wordIndex); words.push(word); }
  applyHifzScore(word, score);
}

export function isHifzDue(entry: QuranHifzEntry | QuranHifzWordEntry, now = new Date()): boolean {
  if (entry.status === 'new' || entry.status === 'learning' || entry.status === 'unstable' || !entry.lastReviewedAt) return true;
  const ageDays = (now.getTime() - new Date(entry.lastReviewedAt).getTime()) / 86400000;
  return entry.status === 'stable' ? ageDays >= 7 : ageDays >= 30;
}

