from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> Any:
    with path.open(encoding='utf-8') as handle:
        return json.load(handle)


def write_json(path: Path, value: Any, *, compact: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8', newline='\n') as handle:
        if compact:
            json.dump(value, handle, ensure_ascii=False, separators=(',', ':'))
        else:
            json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write('\n')


def load_split_array(directory: Path, fallback: Path | None = None) -> list[dict]:
    files = sorted(directory.glob('*.json')) if directory.exists() else []
    if files:
        output: list[dict] = []
        for path in files:
            value = read_json(path)
            if not isinstance(value, list):
                raise ValueError(f'{path}: JSON-Liste erwartet')
            output.extend(value)
        return output
    if fallback and fallback.exists():
        value = read_json(fallback)
        if not isinstance(value, list):
            raise ValueError(f'{fallback}: JSON-Liste erwartet')
        return value
    raise FileNotFoundError(directory)


def write_track_shards(directory: Path, chapters: list[dict]) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    for old in directory.glob('*.json'):
        old.unlink()
    tracks: dict[str, list[dict]] = {}
    for chapter in chapters:
        track = str(chapter.get('track', '')).strip()
        if not track:
            raise ValueError('Islamisches Kapitel ohne track')
        tracks.setdefault(track, []).append(chapter)
    written: list[Path] = []
    for track, values in sorted(tracks.items()):
        path = directory / f'{track}.json'
        write_json(path, values, compact=False)
        written.append(path)
    return written
