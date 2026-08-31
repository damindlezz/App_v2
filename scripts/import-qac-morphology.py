#!/usr/bin/env python3
"""Import an official Quranic Arabic Corpus v0.4 morphology text export.

The script intentionally does not download QAC. Obtain the official source under its
published licence/terms, keep the original file unchanged, then pass its path here.
Only lemma/root/morphology fields are merged onto the project's stable Quran word IDs.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKEN_FILE = ROOT / 'content-src/quran-reader/word_analysis/uthmani-token-review.json'
OUTPUT_FILE = ROOT / 'content-src/quran-reader/word_analysis/qac-v04.json'
EXPECTED_WORDS = 77433

LOCATION_RE = re.compile(r'^\((\d+):(\d+):(\d+):(\d+)\)\s+(\S+)\s+(\S+)(?:\s+(.*))?$')
ARABIC_RE = re.compile(r'[\u0600-\u06ff]')

# Buckwalter transliteration used by the Quranic Arabic Corpus downloads.
BW = {
    "'": 'ء', '|': 'آ', '>': 'أ', '&': 'ؤ', '<': 'إ', '}': 'ئ', 'A': 'ا',
    'b': 'ب', 'p': 'ة', 't': 'ت', 'v': 'ث', 'j': 'ج', 'H': 'ح', 'x': 'خ',
    'd': 'د', '*': 'ذ', 'r': 'ر', 'z': 'ز', 's': 'س', '$': 'ش', 'S': 'ص',
    'D': 'ض', 'T': 'ط', 'Z': 'ظ', 'E': 'ع', 'g': 'غ', '_': 'ـ', 'f': 'ف',
    'q': 'ق', 'k': 'ك', 'l': 'ل', 'm': 'م', 'n': 'ن', 'h': 'ه', 'w': 'و',
    'Y': 'ى', 'y': 'ي', 'F': 'ً', 'N': 'ٌ', 'K': 'ٍ', 'a': 'َ', 'u': 'ُ',
    'i': 'ِ', '~': 'ّ', 'o': 'ْ', '`': 'ٰ', '{': 'ٱ'
}


def bw_to_arabic(value: str) -> str:
    value = value.strip()
    if not value or ARABIC_RE.search(value):
        return value
    return ''.join(BW.get(ch, ch) for ch in value)


def feature_value(features: str, name: str) -> str:
    match = re.search(rf'(?:^|\|){re.escape(name)}:([^|]+)', features)
    return match.group(1).strip() if match else ''


def read_json(path: Path):
    with path.open('r', encoding='utf-8') as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(description='Import Quranic Arabic Corpus v0.4 morphology data.')
    parser.add_argument('input', type=Path, help='Untouched official morphology text file')
    parser.add_argument('--output', type=Path, default=OUTPUT_FILE)
    args = parser.parse_args()
    if not args.input.is_file():
        raise SystemExit(f'Input fehlt: {args.input}')

    token_payload = read_json(TOKEN_FILE)
    tokens = token_payload.get('records', [])
    token_by_key = {(int(item['reference'].split(':')[0]), int(item['reference'].split(':')[1]), int(item['wordIndex'])): item for item in tokens}
    if len(token_by_key) != EXPECTED_WORDS:
        raise SystemExit(f'Tokenbasis unvollständig: {len(token_by_key)}/{EXPECTED_WORDS}')

    segments: dict[tuple[int, int, int], list[dict[str, str]]] = {}
    with args.input.open('r', encoding='utf-8-sig', errors='strict') as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith('#') or line.startswith('//') or line.startswith('LOCATION'):
                continue
            match = LOCATION_RE.match(line)
            if not match:
                continue
            surah, ayah, word, segment = map(int, match.group(1, 2, 3, 4))
            form = match.group(5)
            tag = match.group(6)
            features = (match.group(7) or '').strip()
            segments.setdefault((surah, ayah, word), []).append({
                'segment': str(segment), 'form': form, 'tag': tag, 'features': features
            })

    records = []
    missing = []
    for key, token in token_by_key.items():
        word_segments = sorted(segments.get(key, []), key=lambda item: int(item['segment']))
        if not word_segments:
            missing.append(key)
            continue
        lemma = ''
        root = ''
        morphology_parts = []
        for part in word_segments:
            features = part['features']
            if not lemma:
                lemma = feature_value(features, 'LEM')
            if not root:
                root = feature_value(features, 'ROOT')
            descriptor = '|'.join(value for value in (part['tag'], features) if value)
            if descriptor:
                morphology_parts.append(descriptor)
        records.append({
            'id': token['id'],
            'reference': token['reference'],
            'wordIndex': token['wordIndex'],
            'text': token['text'],
            **({'lemma': bw_to_arabic(lemma)} if lemma else {}),
            **({'root': bw_to_arabic(root)} if root else {}),
            'morphology': ' / '.join(morphology_parts)
        })

    payload = {
        'schemaVersion': 1,
        'datasetId': 'word_analysis_qac_v04',
        'sourceId': 'src_quranic_arabic_corpus_morphology',
        'importPolicy': 'manual-official-source-only',
        'records': records,
        'coverage': {
            'stableWordPositions': len(token_by_key),
            'importedWordPositions': len(records),
            'missingWordPositions': len(missing),
            'lemma': sum(1 for item in records if item.get('lemma')),
            'root': sum(1 for item in records if item.get('root')),
            'morphology': sum(1 for item in records if item.get('morphology'))
        }
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('w', encoding='utf-8') as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write('\n')

    print(f"QAC Morphologie: {len(records)}/{EXPECTED_WORDS} Wortpositionen importiert")
    if missing:
        print(f"WARN: {len(missing)} Wortpositionen ohne QAC-Segment; Build bleibt möglich, UI blendet fehlende Felder aus.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
