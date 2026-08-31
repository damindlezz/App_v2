#!/usr/bin/env python3
"""Import user-supplied/licensed Quran Reader data into an existing dataset slot.

Supported input:
- JSON: list or {"records": [...]}
- TSV: reference<TAB>text or reference<TAB>title<TAB>text
- Tanzil-style TXT-2: surah|ayah|text
- Plain text: exactly 6236 lines, one line per ayah (quran_text/translation)

The script never downloads third-party content. Rights and source metadata remain an editorial responsibility.
"""
from __future__ import annotations
import argparse, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
META = ROOT / 'content-src' / 'runtime-meta' / 'quran-reader-meta.json'
AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]
REFERENCES = [f'{surah}:{ayah}' for surah,count in enumerate(AYAH_COUNTS,1) for ayah in range(1,count+1)]
LAYERS = {'quran_text','translation','tafsir','word_analysis','tajweed','mushaf_13_line','recitation_audio'}

def valid_reference(value: object) -> str:
    m = re.fullmatch(r'(\d{1,3}):(\d{1,3})', str(value or '').strip())
    if not m: raise ValueError(f'Ungültige Referenz: {value!r}')
    surah, ayah = map(int, m.groups())
    if not 1 <= surah <= 114 or not 1 <= ayah <= AYAH_COUNTS[surah-1]:
        raise ValueError(f'Ungültige Referenz: {value!r}')
    return f'{surah}:{ayah}'

def parse_text(path: Path, layer: str) -> list[dict]:
    raw = path.read_text(encoding='utf-8-sig')
    if path.suffix.lower() == '.json' or raw.lstrip().startswith(('[','{')):
        payload = json.loads(raw)
        records = payload if isinstance(payload,list) else payload.get('records',[])
        if not isinstance(records,list): raise ValueError('JSON muss eine Liste oder {"records": [...]} enthalten.')
        return [dict(item) for item in records if isinstance(item,dict)]
    lines = [line.rstrip('\r') for line in raw.splitlines() if line.strip()]
    out=[]
    pipe = re.compile(r'^(\d{1,3})\|(\d{1,3})\|(.*)$')
    if lines and all(pipe.match(line) for line in lines):
        for line in lines:
            m=pipe.match(line); assert m
            out.append({'reference':f'{int(m.group(1))}:{int(m.group(2))}','text':m.group(3).strip()})
        return out
    if lines and all('\t' in line for line in lines):
        for line in lines:
            cells=line.split('\t')
            if layer=='tafsir' and len(cells)>=3: out.append({'reference':cells[0].strip(),'title':cells[1].strip(),'text':'\t'.join(cells[2:]).strip()})
            else: out.append({'reference':cells[0].strip(),'text':'\t'.join(cells[1:]).strip()})
        return out
    if layer in {'quran_text','translation'} and len(lines)==6236:
        return [{'reference':ref,'text':text.strip()} for ref,text in zip(REFERENCES,lines)]
    raise ValueError('Format nicht erkannt. Erwartet: JSON, TSV, TXT-2 oder 6236 Zeilen Volltext.')

def normalize(records: list[dict], layer: str) -> list[dict]:
    normalized=[]; refs=set(); ids=set()
    for index,record in enumerate(records,1):
        item={k:v for k,v in record.items()}
        if 'reference' in item: item['reference']=valid_reference(item['reference'])
        if layer in {'quran_text','translation','tafsir'} and not str(item.get('text','')).strip():
            raise ValueError(f'Datensatz {index}: Text fehlt.')
        if layer in {'quran_text','translation'}:
            ref=item.get('reference','')
            if ref in refs: raise ValueError(f'Doppelte Referenz: {ref}')
            refs.add(ref)
        rid=str(item.get('id') or '').strip() or f'{layer}_{item.get("reference",index)}'.replace(':','_')
        if rid in ids: rid=f'{rid}_{index}'
        ids.add(rid); item['id']=rid
        normalized.append(item)
    if layer in {'quran_text','translation'} and len(normalized) not in {0,6236}:
        print(f'WARN: {layer} enthält {len(normalized)} statt 6236 Ayat; Review möglich, Freigabe bleibt unvollständig.')
    return normalized

def dataset(layer: str, entry: str) -> tuple[dict,Path]:
    meta=json.loads(META.read_text(encoding='utf-8'))
    target_layer=next((item for item in meta.get('layers',[]) if item.get('id')==layer),None)
    if not target_layer: raise ValueError(f'Layer nicht gefunden: {layer}')
    target=next((item for item in target_layer.get('entries',[]) if item.get('id')==entry),None)
    if not target: raise ValueError(f'Dataset nicht gefunden: {layer}/{entry}')
    rel=str(target.get('dataPath','')).strip()
    if not rel or '..' in Path(rel).parts: raise ValueError('Ungültiger dataPath in quran-reader-meta.json')
    return target, ROOT/'content-src'/rel

def main() -> None:
    ap=argparse.ArgumentParser()
    ap.add_argument('--layer',required=True,choices=sorted(LAYERS))
    ap.add_argument('--entry',required=True)
    ap.add_argument('--input',required=True,type=Path)
    ap.add_argument('--dry-run',action='store_true')
    args=ap.parse_args()
    target,out=dataset(args.layer,args.entry)
    records=normalize(parse_text(args.input,args.layer),args.layer)
    payload={'schemaVersion':1,'layerId':args.layer,'entryId':args.entry,'records':records}
    print(f'{args.layer}/{args.entry}: {len(records)} Datensätze -> {out.relative_to(ROOT)}')
    if args.dry_run:return
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Import gespeichert. Danach: python scripts/build-content.py')

if __name__=='__main__': main()
