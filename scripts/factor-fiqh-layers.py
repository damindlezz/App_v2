#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from content_build.fiqh_layers import FIQH_SCHOOLS, factor_values, merge_layered_value
from content_build.io import read_json, write_json

SOURCE = ROOT / "content-src" / "islamic" / "paths"
TARGET = ROOT / "content-src" / "islamic" / "fiqh"


def _legacy_paths() -> list[Path]:
    return [SOURCE / f"fiqh_{school}.json" for school in FIQH_SCHOOLS]


def _layer_paths() -> list[Path]:
    return [TARGET / "layers" / f"{school}.json" for school in FIQH_SCHOOLS]


def validate_factored() -> None:
    core_path = TARGET / "core.json"
    layer_paths = _layer_paths()
    if not core_path.exists() or not all(path.exists() for path in layer_paths):
        raise FileNotFoundError("Neither legacy Fiqh tracks nor a complete factored Fiqh source set exists")

    core = read_json(core_path)
    counts: dict[str, int] = {}
    for school, path in zip(FIQH_SCHOOLS, layer_paths, strict=True):
        rebuilt = merge_layered_value(core, read_json(path))
        if not isinstance(rebuilt, list) or not rebuilt:
            raise AssertionError(f"Factored Fiqh layer is invalid for {school}")
        counts[school] = len(rebuilt)

    print(json.dumps({"status": "already_factored", "tracks": counts}, ensure_ascii=False))


def main() -> None:
    legacy_paths = _legacy_paths()
    if not all(path.exists() for path in legacy_paths):
        validate_factored()
        return

    documents = [read_json(path) for path in legacy_paths]
    core, layers = factor_values(documents)
    for school, original, layer in zip(FIQH_SCHOOLS, documents, layers, strict=True):
        rebuilt = merge_layered_value(core, layer)
        if rebuilt != original:
            raise AssertionError(f"Layer roundtrip failed for {school}")

    write_json(TARGET / "core.json", core, compact=False)
    for school, layer in zip(FIQH_SCHOOLS, layers, strict=True):
        write_json(TARGET / "layers" / f"{school}.json", layer, compact=False)

    before = sum(path.stat().st_size for path in legacy_paths)
    after = (TARGET / "core.json").stat().st_size + sum(path.stat().st_size for path in _layer_paths())
    print(json.dumps({"status": "factored", "before": before, "after": after, "saved": before - after}, ensure_ascii=False))


if __name__ == "__main__":
    main()
