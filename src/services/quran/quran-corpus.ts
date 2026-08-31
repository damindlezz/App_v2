import { JUZ_STARTS, QURAN_AYAH_COUNTS, TOTAL_QURAN_AYAHS } from '../../shared/quran-structure';
import type {
  QuranReaderAudioRecord,
  QuranReaderMushafLineRecord,
  QuranReaderRuntime,
  QuranReaderTafsirRecord,
  QuranReaderTajweedRecord,
  QuranReaderTranslationRecord,
  QuranReaderWordRecord
} from '../../types/models';

export interface QuranCorpusIndex {
  readonly runtime: QuranReaderRuntime;
  readonly ayahs: QuranReaderRuntime['ayahs'];
  readonly ayahByReference: ReadonlyMap<string, QuranReaderRuntime['ayahs'][number]>;
  readonly wordsByReference: ReadonlyMap<string, QuranReaderWordRecord[]>;
  readonly tajweedByReference: ReadonlyMap<string, QuranReaderTajweedRecord[]>;
  readonly translationsByReference: ReadonlyMap<string, QuranReaderTranslationRecord[]>;
  readonly tafsirByReference: ReadonlyMap<string, QuranReaderTafsirRecord[]>;
  readonly audioByReference: ReadonlyMap<string, QuranReaderAudioRecord>;
  readonly mushafLinesByPage: ReadonlyMap<number, QuranReaderMushafLineRecord[]>;
  readonly mushafAyahsByPage: ReadonlyMap<number, QuranReaderRuntime['ayahs']>;
  readonly mushafPages: readonly number[];
  ayah(reference: string | null | undefined): QuranReaderRuntime['ayahs'][number] | undefined;
  words(reference: string | null | undefined): readonly QuranReaderWordRecord[];
  tajweed(reference: string | null | undefined): readonly QuranReaderTajweedRecord[];
  translations(reference: string | null | undefined): readonly QuranReaderTranslationRecord[];
  tafsir(reference: string | null | undefined): readonly QuranReaderTafsirRecord[];
  audio(reference: string | null | undefined): QuranReaderAudioRecord | undefined;
  surah(surah: number): readonly QuranReaderRuntime['ayahs'][number][];
  juz(juz: number): readonly QuranReaderRuntime['ayahs'][number][];
  page(page: number): readonly QuranReaderMushafLineRecord[];
  pageAyahs(page: number): readonly QuranReaderRuntime['ayahs'][number][];
  pageForReference(reference: string | null | undefined): number | null;
}

interface QuranCorpusBase {
  ayahs: QuranReaderRuntime['ayahs'];
  ayahByReference: Map<string, QuranReaderRuntime['ayahs'][number]>;
  translationsByReference: Map<string, QuranReaderTranslationRecord[]>;
  tafsirByReference: Map<string, QuranReaderTafsirRecord[]>;
  audioByReference: Map<string, QuranReaderAudioRecord>;
  mushafLinesByPage: Map<number, QuranReaderMushafLineRecord[]>;
  mushafAyahsByPage: Map<number, QuranReaderRuntime['ayahs']>;
  mushafPages: number[];
  mushafPageByReference: Map<string, number>;
  bySurah: Map<number, QuranReaderRuntime['ayahs']>;
  byJuz: Map<number, QuranReaderRuntime['ayahs']>;
}

const CACHE = new WeakMap<QuranReaderRuntime, QuranCorpusIndex>();
const BASE_CACHE = new WeakMap<QuranReaderRuntime['ayahs'], QuranCorpusBase>();
const SURAH_START_ORDERS = QURAN_AYAH_COUNTS.map((_, index) => {
  let start = 1;
  for (let cursor = 0; cursor < index; cursor += 1) start += QURAN_AYAH_COUNTS[cursor] ?? 0;
  return start;
});
const JUZ_START_ORDERS = JUZ_STARTS.map((reference) => {
  const match = reference.match(/^(\d+):(\d+)$/);
  if (!match) return 1;
  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  return (SURAH_START_ORDERS[surah - 1] ?? 1) + ayah - 1;
});

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export function quranReferenceOrder(value: string | null | undefined): number {
  if (!value) return -1;
  const match = value.match(/^(\d+):(\d+)$/);
  if (!match) return -1;
  const surah = Number(match[1]);
  const ayah = Number(match[2]);
  if (surah < 1 || surah > 114 || ayah < 1 || ayah > (QURAN_AYAH_COUNTS[surah - 1] ?? 0)) return -1;
  return (SURAH_START_ORDERS[surah - 1] ?? 1) + ayah - 1;
}

export function quranCurrentSurah(reference: string | null | undefined): number {
  const match = reference?.match(/^(\d+):/);
  const value = match ? Number(match[1]) : 1;
  return value >= 1 && value <= 114 ? value : 1;
}

export function quranJuzForReference(reference: string | null | undefined): number {
  const order = quranReferenceOrder(reference);
  if (order < 1) return 1;
  let low = 0;
  let high = JUZ_START_ORDERS.length - 1;
  let found = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if ((JUZ_START_ORDERS[mid] ?? 1) <= order) { found = mid; low = mid + 1; }
    else high = mid - 1;
  }
  return found + 1;
}

export function quranJuzRange(juz: number): { start: number; end: number } {
  const safe = Math.min(30, Math.max(1, Math.trunc(juz || 1)));
  const start = JUZ_START_ORDERS[safe - 1] ?? 1;
  const end = safe < JUZ_START_ORDERS.length ? (JUZ_START_ORDERS[safe] ?? TOTAL_QURAN_AYAHS + 1) - 1 : TOTAL_QURAN_AYAHS;
  return { start, end };
}

export function quranSurahsOverlappingOrders(startOrder: number, endOrder: number): number[] {
  const output: number[] = [];
  for (let index = 0; index < QURAN_AYAH_COUNTS.length; index += 1) {
    const start = SURAH_START_ORDERS[index] ?? 1;
    const end = start + (QURAN_AYAH_COUNTS[index] ?? 0) - 1;
    if (end >= startOrder && start <= endOrder) output.push(index + 1);
    if (start > endOrder) break;
  }
  return output;
}


function buildBase(runtime: QuranReaderRuntime): QuranCorpusBase {
  const cached = BASE_CACHE.get(runtime.ayahs);
  if (cached) return cached;

  const ayahs = [...runtime.ayahs].sort((left, right) => left.surah - right.surah || left.ayah - right.ayah);
  const ayahByReference = new Map(ayahs.map((ayah) => [ayah.reference, ayah]));
  const translationsByReference = new Map<string, QuranReaderTranslationRecord[]>();
  const tafsirByReference = new Map<string, QuranReaderTafsirRecord[]>();
  const audioByReference = new Map<string, QuranReaderAudioRecord>();
  const mushafLinesByPage = new Map<number, QuranReaderMushafLineRecord[]>();
  const bySurah = new Map<number, QuranReaderRuntime['ayahs']>();
  const byJuz = new Map<number, QuranReaderRuntime['ayahs']>();

  for (const item of runtime.translations) push(translationsByReference, item.reference, item);
  for (const item of runtime.tafsir) push(tafsirByReference, item.reference, item);
  for (const item of runtime.audio) if (!audioByReference.has(item.reference)) audioByReference.set(item.reference, item);
  for (const line of runtime.mushafLines) push(mushafLinesByPage, line.page, line);
  for (const lines of mushafLinesByPage.values()) lines.sort((left, right) => left.line - right.line);
  for (const ayah of ayahs) push(bySurah, ayah.surah, ayah);

  let juz = 1;
  for (const ayah of ayahs) {
    const order = quranReferenceOrder(ayah.reference);
    while (juz < 30 && order >= (JUZ_START_ORDERS[juz] ?? Number.POSITIVE_INFINITY)) juz += 1;
    push(byJuz, juz, ayah);
  }

  const mushafPages = [...mushafLinesByPage.keys()].sort((a, b) => a - b);
  const pageRanges = mushafPages.map((page) => {
    const lines = mushafLinesByPage.get(page) ?? [];
    let start = Number.POSITIVE_INFINITY;
    let end = -1;
    for (const line of lines) {
      const lineStart = quranReferenceOrder(line.startReference ?? line.reference);
      const lineEnd = quranReferenceOrder(line.endReference ?? line.reference);
      if (lineStart >= 1) start = Math.min(start, lineStart);
      if (lineEnd >= 1) end = Math.max(end, lineEnd);
    }
    return { page, start, end };
  }).filter((range) => Number.isFinite(range.start) && range.end >= range.start);

  const mushafAyahsByPage = new Map<number, QuranReaderRuntime['ayahs']>();
  const mushafPageByReference = new Map<string, number>();
  for (const page of mushafPages) mushafAyahsByPage.set(page, []);
  let pageCursor = 0;
  for (const ayah of ayahs) {
    const order = quranReferenceOrder(ayah.reference);
    while (pageCursor < pageRanges.length && order > (pageRanges[pageCursor]?.end ?? -1)) pageCursor += 1;
    const range = pageRanges[pageCursor];
    if (!range || order < range.start || order > range.end) continue;
    const pageAyahs = mushafAyahsByPage.get(range.page) ?? [];
    pageAyahs.push(ayah);
    mushafAyahsByPage.set(range.page, pageAyahs);
    if (!mushafPageByReference.has(ayah.reference)) mushafPageByReference.set(ayah.reference, range.page);
  }

  const base: QuranCorpusBase = {
    ayahs,
    ayahByReference,
    translationsByReference,
    tafsirByReference,
    audioByReference,
    mushafLinesByPage,
    mushafAyahsByPage,
    mushafPages,
    mushafPageByReference,
    bySurah,
    byJuz
  };
  BASE_CACHE.set(runtime.ayahs, base);
  return base;
}

export function quranCorpus(runtime: QuranReaderRuntime): QuranCorpusIndex {
  const cached = CACHE.get(runtime);
  if (cached) return cached;

  const base = buildBase(runtime);
  const wordsByReference = new Map<string, QuranReaderWordRecord[]>();
  const tajweedByReference = new Map<string, QuranReaderTajweedRecord[]>();
  for (const word of runtime.words) push(wordsByReference, word.reference, word);
  for (const value of wordsByReference.values()) value.sort((left, right) => left.wordIndex - right.wordIndex);
  for (const item of runtime.tajweed) push(tajweedByReference, item.reference, item);

  const pageForReference = (reference: string | null | undefined): number | null => {
    if (!reference) return base.mushafPages[0] ?? null;
    return base.mushafPageByReference.get(reference) ?? base.mushafPages[0] ?? null;
  };

  const index: QuranCorpusIndex = {
    runtime,
    ayahs: base.ayahs,
    ayahByReference: base.ayahByReference,
    wordsByReference,
    tajweedByReference,
    translationsByReference: base.translationsByReference,
    tafsirByReference: base.tafsirByReference,
    audioByReference: base.audioByReference,
    mushafLinesByPage: base.mushafLinesByPage,
    mushafAyahsByPage: base.mushafAyahsByPage,
    mushafPages: base.mushafPages,
    ayah: (reference) => reference ? base.ayahByReference.get(reference) : undefined,
    words: (reference) => reference ? wordsByReference.get(reference) ?? [] : [],
    tajweed: (reference) => reference ? tajweedByReference.get(reference) ?? [] : [],
    translations: (reference) => reference ? base.translationsByReference.get(reference) ?? [] : [],
    tafsir: (reference) => reference ? base.tafsirByReference.get(reference) ?? [] : [],
    audio: (reference) => reference ? base.audioByReference.get(reference) : undefined,
    surah: (surah) => base.bySurah.get(surah) ?? [],
    juz: (value) => base.byJuz.get(value) ?? [],
    page: (page) => base.mushafLinesByPage.get(page) ?? [],
    pageAyahs: (page) => base.mushafAyahsByPage.get(page) ?? [],
    pageForReference
  };
  CACHE.set(runtime, index);
  return index;
}
