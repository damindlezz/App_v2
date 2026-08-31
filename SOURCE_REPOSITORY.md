# Source Repository

## Scope

Complete clean source repository for **NUR 4.4 UI PERFORMANCE HARDENED / v0.25.4**.
It contains application source, canonical content inputs, tests, build tooling, database migrations,
Next.js configuration and Tauri source.

## Included

- `app/` - Next.js App Router entrypoints
- `src/` - UI, features, focused state contexts, services, styles, types and learning engine
- `content-src/` - canonical content/build inputs
- `scripts/` - content, QA, release and platform tooling
- `tests/` - architecture, learning and P0-P3/P1-hardening regression tests
- `src-tauri/` - Rust/Tauri source, capabilities, icons and SQLite migrations
- `public/` - hand-maintained public assets; runtime content is generated
- `dev.bat` / `build.bat` - Windows development and production entrypoints
- lock/config files - `package-lock.json`, `package.json`, `tsconfig.json`, `next.config.mjs`

## Intentionally excluded from clean source ZIP

- `node_modules/`
- `.next/`
- `out/`
- `public/content/` (rebuilt from `content-src/`)
- `src-tauri/target/`
- local databases, logs, caches and QA artifacts

## Verification

```bat
npm run verify:source
npm run test
npm run test:migrations
npm run validate:content
npm run verify:platforms
```

A complete dependency-backed web export is produced by `build.bat`.
