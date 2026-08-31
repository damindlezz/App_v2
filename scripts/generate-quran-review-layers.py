#!/usr/bin/env python3
"""Generate review-ready Quran reader layers from locally redistributable sources.

This script intentionally does not invent lexical morphology or a physical Mushaf
layout. It creates:
- German verse translation from TeX Live qurantext-de.translation.def.
- Stable word tokens from the bundled Uthmani Quran text.
- Conservative, deterministic Tajwid review hints derived from orthography.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QURAN_PATH = ROOT / "content-src/quran-reader/quran_text/uthmani-texlive-quran.json"
TRANSLATION_SOURCE = Path("/usr/share/texlive/texmf-dist/tex/latex/quran/qurantext-de.translation.def")
TRANSLATION_OUT = ROOT / "content-src/quran-reader/translation/abu-reda-de-texlive.json"
WORDS_OUT = ROOT / "content-src/quran-reader/word_analysis/uthmani-token-review.json"
TAJWEED_OUT = ROOT / "content-src/quran-reader/tajweed/orthographic-review.json"
MUSHAF_OUT = ROOT / "content-src/quran-reader/mushaf_13_line/indopak-waqar-mit.json"

TRANSLATION_RE = re.compile(
    r"^\\qt@newcmd\\qurantrans@de@[^\{]+\{(.*)\\qt@no\{\((\d+)\)\}\}%?$"
)

SUN_LETTERS = set("\u062a\u062b\u062f\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0644\u0646")
IKHFA_LETTERS = set("\u062a\u062b\u062c\u062f\u0630\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0641\u0642\u0643")
IDGHAM_GHUNNAH = set("\u064a\u0646\u0645\u0648")
IDGHAM_NO_GHUNNAH = set("\u0644\u0631")
QALQALAH = set("\u0642\u0637\u0628\u062c\u062f")
SHADDA = "\u0651"
SUKUN = "\u0652"
TANWIN = set("\u064b\u064c\u064d")
MADDAH = "\u0653"
DAGGER_ALEF = "\u0670"
ALEF_WASLA = "\u0671"


def dump(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def has_letter(token: str) -> bool:
    return any(unicodedata.category(ch).startswith("L") for ch in token)


def tokenize_ayah(text: str) -> list[str]:
    """Keep Quranic pause marks by attaching standalone marks to the previous word."""
    words: list[str] = []
    for token in text.split():
        if has_letter(token):
            words.append(token)
        elif words:
            words[-1] += " " + token
    return words


def letter_groups(token: str) -> list[tuple[str, str]]:
    groups: list[list[str]] = []
    for ch in token:
        if unicodedata.category(ch).startswith("L"):
            groups.append([ch, ""])
        elif groups:
            groups[-1][1] += ch
    return [(base, marks) for base, marks in groups]


def normalize_translation(text: str) -> str:
    text = text.replace("\\basmalahde", "").strip()
    # TeX-style quotation marks are presentation syntax, not semantic content.
    text = text.replace("``", "\u201e").replace('"', "\u201c")
    return re.sub(r"\s+", " ", text).strip()


def build_translation(references: list[str]) -> list[dict]:
    if not TRANSLATION_SOURCE.is_file():
        raise SystemExit(f"Missing translation source: {TRANSLATION_SOURCE}")
    rows: list[str] = []
    for line in TRANSLATION_SOURCE.read_text(encoding="utf-8").splitlines():
        match = TRANSLATION_RE.match(line)
        if match:
            rows.append(normalize_translation(match.group(1)))
    if len(rows) != len(references):
        raise SystemExit(f"Translation record count mismatch: {len(rows)} != {len(references)}")
    return [
        {
            "id": f"translation_abu_reda_{ref.replace(':', '_')}",
            "reference": ref,
            "text": text,
        }
        for ref, text in zip(references, rows, strict=True)
    ]


def add_annotation(
    target: list[dict], seen: set[tuple], reference: str, rule: str, explanation: str,
    start_word: int, end_word: int, text: str,
) -> None:
    key = (reference, rule, start_word, end_word, text)
    if key in seen:
        return
    seen.add(key)
    slug = re.sub(r"[^a-z0-9]+", "_", rule.lower()).strip("_") or "rule"
    target.append({
        "id": f"tajweed_review_{reference.replace(':', '_')}_{slug}_{start_word}_{end_word}",
        "reference": reference,
        "rule": rule,
        "explanation": explanation,
        "startWord": start_word,
        "endWord": end_word,
        "text": text,
    })


def build_words_and_tajweed(ayahs: list[dict]) -> tuple[list[dict], list[dict]]:
    word_records: list[dict] = []
    tajweed: list[dict] = []
    seen: set[tuple] = set()

    for ayah in ayahs:
        reference = ayah["reference"]
        words = tokenize_ayah(ayah["text"])
        for index, word in enumerate(words, start=1):
            word_records.append({
                "id": f"quran_word_{reference.replace(':', '_')}_{index}",
                "reference": reference,
                "wordIndex": index,
                "text": word,
            })

        groups_by_word = [letter_groups(word) for word in words]
        for index, (word, groups) in enumerate(zip(words, groups_by_word, strict=True), start=1):
            if any(base in {"\u0646", "\u0645"} and SHADDA in marks for base, marks in groups):
                add_annotation(
                    tajweed, seen, reference, "Ghunnah",
                    "Automatisch aus Nun/Mim mit Schadda erkannt; redaktionell pruefen.",
                    index, index, word,
                )

            if any(base in QALQALAH and SUKUN in marks for base, marks in groups):
                add_annotation(
                    tajweed, seen, reference, "Qalqalah",
                    "Automatisch aus einem Qalqalah-Buchstaben mit Sukun erkannt; redaktionell pruefen.",
                    index, index, word,
                )

            if any(MADDAH in marks or DAGGER_ALEF in marks for _, marks in groups):
                add_annotation(
                    tajweed, seen, reference, "Madd (Review)",
                    "Orthographischer Madd-Hinweis; Madd-Art und Laenge redaktionell bestimmen.",
                    index, index, word,
                )

            if ALEF_WASLA in word:
                add_annotation(
                    tajweed, seen, reference, "Hamzat al-Wasl",
                    "Hamzat al-Wasl im Uthmani-Text erkannt; Leseregel kontextbezogen pruefen.",
                    index, index, word,
                )

            for gi in range(len(groups) - 2):
                a, b, c = groups[gi], groups[gi + 1], groups[gi + 2]
                if a[0] == ALEF_WASLA and b[0] == "\u0644" and c[0] in SUN_LETTERS and SHADDA in c[1] and "\u0671\u0644\u0644\u0651\u064e\u0647" not in word:
                    add_annotation(
                        tajweed, seen, reference, "Lam Shamsiyyah",
                        "Artikel-Lam vor Sonnenbuchstaben mit Schadda erkannt; redaktionell pruefen.",
                        index, index, word,
                    )
                    break

        # Cross-word rules: conservative final Nun/Tanwin/Mim-sakin + next initial letter.
        for pos in range(len(words) - 1):
            current_groups = groups_by_word[pos]
            next_groups = groups_by_word[pos + 1]
            if not current_groups or not next_groups:
                continue
            current_word = words[pos]
            next_word = words[pos + 1]
            last_base, last_marks = current_groups[-1]
            next_base = next_groups[0][0]
            start = pos + 1
            end = pos + 2
            span_text = f"{current_word} {next_word}"
            has_nun_sakin_or_tanwin = (last_base == "\u0646" and SUKUN in last_marks) or any(mark in last_marks for mark in TANWIN)
            if has_nun_sakin_or_tanwin:
                if next_base == "\u0628":
                    rule = "Iqlab"
                elif next_base in IDGHAM_GHUNNAH:
                    rule = "Idgham mit Ghunnah"
                elif next_base in IDGHAM_NO_GHUNNAH:
                    rule = "Idgham ohne Ghunnah"
                elif next_base in IKHFA_LETTERS:
                    rule = "Ikhfa"
                else:
                    rule = ""
                if rule:
                    add_annotation(
                        tajweed, seen, reference, rule,
                        "Automatisch aus Nun sakin/Tanwin und dem Folgebuchstaben erkannt; redaktionell pruefen.",
                        start, end, span_text,
                    )
            if last_base == "\u0645" and SUKUN in last_marks:
                if next_base == "\u0628":
                    add_annotation(
                        tajweed, seen, reference, "Ikhfa Shafawi",
                        "Automatisch aus Mim sakin vor Ba erkannt; redaktionell pruefen.",
                        start, end, span_text,
                    )
                elif next_base == "\u0645":
                    add_annotation(
                        tajweed, seen, reference, "Idgham Shafawi",
                        "Automatisch aus Mim sakin vor Mim erkannt; redaktionell pruefen.",
                        start, end, span_text,
                    )
    return word_records, tajweed


def main() -> None:
    quran = json.loads(QURAN_PATH.read_text(encoding="utf-8"))
    ayahs = quran.get("records", [])
    if len(ayahs) != 6236:
        raise SystemExit(f"Expected 6236 ayahs, got {len(ayahs)}")
    references = [str(row["reference"]) for row in ayahs]
    if len(set(references)) != 6236:
        raise SystemExit("Quran references are not unique")

    today = datetime.now(timezone.utc).date().isoformat()
    translation = build_translation(references)
    words, tajweed = build_words_and_tajweed(ayahs)

    dump(TRANSLATION_OUT, {
        "schemaVersion": 1,
        "layerId": "translation",
        "entryId": "translation_abu_reda_de_texlive",
        "records": translation,
        "updatedAt": today,
    })
    dump(WORDS_OUT, {
        "schemaVersion": 1,
        "layerId": "word_analysis",
        "entryId": "word_analysis_uthmani_token_review",
        "records": words,
        "updatedAt": today,
    })
    dump(TAJWEED_OUT, {
        "schemaVersion": 1,
        "layerId": "tajweed",
        "entryId": "tajweed_orthographic_review",
        "records": tajweed,
        "updatedAt": today,
    })
    if not MUSHAF_OUT.exists():
        dump(MUSHAF_OUT, {
            "schemaVersion": 1,
            "layerId": "mushaf_13_line",
            "entryId": "mushaf_13line_indopak_waqar_mit",
            "records": [],
            "updatedAt": today,
        })

    print(f"translation={len(translation)}")
    print(f"words={len(words)}")
    print(f"tajweed={len(tajweed)}")
    print("mushaf_13_line=0 (MIT source identified; remote payload not bundled in isolated build)")


if __name__ == "__main__":
    main()
