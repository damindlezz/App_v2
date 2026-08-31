# NUR 4.4 P1 Hardening Report

**Stand:** 2026-08-31  
**Version:** 0.25.3

## Resolved P1 risks

| P1 risk | Root cause | Implemented fix |
|---|---|---|
| Broad React rerenders | one application context exposed all changing state | six focused contexts; internal UI migrated from `useApp()` |
| Large progress clones | every mutation cloned complete `ProgressState` | branch-level copy-on-write with explicit mutable branches |
| IndexedDB growth/I/O | history and exercise results were growing arrays | v6 indexed event stores; bounded indexed reads and retention |
| IndexedDB reset race | clear cursor and new event inserts could overlap | replacement inserts are queued only after clear cursor exhaustion |
| IndexedDB retention cost | retained event window could be scanned on each append | cursor `advance(retention)` skips the 5,000 retained records |
| SQLite Hifz write amplification | normal saves rewrote all Hifz rows | previous/current row delta UPSERT/DELETE |
| Quran reader overfetch | ~5 MiB reader core loaded as one payload | 5.1 KiB metadata core + 114 per-Surah shards |
| Source evidence overfetch | full evidence graph loaded for one source | 38 selected-source evidence shards |
| Unbounded audio cache | CacheStorage had no file/byte budget | 256 MiB / 640 files, LRU, pre-write reservation |
| Compressed TSX | several components contained 1-3 KiB+ source lines | hotspots reformatted; global 900-char regression gate |

## Runtime characteristics

- Quran reader core: **5,177 bytes**; largest Surah shard: **~2.70 MiB**; median shard: **~150 KiB**.
- Source evidence: **38 shards**; largest selected-source shard: **~348 KiB**.
- Browser history runtime reads: indexed newest-first cursor with caller limit (default history 100).
- Browser event retention: 5,000 history and 5,000 exercise records without array rewrite.
- Audio cache: 256 MiB / 640-file upper bound; four concurrent network workers for offline Surah caching.
- Largest TSX source line after hardening: below 900 characters (regression-gated).

## Compatibility

- No public route removed.
- No SQLite migration/schema change required for P1 delta writes.
- IndexedDB upgrades automatically from older schemas to v6.
- Existing storage-service method semantics remain compatible; optional previous-progress data enables deltas.
- Full `ensureSources()` remains available; selected-source hydration is an additive optimization.

## Edge cases explicitly covered

- old IndexedDB profiles migrating directly from pre-v5 layouts;
- v5 history/exercise segment migration to v6 event stores;
- reset followed by a new audit/history event in the same transaction;
- retention above 5,000 events;
- source views before selected evidence is hydrated;
- Quran requests spanning more Surahs than the runtime cache retains;
- audio files larger than the configured cache budget;
- CacheStorage write failures/quota pressure;
- concurrent lazy content requests and parallel offline audio downloads;
- Hifz marking reset preserving independent Hifz progress.
