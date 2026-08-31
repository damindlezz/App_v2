# QA P1

**Release:** NUR 4.4 P1 HARDENED / v0.25.3  
**Stand:** 2026-08-31

## Results

- Repository regression tests: **85/85 PASS**
- SQLite migrations: **9/9 PASS**; v3 -> v9 upgrade preserves profile/progress/reviews
- Stable content IDs: **10,482**, no unexpected aliases
- Storage conformance: **28 Promise operations PASS** for IndexedDB and SQLite adapters
- Content validation: **PASS**
- Platform contract: **PASS** for Next static export configuration, Tauri Desktop and Android
- P3 content audit: **PASS**
- TypeScript parser diagnostics: **0 syntax/parser errors**
- P1 TSX maintainability gate: **PASS**, maximum allowed line length 900 characters

## Build limitation in this environment

A complete `npm ci`/`next build` could not be rerun because dependency download timed out in the
execution environment. No `node_modules` are included in the delivered archives. The TypeScript command
therefore stops on missing `@types/node`, `@types/react` and `@types/react-dom`; it reports no parser errors
before dependency resolution.

## P1 regression coverage

`tests/p1-runtime-hardening.test.mjs` verifies:

- Quran and source-evidence sharding;
- IndexedDB v6 event stores, retention jump and reset sequencing;
- SQLite Hifz delta persistence;
- branch-level progress cloning;
- split React contexts and absence of internal `useApp()` consumers;
- bounded audio LRU with pre-write reservation;
- maintainability guard against giant single-line TSX components.
