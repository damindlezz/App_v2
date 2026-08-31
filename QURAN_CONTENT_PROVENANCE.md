# Quran Reader - Content-/Rechte-Status

## Eingebettet

### Uthmani-Qurantext
- 6.236 Ayat, Referenzen 1:1 bis 114:6.
- Arbeitsquelle: `qurantext-uthmani.def` aus TeX Live `quran`.
- Lizenz: LPPL 1.3c+ laut Paket/Dateikopf.
- Datensatz: `content-src/quran-reader/quran_text/uthmani-texlive-quran.json`.
- Status: `referenced`; fachliche Gegenprüfung bleibt offen.

### Deutsche Übersetzung - Abu Reda / Ibn Rassoul
- 6.236/6.236 Verse migriert.
- Quelle: `qurantext-de.translation.def` aus TeX Live `quran`.
- Lizenz: LPPL 1.3c+ laut verwendeter Quelldatei.
- Datensatz: `content-src/quran-reader/translation/abu-reda-de-texlive.json`.
- Status: `referenced`; redaktionelle Gegenprüfung bleibt offen.

### Wortanalyse - Reviewbasis
- 77.433 1-basierte Wortpositionen aus dem eingebetteten Uthmani-Text.
- Keine Lemma-, Wurzel-, Bedeutungs- oder Morphologieangaben erfunden.
- Datensatz: `content-src/quran-reader/word_analysis/uthmani-token-review.json`.
- Status: `draft`.

### Deutsche Wortglossen - eingebetteter Offline-Fallback
- 77.433/77.433 Wortpositionen werden offline mit einer deutschen Wortglosse ausgeliefert.
- Quelle der Ableitung: die bereits eingebettete LPPL-1.3c+-Versübersetzung Abu Reda / Ibn Rassoul plus die lokale Uthmani-Tokenbasis.
- Verfahren: deterministische, monotone statistische Ausrichtung innerhalb der jeweiligen Verse; es werden keine externen Wort-für-Wort-Rohdaten kopiert.
- Datensatz: `content-src/quran-reader/word_analysis/abureda-derived-wbw-de.json`.
- Status: `draft`; die Glosses sind ein Offline-Fallback und bleiben redaktionell prüfpflichtig.
- Quran-Foundation-Wortglossen haben beim Build Vorrang und überschreiben den Fallback positionsgenau, sobald ein vollständiger lokaler QF-Cache vorhanden ist.

### Tajwid - orthographische Reviewbasis
- Regelbasierte Review-Hinweise aus dem vorhandenen Uthmani-Text.
- Keine externe Tajwid-Datenbank kopiert.
- Datensatz: `content-src/quran-reader/tajweed/orthographic-review.json`.
- Status: `draft`; fachliche Prüfung erforderlich.

### Rezitationsaudio - Referenzen
- 6.236 externe Vers-Audio-Referenzen.
- Keine Audio-Bytes werden im Projekt redistribuiert.
- Datensatz: `content-src/quran-reader/recitation_audio/quranlab-reference.json`.

## Externer Entwicklungs-Sync

### Deutscher Tafsir - Muhammad Ibn Ahmad Ibn Rassoul
- Quelle: `Mylinde/Tafsir`, `tafsir-json/de_tafsir_complete.json`.
- Werk: *Tafsir Al-Qurʾan Al-Karim*, 41. Auflage.
- Weiterverwendung ist bei Quellenangabe vorgesehen; Attribution bleibt erhalten.
- Importziel: `content-src/quran-reader/tafsir/rassoul-de.json`.
- Importer: `scripts/import-tafsir-rassoul-de.py`.
- `scripts/sync-quran-external-content.py` lädt, validiert und migriert den Quellenbestand bei Bedarf.
- Der aktuelle Upstream liefert 6.086 eindeutige Versreferenzen (97,6 % der 6.236 Quranverse). Das ist Tafsir-Abdeckung, keine Qurantext-Lücke; fehlende Tafsir-Kommentare werden nicht künstlich erzeugt.

### 13-Zeilen-Mushaf - IndoPak / Quran Revision Companion
- Quelle: `Waqar144/quran_memorization_helper`.
- Repository-Lizenz: MIT.
- Quelldatei: `lib/quran_data/thirteen_line_indopak_layout.dart`.
- Erwartet: 847 Seiten mit `ayahIdx` + `wordStartInAyahIdx`.
- Importziel: `content-src/quran-reader/mushaf_13_line/indopak-waqar-mit.json`.
- Importer: `scripts/import-mushaf-13-line-dart.py`.
- Ohne erfolgreichen Download werden keine Zeilenpositionen erfunden.

## Weiteres Importziel

### Wortmorphologie - Quranic Arabic Corpus v0.4
- Importziel für Lemma, Wurzel und Morphologie ist registriert.
- Datensatz: `content-src/quran-reader/word_analysis/qac-v04.json`.
- Der offizielle Bezug erfordert zusätzliche Angaben; deshalb kein automatischer Download im Bundle.

## Reproduzierbare Befehle

```bash
python scripts/sync-quran-external-content.py --strict
python scripts/build-content.py
```

Manueller Import einer berechtigten Reader-Datei:

```bash
python scripts/import-quran-review-content.py --layer <layer> --entry <entry> --input <datei>
python scripts/build-content.py
```

## Freigaberegel
- `draft` / `referenced`: sichtbar und redaktionell testbar.
- `approved`: nur nach Quellen-, Inhalts- und Lizenzprüfung.
- Automatisch abgeleitete Wort-/Tajwid-Daten dürfen nicht allein aufgrund technischer Vollständigkeit auf `approved` gesetzt werden.

## Externe Referenzen
- CTAN `quran`: https://ctan.org/pkg/quran
- CTAN `quran-de`: https://ctan.org/pkg/quran-de
- Deutscher Tafsir: https://github.com/Mylinde/Tafsir
- MIT 13-line source: https://github.com/Waqar144/quran_memorization_helper
- QuranLab Audio-Metadaten: https://huggingface.co/datasets/quranlab/quran-audio
- Quranic Arabic Corpus: https://corpus.quran.com/download/


### Vahid Arabic/Ottoman Font
- Quelle: muctebanesiri/vahid-font
- Zweck: optionale arabische Schrift im türkisch/osmanischen Ruqʿa-Stil
- Lizenz: SIL Open Font License 1.1
- Die Fontdatei wird lokal durch die BAT synchronisiert und ist nicht im Source-ZIP gebündelt.

### Deutsche Wort-für-Wort-Übersetzungen
- Zielquelle: Quran Foundation Content API v4 (`language=de`, `words=true`).
- Synchronisation: lokal über `scripts/sync-quran-wbw-de.py`; benötigt `QF_CLIENT_ID` und `QF_CLIENT_SECRET`.
- Lizenz/Nutzung: Quran Foundation Developer Terms; App-Anzeige mit Attribution, keine separate Rohdaten-Redistribution.
- Das Source-ZIP enthält keine geschützten Quran-Foundation-Rohdaten. Stattdessen wird der lokale, aus bereits lizenzierten Projektdaten abgeleitete Offline-Fallback mitgeführt.

### Offline-Cache-Pipeline der deutschen Wortübersetzungen
- Rohantworten: `.cache/quran-external/qf-wbw-de/surah-001.json` bis `surah-114.json`.
- Normalisiertes lokales Importziel: `content-src/quran-reader/word_analysis/quran-foundation-wbw-de.json`.
- Runtime: nur über `public/content/quran-reader/surah/<NNN>.json`; kein `quran-reader.json`-Monolith.
- Fehlen QF-Credentials oder Cache, erzeugt `scripts/derive-quran-wbw-de.py` deterministisch 77.433 Offline-Fallback-Glosses; ein leerer Release-Datensatz ist nicht mehr zulässig.
- Der Cache ist lokale Build-/Sync-Infrastruktur und wird nicht mit Source-ZIPs verteilt.
