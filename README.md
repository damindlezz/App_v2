# NUR 4.4 UNIFIED REFERENCE UI

Complete runtime-hardened repository for NUR 4.4, app version **0.25.4**.
The runtime-hardened NUR 4.4 application with the green/gold reference design integrated into the real Next.js/Tauri product. Existing Quran, Hifz, curriculum, review, source, library and exercise engines remain canonical; the redesign is the shared visual shell rather than a second frontend.

## Unified reference design

- reference navigation and subject menu across the real routes;
- green/gold ornamental visual system with responsive and reduced-motion behavior;
- Today extensions: four-stage method, manual prayer planner and persistent Tasbih;
- eight prominent training starters backed by the existing exercise registry;
- focused footer links to learning rooms, tools, library and sources.

See `UNIFIED_INTEGRATION_REPORT.md` and `QA_UNIFIED.md`.

## Requirements

- Node.js >= 20.19
- npm
- Python 3
- Rust/Cargo only for Tauri desktop builds

## Development

```bat
dev.bat
```

`dev.bat` reuses a running server when possible, installs dependencies only when missing, validates
generated content freshness and starts Next.js on port 1420.

Force content rebuild:

```bat
dev.bat content
```

## Production

Web/static export:

```bat
build.bat
```

Desktop/Tauri:

```bat
build.bat desktop
```

## P1 hardening

- split React app state into focused runtime/content/profile/progress/learning/annotation contexts;
- copy-on-write `ProgressState` updates instead of whole-state cloning;
- IndexedDB v6 event stores for history/exercise events with indexed bounded retention;
- SQLite Hifz delta writes instead of full-table rewrites on normal commits;
- Quran reader core reduced to metadata; per-Surah reader shards load on demand;
- source evidence split into selected-source shards;
- Quran audio cache bounded to 256 MiB / 640 files with LRU eviction and pre-write reservation;
- giant single-line TSX hotspots reformatted and protected by a regression guard.

See `P1_HARDENING_REPORT.md`, `ARCHITEKTUR.md` and `QA_P1.md`.
