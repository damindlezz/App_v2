# Drittanbieterhinweise – Arabisch Lernen v0.13.0

Stand: siehe `CHANGELOG.md`. Die Abhängigkeitstabelle unten wird gegen `package.json`/`src-tauri/Cargo.toml` gepflegt und sollte bei jedem Versionssprung erneut abgeglichen werden.

Dieses Projekt enthält eigenen TypeScript-, CSS-, HTML-, Rust-Konfigurations- und Inhaltscode sowie Abhängigkeiten von Drittanbietern. Die folgenden direkten Abhängigkeiten sind in den Projektdateien deklariert.

## JavaScript-/TypeScript-Abhängigkeiten

| Paket | Projektversion | Lizenz laut Upstream-Projekt |
|---|---:|---|
| `@tauri-apps/api` | 2.11.1 | MIT oder Apache-2.0 |
| `@tauri-apps/plugin-sql` | 2.4.0 | MIT oder Apache-2.0 |
| `@tauri-apps/cli` | 2.11.2 | MIT oder Apache-2.0 |
| `vite` | 7.3.6 | MIT |
| `typescript` | 5.8.3 | Apache-2.0 |

## Rust-Abhängigkeiten

| Crate | Versionsbereich im Projekt | Lizenz laut Upstream-Projekt |
|---|---:|---|
| `tauri` / `tauri-build` | 2 | MIT oder Apache-2.0 |
| `tauri-plugin-sql` | 2 | MIT oder Apache-2.0 |
| `serde` | 1 | MIT oder Apache-2.0 |
| `serde_json` | 1 | MIT oder Apache-2.0 |

## Schriften, Bilder und Inhalte

- Die auslieferbare ZIP enthält keine `.ttf`, `.otf`, `.woff`, `.woff2` oder `.eot`-Dateien.
- Die Oberfläche verwendet plattformeigene Systemschrift-Fallbacks. Dadurch werden keine externen Schriftdateien weitergegeben.
- Die im Projekt enthaltenen App-Symbole wurden für dieses Projekt erstellt und sind keine übernommenen Markenlogos.
- Die Lerntexte und Beispieldaten sind als projektspezifische Inhalte angelegt. Vor einer öffentlichen oder kommerziellen Veröffentlichung sollten sie zusätzlich fachlich und rechtlich redaktionell freigegeben werden.


## Babel/CLDR-Lokalisierungsdaten

Für 451 als `draft`/`extended` markierte v0.12-Vokabeleinträge verwendet das Generatorskript die lokal installierte Python-Bibliothek Babel 2.18.0 und deren Lokalisierungsdaten für Länder-, Sprach- und Währungsbezeichnungen. Diese Inhalte sind kein redaktionell freigegebener Kernwortschatz. Vor externer Distribution müssen die für Babel/Unicode-CLDR geltenden Lizenz-/Hinweispflichten im finalen Distributionspaket nochmals geprüft und vollständig übernommen werden.

## Transitive Abhängigkeiten

Diese Datei dokumentiert die direkten Abhängigkeiten. Für eine Veröffentlichung muss nach der ersten vollständigen Online-Installation zusätzlich ein maschineller Bericht aller transitiven npm- und Cargo-Abhängigkeiten erzeugt und archiviert werden. Geeignete Schritte sind beispielsweise:

```text
npm ci
npm audit
cargo generate-lockfile
cargo tree
cargo deny check licenses
```

`cargo-deny` ist ein optionales separates Werkzeug und nicht Bestandteil dieses Projekts.

## Rechtlicher Hinweis

Diese Datei ist eine technische Bestandsaufnahme und keine Rechtsberatung. Sie ersetzt insbesondere keine Prüfung von Marken, Lerninhalten, Audioaufnahmen, später ergänzten Bildern oder durch Nutzer importierten Dateien.

## Quran-Daten

- Der eingebettete Uthmani-Qurantext und die migrierte deutsche Abu-Reda-Uebersetzung stammen aus Dateien des TeX-Live/CTAN-Pakets `quran`. CTAN weist fuer das Paket LPPL 1.3c aus. Die verwendeten lokalen Quelldateien enthalten einen LPPL-1.3c+-Lizenzhinweis.
- Die Worttoken- und Tajwid-Reviewdaten sind projektinterne Ableitungen aus diesem eingebetteten Text; sie kopieren keinen externen Morphologie- oder Tajwid-Korpus.

### 13-Zeilen-Muṣḥaf-Importquelle

- Bevorzugte Layoutquelle: `Waqar144/quran_memorization_helper` / Quran Revision Companion.
- Repository-Lizenz: MIT.
- Relevante Quelldatei: `lib/quran_data/thirteen_line_indopak_layout.dart`.
- Der Lean Source enthält Importadapter und Quellenmetadokumentation; das Layout wird bei Bedarf vom Entwicklungs-Sync geladen und lokal migriert.


## German Tafsir - Muhammad Ibn Ahmad Ibn Rassoul

- Work: Tafsir Al-Quran Al-Karim, 41st revised and expanded edition.
- App source: Mylinde/Tafsir JSON conversion (`tafsir-json/de_tafsir_complete.json`).
- Reuse condition stated by the work: reproduction, reprinting and translation are permitted when the source is cited.
- The desktop sync keeps attribution in the content source registry.

## QuranLab Quran Audio reference manifest

- The app stores external verse-level audio references only.
- QuranLab explicitly does not redistribute recitation audio bytes; recordings remain with their reciters/producers.
- The app streams an original public source URL when the user clicks an ayah.
- No recitation MP3 files are bundled in this project.


### Vahid Arabic/Ottoman Font
- Quelle: muctebanesiri/vahid-font
- Zweck: optionale arabische Schrift im türkisch/osmanischen Ruqʿa-Stil
- Lizenz: SIL Open Font License 1.1
- Die Fontdatei wird lokal durch die BAT synchronisiert und ist nicht im Source-ZIP gebündelt.

### Quran Foundation · deutsche Wort-für-Wort-Übersetzungen
- Nutzung über die Content API v4 unter den jeweils aktuellen Quran Foundation Developer Terms.
- Attribution in der App: „Quran data provided by Quran Foundation.“
- Der Quellcode enthält keine QF-Wortdaten; diese können für lokale Entwicklungs-/Reviewzwecke credential-basiert synchronisiert werden.

## Optionaler Quranic-Arabic-Corpus-Morphologieimport

Die Anwendung enthält einen **Importer**, aber keine automatisch bezogene Kopie des Quranic Arabic Corpus v0.4. Eine offizielle Morphologiedatei darf nur nach den jeweils geltenden Corpus-Lizenz- und Bezugsbedingungen eingebracht werden. `scripts/import-qac-morphology.py` übernimmt daraus ausschließlich positionsgebundene Lemma-, Wurzel- und Morphologiefelder in die stabile interne Wortschicht. Die originale Bezugsdatei wird vom Projekt weder verändert noch verteilt.
