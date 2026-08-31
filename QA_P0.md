# NUR 4.4 P0 CLEAN - QA

## P0 startup

- Turbopack root is pinned to the project directory.
- `dev.bat` reuses an already running server on port 1420.
- Runtime content is rebuilt only when missing or stale.
- A successful content build writes `public/content/.build-stamp` last.
- The final NUR shell renders immediately while content/storage initialize.
- Profile summaries hydrate progressively after the core profile is available.
- Daily challenge generation waits for profile hydration.
- Islamic study content is not loaded on Today unless Knowledge is the primary goal.

## Tests

- Storage conformance: passed.
- Content validation: passed.
- Node regression tests: 63/63 passed.
- SQLite migrations: passed.
- Dev content cold build: 5.71 s in test container.
- Dev content warm check: 0.05 s in test container.

## Source package cleanup

Excluded from the source ZIP:

- `public/content/`
- `.next/`
- `out/`
- `src-tauri/target/`
- `node_modules/`
- Python caches
- TypeScript build cache
- prior migration/QA reports
- obsolete launcher BAT files
