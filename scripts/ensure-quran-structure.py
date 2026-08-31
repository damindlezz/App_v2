#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from content_build.quran_structure import load_quran_structure

ROOT = Path(__file__).resolve().parents[1]
structure = load_quran_structure(
    ROOT / 'content-src/static/quran-structure.json',
    ROOT / 'src/shared/quran-structure.generated.ts',
)
print(
    '[OK] Quran-Struktur: '
    f"{len(structure['ayahCounts'])} Suren, "
    f"{sum(structure['ayahCounts'])} Ayat, "
    f"{len(structure['juzStarts'])} Juz."
)
