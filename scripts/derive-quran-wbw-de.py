#!/usr/bin/env python3
"""Generate deterministic German Quran word glosses for offline fallback use.

The fallback uses only content already shipped with the project:
- the LPPL Uthmani token layer
- the LPPL German Abu Reda / Ibn Rassoul verse translation

It performs a corpus-wide monotonic statistical alignment. The result is explicitly
marked as derived/draft and is overridden by Quran Foundation WBW data when present.
"""
from __future__ import annotations

import json
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS_PATH = ROOT / "content-src/quran-reader/word_analysis/uthmani-token-review.json"
TRANSLATION_PATH = ROOT / "content-src/quran-reader/translation/abu-reda-de-texlive.json"
OUT = ROOT / "content-src/quran-reader/word_analysis/abureda-derived-wbw-de.json"
EXPECTED_WORDS = 77433
GERMAN_TOKEN_RE = re.compile(r"[A-Za-zÄÖÜäöüßẞ]+(?:['’][A-Za-zÄÖÜäöüßẞ]+)?|\d+")
ARABIC_MARKS = re.compile(r"[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]")
PREFIX_WORDS = {
    "der", "die", "das", "des", "dem", "den", "ein", "eine", "einer", "eines", "einem", "einen",
    "im", "am", "ins", "zum", "zur", "vom", "von", "zu", "auf", "in", "aus", "mit", "für", "um",
    "ohne", "bei", "an", "als", "kein", "keine", "keinen", "keinem", "keiner", "weder", "außer",
}


def read_records(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("records", []) if isinstance(payload, dict) else []
    return [row for row in records if isinstance(row, dict)]


def write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".tmp-{os.getpid()}")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    tmp.replace(path)


def normalize_arabic(value: str) -> str:
    text = unicodedata.normalize("NFKC", value)
    text = ARABIC_MARKS.sub("", text).replace("ـ", "")
    for source, target in (("ٱ", "ا"), ("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ى", "ي"), ("ؤ", "و"), ("ئ", "ي")):
        text = text.replace(source, target)
    return re.sub(r"[^\u0621-\u064a]", "", text)


def german_tokens(value: str) -> list[str]:
    return GERMAN_TOKEN_RE.findall(value)


def german_key(value: str) -> str:
    return value.casefold().replace("ß", "ss")


def build_lexicon(words_by_ref: dict[str, list[dict]], translations: dict[str, str]) -> dict[str, dict[str, float]]:
    pair_scores: dict[tuple[str, str], float] = defaultdict(float)
    german_frequency: Counter[str] = Counter()
    for reference, words in words_by_ref.items():
        translated = german_tokens(translations.get(reference, ""))
        if not translated or not words:
            continue
        german_normalized = [german_key(token) for token in translated]
        german_frequency.update(german_normalized)
        word_count = len(words)
        german_count = len(translated)
        for index, word in enumerate(words):
            arabic = normalize_arabic(str(word.get("text", "")))
            if not arabic:
                continue
            relative_arabic = (index + 0.5) / word_count
            for german_index, german in enumerate(german_normalized):
                distance = abs(relative_arabic - ((german_index + 0.5) / german_count))
                pair_scores[(arabic, german)] += math.exp(-5.0 * distance)

    lexicon: dict[str, dict[str, float]] = defaultdict(dict)
    for (arabic, german), score in pair_scores.items():
        # Penalize ubiquitous German words without eliminating legitimate particles.
        lexicon[arabic][german] = math.log1p(score) - 0.55 * math.log1p(german_frequency[german])
    return lexicon


def proportional_anchors(word_count: int, german_count: int) -> list[int]:
    if german_count <= 0:
        return [0] * word_count
    return [min(german_count - 1, max(0, round(((index + 0.5) * german_count / word_count) - 0.5))) for index in range(word_count)]


def monotonic_anchors(words: list[dict], translated: list[str], lexicon: dict[str, dict[str, float]]) -> list[int]:
    n, m = len(words), len(translated)
    if not n or not m or m < n:
        return proportional_anchors(n, m)
    normalized_german = [german_key(token) for token in translated]
    negative = -1e18
    scores = [[negative] * m for _ in range(n)]
    previous: list[list[int | None]] = [[None] * m for _ in range(n)]

    first_arabic = normalize_arabic(str(words[0].get("text", "")))
    for german_index, german in enumerate(normalized_german):
        if m - german_index < n:
            continue
        positional = -2.0 * abs((0.5 / n) - ((german_index + 0.5) / m))
        scores[0][german_index] = lexicon.get(first_arabic, {}).get(german, -3.0) + positional - (0.02 * german_index)

    for arabic_index in range(1, n):
        arabic = normalize_arabic(str(words[arabic_index].get("text", "")))
        best_score = negative
        best_index: int | None = None
        for german_index in range(m):
            prior_index = german_index - 1
            if prior_index >= 0 and scores[arabic_index - 1][prior_index] > best_score:
                best_score = scores[arabic_index - 1][prior_index]
                best_index = prior_index
            if best_index is None or m - german_index < n - arabic_index:
                continue
            german = normalized_german[german_index]
            positional = -2.0 * abs(((arabic_index + 0.5) / n) - ((german_index + 0.5) / m))
            scores[arabic_index][german_index] = best_score + lexicon.get(arabic, {}).get(german, -3.0) + positional
            previous[arabic_index][german_index] = best_index

    candidates = [(scores[n - 1][j] - (0.02 * (m - 1 - j)), j) for j in range(m) if scores[n - 1][j] > negative / 2]
    if not candidates:
        return proportional_anchors(n, m)
    final_index = max(candidates)[1]
    anchors = [0] * n
    anchors[-1] = final_index
    for arabic_index in range(n - 1, 0, -1):
        prior = previous[arabic_index][anchors[arabic_index]]
        if prior is None:
            return proportional_anchors(n, m)
        anchors[arabic_index - 1] = prior
    return anchors


def aligned_phrase(words: list[dict], translated: list[str], anchors: list[int], index: int) -> str:
    if not translated:
        return ""
    anchor = min(len(translated) - 1, max(0, anchors[index]))
    if len(translated) < len(words):
        return translated[anchor]

    start = 0 if index == 0 else (anchors[index - 1] + anchor + 1) // 2
    end = len(translated) if index == len(words) - 1 else (anchor + anchors[index + 1] + 1) // 2
    start = max(0, min(start, anchor))
    end = max(anchor + 1, min(len(translated), end))
    span = translated[start:end]
    anchor_offset = anchor - start

    if len(span) <= 2:
        return " ".join(span).strip()
    phrase = span[anchor_offset]
    if anchor_offset > 0 and german_key(span[anchor_offset - 1]) in PREFIX_WORDS:
        phrase = f"{span[anchor_offset - 1]} {phrase}"
    return phrase.strip()


def main() -> int:
    word_records = read_records(TOKENS_PATH)
    translation_records = read_records(TRANSLATION_PATH)
    if len(word_records) != EXPECTED_WORDS:
        raise SystemExit(f"Wortbasis unvollständig: {len(word_records)} != {EXPECTED_WORDS}")
    translations = {str(row.get("reference", "")): str(row.get("text", "")).strip() for row in translation_records if row.get("reference") and row.get("text")}
    if len(translations) != 6236:
        raise SystemExit(f"Deutsche Versübersetzung unvollständig: {len(translations)} != 6236")

    words_by_ref: dict[str, list[dict]] = defaultdict(list)
    for word in word_records:
        words_by_ref[str(word.get("reference", ""))].append(word)
    for words in words_by_ref.values():
        words.sort(key=lambda row: int(row.get("wordIndex", 0) or 0))

    lexicon = build_lexicon(words_by_ref, translations)
    output: list[dict] = []
    missing: list[str] = []
    for reference, words in words_by_ref.items():
        translated = german_tokens(translations.get(reference, ""))
        anchors = monotonic_anchors(words, translated, lexicon)
        for index, word in enumerate(words):
            gloss = aligned_phrase(words, translated, anchors, index)
            if not gloss:
                missing.append(f"{reference}:{word.get('wordIndex')}")
                continue
            output.append({
                "id": f"derived_wbw_de_{reference.replace(':', '_')}_{int(word.get('wordIndex', 0))}",
                "reference": reference,
                "wordIndex": int(word.get("wordIndex", 0)),
                "text": str(word.get("text", "")).strip() or "—",
                "translation": gloss,
                "translationOrigin": "derived_abureda_alignment",
                "reviewStatus": "draft",
            })

    if missing or len(output) != EXPECTED_WORDS:
        raise SystemExit(f"Abgeleitete Wortübersetzung unvollständig: {len(output)}/{EXPECTED_WORDS}; fehlend: {missing[:5]}")
    output.sort(key=lambda row: tuple(int(part) for part in row["reference"].split(":")) + (row["wordIndex"],))
    write_json_atomic(OUT, {
        "schemaVersion": 1,
        "datasetId": "word_analysis_abureda_derived_wbw_de",
        "sourceId": "src_quran_wbw_de_derived_abureda",
        "derivation": {
            "method": "corpus-wide monotonic statistical alignment",
            "sourceTranslation": "translation_abu_reda_de_texlive",
            "sourceTokens": "word_analysis_uthmani_token_review",
            "reviewStatus": "draft",
        },
        "records": output,
    })
    print(f"[OK] Deutsche Offline-Wortglossen: {len(output)} abgeleitete Token erzeugt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
