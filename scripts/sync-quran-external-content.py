#!/usr/bin/env python3
"""Download and migrate external Quran datasets for local desktop development.

No third-party Python packages are required. Existing valid authoring JSON is kept,
so ordinary starts do not redownload unchanged data.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from content_build.quran_structure import load_quran_structure

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "quran-external"
TAFSIR_JSON = CACHE / "de_tafsir_complete.json"
MUSHAF_DART = CACHE / "thirteen_line_indopak_layout.dart"
AUDIO_META = CACHE / "quranlab-recitations.csv"
TAFSIR_OUT = ROOT / "content-src/quran-reader/tafsir/rassoul-de.json"
WBW_OUT = ROOT / "content-src/quran-reader/word_analysis/quran-foundation-wbw-de.json"
WBW_FALLBACK_OUT = ROOT / "content-src/quran-reader/word_analysis/abureda-derived-wbw-de.json"
MUSHAF_OUT = ROOT / "content-src/quran-reader/mushaf_13_line/indopak-waqar-mit.json"
AUDIO_OUT = ROOT / "content-src/quran-reader/recitation_audio/quranlab-reference.json"
VAHID_FONT = ROOT / "public/fonts/vahid.ttf"
VAHID_LICENSE = ROOT / "public/fonts/Vahid-OFL.txt"

TAFSIR_URL = os.environ.get(
    "QURAN_TAFSIR_DE_URL",
    "https://raw.githubusercontent.com/Mylinde/Tafsir/main/tafsir-json/de_tafsir_complete.json",
)
MUSHAF_URL = os.environ.get(
    "QURAN_MUSHAF13_URL",
    "https://raw.githubusercontent.com/Waqar144/quran_memorization_helper/master/lib/quran_data/thirteen_line_indopak_layout.dart",
)
AUDIO_META_URL = os.environ.get(
    "QURAN_AUDIO_META_URL",
    "https://huggingface.co/datasets/quranlab/quran-audio/resolve/main/metadata/recitations.csv?download=true",
)
EXPECTED_AYAHS = 6236
MIN_TAFSIR_RECORDS = 6086
EXPECTED_MUSHAF_PAGES = 847
VAHID_FONT_URL = "https://raw.githubusercontent.com/muctebanesiri/vahid-font/main/fonts/vahid.ttf"
VAHID_LICENSE_URL = "https://raw.githubusercontent.com/muctebanesiri/vahid-font/main/OFL.txt"


def load_records(path: Path) -> list[dict]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    records = payload.get("records", []) if isinstance(payload, dict) else []
    return [row for row in records if isinstance(row, dict)]


def valid_verse_output(path: Path) -> bool:
    records = load_records(path)
    refs = {str(row.get("reference", "")) for row in records}
    return len(records) == EXPECTED_AYAHS and len(refs) == EXPECTED_AYAHS


def valid_tafsir_output(path: Path) -> bool:
    records = load_records(path)
    refs = [str(row.get("reference", "")).strip() for row in records]
    unique = set(refs)
    return (
        MIN_TAFSIR_RECORDS <= len(records) <= EXPECTED_AYAHS
        and len(unique) == len(records)
        and all(re.fullmatch(r"\d{1,3}:\d{1,3}", ref) for ref in refs)
        and all(str(row.get("text", "")).strip() for row in records)
    )


def tafsir_coverage(path: Path) -> tuple[int, float]:
    count = len(load_records(path))
    return count, (count / EXPECTED_AYAHS * 100 if EXPECTED_AYAHS else 0.0)


def valid_mushaf_output(path: Path = MUSHAF_OUT) -> bool:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict) or payload.get("layoutRevision") != 3:
        return False
    records = payload.get("records") if isinstance(payload.get("records"), list) else []
    if not records:
        return False
    pages: dict[int, set[int]] = {}
    try:
        for row in records:
            page = int(row["page"])
            line = int(row["line"])
            text = str(row.get("text", "")).strip()
            if page < 1 or line < 1 or line > 13 or not text:
                return False
            # Reject the old raw-anchor renderer (for example "1:2 · Wort 1").
            # This deliberately forces a one-time reimport after upgrading from V4.
            if "· Wort" in text or text.startswith("surah_name"):
                return False
            # V9 rendered generic headers like "سُورَة 2". V10 requires the actual Arabic surah name.
            if str(row.get("lineType", "")) == "surah_name" and re.fullmatch(r"سُورَةُ?\s*\d+", text):
                return False
            if "sourceAyahIndex" not in row or "sourceWordStartIndex" not in row:
                return False
            if not re.search(r"[\u0600-\u06ff]", text):
                return False
            pages.setdefault(page, set()).add(line)
    except (KeyError, TypeError, ValueError):
        return False
    expected_pages = set(range(1, EXPECTED_MUSHAF_PAGES + 1))
    headers = [row for row in records if str(row.get("lineType", "")) == "surah_name"]
    header_numbers = [row.get("surahNumber") for row in headers]
    return (
        set(pages) == expected_pages
        and all(1 <= len(lines) <= 13 for lines in pages.values())
        and header_numbers == list(range(1, 115))
    )


def valid_tafsir_source(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 500_000:
        return False
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    stack = [payload]
    checked = 0
    while stack and checked < 10_000:
        item = stack.pop()
        checked += 1
        if isinstance(item, dict):
            if str(item.get("verse_key", "")).strip() and str(item.get("text", "")).strip():
                return True
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return False


def valid_mushaf_source(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 10_000:
        return False
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return False
    return text.count("Page(") == EXPECTED_MUSHAF_PAGES and "Line(" in text


def valid_font(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 20_000:
        return False
    try:
        magic = path.read_bytes()[:4]
    except OSError:
        return False
    return magic in {b"\x00\x01\x00\x00", b"OTTO", b"true", b"ttcf"}


def sync_turkish_font(force: bool) -> bool:
    if not force and valid_font(VAHID_FONT):
        print("[OK] Arabische Schrift: Vahid (türkisch/osmanischer Stil) vorhanden.")
        return False
    print("[SYNC] Arabische Schrift / Vahid (SIL OFL 1.1)")
    download(VAHID_FONT_URL, VAHID_FONT, "Vahid Turkish Font", 20_000)
    download(VAHID_LICENSE_URL, VAHID_LICENSE, "Vahid OFL-Lizenz", 500)
    if not valid_font(VAHID_FONT):
        raise RuntimeError("Vahid-Fontdatei ist nach dem Download ungueltig.")
    print("[OK] Vahid-Schrift installiert; Auswahl 'Türkisch / Osmanisch' ist offline verfügbar.")
    return True


def valid_audio_meta(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 500:
        return False
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
    except OSError:
        return False
    return any(
        str(row.get("recitation_id", "")).strip() == "abdul-basit"
        and str(row.get("everyayah_dir", "")).strip()
        and "reference-only" in str(row.get("license", "")).lower()
        for row in rows
    )


def download(url: str, target: Path, label: str, min_bytes: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_name(target.name + ".part")
    existing = part.stat().st_size if part.exists() else 0
    headers = {"User-Agent": "Arabisch-Lernen-Quran-Sync/0.13.0"}
    if existing:
        headers["Range"] = f"bytes={existing}-"
        print(f"  {label}: setze Download bei {existing // (1024 * 1024)} MB fort ...")
    else:
        print(f"  {label}: Download startet ...")

    request = urllib.request.Request(url, headers=headers)
    try:
        response = urllib.request.urlopen(request, timeout=90)
    except urllib.error.HTTPError as exc:
        if existing and exc.code == 416:
            part.replace(target)
            return
        raise

    status = getattr(response, "status", 200)
    append = existing > 0 and status == 206
    if not append:
        existing = 0
    mode = "ab" if append else "wb"
    downloaded = existing
    next_report = ((downloaded // (25 * 1024 * 1024)) + 1) * 25 * 1024 * 1024
    with response, part.open(mode) as handle:
        while True:
            chunk = response.read(2 * 1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
            downloaded += len(chunk)
            if downloaded >= next_report:
                print(f"    {downloaded // (1024 * 1024)} MB")
                next_report += 25 * 1024 * 1024
    if downloaded < min_bytes:
        raise RuntimeError(f"Download fuer {label} ist unerwartet klein ({downloaded} Byte).")
    part.replace(target)
    print(f"  {label}: {downloaded // 1024} KB gespeichert.")


def run_import(script: str, source: Path) -> None:
    subprocess.run([sys.executable, str(ROOT / script), str(source)], cwd=ROOT, check=True)



def sync_word_translations(force: bool) -> bool:
    before_qf = len([row for row in load_records(WBW_OUT) if str(row.get("translation", "")).strip()])
    before_fallback = len([row for row in load_records(WBW_FALLBACK_OUT) if str(row.get("translation", "")).strip()])
    command = [sys.executable, str(ROOT / "scripts/sync-quran-wbw-de.py")]
    if force:
        command.append("--force")
    subprocess.run(command, cwd=ROOT, check=True)
    after_qf = len([row for row in load_records(WBW_OUT) if str(row.get("translation", "")).strip()])

    # Never leave the desktop reader without word meanings. If the licensed QF cache is
    # unavailable, regenerate the deterministic offline review fallback from bundled LPPL data.
    fallback = len([row for row in load_records(WBW_FALLBACK_OUT) if str(row.get("translation", "")).strip()])
    if fallback < 77000:
        subprocess.run([sys.executable, str(ROOT / "scripts/derive-quran-wbw-de.py")], cwd=ROOT, check=True)
        fallback = len([row for row in load_records(WBW_FALLBACK_OUT) if str(row.get("translation", "")).strip()])
    if fallback < 77000:
        raise RuntimeError(f"Deutscher Offline-Wortfallback ist unvollständig ({fallback}/77433).")

    if after_qf >= 77000:
        print(f"[OK] Deutsche Wortübersetzungen: {after_qf} Quran-Foundation-Glosses + {fallback} Offline-Fallbacks vorhanden.")
    else:
        print(f"[OK] Deutsche Wortübersetzungen: {fallback} Offline-Fallback-Glosses vorhanden; QF-Cache kann sie später überschreiben.")
    return after_qf != before_qf or fallback != before_fallback

def sync_tafsir(force: bool) -> bool:
    if not force and valid_tafsir_output(TAFSIR_OUT):
        count, percent = tafsir_coverage(TAFSIR_OUT)
        print(f"[OK] Deutscher Tafsir: {count} Versreferenzen ({percent:.1f}% Quellenabdeckung) bereits vorhanden.")
        return False
    print("[SYNC] Deutscher Tafsir / M. Ibn Rassoul (Weiterverwendung mit Quellenangabe)")
    if force or not valid_tafsir_source(TAFSIR_JSON):
        download(TAFSIR_URL, TAFSIR_JSON, "de_tafsir_complete.json", 500_000)
    if not valid_tafsir_source(TAFSIR_JSON):
        raise RuntimeError("Deutsche Tafsir-Quelldatei ist nach dem Download ungueltig.")
    run_import("scripts/import-tafsir-rassoul-de.py", TAFSIR_JSON)
    if not valid_tafsir_output(TAFSIR_OUT):
        raise RuntimeError(f"Deutscher Tafsir-Import liegt ausserhalb der erwarteten Quellenabdeckung ({MIN_TAFSIR_RECORDS}–{EXPECTED_AYAHS} Versreferenzen).")
    count, percent = tafsir_coverage(TAFSIR_OUT)
    print(f"[OK] Deutscher Tafsir: {count} Versreferenzen ({percent:.1f}% Quellenabdeckung) migriert.")
    return True


def sync_audio(force: bool) -> bool:
    if not force and valid_verse_output(AUDIO_OUT):
        print("[OK] Audio: 6.236 externe Vers-Referenzen bereits vorhanden.")
        return False
    print("[SYNC] QuranLab Audio-Referenzmanifest (keine Audio-Bytes im Projekt)")
    if force or not valid_audio_meta(AUDIO_META):
        download(AUDIO_META_URL, AUDIO_META, "QuranLab recitations.csv", 500)
    if not valid_audio_meta(AUDIO_META):
        raise RuntimeError("QuranLab Audio-Metadaten sind nach dem Download ungueltig.")
    run_import("scripts/generate-quran-audio-references.py", AUDIO_META)
    if not valid_verse_output(AUDIO_OUT):
        raise RuntimeError("Audio-Referenzimport lieferte nicht exakt 6.236 eindeutige Verse.")
    print("[OK] Audio: Versweises Streaming-Referenzmanifest erzeugt.")
    return True


def sync_mushaf(force: bool) -> bool:
    if not force and valid_mushaf_output():
        print("[OK] 13-Zeilen-Mushaf: 847 Seiten mit lesbarem Zeilentext vorhanden.")
        return False
    print("[SYNC] 13-Zeilen-Mushaf / Quran Revision Companion (MIT)")
    if force or not valid_mushaf_source(MUSHAF_DART):
        download(MUSHAF_URL, MUSHAF_DART, "13-Zeilen-Layout", 10_000)
    if not valid_mushaf_source(MUSHAF_DART):
        raise RuntimeError("13-Zeilen-Quelldatei ist nach dem Download ungueltig.")
    run_import("scripts/import-mushaf-13-line-dart.py", MUSHAF_DART)
    if not valid_mushaf_output():
        raise RuntimeError("13-Zeilen-Import lieferte nicht die erwarteten 847 lesbaren Seiten.")
    print("[OK] 13-Zeilen-Mushaf: Mapping und Zeilentext migriert.")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="Sync-Fehler mit Exitcode 1 melden")
    parser.add_argument("--force", action="store_true", help="Quellen erneut herunterladen und migrieren")
    args = parser.parse_args()

    if os.environ.get("QURAN_SYNC_SKIP") == "1":
        print("Quran-External-Sync durch QURAN_SYNC_SKIP=1 uebersprungen.")
        return 0
    force = args.force or os.environ.get("QURAN_SYNC_FORCE") == "1"
    load_quran_structure(
        ROOT / "content-src/static/quran-structure.json",
        ROOT / "src/shared/quran-structure.generated.ts",
    )
    CACHE.mkdir(parents=True, exist_ok=True)

    failures: list[str] = []
    changed = False
    for label, action in (
        ("Deutsche Wortübersetzungen", sync_word_translations),
        ("Deutscher Tafsir", sync_tafsir),
        ("Audio-Referenzen", sync_audio),
        ("13-Zeilen-Mushaf", sync_mushaf),
        ("Türkisch/osmanische Schrift", sync_turkish_font),
    ):
        try:
            changed = action(force) or changed
        except Exception as exc:
            failures.append(f"{label}: {exc}")
            print(f"[WARN] {label}: {exc}")

    if changed:
        print("[SYNC] Quran-Content neu bauen ...")
        try:
            subprocess.run([sys.executable, str(ROOT / "scripts/build-content.py")], cwd=ROOT, check=True)
            print("[OK] Quran-Content gebaut.")
        except subprocess.CalledProcessError as exc:
            failures.append(f"Content-Build: Exit {exc.returncode}")

    if failures:
        print("\nQuran-Sync nicht vollstaendig:")
        for failure in failures:
            print(f" - {failure}")
        print("Die Desktop-Entwicklung kann mit dem vorhandenen lokalen Content weiterlaufen.")
        return 1 if args.strict else 0

    print("[OK] Externe Quran-Basisdaten synchronisiert; geschuetzte Wortdaten werden bei vorhandenen QF-Credentials lokal gecacht und offline migriert.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
