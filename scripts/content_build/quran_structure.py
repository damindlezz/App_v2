from __future__ import annotations

import json
import re
from pathlib import Path

EXPECTED_SURAHS = 114
EXPECTED_AYAHS = 6236
EXPECTED_JUZ = 30


def _validate(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError('Quran-Struktur muss ein JSON-Objekt sein.')
    counts = payload.get('ayahCounts')
    juz_starts = payload.get('juzStarts')
    names = payload.get('surahNamesArabic')
    if not isinstance(counts, list) or len(counts) != EXPECTED_SURAHS:
        raise ValueError(f'Quran-Struktur: {EXPECTED_SURAHS} Suren erwartet.')
    if any(not isinstance(value, int) or value <= 0 for value in counts):
        raise ValueError('Quran-Struktur: ayahCounts enthaelt ungueltige Werte.')
    if sum(counts) != EXPECTED_AYAHS:
        raise ValueError(f'Quran-Struktur: {EXPECTED_AYAHS} Ayat erwartet, gefunden {sum(counts)}.')
    if not isinstance(juz_starts, list) or len(juz_starts) != EXPECTED_JUZ:
        raise ValueError(f'Quran-Struktur: {EXPECTED_JUZ} Juz-Starts erwartet.')
    if any(not isinstance(value, str) or not re.fullmatch(r'\d{1,3}:\d{1,3}', value) for value in juz_starts):
        raise ValueError('Quran-Struktur: juzStarts enthaelt ungueltige Referenzen.')
    if not isinstance(names, list) or len(names) != EXPECTED_SURAHS or any(not isinstance(value, str) or not value.strip() for value in names):
        raise ValueError(f'Quran-Struktur: {EXPECTED_SURAHS} arabische Surennamen erwartet.')
    return {
        'schemaVersion': int(payload.get('schemaVersion') or 1),
        'ayahCounts': counts,
        'juzStarts': juz_starts,
        'surahNamesArabic': names,
    }


def _extract_json_array(source: str, constant: str) -> list:
    match = re.search(rf'export const {re.escape(constant)}\s*=\s*(\[[^\n]+\])\s+as const;', source)
    if not match:
        raise ValueError(f'{constant} fehlt in generierter Quran-Struktur.')
    value = json.loads(match.group(1))
    if not isinstance(value, list):
        raise ValueError(f'{constant} ist kein Array.')
    return value


def _recover_from_generated(generated_ts: Path) -> dict:
    source = generated_ts.read_text(encoding='utf-8')
    return _validate({
        'schemaVersion': 1,
        'ayahCounts': _extract_json_array(source, 'QURAN_AYAH_COUNTS'),
        'juzStarts': _extract_json_array(source, 'JUZ_STARTS'),
        'surahNamesArabic': _extract_json_array(source, 'QURAN_SURAH_NAMES_AR'),
    })


def _write_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f'{path.name}.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


def load_quran_structure(source_json: Path, generated_ts: Path, *, repair_missing: bool = True) -> dict:
    try:
        return _validate(json.loads(source_json.read_text(encoding='utf-8')))
    except FileNotFoundError:
        if not repair_missing:
            raise
        payload = _recover_from_generated(generated_ts)
        _write_atomic(source_json, payload)
        print(f'[REPAIR] Fehlende Quran-Struktur wiederhergestellt: {source_json.relative_to(source_json.parents[2])}')
        return payload
    except json.JSONDecodeError as exc:
        raise ValueError(f'Ungueltige Quran-Struktur in {source_json}: {exc}') from exc
