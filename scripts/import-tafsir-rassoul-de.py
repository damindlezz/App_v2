#!/usr/bin/env python3
"""Import the German Tafsir Al-Quran Al-Karim JSON into the Quran reader layer.

The source work explicitly permits reproduction/reprint/translation when the source is cited.
The upstream JSON may contain grouped verse ranges; this importer expands each group to
verse-level records and converts the HTML payload to readable plain text.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]
EXPECTED_AYAHS = sum(AYAH_COUNTS)
MIN_TAFSIR_RECORDS = 6086
REF_RE = re.compile(r"^(\d{1,3}):(\d{1,3})$")


class PlainTextParser(HTMLParser):
    BLOCKS = {"p", "div", "h1", "h2", "h3", "h4", "li", "br", "blockquote"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag.lower() in self.BLOCKS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def plain_text(value: str) -> str:
    parser = PlainTextParser()
    parser.feed(value)
    text = html.unescape("".join(parser.parts)).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    return "\n\n".join(line for line in lines if line)


def valid_reference(ref: str) -> bool:
    match = REF_RE.match(ref)
    if not match:
        return False
    surah, ayah = map(int, match.groups())
    return 1 <= surah <= len(AYAH_COUNTS) and 1 <= ayah <= AYAH_COUNTS[surah - 1]


def walk_entries(node):
    if isinstance(node, dict):
        if isinstance(node.get("text"), str) and (node.get("verse_key") or node.get("verses")):
            yield node
        for value in node.values():
            yield from walk_entries(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk_entries(value)


def references_for(entry: dict) -> list[str]:
    refs = entry.get("verses")
    if isinstance(refs, list):
        result = [str(value).strip() for value in refs if valid_reference(str(value).strip())]
        if result:
            return result
    ref = str(entry.get("verse_key", "")).strip()
    return [ref] if valid_reference(ref) else []


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="de_tafsir_complete.json")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("content-src/quran-reader/tafsir/rassoul-de.json"),
    )
    parser.add_argument("--quran-ayahs", type=int, default=EXPECTED_AYAHS)
    parser.add_argument("--min-commented-ayahs", type=int, default=MIN_TAFSIR_RECORDS)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    by_ref: dict[str, list[str]] = {}
    for entry in walk_entries(payload):
        text = plain_text(str(entry.get("text", "")))
        if not text:
            continue
        for ref in references_for(entry):
            bucket = by_ref.setdefault(ref, [])
            if text not in bucket:
                bucket.append(text)

    if len(by_ref) < args.min_commented_ayahs or len(by_ref) > args.quran_ayahs:
        raise SystemExit(
            f"Unerwartete Tafsir-Abdeckung: {len(by_ref)} Versreferenzen "
            f"(erwarteter Bereich {args.min_commented_ayahs}–{args.quran_ayahs}). Quelle nicht migriert."
        )

    def sort_key(ref: str) -> tuple[int, int]:
        surah, ayah = ref.split(":", 1)
        return int(surah), int(ayah)

    records = []
    for ref in sorted(by_ref, key=sort_key):
        surah, ayah = ref.split(":", 1)
        records.append(
            {
                "id": f"tafsir_rassoul_de_{surah}_{ayah}",
                "reference": ref,
                "title": "Tafsir Al-Quran Al-Karim - M. Ibn Rassoul",
                "text": "\n\n".join(by_ref[ref]),
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "layerId": "tafsir",
                "entryId": "tafsir_rassoul_de",
                "sourceId": "src_tafsir_rassoul_de",
                "coverage": {
                    "commentedVerseReferences": len(records),
                    "quranVerseCount": args.quran_ayahs,
                    "coveragePercent": round(len(records) / args.quran_ayahs * 100, 2) if args.quran_ayahs else 0,
                },
                "records": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    percent = len(records) / args.quran_ayahs * 100 if args.quran_ayahs else 0
    print(f"Importiert: {len(records)} deutsche Tafsir-Zuordnungen / {args.quran_ayahs} Quranverse ({percent:.1f}% Quellenabdeckung) -> {args.output}")


if __name__ == "__main__":
    main()
