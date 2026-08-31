# 0.25.4 - UNIFIED REFERENCE UI INTEGRATION

- Referenzdesign aus App-Aufbau/UI-Referenz in die produktive NUR-4.4-Runtime integriert.
- Referenz-Navigation, Lernfach-Popover, ornamentale Gruen/Gold-Oberflaeche und Footer hinzugefuegt.
- Today um Vier-Etappen-Methode, manuellen Salah-Zeitplaner und persistierten Tasbih erweitert.
- Training hebt acht Referenz-Uebungen hervor; der vollstaendige Exercise-Registry-Vertrag bleibt erhalten.
- Kein paralleles Progress-/Review-/Hifz-Datenmodell eingefuehrt; alle neuen Oberflaechen nutzen bestehende Engines.
- Unified-Integration durch zusaetzliche Regressionstests abgesichert.

# 0.25.4 - NUR 4.4 UI PERFORMANCE HARDENING

- UI state subscriptions split into preferences, actions and learning summaries.
- Global shell, header and Arabic text no longer subscribe to complete progress payloads.
- Global search mounts only while open; onboarding remains eager for offline first-run reliability.
- Quran audio player owns high-frequency playback state; long Quran canvas is memoized.
- Library search uses deferred input, pre-normalized search text and memoized derived collections.
- Theme options moved to one canonical shared catalog.
- Long collections use browser render containment; reduced-motion and slow/mobile ambient effects are reduced.
- Audio playback cleanup avoids state writes after unmount and applies rate changes to active playback.

# 0.25.3 - NUR 4.4 P1 HARDENED

- Split the monolithic application context into six focused React contexts.
- Add branch-level copy-on-write progress updates to avoid whole-state clones.
- Upgrade browser persistence to IndexedDB v6 with indexed history/exercise event stores.
- Sequence IndexedDB reset replacement deterministically and optimize retention with cursor jumps.
- Persist Hifz changes to SQLite as row deltas during normal progress saves/learning commits.
- Shard Quran reader payloads per Surah; the core reader payload is metadata-only.
- Shard source evidence and load only the selected source on the Sources page.
- Bound Quran audio CacheStorage to 256 MiB / 640 files with LRU eviction and pre-write budget reservation.
- Reformat the largest compressed TSX hotspots and add a max-line regression gate.
- Extend runtime-hardening regression coverage.

# 0.25.2 - NUR 4.4 P0 CLEAN

- Pin Turbopack root to project directory.
- Reuse running development server from dev.bat.
- Replace unconditional dev content build with stale-check cache.
- Add successful content build stamp.
- Parallelize core content and storage startup.
- Render final NUR shell during startup.
- Hydrate profile summaries progressively.
- Delay daily challenge persistence until profile hydration completes.
- Lazy-load Islamic study track on Today only when needed.
- Remove generated and obsolete source-package artifacts.
- Complete source-repository contract added with source-integrity verification and Git line-ending rules.
- Desktop/Tauri package version aligned with app version 0.25.2.

# Changelog

## v0.24.1 - Build- und Navigations-Fix

- Root Cause fuer fehlschlagenden Typecheck (`npm run check` / `tsc --noEmit`) behoben: `ReviewWorkspace.tsx` nutzte den nicht existierenden Icon-Namen `progress` statt `chart`.
- Branding-Inkonsistenz im Study-Sidebar-Logo behoben: zeigte `"N"`/`"Nord Study"` statt `"F"`/`"Fusha"` - einzige Fundstelle dieses Fremdnamens im Code.
- Vollstaendiger `next build`-Produktionsbuild inklusive installierter Dependencies verifiziert: 15 Routen, Export- und Platform-Checks gruen.
- Navigation aller Seiten gegen Doppel-/Fehlmount der Study-Nav-Rail geprueft; keine weiteren Abweichungen gefunden.

## v0.22.0 - P1/P2 Learning Quality + UI Consolidation
- Fiqh-Quellen von vier weitgehend duplizierten Volltracks auf einen gemeinsamen Core plus sparse Hanafi-/Maliki-/Shafii-/Hanbali-Layer umgestellt; der Content-Build rekonstruiert die bisherigen Runtime-Tracks unveraendert.
- Faktorisierungswerkzeug ist idempotent und kann den neuen Layer-Bestand ohne Legacy-Dateien validieren.
- Hadith-Analyse nutzt echte Mehrschrittanalyse; Fiqh-Vergleiche verwenden schuluebergreifende Matching-/Analyseaufgaben statt generischem MC-Fallback.
- Hifz-Ranges werden kumulativ verkettet: neue Ayah -> kombinierter Recall der bisher gelernten Range.
- Hifz-Testung erzeugt objektive Ayah-/Range-/Wort-Evidenz inklusive Score, Fehlerpositionen und Reaktionszeit.
- Ein `ReviewPlanner` priorisiert normale SRS-Karten, Hifz-Ayah und Hifz-Woerter in einer gemeinsamen stabilen Review-Queue.
- Context Rail als Single-State-Machine (`focus`, `evidence`, `error`, `review`, `prerequisite`, `word`, `source`) vereinheitlicht.
- Kurs-, Modul- und Hifz-Ledger verwenden gemeinsame `StudyLedgerPrimitives`.
- `Study` im Nav Rail setzt dynamisch am zuletzt aktiven Lernbereich fort statt immer Arabisch zu oeffnen.
- Bibliothek, Quellen und Bereich wurden in den Study-Shell-Vertrag aufgenommen; Navigation faellt dort nicht mehr in die Legacy-Oberflaeche zurueck.
- P1/P2-Regressionssuite ergaenzt.

## v0.21.0 - P0 Learning Integrity
- `skill_progress` wird inkrementell aus neu committed Exercise-Events aktualisiert; das 300-Event-Runtimefenster kann historische Skills nicht mehr entfernen.
- Vollhistorischer Skill-Rebuild bleibt ausschließlich Migration/Repair, wenn noch kein persistierter Skill-Stand existiert.
- Legacy-Kurspositionen (`currentLearning*`, `currentCourseTrack`) wurden aus `ProgressState` und der Runtime entfernt; `journeyStates` ist die einzige aktive Kurs-Resume-Quelle.
- Alte Progress-Saves werden beim Normalisieren einmalig in `journeyStates` migriert.
- Quran Reader und Hifz besitzen getrennte Resume-States inklusive Ansicht/Layern; Hifz speichert zusätzlich Navigation, Range und `mushafLayoutId`.
- Jeder Lernschritt besitzt eine `completionPolicy` mit Mindestscore, Mindestanzahl unterschiedlicher Evidenzen und erforderlichen Evidenzmodi.
- Mikro-Checks speichern nur Evidenz (`attempt`); `verify` erfolgt ausschließlich nach erfüllter Completion Policy. Wiederholtes Beantworten derselben Exercise-ID zählt nicht mehrfach.
- Content-Build und Content-Validator prüfen Completion Policies für alle Lernpfade.
- Neue P0-Regressionsprüfungen sichern die vier Verträge ab.

## v0.20.5 - Clean Study Rewrite
- Root Cause fuer gemischte alte/neue UI behoben: Study-Routen mounten den Legacy-App-Shell nicht mehr.
- Study Navigation wird synchron aus der Route entschieden; kein nachtraegliches DOM-/Dataset-Umschalten mehr.
- `StudyNavRail` als gemeinsame Navigation fuer Lernpfad, Modul, Quran, Hifz und Practice-Picker vereinheitlicht.
- Heute, Fortschritt und Einstellungen ueber `StudyUtilityFrame` in denselben Study-Shell-Vertrag migriert; Navigation aus dem Study Rail faellt nicht mehr in die alte UI zurueck.
- `ModulePage` komplett auf Study Ledger + Study Canvas + Context Rail umgeschrieben; alte `module-page`-/`lesson-rail`-Oberflaeche entfernt.
- Practice- und Review-Fokusflaechen visuell auf das Study-System angeglichen und verschachtelte Karten reduziert.
- Responsive Rails/Drawer fuer 1320/980/700 px, konsistente Focus-States und Reduced-Motion-Unterstuetzung ergaenzt.
- Veraltete `ProgressRing`-Komponente und Legacy-Module-Styles entfernt.

## v0.20.4 - Adaptive Study
- Lern-Evidenz wird aus den kanonischen Exercise-Result-Events abgeleitet: Score, Fehlerart, Reaktionszeit, Variante und Skills.
- Schrittabschluss ist evidenzbasiert (`verify`) statt manuell; ein Klick allein erzeugt keine Kompetenz mehr.
- `skill_progress` wird aus realen Uebungsergebnissen aufgebaut und bei neuen Ergebnissen synchronisiert.
- Context Rail zeigt Mastery, Confidence, Fehlerquote, Reaktionszeit, betroffene Skills und faellige Reviews zum aktuellen Lernschritt.
- Reviews werden nach Ueberfaelligkeit, Schwachstelle und Fehlerhaeufigkeit priorisiert.
- Journey-Status und Learning-Health bleiben getrennt; bestandene Gates werden durch spaetere Reviews nicht rueckwirkend gesperrt.

## v0.20.3 - Quran Study
- Gemeinsamer `QuranStudyCanvas` fuer Quran und Hifz eingefuehrt.
- Drei Darstellungen: Verse, 13-Zeilen-Mushaf und Ayah-Fokus.
- Wort-fuer-Wort, Uebersetzung und Tajwid als gemeinsame Layer statt separater Reader-Implementierungen.
- Quran Reader auf den gemeinsamen Study Canvas migriert.
- Hifz nutzt denselben Canvas im Memoriermodus mit Ausblend-/Recall-Logik.

## v0.20.2 - Hifz Study
- Hifz auf das dreispaltige Study-Workspace-Prinzip umgestellt.
- Study Ledger navigiert getrennt nach Sure, Juz oder Mushaf-Seite.
- Ayah-Bereichsauswahl fuer einzelne Verse und zusammenhaengende Ranges.
- Study-Workflow: Verstehen, Einpraegen, Rezitieren, Pruefen.
- Mushaf-Seiten werden explizit als 13-Zeilen-Layout behandelt.

## v0.20.1 - Lernpfade
- Arabisch 0-C2, Quran Q0-Q6 und sieben islamische Fachpfade auf die gemeinsame Study-Ledger-Engine umgestellt.
- Quran-Fusha-Voraussetzungen erscheinen als Arabisch-Bruecken.
- Track-spezifischer Resume-State wird aus Modulen und Lernschritten fortgeschrieben.
- Abschluss/Freischaltung bleibt unabhaengig von spaeteren Review-Signalen.

## v0.20.0 - Study Workspace
- Dreigeteiltes Lernlayout: Study Ledger, Study Canvas, Context Rail.
- Study Ledger als flache Timeline ohne Kachel-in-Kachel-Struktur.
- `JourneyStatus` und `LearningHealth` getrennt.
- Persistenter `journeyStates`-Zustand pro Kurs-Track.
- Responsive Ledger-/Context-Drawer fuer kleinere Breiten.

## Vor v0.20
- Next.js/React/Tauri Runtime, Content-Build, IndexedDB/SQLite-Persistenz, Practice Engine, SRS, Kapitel-/Modul-Gates, Quran-Content-Pipeline und Release-Gates wurden in v0.18-v0.19 etabliert.

## 0.24.0 - P3 + Sidebar-Fix

- P3-Content-Audit fuer alle 211 Module: strukturelle/didaktische Vollstaendigkeit maschinell geprueft; Fachreview bleibt explizites Gate.
- Fusha: Hoerverstehen und Speaking systematisch in allen 76 Modulen verankert.
- Neue Runtime-Varianten: `grammar_listening`, `reading_listening`, `writing_dictation`; Speaking nutzt Vokabel-, Grammatik-, Lese- und Schreibinhalte.
- Quellenreview: `content-src/editorial/source-verification.json` als einzige manuelle Freigabegrenze fuer exakte Fundstellen/Claims. Keine automatische Scheinfreigabe.
- Quran-Morphologie: manueller Importer fuer offizielle Quranic-Arabic-Corpus-v0.4-Dateien; Runtime vereinigt Token, Wortglosse und Morphologie positionsgenau.
- Quran Context Rail blendet Lemma/Wurzel/Morphologie aus, solange kein echter Datensatz importiert ist.
- Study Sidebar neu repariert: 96px Desktop-Rail, vollstaendige Labels, responsive Breiten, Hover-Zustaende, dekoratives Logo ohne doppelte Heute-Funktion.
