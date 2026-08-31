# Architektur v0.24.0 - P3

## Study Shell
Study-Routen mounten keine Legacy-Sidebar. `StudyNavRail` ist die gemeinsame Navigation. `Study` wird dynamisch auf den zuletzt aktiven Lernbereich aufgeloest. Heute, Fortschritt, Einstellungen, Bibliothek, Quellen und Bereich bleiben im Study-Shell-Vertrag.

## Study Workspace
Drei feste Verantwortungen:
- `StudyLedger`: Position, Lernpfad, Gate, Review-Markierung.
- `StudyCanvas`: aktueller Inhalt und aktive Interaktion.
- `StudyContextRail`: genau ein Hauptkontextzustand plus optionaler kompakter Status.

`JourneyStatus` (`locked`, `available`, `active`, `completed`) und `LearningHealth` (`stable`, `weak`, `review_due`) bleiben getrennt.

## Gemeinsame Ledger-Primitiven
`StudyLedgerPrimitives` stellt gemeinsame Shell-, Header-, Progress- und Review-Bausteine bereit. Kurs-Ledger, Modul-Ledger und Hifz-Ledger verwenden diese Basis; bereichsspezifisch bleiben nur Datenadapter und Fachinteraktionen.

## P0 Learning Integrity
- `skill_progress` ist ein inkrementeller persistenter Aggregat-Store.
- `journeyStates[track]` ist die einzige aktive Kurs-Resume-Quelle.
- `quranReaderState` und `hifzStudyState` sind voneinander getrennt.
- Lernschritte werden nur nach erfuellter `completionPolicy` verifiziert.

## Fiqh Core + Madhhab Layer
Die vier Fiqh-Tracks werden nicht mehr als vier vollstaendig duplizierte Quelldateien gepflegt:
- `content-src/islamic/fiqh/core.json` enthaelt gemeinsame Struktur/Inhalte.
- `content-src/islamic/fiqh/layers/{hanafi,maliki,shafii,hanbali}.json` enthaelt nur Abweichungen.
- `scripts/content_build/fiqh_layers.py` rekonstruiert beim Content-Build die unveraenderten sieben Runtime-Track-Vertraege.
- `scripts/factor-fiqh-layers.py` kann Legacy-Tracks faktorisieren und einen bereits faktorisierten Bestand idempotent validieren.

Im Study Ledger erscheint Fiqh als Fachgebiet mit separatem Madhhab-Layer-Schalter statt vier konkurrierender Hauptbaeume.

## Practice P1
`ExerciseTask` besitzt einen echten `analysis`-Typ. Hadith-Analyse wird als Mehrschrittanalyse gerendert. Fiqh-Vergleiche erzeugen nach Moeglichkeit schuluebergreifende Zuordnungen; bei nicht passender Datenlage faellt die Engine auf strukturierte Mehrschrittanalyse zurueck, nicht auf generisches Multiple Choice.

## Hifz P1
Navigation, Darstellung und Lernflow bleiben getrennt:
- Navigation: `surah | juz | page`
- Auswahl: Ayah oder Range
- Darstellung: `verses | mushaf | focus`
- Flow: `understand -> memorize -> recite -> test`

Bei Ranges wird nach jeder neuen Ayah ein kumulativer Chain-Recall eingefuegt. `HifzRecallTask` bewertet Ayah-Wortreihenfolge bzw. Range-Verkettung objektiv. `HifzWordRecallTask` bewertet Wort-Recall objektiv. Ergebnis, Fehlerpositionen und Reaktionszeit werden als Exercise-Evidenz persistiert.

## Unified Review Planner
`review-planner.ts` baut eine gemeinsame priorisierte Queue aus:
- normalen SRS-Items,
- Hifz-Ayah-Reviews,
- Hifz-Wort-Reviews.

Prioritaet beruecksichtigt Faelligkeit, Schwachstelle, Fehlerstatus und Hifz-spezifische Vergessenssignale. Die Review-Session arbeitet auf einem stabilen Queue-Snapshot.

## Context Rail P2
`StudyContextRail` ist eine explizite State Machine mit den Zustaenden:
`focus | evidence | error | review | prerequisite | word | source`.

Kurs, Modul und Hifz loesen jeweils genau einen primaeren Zustand auf. Dadurch wird der rechte Rail nicht wieder zu einem parallelen Dashboard.

## Persistenz
- Browser: IndexedDB.
- Tauri Desktop/Android: SQLite.
- Gemeinsamer Progress-, Review-, Journey-, Skill- und Hifz-Datenvertrag.

## Build / Release
`build:content` erzeugt `public/content/` aus `content-src/`. `npm run build` erzeugt den Next-Export und validiert Assets. `verify-platform-config.mjs` prueft den Next-/Tauri-Vertrag.

Generierte Artefakte (`public/content`, `.next`, `out`, `src-tauri/target`, `RELEASE_MANIFEST.json`, Caches) gehoeren nicht in das Source-ZIP.

## Runtime Hardening v0.25.3

### React state
`AppProvider` exposes six focused contexts: runtime, content, profile, progress, learning and annotations.
Internal screens consume only the context slices they need. `useApp()` remains only as a compatibility
facade; first-party UI does not consume it.

`ProgressState` updates use branch-level copy-on-write via `cloneProgressForUpdate`. Large Hifz/session/
challenge branches are cloned only when the mutation declares them.

### Browser persistence
IndexedDB schema v6 stores profile core data separately from bounded segments. High-growth history and
exercise results are normalized into indexed event stores keyed by profile/time. Existing v5 and older
records migrate during schema upgrade. Event retention keeps 5,000 records and jumps over the retained
window before deleting overflow records.

### SQLite
Normal saves and learning commits compare the previous/current Hifz state and UPSERT/DELETE only changed
Ayah and word rows. Full Hifz writes remain only for first creation/import where no previous state exists.

### Content loading
`quran-reader-core.json` contains metadata only. Reader records live in `quran-reader/surah/NNN.json` and
are loaded per required Surah with a six-Surah runtime cache. Source catalog data is separate from
`source-evidence/<sourceId>.json`; the Sources screen hydrates only the selected source evidence.

### Offline audio
Quran audio uses a shared CacheStorage LRU with a 256 MiB / 640-file ceiling. Space is reserved before
writes, oversized files are rejected and metadata is maintained separately from the audio cache.

### Maintainability gate
P1 regression tests reject TSX source lines above 900 characters, preventing the previous multi-kilobyte
single-line component pattern from returning.

## UI Performance Hardening v0.25.4

- Global chrome uses focused runtime/profile/preferences/summary contexts instead of complete progress/learning payloads.
- Quran playback state is isolated from the long reader canvas.
- Search is conditional/lazy; onboarding remains eager for offline first-run reliability.
- Library search uses pre-normalized searchable text and deferred input.
- Long collections use render containment; decorative paint is reduced on constrained/reduced-motion clients.
- Theme metadata has one canonical source.

See `UI_AUDIT_OPTIMIZATION_REPORT.md` for root causes, edge cases and remaining CSS/component risks.
