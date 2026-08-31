#!/usr/bin/env python3
"""Import the MIT 13-line IndoPak page anchors and render readable line text.

The upstream layout stores Page(pageNum, [Line(ayahIdx, wordStartInAyahIdx), ...]).
Line text is reconstructed locally from the already bundled Quran text. The authoritative
page/line anchors are preserved unchanged; no page breaks are invented.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]
TOTAL_AYAHS = sum(AYAH_COUNTS)
BASMALLAH = "\u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u064e\u0651\u0647\u0650 \u0671\u0644\u0631\u064e\u0651\u062d\u0652\u0645\u064e\u0640\u0670\u0646\u0650 \u0671\u0644\u0631\u064e\u0651\u062d\u0650\u064a\u0645\u0650"
SURAH_LABEL = "\u0633\u064f\u0648\u0631\u064e\u0629"
SURAH_NAMES = ["الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس", "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه", "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم", "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر", "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق", "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة", "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج", "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس", "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد", "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات", "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر", "المسد", "الإخلاص", "الفلق", "الناس"]


def ref_for_abs(idx: int) -> str:
    if idx < 0 or idx >= TOTAL_AYAHS:
        return ""
    n = idx
    for surah, count in enumerate(AYAH_COUNTS, 1):
        if n < count:
            return f"{surah}:{n + 1}"
        n -= count
    return ""


def surah_for_abs(idx: int) -> int | None:
    ref = ref_for_abs(idx)
    return int(ref.split(":", 1)[0]) if ref else None


def special_kind(word_start: int) -> str:
    if word_start == -999:
        return "basmallah"
    return "surah_name"


def parse_layout(text: str) -> list[tuple[int, list[tuple[int, int]]]]:
    pages = []
    for page_match in re.finditer(r"Page\(\s*(\d+)\s*,\s*\[(.*?)\]\s*\)", text, re.S):
        page = int(page_match.group(1))
        lines = []
        for line_match in re.finditer(r"Line\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)", page_match.group(2)):
            lines.append((int(line_match.group(1)), int(line_match.group(2))))
        pages.append((page, lines))
    return pages


def load_quran(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload.get("records", []) if isinstance(payload, dict) else []
    if len(records) != TOTAL_AYAHS:
        raise SystemExit(f"Qurantext unvollstaendig: {len(records)}/{TOTAL_AYAHS} Verse.")
    return records


def build_word_index(quran_records: list[dict]):
    words_by_ayah: list[list[str]] = []
    refs: list[str] = []
    flat: list[tuple[int, int, str, str]] = []
    coord_to_flat: dict[tuple[int, int], int] = {}
    for ayah_idx, record in enumerate(quran_records):
        ref = str(record.get("reference", "")).strip()
        expected = ref_for_abs(ayah_idx)
        if ref != expected:
            raise SystemExit(f"Qurantext-Reihenfolge ungueltig bei Index {ayah_idx}: {ref!r} != {expected!r}")
        words = str(record.get("text", "")).split()
        if not words:
            raise SystemExit(f"Quranvers {ref} enthaelt keine Woerter.")
        refs.append(ref)
        words_by_ayah.append(words)
        for word_idx, word in enumerate(words):
            coord_to_flat[(ayah_idx, word_idx)] = len(flat)
            flat.append((ayah_idx, word_idx, ref, word))
    return words_by_ayah, refs, flat, coord_to_flat


def next_regular_anchor(anchors: list[tuple[int, int, int, int]], index: int):
    for candidate in anchors[index + 1:]:
        if candidate[2] >= 0 and candidate[3] >= 0:
            return candidate
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="thirteen_line_indopak_layout.dart")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("content-src/quran-reader/mushaf_13_line/indopak-waqar-mit.json"),
    )
    parser.add_argument(
        "--quran-text",
        type=Path,
        default=Path("content-src/quran-reader/quran_text/uthmani-texlive-quran.json"),
    )
    parser.add_argument("--expected-pages", type=int, default=847)
    args = parser.parse_args()

    pages = parse_layout(args.input.read_text(encoding="utf-8"))
    if not pages:
        raise SystemExit("Keine Page(...)/Line(...)-Daten gefunden.")
    if args.expected_pages and len(pages) != args.expected_pages:
        raise SystemExit(f"Erwartet {args.expected_pages} Seiten, gefunden {len(pages)}.")
    for page, lines in pages:
        if len(lines) > 13:
            raise SystemExit(f"Seite {page}: {len(lines)} Zeilen > 13.")

    quran_records = load_quran(args.quran_text)
    _, refs, flat, coord_to_flat = build_word_index(quran_records)
    anchors = [
        (page, line_no, ayah_idx, word_start)
        for page, lines in pages
        for line_no, (ayah_idx, word_start) in enumerate(lines, 1)
    ]

    records = []
    for anchor_index, (page, line_no, ayah_idx, word_start) in enumerate(anchors):
        ref = ref_for_abs(ayah_idx)
        line_type = "ayah" if ayah_idx >= 0 else special_kind(word_start)
        text = ""
        end_ref = ref
        surah_number = surah_for_abs(ayah_idx)

        if line_type == "basmallah":
            text = BASMALLAH
        elif line_type == "surah_name":
            # The upstream marker encodes the zero-based surah index in the second value:
            # Line(-1, 0) -> surah 1, Line(-1, -1) -> surah 2, ... Line(-1, -113) -> surah 114.
            surah_number = abs(word_start) + 1
            if not 1 <= surah_number <= len(SURAH_NAMES):
                raise SystemExit(f"Seite {page}, Zeile {line_no}: ungueltiger Surenmarker {word_start}.")
            following = next_regular_anchor(anchors, anchor_index)
            if following:
                following_ref = ref_for_abs(following[2])
                expected_ref = f"{surah_number}:1"
                if following_ref != expected_ref or following[3] != 0:
                    raise SystemExit(
                        f"Seite {page}, Zeile {line_no}: Surenmarker {surah_number} passt nicht "
                        f"zum Folgeanker {following_ref} / Wort {following[3]}."
                    )
            surah_name = SURAH_NAMES[surah_number - 1]
            text = f"{SURAH_LABEL}ُ {surah_name}"
        else:
            start_index = coord_to_flat.get((ayah_idx, word_start))
            if start_index is None:
                raise SystemExit(
                    f"Seite {page}, Zeile {line_no}: Wortanker ({ayah_idx}, {word_start}) "
                    "passt nicht zum eingebetteten Qurantext."
                )
            following = next_regular_anchor(anchors, anchor_index)
            end_index = len(flat)
            if following:
                end_index = coord_to_flat.get((following[2], following[3]), -1)
                if end_index < 0:
                    raise SystemExit(
                        f"Folgeanker ({following[2]}, {following[3]}) passt nicht zum eingebetteten Qurantext."
                    )
            if end_index <= start_index:
                raise SystemExit(f"Seite {page}, Zeile {line_no}: nicht-monotone Wortanker.")
            segment = flat[start_index:end_index]
            text = " ".join(item[3] for item in segment)
            end_ref = segment[-1][2]

        item = {
            "id": f"m13_{page}_{line_no}",
            "page": page,
            "line": line_no,
            "reference": ref,
            "startReference": ref,
            "endReference": end_ref,
            "lineType": line_type,
            "alignment": "center" if ayah_idx < 0 else "justify",
            "sourceAyahIndex": ayah_idx,
            "sourceWordStartIndex": word_start,
            "text": text,
        }
        if surah_number:
            item["surahNumber"] = surah_number
        records.append(item)

    surah_headers = [row for row in records if row.get("lineType") == "surah_name"]
    header_numbers = [row.get("surahNumber") for row in surah_headers]
    if header_numbers != list(range(1, 115)):
        raise SystemExit(
            "13-Zeilen-Layout: Surenueberschriften unvollstaendig oder falsch sortiert "
            f"({len(surah_headers)}/114)."
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "layoutRevision": 3,
                "datasetId": "mushaf_13line_indopak_waqar_mit",
                "sourceId": "src_mushaf_13line_waqar_mit",
                "records": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Importiert: {len(pages)} Seiten / {len(records)} Zeilen -> {args.output}")
    print("Zeilentext lokal aus dem eingebetteten Qurantext anhand der MIT-Layoutanker rekonstruiert.")


if __name__ == "__main__":
    main()
