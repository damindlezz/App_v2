import type { LearningContent } from '../../types/models';
import { cacheQuranAudioSource, clearQuranAudioCache, getQuranAudioCacheStats } from '../audio/quran-audio-cache';
const AUDIO_CACHE_CONCURRENCY = 4;

export interface OfflineContentStatus {
  bundledDatasets: number;
  quranReaderDatasets: number;
  quranReaderRecords: number;
  audioCachedFiles: number;
  audioCachedBytes: number;
  cacheAvailable: boolean;
}

export async function getOfflineContentStatus(content: LearningContent): Promise<OfflineContentStatus> {
  const quran = content.quranReader;
  const cacheAvailable = typeof caches !== 'undefined';
  const audioStats = await getQuranAudioCacheStats();
  const audioCachedFiles = audioStats.files;
  const audioCachedBytes = audioStats.bytes;
  return {
    bundledDatasets: content.manifest.datasets?.length ?? 0,
    quranReaderDatasets: quran?.datasets.length ?? 0,
    quranReaderRecords: (quran?.ayahs.length ?? 0) + (quran?.translations.length ?? 0) + (quran?.words.length ?? 0) + (quran?.tajweed.length ?? 0),
    audioCachedFiles,
    audioCachedBytes,
    cacheAvailable
  };
}

export async function cacheQuranAudioForSurah(content: LearningContent, surah: number): Promise<{ cached: number; failed: number; total: number }> {
  if (typeof caches === 'undefined') return { cached: 0, failed: 0, total: 0 };
  const sources = (content.quranReader?.audio ?? []).filter((entry) => Number(entry.reference.split(':')[0]) === surah && /^https?:\/\//i.test(entry.audioPath));
  if (!sources.length) return { cached: 0, failed: 0, total: 0 };
  let cached = 0;
  let failed = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < sources.length) {
      const source = sources[cursor++];
      try {
        if (await cacheQuranAudioSource(source.audioPath)) cached += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
  };
  const workers = Math.min(AUDIO_CACHE_CONCURRENCY, sources.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { cached, failed, total: sources.length };
}

export async function clearOfflineAudio(): Promise<void> {
  await clearQuranAudioCache();
}

export function formatBytes(value: number): string {
  if (!value) return '0 MB';
  const mb = value / 1024 / 1024;
  return mb < 0.1 ? `${Math.round(value / 1024)} KB` : `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
