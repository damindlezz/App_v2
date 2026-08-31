from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

from .io import read_json

LAYER_MARKER = {"$layer": True}
KEEP_MARKER = {"$keep": True}
FIQH_SCHOOLS = ("hanafi", "maliki", "shafii", "hanbali")


def _is_marker(value: Any, marker: dict[str, bool]) -> bool:
    return isinstance(value, dict) and value == marker


def factor_values(values: list[Any]) -> tuple[Any, list[Any]]:
    """Split equivalent JSON trees into shared core and sparse school overlays."""
    if all(value == values[0] for value in values[1:]):
        return deepcopy(values[0]), [deepcopy(KEEP_MARKER) for _ in values]

    if all(isinstance(value, dict) for value in values):
        key_sets = [set(value.keys()) for value in values]
        if all(keys == key_sets[0] for keys in key_sets[1:]):
            core: dict[str, Any] = {}
            overlays: list[dict[str, Any]] = [{} for _ in values]
            for key in values[0].keys():
                child_core, child_overlays = factor_values([value[key] for value in values])
                core[key] = child_core
                for index, overlay in enumerate(child_overlays):
                    if not _is_marker(overlay, KEEP_MARKER):
                        overlays[index][key] = overlay
            normalized = [overlay if overlay else deepcopy(KEEP_MARKER) for overlay in overlays]
            return core, normalized

    if all(isinstance(value, list) for value in values):
        lengths = {len(value) for value in values}
        if len(lengths) == 1:
            core_list: list[Any] = []
            overlay_lists: list[list[Any]] = [[] for _ in values]
            for item_index in range(len(values[0])):
                child_core, child_overlays = factor_values([value[item_index] for value in values])
                core_list.append(child_core)
                for school_index, overlay in enumerate(child_overlays):
                    overlay_lists[school_index].append(overlay)
            normalized: list[Any] = []
            for overlay in overlay_lists:
                if all(_is_marker(item, KEEP_MARKER) for item in overlay):
                    normalized.append(deepcopy(KEEP_MARKER))
                else:
                    normalized.append(overlay)
            return core_list, normalized

    return deepcopy(LAYER_MARKER), [deepcopy(value) for value in values]


def merge_layered_value(core: Any, overlay: Any) -> Any:
    if _is_marker(core, LAYER_MARKER):
        if _is_marker(overlay, KEEP_MARKER):
            raise ValueError("Fiqh layer is missing a required school-specific value")
        return deepcopy(overlay)
    if _is_marker(overlay, KEEP_MARKER):
        return deepcopy(core)
    if isinstance(core, dict):
        source = overlay if isinstance(overlay, dict) else {}
        return {key: merge_layered_value(value, source.get(key, KEEP_MARKER)) for key, value in core.items()}
    if isinstance(core, list):
        if _is_marker(overlay, KEEP_MARKER):
            return deepcopy(core)
        if not isinstance(overlay, list) or len(overlay) != len(core):
            raise ValueError("Fiqh layer list shape does not match the shared core")
        return [merge_layered_value(value, overlay[index]) for index, value in enumerate(core)]
    return deepcopy(core)


def load_fiqh_paths(source_root: Path) -> list[dict]:
    base = source_root / "islamic" / "fiqh"
    core_path = base / "core.json"
    if not core_path.exists():
        return []
    core = read_json(core_path)
    output: list[dict] = []
    for school in FIQH_SCHOOLS:
        layer_path = base / "layers" / f"{school}.json"
        layer = read_json(layer_path)
        value = merge_layered_value(core, layer)
        if not isinstance(value, list):
            raise ValueError(f"{layer_path}: reconstructed Fiqh track must be a JSON list")
        output.extend(value)
    return output
