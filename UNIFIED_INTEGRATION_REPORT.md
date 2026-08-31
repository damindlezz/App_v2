# NUR 4.4 - Unified Reference UI Integration

## Ziel

Das Referenzdesign aus `App Aufbau.zip` / `UI-Referenz.tar` ist nicht als zweite App eingebettet. Es wurde als visuelle Huelle in die bestehende NUR-4.4-Runtime integriert. Datenmodell, Content-Pipeline, Review-Planner, Hifz, Quran-Reader, Lernpfade, Persistenz und Exercise Engine bleiben die kanonischen Funktionsquellen.

## Integriert

- Referenz-Navigation: Heute, Lernen, Mushaf, Training, Fortschritt.
- Lernfach-Popover fuer Arabisch, Quran/Tajwid, Hifz, Fiqh und Hadith.
- Direkter Zugriff auf Bibliothek, Quellen, Review und Einstellungen.
- Gruen/Gold-Design, Girih-/Noise-/Glow-Ebenen, ornamentale Panels und responsive Mobile-Navigation.
- Referenz-Dashboard: Vier-Etappen-Methode, persoenlicher Salah-Zeitplaner, digitaler Tasbih.
- Quran/Hifz/Module/Training werden visuell in dieselbe Designfamilie gezogen.
- Footer als Wissens-/Werkzeug-Navigation, auf Fokus-Routen bewusst ausgeblendet.
- Reduced-Motion-Unterstuetzung fuer dekorative Effekte.

## Funktionen und Uebungen

Die Referenzideen werden mit bestehenden Engines verbunden statt dupliziert:

- Karteikarten / Wiederholen -> kanonischer Review Planner und SRS.
- Quiz-Arena -> Exercise Engine.
- Hifz Wort-fuer-Wort -> Hifz-/Ayah-Evidenz und Quran-Interaktionen.
- Tajwid-Quiz -> `quran_tajweed`.
- Hoeren -> `vocabulary_listening`, `grammar_listening`, `reading_listening`.
- Sprechen -> `speaking_shadowing`.
- Schreiben -> Trace, Copy, Input und Dictation.
- Satzbau / Drag -> `sentence_builder`.
- Luecken -> `grammar_cloze`.
- Zuordnen -> `vocabulary_matching`.
- Hadith-Analyse und Fiqh-Vergleich bleiben quellengebundene Knowledge-Varianten.

Der Registry-Vertrag enthaelt 33 registrierte Type/Variant-Kombinationen. Die Startseite des Trainings hebt acht visuell passende Einstiege hervor; der volle Registry-Katalog bleibt erreichbar.

## Neue lokale Werkzeuge

### Salah-Zeitplaner

- manuelle Uhrzeiten pro Gebet;
- lokale Persistenz im Browser;
- keine automatische Gebetszeitberechnung ohne explizite Methode/Standort.

### Tasbih

- Zaehler mit 33er-Ziel;
- Dhikr-Wechsel;
- Reset;
- lokale Persistenz.

## Architekturregel

Kein zweites Progress-, Review-, Hifz- oder Quran-Datenmodell wurde eingefuehrt. Das verhindert abweichende Lernstaende zwischen Referenzoberflaeche und produktiver Runtime.
