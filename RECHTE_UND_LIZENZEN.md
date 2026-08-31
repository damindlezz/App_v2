# Rechte- und Lizenzkonzept

## Projektcode und Lerninhalte

Für den projektspezifischen Quellcode und die selbst erstellten Lerninhalte ist derzeit bewusst keine öffentliche Open-Source-Lizenz hinterlegt. Vor einer Weitergabe außerhalb des eigenen Teams sollte der Rechteinhaber festgelegt und eine passende Lizenz- oder Nutzungsvereinbarung ergänzt werden.

Eine fehlende Projektlizenz bedeutet nicht, dass Drittanbieterhinweise entfallen. Die Hinweise in `THIRD_PARTY_NOTICES.md` müssen bei einer Veröffentlichung berücksichtigt werden.

## Vor einer öffentlichen oder kommerziellen Veröffentlichung

Zu prüfen sind insbesondere:

- Name und Logo der App auf mögliche Markenüberschneidungen
- fachliche und urheberrechtliche Freigabe aller Lerntexte, Beispiele und Übersetzungen
- Lizenzen später ergänzter Audioaufnahmen, Bilder, Videos und Schriftdateien
- vollständiger Lizenzbericht aller installierten npm- und Cargo-Abhängigkeiten
- Datenschutz- und Einwilligungstexte für die lokale Mikrofonaufnahme sowie erneut bei späterer Cloud-Synchronisation oder Nutzerkonten

## Erweiterte v0.12-Vokabeln

451 `extended`-Einträge werden aus lokal verfügbarer Babel/CLDR-Lokalisierungsinformation erzeugt. Sie bleiben `draft`; vor öffentlicher Distribution sind sowohl sprachliche Freigabe als auch die vollständigen Drittanbieter-/Lizenzhinweise zu prüfen.

## Aktueller technischer Stand

- keine gebündelten Schriftdateien
- keine kopierten Bildbibliotheken oder UI-Templates im Projekt
- Offline-Kernoberfläche ohne externe UI-Ressourcen; Quran-Audio und Entwicklungs-Sync verwenden optionale externe Quellen
- direkte Abhängigkeiten mit permissiven Upstream-Lizenzen dokumentiert

Diese Aussagen beziehen sich auf den geprüften Projektstand v0.13.0 und sind keine juristische Garantie.


### Vahid Arabic/Ottoman Font
- Quelle: muctebanesiri/vahid-font
- Zweck: optionale arabische Schrift im türkisch/osmanischen Ruqʿa-Stil
- Lizenz: SIL Open Font License 1.1
- Die Fontdatei wird lokal durch die BAT synchronisiert und ist nicht im Source-ZIP gebündelt.
