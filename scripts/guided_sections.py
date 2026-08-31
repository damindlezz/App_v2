from __future__ import annotations
from copy import deepcopy

DOMAIN_LABELS = {
    'alphabet': 'Buchstaben',
    'vocabulary': 'Wortschatz',
    'grammar': 'Grammatik',
    'writing': 'Schreiben',
    'reading': 'Lesen',
    'quran': 'Quran',
}


def block_type(title: str, step_title: str = '') -> str:
    value = f'{step_title} {title}'.casefold()
    if any(token in value for token in ['fehler', 'grenze', 'achtung']): return 'warning'
    if any(token in value for token in ['merksatz', 'merke']): return 'remember'
    if any(token in value for token in ['prüfschritt', 'vorgehen', 'systematik', 'methode']): return 'steps'
    if any(token in value for token in ['fall', 'anwendung', 'beispiel']): return 'example'
    if any(token in value for token in ['begriff', 'definition', 'madhhab', 'masʾala', 'attribution']): return 'definition'
    if any(token in value for token in ['quelle', 'nachweis']): return 'explanation'
    if any(token in value for token in ['abschluss', 'zusammenfassung']): return 'summary'
    return 'explanation'


def knowledge_block(step: dict, raw: dict, index: int) -> dict:
    result = {
        'id': f"{step['id']}_block_{index + 1}",
        'type': block_type(str(raw.get('title', '')), str(step.get('title', ''))),
        'title': str(raw.get('title', '')).strip(),
        'text': str(raw.get('text', '')).strip(),
    }
    if raw.get('arabic'): result['arabic'] = raw['arabic']
    if raw.get('claimId'): result['claimId'] = raw['claimId']
    return result


def generic_knowledge_sections(step: dict) -> list[dict]:
    blocks = [knowledge_block(step, raw, idx) for idx, raw in enumerate(step.get('knowledge', []))]
    if not blocks:
        blocks = [{
            'id': f"{step['id']}_block_lead",
            'type': 'lead',
            'title': step.get('title', 'Lerninhalt'),
            'text': step.get('description') or step.get('objective') or '',
        }]
    size = 3 if len(blocks) > 4 else len(blocks)
    sections = []
    for offset in range(0, len(blocks), max(1, size)):
        part = blocks[offset:offset + max(1, size)]
        first_title = part[0].get('title') or step.get('title', 'Abschnitt')
        sections.append({
            'id': f"{step['id']}_section_{len(sections) + 1}",
            'title': first_title if len(sections) else step.get('title', first_title).split(' · ')[0],
            'description': step.get('description', ''),
            'estimatedMinutes': max(1, round(step.get('estimatedMinutes', 4) * len(part) / max(1, len(blocks)))),
            'contentIds': [],
            'blocks': part,
        })
    return sections


def content_sections(step: dict) -> list[dict]:
    ids = list(step.get('contentIds', []))
    module = step.get('contentModule', '')
    if not ids:
        return [{
            'id': f"{step['id']}_section_1",
            'title': step.get('title', 'Lerninhalt'),
            'description': step.get('description', ''),
            'estimatedMinutes': step.get('estimatedMinutes', 4),
            'contentIds': [],
            'blocks': [{
                'id': f"{step['id']}_block_lead",
                'type': 'lead',
                'title': step.get('title', 'Lerninhalt'),
                'text': step.get('description') or step.get('objective') or '',
            }],
        }]
    chunk = {'alphabet': 7, 'vocabulary': 6, 'grammar': 2, 'writing': 3, 'reading': 2, 'quran': 2}.get(module, 4)
    sections = []
    for offset in range(0, len(ids), chunk):
        part = ids[offset:offset + chunk]
        start, end = offset + 1, offset + len(part)
        label = DOMAIN_LABELS.get(module, 'Inhalte')
        title = label if len(ids) <= chunk else f'{label} {start}–{end}'
        sections.append({
            'id': f"{step['id']}_section_{len(sections) + 1}",
            'title': title,
            'description': step.get('description', ''),
            'estimatedMinutes': max(1, round(step.get('estimatedMinutes', 4) * len(part) / len(ids))),
            'contentIds': part,
            'blocks': [],
        })
    return sections


def alphabet_pilot(step: dict) -> list[dict] | None:
    if step.get('id') != 'fusha_a0_alphabet_learn_1': return None
    ids = list(step.get('contentIds', []))
    groups = [ids[i:i+7] for i in range(0, len(ids), 7)]
    sections = [{
        'id': f"{step['id']}_intro",
        'title': 'Einführung',
        'description': 'Schreibrichtung und Lernziel',
        'estimatedMinutes': 1,
        'contentIds': [],
        'blocks': [
            {'id': f"{step['id']}_lead", 'type': 'lead', 'title': 'So liest du Arabisch', 'text': 'Arabisch wird von rechts nach links gelesen und geschrieben. In diesem Lernschritt konzentrierst du dich auf isolierte Grundform, Buchstabenname und Grundlaut.'},
            {'id': f"{step['id']}_remember", 'type': 'remember', 'title': 'Ziel', 'text': 'Erkennen, benennen und hören – die verbundenen Schreibformen folgen erst im nächsten Lernschritt.'},
        ],
    }]
    ranges = [('ا–خ', 2), ('د–ص', 2), ('ض–ق', 2), ('ك–ي', 2)]
    for idx, group in enumerate(groups):
        sections.append({
            'id': f"{step['id']}_group_{idx + 1}",
            'title': f'Gruppe {idx + 1} · {ranges[idx][0] if idx < len(ranges) else idx + 1}',
            'description': 'Sieben Buchstaben nacheinander erkennen, benennen und anhören.',
            'estimatedMinutes': ranges[idx][1] if idx < len(ranges) else 2,
            'contentIds': group,
            'blocks': [],
        })
    sections.append({
        'id': f"{step['id']}_finish",
        'title': 'Selbstkontrolle',
        'description': 'Formfamilien kurz vergleichen',
        'estimatedMinutes': 1,
        'contentIds': [],
        'blocks': [
            {'id': f"{step['id']}_checkpoint", 'type': 'checkpoint', 'title': 'Kurz prüfen', 'text': 'Kannst du ähnliche Grundformen über ihre Punkte unterscheiden und den Buchstabennamen nennen?'},
            {'id': f"{step['id']}_summary", 'type': 'summary', 'title': 'Geschafft', 'text': 'Du hast alle 28 isolierten Grundformen gesehen. Im nächsten Lernschritt lernst du, wie sich Formen beim Verbinden verändern.'},
        ],
    })
    return sections


def madhhab_pilot(step: dict) -> list[dict] | None:
    sid = step.get('id', '')
    if not sid.startswith('fiqh_hanafi_s0_methodik_learn_'): return None
    number = int(sid.rsplit('_', 1)[-1])
    knowledge = step.get('knowledge', [])
    def kb(i, typ=None):
        raw = knowledge[i]
        b = knowledge_block(step, raw, i)
        if typ: b['type'] = typ
        return b
    if number == 1 and len(knowledge) >= 4:
        return [
            {'id':f'{sid}_intro','title':'Einführung','description':'Warum Begriffe zuerst sauber getrennt werden','estimatedMinutes':1,'contentIds':[],'blocks':[{'id':f'{sid}_lead','type':'lead','title':'Orientierung','text':step.get('objective','')}]},
            {'id':f'{sid}_terms','title':'Kernbegriffe','description':'Madhhab, Masʾala und Attribution','estimatedMinutes':5,'contentIds':[],'blocks':[kb(0,'definition'),kb(1,'definition'),kb(2,'definition')]},
            {'id':f'{sid}_relation','title':'Zusammenhang','description':'Begriffe gemeinsam anwenden','estimatedMinutes':1,'contentIds':[],'blocks':[{'id':f'{sid}_relation_block','type':'contrast','title':'Zusammenhang','text':'Eine Masʾala wird zuerst sachlich beschrieben; ihre Darstellung muss anschließend eindeutig einer Rechtsschule, einem Werk und gegebenenfalls einem Autor attribuiert werden.'}]},
            {'id':f'{sid}_check','title':'Checkpoint','description':'Fehlende Information erkennen','estimatedMinutes':1,'contentIds':[],'blocks':[{'id':f'{sid}_check_block','type':'checkpoint','title':'Kurz prüfen','text':'Eine Regel aus einem Lehrbuch wird ohne Schulangabe zitiert. Welche Zuordnung fehlt, bevor du sie als Madhhab-Position einordnest?'}]},
        ]
    if number == 2 and len(knowledge) >= 4:
        return [
            {'id':f'{sid}_method','title':'Prüfreihenfolge','description':'Vom Sachverhalt zur sauber attribuierten Aussage','estimatedMinutes':6,'contentIds':[],'blocks':[{'id':f'{sid}_steps','type':'steps','title':'Prüfschritte','text':'Arbeite die Schritte nacheinander ab.','items':[knowledge[0]['text'],knowledge[1]['text'],knowledge[2]['text']]}]},
            {'id':f'{sid}_remember','title':'Merksatz','description':'Methode sichern','estimatedMinutes':2,'contentIds':[],'blocks':[kb(3,'remember')]},
        ]
    if number == 3 and len(knowledge) >= 4:
        return [
            {'id':f'{sid}_cases','title':'Fallkarten','description':'Drei Fälle methodisch einordnen','estimatedMinutes':6,'contentIds':[],'blocks':[kb(0,'example'),kb(1,'example'),kb(2,'example')]},
            {'id':f'{sid}_task','title':'Arbeitsauftrag','description':'Nächsten Prüfschritt begründen','estimatedMinutes':2,'contentIds':[],'blocks':[kb(3,'checkpoint')]},
        ]
    if number == 4 and len(knowledge) >= 6:
        return [
            {'id':f'{sid}_errors','title':'Typische Fehler','description':'Drei Abkürzungen vermeiden','estimatedMinutes':4,'contentIds':[],'blocks':[kb(0,'warning'),kb(1,'warning'),kb(2,'warning')]},
            {'id':f'{sid}_sources','title':'Quellen & Grenzen','description':'Quellenstatus und Aussagegrenze sichtbar halten','estimatedMinutes':4,'contentIds':[],'blocks':[kb(3,'explanation'),kb(4,'checkpoint'),kb(5,'warning')]},
        ]
    return None


def enrich_step(step: dict) -> dict:
    pilot = alphabet_pilot(step) or madhhab_pilot(step)
    if pilot is not None:
        step['sections'] = pilot
    elif step.get('kind') == 'content':
        step['sections'] = content_sections(step)
    else:
        step['sections'] = generic_knowledge_sections(step)
    return step


def enrich_paths(paths: list[dict]) -> list[dict]:
    for chapter in paths:
        for unit in chapter.get('units', []):
            for step in unit.get('learningSteps', []):
                enrich_step(step)
    return paths
