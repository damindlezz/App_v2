# Inhaltspflege v0.24

## P3 Review-Gate

1. `python scripts/build-content.py`
2. `node scripts/p3-content-audit.mjs`
3. Exakte Quellen-/Claim-Pruefungen ausschliesslich in `content-src/editorial/source-verification.json` dokumentieren.
4. Keine Citation auf `direct_support` setzen, solange Fundstelle und zugehoeriger Claim nicht explizit verifiziert wurden.

## Quran-Morphologie

Offizielle Quranic-Arabic-Corpus-v0.4-Morphologiedatei gemaess deren Bezugs-/Lizenzbedingungen beschaffen. Danach:

`python scripts/import-qac-morphology.py <pfad-zur-offiziellen-datei>`

Anschliessend den Content-Build erneut ausfuehren. Fehlende Lemma-/Wurzel-/Morphologiefelder werden im UI automatisch ausgeblendet.
