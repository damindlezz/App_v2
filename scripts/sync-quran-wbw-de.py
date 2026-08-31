#!/usr/bin/env python3
"""Cache and migrate German Quran Foundation word-by-word glosses for offline use.

Quran Foundation credentials are only used by this local backend sync script. Raw API
responses are stored under .cache/quran-external/qf-wbw-de and are intentionally not
part of release ZIPs. The normalized authoring JSON is consumed by build-content.py and
therefore becomes offline runtime content.
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "content-src/quran-reader/word_analysis/quran-foundation-wbw-de.json"
CACHE_DIR = ROOT / ".cache/quran-external/qf-wbw-de"
CACHE_MANIFEST = CACHE_DIR / "manifest.json"
EXPECTED_MIN = 77000
EXPECTED_SURAHS = 114
ENVIRONMENTS = {
    "prelive": ("https://prelive-oauth2.quran.foundation", "https://apis-prelive.quran.foundation"),
    "production": ("https://oauth2.quran.foundation", "https://apis.quran.foundation"),
}


def clean_text(value: object) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", text).strip()


def read_json(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def translated_count(path: Path) -> int:
    records = read_json(path).get("records", [])
    if not isinstance(records, list):
        return 0
    return sum(1 for row in records if isinstance(row, dict) and str(row.get("translation", "")).strip())


def cache_path(surah: int) -> Path:
    return CACHE_DIR / f"surah-{surah:03d}.json"


def valid_cache_payload(payload: dict, surah: int) -> bool:
    if payload.get("schemaVersion") != 1 or int(payload.get("surah", 0) or 0) != surah:
        return False
    verses = payload.get("verses")
    if not isinstance(verses, list) or not verses:
        return False
    prefix = f"{surah}:"
    return all(isinstance(verse, dict) and str(verse.get("verse_key", "")).startswith(prefix) for verse in verses)


def valid_cache(surah: int) -> bool:
    return valid_cache_payload(read_json(cache_path(surah)), surah)


def token(client_id: str, client_secret: str, auth_base: str) -> str:
    data = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "content"}).encode()
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    request = urllib.request.Request(
        f"{auth_base}/oauth2/token",
        data=data,
        headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Arabisch-Lernen/0.13.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)
    access = str(payload.get("access_token", "")).strip()
    if not access:
        raise RuntimeError("Quran-Foundation-Tokenantwort enthaelt kein access_token.")
    return access


def fetch_json(url: str, client_id: str, access_token: str) -> dict:
    request = urllib.request.Request(url, headers={
        "x-auth-token": access_token,
        "x-client-id": client_id,
        "User-Agent": "Arabisch-Lernen/0.13.0",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise RuntimeError("Unerwartete Quran-Foundation-Antwort.")
    return payload


def write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".tmp-{os.getpid()}")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def fetch_surah(surah: int, api_base: str, client_id: str, access_token: str, environment: str) -> dict:
    verses: list[dict] = []
    page = 1
    while True:
        query = urllib.parse.urlencode({
            "language": "de",
            "words": "true",
            "word_fields": "text_uthmani",
            "per_page": "50",
            "page": str(page),
        })
        payload = fetch_json(f"{api_base}/content/api/v4/verses/by_chapter/{surah}?{query}", client_id, access_token)
        page_verses = payload.get("verses", [])
        if isinstance(page_verses, list):
            verses.extend(verse for verse in page_verses if isinstance(verse, dict))
        pagination = payload.get("pagination", {})
        next_page = pagination.get("next_page") if isinstance(pagination, dict) else None
        if not next_page:
            break
        page = int(next_page)
    cached = {"schemaVersion": 1, "surah": surah, "environment": environment, "verses": verses}
    if not valid_cache_payload(cached, surah):
        raise RuntimeError(f"Ungueltiger Wortdaten-Cache fuer Sure {surah}.")
    return cached


def migrate_cache() -> int:
    records: list[dict] = []
    seen: set[tuple[str, int]] = set()
    cached_surahs = 0
    for surah in range(1, EXPECTED_SURAHS + 1):
        payload = read_json(cache_path(surah))
        if not valid_cache_payload(payload, surah):
            continue
        cached_surahs += 1
        for verse in payload.get("verses", []):
            reference = str(verse.get("verse_key", "")).strip()
            for word in verse.get("words", []):
                if not isinstance(word, dict) or str(word.get("char_type_name", "word")) != "word":
                    continue
                try:
                    position = int(word.get("position", 0))
                except (TypeError, ValueError):
                    continue
                translation = word.get("translation", {})
                gloss = clean_text(translation.get("text", "") if isinstance(translation, dict) else "")
                text = clean_text(word.get("text_uthmani", ""))
                key = (reference, position)
                if not reference or position < 1 or key in seen or not gloss:
                    continue
                seen.add(key)
                records.append({
                    "id": f"qf_wbw_de_{reference.replace(':', '_')}_{position}",
                    "reference": reference,
                    "wordIndex": position,
                    "text": text or "—",
                    "translation": gloss,
                })
    if cached_surahs != EXPECTED_SURAHS:
        return 0
    if len(records) < EXPECTED_MIN:
        raise RuntimeError(f"Zu wenige deutsche Wortübersetzungen im Cache: {len(records)} < {EXPECTED_MIN}.")
    records.sort(key=lambda item: (int(item["reference"].split(":")[0]), int(item["reference"].split(":")[1]), int(item["wordIndex"])))
    write_json_atomic(OUT, {
        "schemaVersion": 1,
        "datasetId": "word_analysis_quran_foundation_wbw_de",
        "sourceId": "src_quran_foundation_wbw_de",
        "records": records,
    })
    return len(records)


def write_manifest(environment: str) -> None:
    valid = [surah for surah in range(1, EXPECTED_SURAHS + 1) if valid_cache(surah)]
    write_json_atomic(CACHE_MANIFEST, {
        "schemaVersion": 1,
        "dataset": "quran-foundation-wbw-de",
        "environment": environment,
        "cachedSurahs": len(valid),
        "complete": len(valid) == EXPECTED_SURAHS,
    })


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", choices=sorted(ENVIRONMENTS), default=os.environ.get("QF_ENV", "prelive"))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    existing = translated_count(OUT)
    if existing >= EXPECTED_MIN and not args.force:
        print(f"[OK] Deutsche Wortübersetzungen: {existing} Offline-Glosses bereits vorhanden.")
        return 0

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = sum(1 for surah in range(1, EXPECTED_SURAHS + 1) if valid_cache(surah))
    if cached == EXPECTED_SURAHS and not args.force:
        migrated = migrate_cache()
        if migrated >= EXPECTED_MIN:
            print(f"[OK] Deutsche Wortübersetzungen: {migrated} Glosses aus lokalem Cache migriert.")
            return 0

    client_id = os.environ.get("QF_CLIENT_ID", "").strip()
    client_secret = os.environ.get("QF_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        print(f"[INFO] Deutsche Wortübersetzungen: lokaler Cache {cached}/114 Suren; QF_CLIENT_ID/QF_CLIENT_SECRET fehlen, Download übersprungen.")
        return 0

    auth_base, api_base = ENVIRONMENTS[args.env]
    access = token(client_id, client_secret, auth_base)
    for surah in range(1, EXPECTED_SURAHS + 1):
        target = cache_path(surah)
        if not args.force and valid_cache(surah):
            print(f"  Sure {surah}/114 · Cache vorhanden")
            continue
        try:
            payload = fetch_surah(surah, api_base, client_id, access, args.env)
            write_json_atomic(target, payload)
            print(f"  Sure {surah}/114 · heruntergeladen und gecacht")
        except Exception:
            if valid_cache(surah):
                print(f"  Sure {surah}/114 · Downloadfehler, vorhandener Cache wird verwendet")
                continue
            raise

    write_manifest(args.env)
    migrated = migrate_cache()
    if migrated < EXPECTED_MIN:
        raise SystemExit(f"Wortübersetzungs-Cache unvollständig; Migration erzeugte {migrated} Einträge.")
    print(f"[OK] Deutsche Wortübersetzungen: {migrated} Glosses Cache -> Offline-Content migriert.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
