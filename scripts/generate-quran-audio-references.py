#!/usr/bin/env python3
"""Generate verse-level external audio references without redistributing recordings.

QuranLab documents audio_url rows as reference-only metadata. The audio bytes remain
copyrighted by the reciter/producer and are streamed from the original public source.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]
EXPECTED_AYAHS = sum(AYAH_COUNTS)
DEFAULT_RECITATION_ID = "abdul-basit"
DEFAULT_DIR = "Abdul_Basit_Murattal_64kbps"
DEFAULT_QARI = "Abdul Basit Abdus Samad"


def read_recitation(path: Path, recitation_id: str) -> tuple[str, str]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        if str(row.get("recitation_id", "")).strip() != recitation_id:
            continue
        directory = str(row.get("everyayah_dir", "")).strip()
        qari = str(row.get("name_en", "")).strip() or DEFAULT_QARI
        license_text = str(row.get("license", "")).lower()
        if not directory or "reference-only" not in license_text:
            raise SystemExit("Audio-Metadaten sind nicht als reference-only gekennzeichnet.")
        return directory, qari
    raise SystemExit(f"Rezitation {recitation_id!r} nicht in Audio-Metadaten gefunden.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("metadata", type=Path, nargs="?", help="QuranLab metadata/recitations.csv")
    parser.add_argument("--recitation-id", default=DEFAULT_RECITATION_ID)
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("content-src/quran-reader/recitation_audio/quranlab-reference.json"),
    )
    args = parser.parse_args()

    directory, qari = (DEFAULT_DIR, DEFAULT_QARI)
    if args.metadata:
        directory, qari = read_recitation(args.metadata, args.recitation_id)

    records = []
    for surah, count in enumerate(AYAH_COUNTS, 1):
        for ayah in range(1, count + 1):
            ref = f"{surah}:{ayah}"
            records.append(
                {
                    "id": f"audio_ref_{surah}_{ayah}",
                    "reference": ref,
                    "audioPath": f"https://everyayah.com/data/{directory}/{surah:03d}{ayah:03d}.mp3",
                    "qari": qari,
                    "label": "External streaming reference",
                }
            )
    if len(records) != EXPECTED_AYAHS:
        raise SystemExit("Audio-Referenzmanifest ist unvollstaendig.")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "layerId": "recitation_audio",
                "entryId": "recitation_audio_quranlab_reference",
                "sourceId": "src_quran_audio_quranlab_reference",
                "records": records,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Erzeugt: {len(records)} externe Audio-Referenzen -> {args.output}")


if __name__ == "__main__":
    main()
