#!/usr/bin/env python3
"""Builds the versioned read-only release catalog as bundled JSON."""
from __future__ import annotations

import csv
import json
import hashlib
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from guided_sections import enrich_paths
from content_build.io import load_split_array, read_json, write_json
from content_build.fiqh_layers import load_fiqh_paths
from content_build.quran_structure import load_quran_structure

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'content-src'
OUTPUT = ROOT / 'public' / 'content'
VERSION = '0.12.1'
UPDATED = '2026-08-16'
LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
ISLAMIC_TRACKS = ['fiqh_hanafi', 'fiqh_maliki', 'fiqh_shafii', 'fiqh_hanbali', 'usul_fiqh', 'hadith', 'usul_hadith']
RELEASE_ORDER = 1210
CATALOG_SCHEMA_VERSION = 8
QUIZ_POOL_SIZE = 12
QUIZ_QUESTIONS_PER_ATTEMPT = 7
EXPECTED_QURAN_WORDS = 77_433




def load_vocabulary() -> list[dict]:
    path = SOURCE / 'vocabulary' / 'vocabulary.csv'
    examples_path = SOURCE / 'vocabulary' / 'examples.json'
    examples_by_id = read_json(examples_path)
    if not isinstance(examples_by_id, dict):
        raise ValueError(f'{examples_path}: Objekt mit Vokabel-IDs erwartet')
    result: list[dict] = []
    seen_ids: set[str] = set()
    with path.open(encoding='utf-8-sig', newline='') as handle:
        for index, raw in enumerate(csv.DictReader(handle, delimiter=';'), start=2):
            required = ['id', 'arabicVocalized', 'arabicUnvocalized', 'transliteration', 'german', 'categoryId', 'category', 'partOfSpeech', 'cefrLevel']
            missing = [key for key in required if not raw.get(key, '').strip()]
            if missing:
                raise ValueError(f'{path}:{index}: Pflichtfelder fehlen: {", ".join(missing)}')
            level = raw['cefrLevel'].strip()
            if level not in LEVELS:
                raise ValueError(f'{path}:{index}: Ungültiges Niveau {level}')
            entry_id = raw['id'].strip()
            seen_ids.add(entry_id)
            source_examples = examples_by_id.get(entry_id)
            if not isinstance(source_examples, list) or len(source_examples) < 2:
                raise ValueError(f'{examples_path}: {entry_id} benötigt mindestens zwei redaktionelle Kontextbeispiele')
            normalized_examples: list[dict] = []
            for example_index, example in enumerate(source_examples, start=1):
                if not isinstance(example, dict):
                    raise ValueError(f'{examples_path}: {entry_id}/Beispiel {example_index} ist kein Objekt')
                required_example = ['id', 'arabicVocalized', 'arabicUnvocalized', 'transliteration', 'german']
                missing_example = [key for key in required_example if not str(example.get(key, '')).strip()]
                if missing_example:
                    raise ValueError(f'{examples_path}: {entry_id}/Beispiel {example_index}: Pflichtfelder fehlen: {", ".join(missing_example)}')
                expected_id = f'{entry_id}_example_{example_index}'
                if example['id'].strip() != expected_id:
                    raise ValueError(f'{examples_path}: {entry_id}/Beispiel {example_index}: ID {expected_id} erwartet')
                normalized_examples.append({key: str(example[key]).strip() for key in required_example})
            tags = [value.strip() for value in raw.get('tags', '').split('|') if value.strip()]
            word = {
                'id': raw['id'].strip(),
                'arabicVocalized': raw['arabicVocalized'].strip(),
                'arabicUnvocalized': raw['arabicUnvocalized'].strip(),
                'transliteration': raw['transliteration'].strip(),
                'german': raw['german'].strip(),
                'category': raw['category'].strip(),
                'categoryId': raw['categoryId'].strip(),
                'difficulty': int(raw.get('difficulty') or LEVELS.index(level) + 1),
                'tags': tags,
                'stage': int(raw.get('stage') or LEVELS.index(level) + 1),
                'partOfSpeech': raw['partOfSpeech'].strip(),
                'lemmaVocalized': raw.get('lemmaVocalized', '').strip() or raw['arabicVocalized'].strip(),
                'lemmaUnvocalized': raw.get('lemmaUnvocalized', '').strip() or raw['arabicUnvocalized'].strip(),
                'wordFamily': [value.strip() for value in raw.get('wordFamily', '').split('|') if value.strip()],
                'collocations': [value.strip() for value in raw.get('collocations', '').split('|') if value.strip()],
                'register': raw.get('register', '').strip() or ('academic' if level in {'C1', 'C2'} else 'neutral'),
                'activeUse': str(raw.get('activeUse', '')).strip().lower() not in {'0', 'false', 'no', 'nein'},
                'frequencyBand': raw.get('frequencyBand', '').strip() or 'common',
                'examples': normalized_examples,
                'contentVersion': VERSION,
                'status': raw.get('status', '').strip() or 'draft',
                'source': 'Fusha-Redaktion – fachliche Endprüfung ausstehend',
                'lastUpdated': UPDATED,
                'learningObjectives': [
                    f"„{raw['german'].strip()}“ im modernen Hocharabisch erkennen und aktiv verwenden.",
                    'Die vokalisierte und unvokalisierte Form unterscheiden.'
                ],
                'reviewTags': list(dict.fromkeys(['vocabulary', 'fusha', level.lower(), raw['categoryId'].strip(), *tags])),
                'cefrLevel': level,
                'arabicVariety': 'fusha'
            }
            optional = {
                'gender': raw.get('gender', '').strip(),
                'pluralVocalized': raw.get('pluralVocalized', '').strip(),
                'pluralUnvocalized': raw.get('pluralUnvocalized', '').strip(),
                'root': raw.get('root', '').strip(),
                'pattern': raw.get('pattern', '').strip(),
                'usageNote': raw.get('usageNote', '').strip(),
                'hint': raw.get('hint', '').strip(),
                'translationNote': raw.get('translationNote', '').strip()
            }
            for key, value in optional.items():
                if value:
                    word[key] = value
            result.append(word)
    extra_example_ids = sorted(set(examples_by_id) - seen_ids)
    if extra_example_ids:
        raise ValueError(f'{examples_path}: Beispiele für unbekannte Vokabel-IDs: {", ".join(extra_example_ids[:10])}')

    def example_key(value: str, *, strip_diacritics: bool = False) -> str:
        normalized = re.sub(r'\s+', ' ', value).strip().casefold()
        if strip_diacritics:
            normalized = re.sub(r'[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]', '', normalized)
        return normalized

    seen_arabic: dict[str, str] = {}
    seen_transliteration: dict[str, str] = {}
    for word in result:
        for example in word['examples']:
            arabic_key = example_key(example['arabicUnvocalized'], strip_diacritics=True)
            transliteration_key = example_key(example['transliteration'])
            if re.search(r'نستعمل\s*[«"]?', example['arabicUnvocalized']):
                raise ValueError(f'{examples_path}: {example["id"]}: generisches Alt-Muster ist nicht zulässig')
            if arabic_key in seen_arabic:
                raise ValueError(f'{examples_path}: doppelter arabischer Beispielsatz in {seen_arabic[arabic_key]} und {example["id"]}')
            if transliteration_key in seen_transliteration:
                raise ValueError(f'{examples_path}: doppelte Beispiel-Transliteration in {seen_transliteration[transliteration_key]} und {example["id"]}')
            seen_arabic[arabic_key] = example['id']
            seen_transliteration[transliteration_key] = example['id']
    return result


def level_index(level: str) -> int:
    return LEVELS.index(level) if level in LEVELS else 0


def build_learning_items(content: dict[str, list[dict]]) -> list[dict]:
    result: list[dict] = []
    template_ids_by_domain = {
        'alphabet': ['tpl_script_recognition', 'tpl_script_sound', 'tpl_script_forms', 'tpl_script_trace'],
        'vocabulary': ['tpl_vocab_recognition', 'tpl_vocab_context', 'tpl_vocab_recall', 'tpl_vocab_listening', 'tpl_vocab_dictation', 'tpl_vocab_speaking'],
        'grammar': ['tpl_grammar_rule', 'tpl_grammar_cloze', 'tpl_grammar_error_correction', 'tpl_sentence_order'],
        'writing': ['tpl_writing_copy', 'tpl_writing_production'],
        'reading': ['tpl_reading_vocalized', 'tpl_reading_harakat', 'tpl_reading_comprehension'],
        'quran': ['tpl_quran_signs', 'tpl_quran_tajweed', 'tpl_quran_pause']
    }
    for domain in ['alphabet', 'vocabulary', 'grammar', 'writing', 'reading', 'quran']:
        for item in content[domain]:
            level = item.get('cefrLevel', 'A0')
            skills: list[str] = []
            templates = list(template_ids_by_domain[domain])
            if domain == 'alphabet':
                skills = ['script_recognition', 'script_forms']
            elif domain == 'vocabulary':
                skills = ['vocabulary_recognition']
                if level_index(level) >= level_index('A1'): skills.append('vocabulary_recall')
                if item.get('root') and level_index(level) >= level_index('A2'): skills.append('vocabulary_word_family')
            elif domain == 'grammar':
                skills = ['grammar_foundations' if level_index(level) <= level_index('A2') else 'grammar_complex']
                if any(token in str(item.get('title', '')).lower() for token in ['verb', 'maṣdar', 'partizip', 'stamm', 'plural']): skills.append('morphology_patterns')
            elif domain == 'writing':
                skills = ['writing_control']
                if level_index(level) >= level_index('A2'): skills.append('writing_production')
            elif domain == 'reading':
                skills = ['reading_comprehension']
                if level_index(level) <= level_index('A2'): skills.insert(0, 'reading_decoding')
                if level_index(level) >= level_index('B1'): skills.append('reading_inference')
            else:
                qlevel = item.get('quranLevel', 'Q0')
                if qlevel in {'Q0', 'Q1'}: skills = ['quran_script']
                elif qlevel in {'Q2', 'Q3', 'Q4'}: skills = ['quran_tajweed']
                elif qlevel == 'Q5': skills = ['quran_vocabulary']
                else: skills = ['quran_grammar']
            if domain == 'vocabulary':
                templates = ['tpl_vocab_recognition', 'tpl_vocab_context', 'tpl_vocab_listening', 'tpl_vocab_speaking']
                if level_index(level) >= level_index('A1'):
                    templates.extend(['tpl_vocab_recall', 'tpl_vocab_dictation'])
                if item.get('root') and level_index(level) >= level_index('A2'):
                    templates.append('tpl_morphology_root')
                if level_index(level) >= level_index('B2'):
                    templates.append('tpl_register_shift')
            if domain == 'grammar':
                templates = ['tpl_grammar_rule', 'tpl_sentence_order']
                if any(question.get('type') == 'cloze' for question in item.get('quiz', [])):
                    templates.append('tpl_grammar_cloze')
                if item.get('commonMistakes'):
                    templates.append('tpl_grammar_error_correction')
            if domain == 'quran' and item.get('category') == 'language':
                templates = ['tpl_quran_language']
            prerequisite_items = []
            if domain == 'grammar':
                prerequisite_items = [f'li_grammar_{entry}' for entry in item.get('prerequisiteLessonIds', [])]
            elif domain == 'quran':
                prerequisite_items = [f'li_quran_{entry}' for entry in item.get('prerequisites', [])]
            title = item.get('title') or item.get('german') or item.get('name') or item.get('letter') or item['id']
            result.append({
                'id': f'li_{domain}_{item["id"]}',
                'contentModule': domain,
                'contentId': item['id'],
                'title': title,
                'competencyIds': list(dict.fromkeys(skills)),
                'exerciseTemplateIds': list(dict.fromkeys(templates)),
                'prerequisiteItemIds': prerequisite_items,
                'productionExpected': level_index(level) >= level_index('A2') or domain in {'writing'},
                'contentVersion': VERSION,
                'status': item.get('status', 'draft'),
                'source': item.get('source', 'Fusha-Redaktion – fachliche Endprüfung ausstehend'),
                'lastUpdated': UPDATED,
                'learningObjectives': [f'{title} als überprüfbares Learning Item beherrschen.'],
                'reviewTags': list(dict.fromkeys(['learning-item', domain, level.lower(), *item.get('reviewTags', [])])),
                'cefrLevel': level,
                'arabicVariety': item.get('arabicVariety', 'fusha')
            })
    return result



def compact_text(value: object) -> str:
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def unique_texts(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = compact_text(value)
        key = normalized.casefold()
        if normalized and key not in seen:
            seen.add(key)
            result.append(normalized)
    return result


def deterministic_options(correct: str, pool: list[str], seed: int) -> list[str]:
    """Creates four reproducible options without changing the correct value."""
    correct = compact_text(correct)
    candidates = unique_texts([value for value in pool if compact_text(value).casefold() != correct.casefold()])
    if len(candidates) < 3:
        raise ValueError(f'Fragenpool: Zu wenige eindeutige Ablenkungen für „{correct}“')
    start = (sum(ord(character) for character in correct) + seed * 17) % len(candidates)
    distractors = [candidates[(start + offset) % len(candidates)] for offset in range(3)]
    options = [correct, *distractors]
    shift = seed % len(options)
    return options[shift:] + options[:shift]


def example_sentence(example: dict, field: str) -> str:
    return ' '.join(compact_text(block.get(field)) for block in example.get('blocks', []) if compact_text(block.get(field)))


def expand_grammar_quiz_pools(lessons: list[dict]) -> list[dict]:
    """Builds a deterministic 12-question pool from each lesson's reviewed source fields.

    The source JSON keeps hand-written seed questions. Additional questions are
    reproducibly derived from descriptions, rules, notes and examples, so editors
    only maintain one source of truth. Every generated question still remains a
    draft until the lesson receives independent subject-matter review.
    """
    section_labels = {
        'general': 'Überblick',
        'rules': 'Regeln',
        'important': 'Wichtig zu wissen',
        'exceptions': 'Sonderfälle'
    }
    section_pools = {
        key: unique_texts([
            compact_text(statement)
            for lesson in lessons
            for statement in lesson.get(key, [])
        ])
        for key in section_labels
    }
    description_pool = unique_texts([compact_text(lesson.get('description')) for lesson in lessons])
    translation_pool = unique_texts([
        compact_text(example.get('translation'))
        for lesson in lessons
        for example in lesson.get('examples', [])
    ])
    block_meaning_pool = unique_texts([
        compact_text(block.get('german'))
        for lesson in lessons
        for example in lesson.get('examples', [])
        for block in example.get('blocks', [])
    ])

    for lesson_index, lesson in enumerate(lessons):
        existing = list(lesson.get('quiz', []))
        generated: list[dict] = []
        title = compact_text(lesson.get('title'))
        candidates: list[dict] = []

        description = compact_text(lesson.get('description'))
        if description:
            candidates.append({
                'prompt': f'Welche Lernzielbeschreibung gehört zur Lektion „{title}“?',
                'optionsPool': description_pool,
                'correctAnswer': description,
                'explanation': f'Diese Beschreibung fasst das Lernziel der Lektion „{title}“ zusammen.'
            })

        for section, section_label in section_labels.items():
            for statement in lesson.get(section, []):
                correct = compact_text(statement)
                if not correct:
                    continue
                candidates.append({
                    'prompt': f'Welche Aussage ist in der Lektion „{title}“ unter „{section_label}“ ausdrücklich festgehalten?',
                    'optionsPool': section_pools[section],
                    'correctAnswer': correct,
                    'explanation': f'Die Aussage steht im Abschnitt „{section_label}“ der Lektion „{title}“.'
                })

        for example in lesson.get('examples', []):
            translation = compact_text(example.get('translation'))
            arabic = example_sentence(example, 'arabicVocalized') or example_sentence(example, 'arabicUnvocalized')
            if translation and arabic:
                candidates.append({
                    'prompt': f'Welche deutsche Übersetzung passt zum Beispielsatz aus „{title}“?',
                    'arabicPrompt': arabic,
                    'optionsPool': translation_pool,
                    'correctAnswer': translation,
                    'explanation': f'Der Beispielsatz „{arabic}“ wird in dieser Lektion mit „{translation}“ erklärt.'
                })
            for block in example.get('blocks', []):
                arabic_block = compact_text(block.get('arabicVocalized') or block.get('arabicUnvocalized'))
                german_block = compact_text(block.get('german'))
                if arabic_block and german_block:
                    candidates.append({
                        'prompt': f'Welche Bedeutung hat dieser Satzbaustein im Beispiel aus „{title}“?',
                        'arabicPrompt': arabic_block,
                        'optionsPool': block_meaning_pool,
                        'correctAnswer': german_block,
                        'explanation': f'Der Baustein „{arabic_block}“ trägt in diesem Beispiel die Bedeutung „{german_block}“.'
                    })

        fingerprints = {
            (compact_text(question.get('prompt')).casefold(), compact_text(question.get('correctAnswer')).casefold())
            for question in existing
        }
        for candidate_index, candidate in enumerate(candidates, start=1):
            if len(existing) + len(generated) >= QUIZ_POOL_SIZE:
                break
            fingerprint = (compact_text(candidate['prompt']).casefold(), compact_text(candidate['correctAnswer']).casefold())
            if fingerprint in fingerprints:
                continue
            fingerprints.add(fingerprint)
            seed = lesson_index * 100 + candidate_index
            question = {
                'id': f"{lesson['id']}_auto_{len(generated) + 1:02d}",
                'type': 'multiple_choice',
                'prompt': candidate['prompt'],
                'options': deterministic_options(candidate['correctAnswer'], candidate['optionsPool'], seed),
                'correctAnswer': candidate['correctAnswer'],
                'explanation': candidate['explanation']
            }
            if candidate.get('arabicPrompt'):
                question['arabicPrompt'] = candidate['arabicPrompt']
            generated.append(question)

        lesson['quiz'] = [*existing, *generated]
        if len(lesson['quiz']) < QUIZ_POOL_SIZE:
            raise ValueError(f"Grammatik {lesson['id']}: Der ableitbare Fragenpool enthält nur {len(lesson['quiz'])} Fragen")
        lesson['quizQuestionCount'] = min(QUIZ_QUESTIONS_PER_ATTEMPT, len(lesson['quiz']))
        lesson['reviewTags'] = list(dict.fromkeys([*lesson.get('reviewTags', []), 'question-pool', 'generated-variants']))
    return lessons

def ensure_metadata(items: list[dict], variety: str = 'fusha') -> list[dict]:
    for item in items:
        level = item.get('cefrLevel')
        if level not in LEVELS:
            raise ValueError(f"{item.get('id', '<ohne id>')}: CEFR-Niveau fehlt oder ist ungültig")
        item['contentVersion'] = VERSION
        item['status'] = item.get('status') or 'draft'
        item['source'] = item.get('source') or ('Quran-/Tajwīd-Redaktion – fachliche Prüfung ausstehend' if variety == 'quranic' else 'Fusha-Redaktion – fachliche Endprüfung ausstehend')
        item['lastUpdated'] = UPDATED
        item['arabicVariety'] = variety
        item['learningObjectives'] = item.get('learningObjectives') or [item.get('description') or item.get('objective') or item.get('title') or item.get('name') or 'Lerninhalt bearbeiten.']
        tags = ['quran' if variety == 'quranic' else 'fusha', level.lower()]
        item['reviewTags'] = list(dict.fromkeys([*item.get('reviewTags', []), *tags]))
    return items



def ensure_semantic_metadata(items: list[dict]) -> list[dict]:
    """Adds catalog metadata to skills/templates without duplicating editorial fields in source files."""
    for item in items:
        level = item.get('cefrLevel') or item.get('minLevel') or (item.get('levels') or ['A0'])[0]
        if level not in LEVELS:
            raise ValueError(f"{item.get('id', '<ohne id>')}: semantisches CEFR-Niveau fehlt oder ist ungültig")
        item['cefrLevel'] = level
        item['contentVersion'] = VERSION
        item['status'] = item.get('status') or 'draft'
        item['source'] = item.get('source') or 'Didaktische Semantikschicht – redaktionelle Prüfung ausstehend'
        item['lastUpdated'] = UPDATED
        item['arabicVariety'] = item.get('arabicVariety') or 'fusha'
        item['learningObjectives'] = item.get('learningObjectives') or [item.get('description') or item.get('title') or 'Kompetenz abbilden.']
        item['reviewTags'] = list(dict.fromkeys([*item.get('reviewTags', []), 'semantic-layer', level.lower()]))
    return items


def enhance_v012_course_exercises(content: dict[str, list[dict]]) -> None:
    """Add executable listening/speaking evidence across the complete Fusha path.

    v0.24/P3 turns audio and oral production into a systematic layer instead of a
    vocabulary-only add-on. Every activity reuses content already referenced by the
    module; no new teaching facts are synthesized here.
    """
    ids_by_domain = {
        'alphabet': {item['id'] for item in content['alphabet']},
        'vocabulary': {item['id'] for item in content['vocabulary']},
        'grammar': {item['id'] for item in content['grammar']},
        'reading': {item['id'] for item in content['reading']},
        'writing': {item['id'] for item in content['writing']},
    }

    listening_specs = {
        'vocabulary': ('vocabulary', 'vocabulary_listening', 'tpl_vocab_listening', ['vocabulary_recognition', 'listening_comprehension'], 'Wörter hören und verstehen'),
        'grammar': ('grammar', 'grammar_listening', 'tpl_grammar_listening', ['grammar_foundations', 'listening_comprehension'], 'Grammatik hören und verstehen'),
        'reading': ('reading', 'reading_listening', 'tpl_reading_listening', ['reading_comprehension', 'listening_comprehension'], 'Sätze hören und verstehen'),
        'writing': ('writing', 'writing_dictation', 'tpl_writing_dictation', ['writing_production', 'listening_comprehension'], 'Hören und schreiben'),
        'alphabet': ('alphabet', 'alphabet_sound', 'tpl_script_sound', ['script_recognition', 'listening_comprehension'], 'Laute hören und erkennen'),
    }

    def referenced_content(unit: dict) -> dict[str, list[str]]:
        found: dict[str, list[str]] = {key: [] for key in ids_by_domain}
        for step in unit.get('learningSteps', []):
            domain = step.get('contentModule')
            if domain not in found:
                continue
            for item_id in step.get('contentIds', []):
                if item_id in ids_by_domain[domain] and item_id not in found[domain]:
                    found[domain].append(item_id)
        return found

    for chapter in content['learningPath']:
        for unit in chapter.get('units', []):
            refs = referenced_content(unit)
            practice = next((phase for phase in unit.get('phases', []) if phase.get('type') == 'practice'), None)
            deepen = next((phase for phase in unit.get('phases', []) if phase.get('type') == 'deepen'), None)

            # One auditory evidence activity in every module, choosing the most
            # semantically useful content already taught in that module.
            listening_domain = next((domain for domain in ('vocabulary', 'grammar', 'reading', 'writing', 'alphabet') if refs[domain]), None)
            if practice and listening_domain and not any(a.get('exerciseVariant') in {'vocabulary_listening','grammar_listening','reading_listening','writing_dictation','alphabet_sound'} for a in practice.get('activities', [])):
                exercise_type, variant, template_id, competency_ids, title = listening_specs[listening_domain]
                practice['activities'].append({
                    'id': f"{unit['id']}_practice_listening",
                    'title': title,
                    'description': 'Bereits eingeführten Lernstoff auditiv erkennen und anwenden.',
                    'objective': f"{unit.get('objective', 'Den Lernstoff')} auch ohne visuelle Stütze sicher verarbeiten.",
                    'kind': 'exercise', 'icon': 'audio', 'required': True, 'estimatedMinutes': 4,
                    'contentIds': refs[listening_domain][:12], 'knowledge': [], 'exerciseType': exercise_type,
                    'exerciseVariant': variant, 'exerciseTemplateId': template_id,
                    'minimumScore': 70, 'competencyIds': competency_ids
                })

            # Oral production is available throughout the Fusha journey. Speaking
            # uses a domain that has pronounceable target text; alphabet-only units
            # fall back to their writing targets when present.
            speaking_domain = next((domain for domain in ('vocabulary', 'reading', 'grammar', 'writing') if refs[domain]), None)
            if deepen and speaking_domain and not any(a.get('exerciseVariant') == 'speaking_shadowing' for a in deepen.get('activities', [])):
                deepen['activities'].append({
                    'id': f"{unit['id']}_deepen_speaking",
                    'title': 'Nachsprechen und produzieren',
                    'description': 'Bekannte Wörter oder Sätze anhören, selbst sprechen und vergleichen.',
                    'objective': f"{unit.get('objective', 'Den Lernstoff')} aktiv aussprechen und abrufen.",
                    'kind': 'exercise', 'icon': 'microphone', 'required': False, 'estimatedMinutes': 4,
                    'contentIds': refs[speaking_domain][:8], 'knowledge': [], 'exerciseType': 'speaking',
                    'exerciseVariant': 'speaking_shadowing', 'exerciseTemplateId': 'tpl_speaking_production',
                    'minimumScore': 70, 'competencyIds': ['speaking_production', 'listening_comprehension']
                })

    # Specialist Islamic interactions remain subject-review gated; they reuse the
    # existing module question pool and do not claim external scholarly validation.
    for chapter in content['islamicPaths']:
        for unit in chapter.get('units', []):
            deepen = next((phase for phase in unit.get('phases', []) if phase.get('type') == 'deepen'), None)
            if not deepen or not deepen.get('activities'):
                continue
            activity = deepen['activities'][0]
            track = unit.get('track', '')
            if track in {'hadith', 'usul_hadith'}:
                activity['exerciseVariant'] = 'hadith_analysis'
                activity['exerciseTemplateId'] = 'tpl_hadith_analysis'
                activity['title'] = 'Hadith-Labor'
                activity['description'] = 'Aussage, Überlieferungskontext, Einstufung und methodische Grenze anhand der Modulfragen unterscheiden.'
            elif str(track).startswith('fiqh_') and chapter.get('studyLevel') in {'S2', 'S3'}:
                activity['exerciseVariant'] = 'fiqh_compare'
                activity['exerciseTemplateId'] = 'tpl_fiqh_compare'
                activity['title'] = 'Fiqh-Vergleich'
                activity['description'] = 'Schulgebundene Position, Begründungsrahmen und Vergleichsgrenze explizit unterscheiden.'

SOURCE_IDS_BY_TRACK = {
    'fiqh_hanafi': ['src_fiqh_hanafi_quduri', 'src_fiqh_hanafi_hidaya'],
    'fiqh_maliki': ['src_fiqh_maliki_risala', 'src_fiqh_maliki_mudawwana'],
    'fiqh_shafii': ['src_fiqh_shafii_minhaj', 'src_fiqh_shafii_umm'],
    'fiqh_hanbali': ['src_fiqh_hanbali_umda', 'src_fiqh_hanbali_mughni'],
    'usul_fiqh': ['src_usul_waraqat', 'src_usul_risala_shafii', 'src_usul_burhan_juwayni', 'src_usul_mustasfa_ghazali', 'src_usul_rawda_ibn_qudama'],
    'hadith': ['src_hadith_bukhari', 'src_hadith_muslim', 'src_hadith_muwatta', 'src_hadith_abu_dawud', 'src_hadith_tirmidhi', 'src_hadith_nasai', 'src_hadith_ibn_majah', 'src_hadith_nawawi40', 'src_hadith_riyad'],
    'usul_hadith': ['src_usul_hadith_ibn_salah', 'src_usul_hadith_nuzha', 'src_usul_hadith_kifaya', 'src_usul_hadith_tadrib'],
}


def source_kind_for_record(source: dict) -> str:
    source_type = source.get('type')
    if source_type == 'quran': return 'quran'
    if source_type == 'hadith': return 'collection'
    if source_type in {'fiqh_work', 'usul_work', 'classical_work', 'commentary', 'modern_academic', 'reference_work'}: return 'book'
    if source_type == 'curriculum': return 'curriculum'
    return 'editorial'


def build_source_layer(content: dict[str, list[dict]], sources: list[dict]) -> dict[str, list[dict]]:
    source_by_id = {entry['id']: entry for entry in sources}
    citations: list[dict] = []
    claims: list[dict] = []
    links: list[dict] = []
    citation_ids: set[str] = set()
    claim_ids: set[str] = set()

    def source_ids_for(path_name: str, unit: dict) -> list[str]:
        if path_name == 'learningPath': return ['src_curriculum_fusha']
        if path_name == 'quranPath': return ['src_curriculum_quran']
        return SOURCE_IDS_BY_TRACK.get(str(unit.get('track')), [])

    def domain_for(path_name: str, unit: dict) -> str:
        if path_name == 'learningPath': return 'language'
        if path_name == 'quranPath': return 'quran'
        track = str(unit.get('track'))
        if track.startswith('fiqh_'): return 'fiqh'
        return track

    def claim_kind(title: str) -> str:
        value = title.casefold()
        if 'quelle' in value: return 'source_note'
        if 'grenze' in value or 'review' in value: return 'boundary'
        if 'fall' in value or 'anwendung' in value: return 'case'
        if 'prüfschritt' in value or 'systematik' in value or 'methode' in value: return 'method'
        if any(token in value for token in ['begriff', 'definition', 'madhhab', 'ḥukm', 'isnād', 'matn']): return 'definition'
        return 'teaching_summary'

    for path_name in ('learningPath', 'quranPath', 'islamicPaths'):
        for chapter in content[path_name]:
            for unit in chapter.get('units', []):
                selected_source_ids = source_ids_for(path_name, unit)
                if not selected_source_ids:
                    raise ValueError(f"{unit['id']}: kein Quellenkatalog für Track {unit.get('track')}")
                unit_citations: list[dict] = []
                for index, source_id in enumerate(selected_source_ids, start=1):
                    source = source_by_id.get(source_id)
                    if not source:
                        raise ValueError(f"{unit['id']}: Source {source_id} fehlt")
                    citation_id = f"cit_{unit['id']}_{index}"
                    if citation_id in citation_ids:
                        raise ValueError(f"Doppelte Citation-ID {citation_id}")
                    citation_ids.add(citation_id)
                    citation = {
                        'id': citation_id,
                        'sourceId': source_id,
                        'moduleId': unit['id'],
                        'locatorText': f"Orientierungsnachweis für Modul „{unit['title']}“; konkrete Band-/Seiten-/Kapitelstelle im Quellenreview offen.",
                        'exactLocatorVerified': False,
                        'reviewStatus': 'referenced'
                    }
                    citations.append(citation)
                    unit_citations.append(citation)
                citation_id_list = [entry['id'] for entry in unit_citations]
                trace_citation_ids = citation_id_list[:3] if str(unit.get('track')) == 'hadith' else citation_id_list[:2]
                for traceable in [*unit.get('learningSteps', []), *[a for phase in unit.get('phases', []) for a in phase.get('activities', [])], *unit.get('knowledgeQuestions', [])]:
                    traceable['sourceRefIds'] = trace_citation_ids

                objective_claim_id = f"claim_{unit['id']}_objective"
                claims.append({
                    'id': objective_claim_id,
                    'text': unit.get('objective', ''),
                    'domain': domain_for(path_name, unit),
                    'track': unit.get('track'),
                    **({'madhhab': chapter.get('madhhab')} if chapter.get('madhhab') else {}),
                    'moduleId': unit['id'],
                    'claimKind': 'teaching_summary',
                    'critical': path_name != 'learningPath',
                    'reviewStatus': 'referenced'
                })
                claim_ids.add(objective_claim_id)
                for citation in unit_citations:
                    links.append({
                        'id': f"link_{objective_claim_id}_{citation['id']}",
                        'claimId': objective_claim_id,
                        'citationId': citation['id'],
                        'relation': 'context',
                        'note': 'Orientierungsquelle. Konkrete Fundstelle und Aussagebezug müssen im Quellenreview verifiziert werden.',
                        'reviewStatus': 'referenced'
                    })

                for step in unit.get('learningSteps', []):
                    knowledge_claims: dict[tuple[str, str], str] = {}
                    for block_index, block in enumerate(step.get('knowledge', []), start=1):
                        claim_id = f"claim_{step['id']}_{block_index}"
                        if claim_id in claim_ids:
                            raise ValueError(f"Doppelte Claim-ID {claim_id}")
                        claim_ids.add(claim_id)
                        block['claimId'] = claim_id
                        block['sourceRefIds'] = citation_id_list if claim_kind(str(block.get('title', ''))) == 'source_note' else trace_citation_ids
                        key = (compact_text(block.get('title')).casefold(), compact_text(block.get('text')).casefold())
                        knowledge_claims[key] = claim_id
                        claim = {
                            'id': claim_id,
                            'text': compact_text(block.get('text')),
                            'domain': domain_for(path_name, unit),
                            'track': unit.get('track'),
                            **({'madhhab': chapter.get('madhhab')} if chapter.get('madhhab') else {}),
                            'moduleId': unit['id'],
                            'learningStepId': step['id'],
                            'claimKind': claim_kind(str(block.get('title', ''))),
                            'critical': path_name != 'learningPath',
                            'reviewStatus': 'referenced'
                        }
                        claims.append(claim)
                        relation = 'further_reading' if claim['claimKind'] == 'source_note' else 'context'
                        for citation in unit_citations:
                            links.append({
                                'id': f"link_{claim_id}_{citation['id']}",
                                'claimId': claim_id,
                                'citationId': citation['id'],
                                'relation': relation,
                                'note': 'Noch kein Direktbeleg: Die Referenz dient bis zur Fachprüfung nur als Orientierung/Kontext.',
                                'reviewStatus': 'referenced'
                            })

                    for section_index, section in enumerate(step.get('sections', []), start=1):
                        for section_block_index, block in enumerate(section.get('blocks', []), start=1):
                            block['sourceRefIds'] = citation_id_list if claim_kind(str(block.get('title', ''))) == 'source_note' else trace_citation_ids
                            key = (compact_text(block.get('title')).casefold(), compact_text(block.get('text')).casefold())
                            matched_claim = knowledge_claims.get(key)
                            if matched_claim:
                                block['claimId'] = matched_claim
                                continue
                            if not compact_text(block.get('text')):
                                continue
                            claim_id = f"claim_{step['id']}_section_{section_index}_{section_block_index}"
                            if claim_id in claim_ids:
                                raise ValueError(f"Doppelte Claim-ID {claim_id}")
                            claim_ids.add(claim_id)
                            block['claimId'] = claim_id
                            claim = {
                                'id': claim_id,
                                'text': compact_text(block.get('text')),
                                'domain': domain_for(path_name, unit),
                                'track': unit.get('track'),
                                **({'madhhab': chapter.get('madhhab')} if chapter.get('madhhab') else {}),
                                'moduleId': unit['id'],
                                'learningStepId': step['id'],
                                'claimKind': claim_kind(str(block.get('title', ''))),
                                'critical': path_name != 'learningPath',
                                'reviewStatus': 'referenced'
                            }
                            claims.append(claim)
                            relation = 'further_reading' if claim['claimKind'] == 'source_note' else 'context'
                            for citation in unit_citations:
                                links.append({
                                    'id': f"link_{claim_id}_{citation['id']}",
                                    'claimId': claim_id,
                                    'citationId': citation['id'],
                                    'relation': relation,
                                    'note': 'Reader-Aussage: Die Referenz dient bis zur Fachprüfung nur als Orientierung/Kontext.',
                                    'reviewStatus': 'referenced'
                                })

                for question in unit.get('knowledgeQuestions', []):
                    claim_id = f"claim_{question['id']}"
                    if claim_id in claim_ids:
                        raise ValueError(f"Doppelte Claim-ID {claim_id}")
                    claim_ids.add(claim_id)
                    question['claimId'] = claim_id
                    question_kind_map = {
                        'term': 'definition', 'method': 'method', 'case': 'case',
                        'error': 'boundary', 'source': 'source_note', 'boundary': 'boundary'
                    }
                    claim = {
                        'id': claim_id,
                        'text': compact_text(question.get('explanation') or question.get('correctAnswer') or question.get('prompt')),
                        'domain': domain_for(path_name, unit),
                        'track': unit.get('track'),
                        **({'madhhab': chapter.get('madhhab')} if chapter.get('madhhab') else {}),
                        'moduleId': unit['id'],
                        'claimKind': question_kind_map.get(question.get('questionKind'), 'teaching_summary'),
                        'critical': path_name != 'learningPath',
                        'reviewStatus': 'referenced'
                    }
                    claims.append(claim)
                    relation = 'further_reading' if claim['claimKind'] == 'source_note' else 'context'
                    for citation in unit_citations:
                        links.append({
                            'id': f"link_{claim_id}_{citation['id']}",
                            'claimId': claim_id,
                            'citationId': citation['id'],
                            'relation': relation,
                            'note': 'Übungs-/Prüfungsaussage: Quelle ist bis zur exakten Fundstellenprüfung nur Orientierung/Kontext.',
                            'reviewStatus': 'referenced'
                        })

    return {'sources': sources, 'citations': citations, 'claims': claims, 'claimSourceLinks': links}



def apply_source_verification(layer: dict[str, list[dict]]) -> None:
    """Apply only explicit human/editorial source verification records.

    P3 deliberately does not infer exact locators or scholarly approval. The optional
    editorial file is the single boundary through which citations/claims can move from
    referenced to verified/approved.
    """
    review_path = SOURCE / 'editorial' / 'source-verification.json'
    if not review_path.exists():
        return
    payload = read_json(review_path)
    if not isinstance(payload, dict):
        return
    citation_by_id = {item['id']: item for item in layer.get('citations', [])}
    claim_by_id = {item['id']: item for item in layer.get('claims', [])}
    link_by_id = {item['id']: item for item in layer.get('claimSourceLinks', [])}

    for review in payload.get('citations', []):
        if not isinstance(review, dict):
            continue
        target = citation_by_id.get(str(review.get('id', '')))
        if not target:
            continue
        locator = compact_text(review.get('locatorText'))
        if locator:
            target['locatorText'] = locator
        if review.get('exactLocatorVerified') is True:
            target['exactLocatorVerified'] = True
            target['reviewStatus'] = 'approved' if review.get('reviewStatus') == 'approved' else 'verified'
            target['verifiedBy'] = compact_text(review.get('verifiedBy'))
            target['verifiedAt'] = compact_text(review.get('verifiedAt')) or UPDATED

    for review in payload.get('claims', []):
        if not isinstance(review, dict):
            continue
        target = claim_by_id.get(str(review.get('id', '')))
        if not target:
            continue
        status = str(review.get('reviewStatus', '')).strip()
        if status not in {'verified', 'approved'}:
            continue
        target['reviewStatus'] = status
        target['verifiedBy'] = compact_text(review.get('verifiedBy'))
        target['verifiedAt'] = compact_text(review.get('verifiedAt')) or UPDATED

    for review in payload.get('links', []):
        if not isinstance(review, dict):
            continue
        target = link_by_id.get(str(review.get('id', '')))
        if not target:
            continue
        relation = str(review.get('relation', target.get('relation', 'context'))).strip()
        citation = citation_by_id.get(target.get('citationId'))
        claim = claim_by_id.get(target.get('claimId'))
        if relation == 'direct_support' and not (citation and citation.get('exactLocatorVerified') and claim and claim.get('reviewStatus') in {'verified', 'approved'}):
            continue
        if relation in {'direct_support', 'interpretation', 'context', 'contrasting_view', 'further_reading'}:
            target['relation'] = relation
        status = str(review.get('reviewStatus', '')).strip()
        if status in {'verified', 'approved'}:
            target['reviewStatus'] = status
        note = compact_text(review.get('note'))
        if note:
            target['note'] = note

def validate_source_layer(content: dict[str, list[dict]]) -> None:
    sources = {entry['id']: entry for entry in content['sources']}
    citations = {entry['id']: entry for entry in content['citations']}
    claims = {entry['id']: entry for entry in content['claims']}
    links = content['claimSourceLinks']
    module_ids = {unit['id'] for path in ('learningPath', 'quranPath', 'islamicPaths') for chapter in content[path] for unit in chapter.get('units', [])}
    valid_relations = {'direct_support', 'interpretation', 'context', 'contrasting_view', 'further_reading'}
    valid_reviews = {'missing', 'referenced', 'verified', 'approved'}
    if not sources or not citations or not claims or not links:
        raise ValueError('Quellenlayer ist unvollständig')
    for source in sources.values():
        if source.get('reviewStatus') not in valid_reviews or not compact_text(source.get('title')) or not compact_text(source.get('language')):
            raise ValueError(f"Source {source.get('id')}: Metadaten ungültig")
    for citation in citations.values():
        if citation.get('sourceId') not in sources or citation.get('moduleId') not in module_ids or citation.get('reviewStatus') not in valid_reviews or not compact_text(citation.get('locatorText')):
            raise ValueError(f"Citation {citation.get('id')}: Referenz ungültig")
    links_by_claim: dict[str, list[dict]] = {}
    for link in links:
        if link.get('claimId') not in claims or link.get('citationId') not in citations or link.get('relation') not in valid_relations or link.get('reviewStatus') not in valid_reviews:
            raise ValueError(f"ClaimSourceLink {link.get('id')}: Referenz ungültig")
        citation = citations[link['citationId']]
        if link.get('relation') == 'direct_support' and not citation.get('exactLocatorVerified'):
            raise ValueError(f"{link['id']}: direct_support ohne verifizierte Fundstelle ist verboten")
        links_by_claim.setdefault(link['claimId'], []).append(link)
    for claim in claims.values():
        if claim.get('moduleId') not in module_ids or claim.get('reviewStatus') not in valid_reviews or not compact_text(claim.get('text')):
            raise ValueError(f"Claim {claim.get('id')}: Metadaten ungültig")
        if claim.get('critical') and not links_by_claim.get(claim['id']):
            raise ValueError(f"Claim {claim['id']}: kritische Aussage ohne Quelle")
    for path_name in ('learningPath', 'quranPath', 'islamicPaths'):
        for chapter in content[path_name]:
            for unit in chapter.get('units', []):
                citation_ids = {entry['id'] for entry in content['citations'] if entry.get('moduleId') == unit['id']}
                if not citation_ids:
                    raise ValueError(f"{unit['id']}: keine modulbezogene Citation")
                for step in unit.get('learningSteps', []):
                    for block in step.get('knowledge', []):
                        claim_id = block.get('claimId')
                        if claim_id and claim_id not in claims:
                            raise ValueError(f"{step['id']}: Claim {claim_id} fehlt")
                    for section in step.get('sections', []):
                        for block in section.get('blocks', []):
                            claim_id = block.get('claimId')
                            if claim_id and claim_id not in claims:
                                raise ValueError(f"{step['id']}/{section.get('id')}: Claim {claim_id} fehlt")
                for question in unit.get('knowledgeQuestions', []):
                    claim_id = question.get('claimId')
                    if not claim_id or claim_id not in claims:
                        raise ValueError(f"{question.get('id')}: Quellen-Claim fehlt")
                quality = unit.get('quality') or {}
                if quality.get('reviewStage') == 'published':
                    module_claims = [claim for claim in claims.values() if claim.get('moduleId') == unit['id'] and claim.get('critical')]
                    if any(claim.get('reviewStatus') != 'approved' for claim in module_claims):
                        raise ValueError(f"{unit['id']}: published trotz ungeprüfter kritischer Claims")


def attach_module_quality(content: dict[str, list[dict]]) -> None:
    """Attach machine-auditable structural and review gates to every course module."""
    source_by_id = {entry['id']: entry for entry in content['sources']}
    citations_by_module: dict[str, list[dict]] = {}
    for citation in content['citations']:
        citations_by_module.setdefault(citation.get('moduleId', ''), []).append(citation)
    for path_name in ('learningPath', 'quranPath', 'islamicPaths'):
        for chapter in content[path_name]:
            for unit in chapter.get('units', []):
                phases = unit.get('phases', [])
                practice = next((phase for phase in phases if phase.get('type') == 'practice'), None)
                deepen = next((phase for phase in phases if phase.get('type') == 'deepen'), None)
                is_islamic = path_name == 'islamicPaths'
                is_fiqh = str(unit.get('track', '')).startswith('fiqh_')
                is_quran = path_name == 'quranPath'
                module_citations = citations_by_module.get(unit['id'], [])
                source_refs = []
                for citation in module_citations:
                    source = source_by_id.get(citation['sourceId'])
                    if not source: continue
                    source_refs.append({
                        'id': citation['id'],
                        'sourceId': source['id'],
                        'label': f"{source.get('title', source['id'])}{f' · {source.get("author")}' if source.get('author') else ''}",
                        'locator': citation.get('locatorText'),
                        'kind': source_kind_for_record(source),
                        'relation': 'context',
                        'reviewStatus': citation.get('reviewStatus', 'referenced'),
                        'exactLocatorVerified': bool(citation.get('exactLocatorVerified')),
                        'reviewRequired': citation.get('reviewStatus') != 'approved'
                    })
                coverage = {
                    'objectives': bool(compact_text(unit.get('objective')) and unit.get('intro', {}).get('outcomes')),
                    'teaching': len(unit.get('learningSteps', [])) >= 3,
                    'examples': bool(unit.get('intro', {}).get('example')) and any(step.get('knowledge') or step.get('contentIds') for step in unit.get('learningSteps', [])),
                    'practice': bool(practice and practice.get('activities')),
                    'deepen': bool(deepen and deepen.get('activities')),
                    'exam': bool(unit.get('exam') and unit.get('exam', {}).get('questionCount', 0) >= 3),
                    'sources': bool(source_refs)
                }
                score = round(sum(1 for value in coverage.values() if value) / len(coverage) * 100)
                requirements = ['language_review', 'didactic_review']
                if is_quran or is_islamic: requirements.insert(1, 'source_review')
                if is_fiqh: requirements.insert(2, 'madhhab_review')
                unit['quality'] = {
                    'score': score,
                    'reviewStage': 'editorial_checked',
                    'reviewRequirements': requirements,
                    'sourceRefs': source_refs,
                    'coverage': coverage,
                    'automatedEditorialReview': {
                        'passed': score == 100,
                        'reviewedAt': UPDATED,
                        'checks': coverage
                    },
                    'expertReviewRequired': True
                }


def validate_module_quality(content: dict[str, list[dict]]) -> None:
    forbidden_prompts = ('Was ist das Lernziel von', 'Welcher Kernpunkt gehört zu')
    forbidden_options = {'Eine persönliche Fatwā erzeugen.', 'Quellenhinweise entfernen.', 'Kontext ignorieren.'}
    for path_name in ('learningPath', 'quranPath', 'islamicPaths'):
        for chapter in content[path_name]:
            for unit in chapter.get('units', []):
                quality = unit.get('quality') or {}
                if int(quality.get('score', 0)) < 85:
                    raise ValueError(f"{unit.get('id')}: Qualitätsabdeckung unter 85 %")
                if not quality.get('sourceRefs'):
                    raise ValueError(f"{unit.get('id')}: Quellen-/Redaktionsreferenz fehlt")
                if not quality.get('reviewRequirements'):
                    raise ValueError(f"{unit.get('id')}: Review-Gate fehlt")
                if path_name != 'islamicPaths':
                    continue
                steps = unit.get('learningSteps') or []
                if len(steps) != 4:
                    raise ValueError(f"{unit.get('id')}: Islamische Fachmodule brauchen 4 Lernschritte")
                teaching_words = 0
                for index, step in enumerate(steps):
                    blocks = step.get('knowledge') or []
                    minimum = 5 if index == 3 else 4
                    if len(blocks) < minimum:
                        raise ValueError(f"{unit.get('id')}/{step.get('id')}: zu wenige Lehrbausteine")
                    for block in blocks:
                        text = str(block.get('text', '')).strip()
                        if len(text) < 24:
                            raise ValueError(f"{unit.get('id')}/{step.get('id')}: Lehrtext zu kurz")
                        teaching_words += len(text.split())
                if teaching_words < 170:
                    raise ValueError(f"{unit.get('id')}: Lehrinhalt zu dünn ({teaching_words} Wörter, mindestens 170 erwartet)")
                questions = unit.get('knowledgeQuestions') or []
                if len(questions) != 12:
                    raise ValueError(f"{unit.get('id')}: genau 12 Wissensfragen erforderlich")
                kinds = Counter(question.get('questionKind') for question in questions)
                expected = {'term': 3, 'method': 3, 'case': 2, 'error': 2, 'source': 1, 'boundary': 1}
                for kind, minimum in expected.items():
                    if kinds.get(kind, 0) < minimum:
                        raise ValueError(f"{unit.get('id')}: Fragenmix {kind} unvollständig")
                for question in questions:
                    prompt = str(question.get('prompt', ''))
                    if any(fragment in prompt for fragment in forbidden_prompts):
                        raise ValueError(f"{unit.get('id')}/{question.get('id')}: generische Platzhalterfrage")
                    if any(option in forbidden_options for option in question.get('options', [])):
                        raise ValueError(f"{unit.get('id')}/{question.get('id')}: generischer Distraktor")
                covered = [content_id for phase in (unit.get('phases') or [])[:2] for activity in phase.get('activities', []) for content_id in activity.get('contentIds', [])]
                if len(covered) != 12 or len(set(covered)) != 12 or set(covered) != {q['id'] for q in questions}:
                    raise ValueError(f"{unit.get('id')}: Üben/Vertiefen deckt nicht alle 12 Fragen genau einmal ab")


def validate_unique(dataset: str, items: list[dict]) -> None:
    ids = [str(item.get('id', '')).strip() for item in items]
    duplicates = sorted(key for key, count in Counter(ids).items() if key and count > 1)
    if not all(ids): raise ValueError(f'{dataset}: Ein Datensatz besitzt keine ID.')
    if duplicates: raise ValueError(f'{dataset}: Doppelte IDs: {", ".join(duplicates)}')


def validate_acyclic(graph: dict[str, list[str]], label: str) -> None:
    visiting: set[str] = set(); visited: set[str] = set()
    def visit(node: str, path: list[str]) -> None:
        if node in visited: return
        if node in visiting:
            cycle_start = path.index(node) if node in path else 0
            raise ValueError(f"{label}: Kreisförmige Voraussetzung: {' -> '.join(path[cycle_start:] + [node])}")
        visiting.add(node)
        for dependency in graph.get(node, []): visit(dependency, [*path, node])
        visiting.remove(node); visited.add(node)
    for node in graph: visit(node, [])


def validate_path(path_name: str, chapters: list[dict], ids_by_module: dict[str, set[str]], all_unit_ids: set[str], global_phase_ids: set[str], global_activity_ids: set[str]) -> None:
    valid_types = {'alphabet','vocabulary','grammar','sentence','reading','writing','quran','knowledge','speaking'}
    valid_variants = {'default','alphabet_recognition','alphabet_positions','alphabet_weight','alphabet_sound','vocabulary_matching','vocabulary_recall','vocabulary_listening','vocabulary_dictation','vocabulary_context','speaking_shadowing','morphology_root','register_shift','hadith_analysis','fiqh_compare','grammar_rules','grammar_cloze','grammar_error_correction','grammar_listening','sentence_builder','reading_meaning','reading_listening','reading_vocalized','reading_harakat','writing_input','writing_dictation','writing_trace','writing_copy','quran_signs','quran_tajweed','quran_pauses','quran_language','knowledge_quiz','smart_mix'}
    study_mode = path_name == 'islamicPaths'
    study_tracks = {'fiqh_hanafi','fiqh_maliki','fiqh_shafii','fiqh_hanbali','usul_fiqh','hadith','usul_hadith'}
    expected_track = 'quran' if path_name == 'quranPath' else 'fusha'
    ordered=[]
    for chapter in chapters:
        if (study_mode and chapter.get('track') not in study_tracks) or (not study_mode and chapter.get('track') != expected_track): raise ValueError(f"{path_name}/{chapter.get('id')}: falscher Track")
        if study_mode and chapter.get('studyLevel') not in {'S0','S1','S2','S3'}: raise ValueError(f"{chapter.get('id')}: Studienstufe fehlt")
        if expected_track == 'quran' and not study_mode and chapter.get('quranLevel') not in {'Q0','Q1','Q2','Q3','Q4','Q5','Q6'}: raise ValueError(f"{chapter.get('id')}: Quranstufe fehlt")
        chapter_exam=chapter.get('exam',{})
        cq=int(chapter_exam.get('questionCount',0)); cps=int(chapter_exam.get('passScore',0)); cms=int(chapter_exam.get('minimumSkillScore',0)); cskills=chapter_exam.get('skills',[])
        if not str(chapter_exam.get('id','')).strip() or not 20 <= cq <= 30 or not 50 <= cps <= 100 or not 0 <= cms <= cps or len(cskills)<2 or len(set(cskills))!=len(cskills) or cq < len(cskills)*2 or int(chapter_exam.get('estimatedMinutes',0))<=0:
            raise ValueError(f"{chapter.get('id')}: Kapitelprüfung ungültig")
        for unit in chapter.get('units',[]):
            ordered.append(unit)
            if (study_mode and unit.get('track') != chapter.get('track')) or (not study_mode and unit.get('track') != expected_track): raise ValueError(f"{unit.get('id')}: falscher Track")
            layout=unit.get('layout')
            if layout:
                allowed_order={'title','position','content','actions'}
                order=layout.get('sectionOrder',[])
                if layout.get('schemaVersion') != 1 or layout.get('preset') not in {'standard','focus','wide','reference'} or layout.get('readerWidth') not in {'reader','wide','full'} or layout.get('spacing') not in {'compact','standard','relaxed'} or layout.get('blockStyle') not in {'paper','card','flat'} or layout.get('contentAlign') not in {'start','center'} or len(order)!=4 or set(order)!=allowed_order:
                    raise ValueError(f"{unit.get('id')}: Layoutschema ungültig")
            intro=unit.get('intro',{}); outcomes=intro.get('outcomes',[]); example=intro.get('example',{})
            if not all(str(intro.get(k,'')).strip() for k in ['title','summary']) or not 1 <= int(intro.get('estimatedMinutes',0)) <= 5: raise ValueError(f"{unit['id']}: Einleitung unvollständig")
            if not isinstance(outcomes,list) or not 1 <= len(outcomes) <= 4 or len(set(outcomes)) != len(outcomes) or any(not str(x).strip() for x in outcomes): raise ValueError(f"{unit['id']}: Einleitungsziele ungültig")
            if not isinstance(example,dict) or not str(example.get('text','')).strip() or ('arabic' in example and not str(example.get('arabic','')).strip()): raise ValueError(f"{unit['id']}: Einleitungsbeispiel ungültig")
            missing=[x for x in unit.get('prerequisiteIds',[]) if x not in all_unit_ids]
            if missing: raise ValueError(f"{unit['id']}: unbekannte Voraussetzungen {missing}")
            policy=unit.get('practicePolicy',{})
            if not (50 <= int(policy.get('repeatScore',0)) <= int(policy.get('excellentScore',0)) <= 100 and int(policy.get('repeatAttempts',0)) >= 2 and 0 <= int(policy.get('minimumSkillScore',-1)) <= 100): raise ValueError(f"{unit['id']}: ungültige adaptive Übungsregel")
            learning_id=str(unit.get('learningId','')).strip()
            if not learning_id or learning_id in global_phase_ids: raise ValueError(f"{unit['id']}: Lerncontainer-ID fehlt oder doppelt")
            global_phase_ids.add(learning_id)
            steps=unit.get('learningSteps',[])
            if not isinstance(steps,list) or not 2 <= len(steps) <= 5: raise ValueError(f"{unit['id']}: 2 bis 5 Lernschritte erforderlich")
            for index,step in enumerate(steps,1):
                sid=str(step.get('id','')).strip()
                if not sid or sid in global_activity_ids: raise ValueError(f"{unit['id']}: doppelte Lernschritt-ID {sid}")
                global_activity_ids.add(sid)
                if int(step.get('order',0)) != index or step.get('kind') not in {'content','knowledge'} or not step.get('required',False): raise ValueError(f"{sid}: Lernschritt-Reihenfolge/Art ungültig")
                cm=step.get('contentModule'); cids=step.get('contentIds',[])
                if step.get('kind')=='content':
                    if cm not in ids_by_module or not cids: raise ValueError(f"{sid}: Inhaltsmodul ungültig")
                    unknown=[x for x in cids if x not in ids_by_module[cm]]
                    if unknown: raise ValueError(f"{sid}: unbekannte Inhalte {unknown}")
                else:
                    if cm or cids: raise ValueError(f"{sid}: Wissensschritt darf keine externe Inhaltsquelle besitzen")
                    knowledge=step.get('knowledge',[])
                    if not knowledge or any(not str(block.get('title','')).strip() or not str(block.get('text','')).strip() for block in knowledge): raise ValueError(f"{sid}: Wissensblöcke fehlen")
                if not isinstance(step.get('skillIds'),list) or not step['skillIds'] or len(set(step['skillIds']))!=len(step['skillIds']): raise ValueError(f"{sid}: Skills fehlen")
                completion=step.get('completionPolicy') or {}
                if not 50 <= int(completion.get('minimumScore',0)) <= 100: raise ValueError(f"{sid}: Completion-Mindestscore fehlt")
                if not 2 <= int(completion.get('minimumEvidenceCount',0)) <= 10: raise ValueError(f"{sid}: mindestens zwei Completion-Evidenzen erforderlich")
                modes=completion.get('requiredModes',[])
                if not isinstance(modes,list) or not modes or any(mode not in {'recognition','recall','application','production','listening','speaking'} for mode in modes): raise ValueError(f"{sid}: Completion-Evidenzmodi ungueltig")
            phases=unit.get('phases',[])
            expected_phases = ['practice','deepen','exam']
            if [x.get('type') for x in phases] != expected_phases: raise ValueError(f"{unit['id']}: Phasenstruktur ungültig")
            for phase_index,phase in enumerate(phases,1):
                pid=str(phase.get('id','')).strip()
                if not pid or pid in global_phase_ids: raise ValueError(f"{unit['id']}: doppelte Phasen-ID {pid}")
                global_phase_ids.add(pid)
                if int(phase.get('order',0)) != phase_index: raise ValueError(f"{unit['id']}: falsche Phasenreihenfolge")
                if bool(phase.get('required')) != (phase.get('type') != 'deepen'): raise ValueError(f"{pid}: falscher Pflichtstatus")
                if not phase.get('activities'): raise ValueError(f"{pid}: keine Aktivität")
                for a in phase['activities']:
                    aid=str(a.get('id','')).strip()
                    if not aid or aid in global_activity_ids: raise ValueError(f"{unit['id']}: doppelte Aktivitäts-ID {aid}")
                    global_activity_ids.add(aid)
                    kind=a.get('kind')
                    if kind not in {'exercise','knowledge','exam'}: raise ValueError(f"{aid}: ungültige Art für Phase")
                    if not all(str(a.get(k,'')).strip() for k in ['title','description','objective','icon']): raise ValueError(f"{aid}: Pflichtfeld fehlt")
                    if int(a.get('estimatedMinutes',0)) <= 0: raise ValueError(f"{aid}: Dauer fehlt")
                    if not isinstance(a.get('contentIds'),list) or not isinstance(a.get('knowledge'),list): raise ValueError(f"{aid}: Arrays fehlen")
                    if kind=='exercise':
                        if a.get('exerciseType') not in valid_types or a.get('exerciseVariant','default') not in valid_variants: raise ValueError(f"{aid}: Übungsart ungültig")
                        if not 50 <= int(a.get('minimumScore',0)) <= 100: raise ValueError(f"{aid}: Mindestwert ungültig")
                    if phase.get('type')=='practice' and kind!='exercise': raise ValueError(f"{aid}: Üben muss interaktiv sein")
                    if phase.get('type')=='deepen' and kind!='exercise': raise ValueError(f"{aid}: Vertiefen muss eine Transferübung sein")
                    if phase.get('type')=='exam' and kind!='exam': raise ValueError(f"{aid}: Abschlussphase darf nur den Modulcheck enthalten")
            exam=unit.get('exam',{}); ea=phases[-1]['activities']
            if study_mode:
                kq=unit.get('knowledgeQuestions',[])
                if len(kq) < 4 or any(q.get('correctAnswer') not in q.get('options',[]) for q in kq): raise ValueError(f"{unit['id']}: Wissensfragen fehlen oder sind ungültig")
            if len(ea)!=1 or ea[0].get('kind')!='exam' or exam.get('activityId')!=ea[0].get('id'): raise ValueError(f"{unit['id']}: Modulcheck uneindeutig")
            q=int(exam.get('questionCount',0)); ps=int(exam.get('passScore',0)); ms=int(exam.get('minimumSkillScore',0)); skills=exam.get('skills',[])
            if not 8 <= q <= 12 or not 50 <= ps <= 100 or not 0 <= ms <= ps or len(skills)<2 or len(set(skills))!=len(skills) or q < len(skills)*2: raise ValueError(f"{unit['id']}: Modulcheck-Konfiguration ungültig")
    if path_name=='learningPath' and ordered and ordered[0].get('prerequisiteIds'): raise ValueError('Erstes Fusha-Modul darf keine Voraussetzung besitzen')
    if study_mode:
        for track in study_tracks:
            track_units=[u for u in ordered if u.get('track')==track]
            if track_units and track_units[0].get('prerequisiteIds'): raise ValueError(f"{track}: erstes Studienmodul darf keine Voraussetzung besitzen")
            for previous,current in zip(track_units,track_units[1:]):
                if previous['id'] not in current.get('prerequisiteIds',[]): raise ValueError(f"{current['id']}: vorheriges Modul {previous['id']} muss Voraussetzung sein")
    else:
        for previous,current in zip(ordered,ordered[1:]):
            if previous['id'] not in current.get('prerequisiteIds',[]): raise ValueError(f"{current['id']}: vorheriges Modul {previous['id']} muss Voraussetzung sein")

def validate_references(content: dict[str, list[dict]]) -> None:
    grammar_ids={x['id'] for x in content['grammar']}
    for lesson in content['grammar']:
        missing=[x for x in lesson.get('prerequisiteLessonIds',[]) if x not in grammar_ids]
        if missing: raise ValueError(f"Grammatik {lesson['id']}: unbekannte Voraussetzungen {missing}")
        if len(lesson.get('quiz',[])) < QUIZ_POOL_SIZE: raise ValueError(f"Grammatik {lesson['id']}: zu kleiner Fragenpool")
        for q in lesson.get('quiz',[]):
            if q.get('correctAnswer') not in q.get('options',[]): raise ValueError(f"Grammatikfrage {q.get('id')}: richtige Antwort fehlt")
    qids={x['id'] for x in content['quran']}
    for lesson in content['quran']:
        if lesson.get('quranLevel') not in {'Q0','Q1','Q2','Q3','Q4','Q5','Q6'}: raise ValueError(f"{lesson['id']}: Quranstufe fehlt")
        missing=[x for x in lesson.get('prerequisites',[]) if x not in qids]
        if missing: raise ValueError(f"{lesson['id']}: unbekannte Quran-Voraussetzungen {missing}")
    ids={'alphabet':{x['id'] for x in content['alphabet']},'vocabulary':{x['id'] for x in content['vocabulary']},'grammar':grammar_ids,'writing':{x['id'] for x in content['writing']},'reading':{x['id'] for x in content['reading']},'quran':qids}
    all_units={u['id'] for key in ('learningPath','quranPath','islamicPaths') for st in content[key] for u in st['units']}
    gp:set[str]=set(); ga:set[str]=set()
    validate_path('learningPath',content['learningPath'],ids,all_units,gp,ga)
    validate_path('quranPath',content['quranPath'],ids,all_units,gp,ga)
    validate_path('islamicPaths',content['islamicPaths'],ids,all_units,gp,ga)
    validate_acyclic({x['id']:x.get('prerequisiteLessonIds',[]) for x in content['grammar']},'Grammatik')
    validate_acyclic({u['id']:u.get('prerequisiteIds',[]) for key in ('learningPath','quranPath','islamicPaths') for st in content[key] for u in st['units']},'Kurs')



def validate_semantic_layer(content: dict[str, list[dict]]) -> None:
    skill_ids={x['id'] for x in content['skills']}
    template_by_id={x['id']:x for x in content['exerciseTemplates']}
    item_by_id={x['id']:x for x in content['learningItems']}
    content_ids={domain:{x['id'] for x in content[domain]} for domain in ['alphabet','vocabulary','grammar','writing','reading','quran']}
    valid_types={'alphabet','vocabulary','grammar','sentence','reading','writing','quran','knowledge','speaking'}
    valid_variants={'default','alphabet_recognition','alphabet_positions','alphabet_weight','alphabet_sound','vocabulary_matching','vocabulary_recall','vocabulary_listening','vocabulary_dictation','vocabulary_context','speaking_shadowing','morphology_root','register_shift','hadith_analysis','fiqh_compare','grammar_rules','grammar_cloze','grammar_error_correction','grammar_listening','sentence_builder','reading_meaning','reading_listening','reading_vocalized','reading_harakat','writing_input','writing_dictation','writing_trace','writing_copy','quran_signs','quran_tajweed','quran_pauses','quran_language','knowledge_quiz','smart_mix'}
    for skill in content['skills']:
        if skill.get('domain') not in {'script','phonology','vocabulary','grammar','morphology','reading','writing','listening','speaking','interaction','discourse','register','quran','fiqh','usul_fiqh','hadith','usul_hadith'}:
            raise ValueError(f"Skill {skill['id']}: Domäne ungültig")
        if not skill.get('levels') or any(level not in LEVELS for level in skill['levels']):
            raise ValueError(f"Skill {skill['id']}: Levelabdeckung ungültig")
    for template in content['exerciseTemplates']:
        missing=[sid for sid in template.get('competencyIds',[]) if sid not in skill_ids]
        if missing: raise ValueError(f"ExerciseTemplate {template['id']}: unbekannte Skills {missing}")
        if template.get('engineType') not in valid_types or template.get('engineVariant') not in valid_variants:
            raise ValueError(f"ExerciseTemplate {template['id']}: Runtime-Mapping ungültig")
        if template.get('runtimeStatus') not in {'implemented','content_ready','planned'}:
            raise ValueError(f"ExerciseTemplate {template['id']}: Runtime-Status ungültig")
    seen_content=set()
    for item in content['learningItems']:
        domain=item.get('contentModule'); cid=item.get('contentId')
        if domain not in content_ids or cid not in content_ids[domain]:
            raise ValueError(f"LearningItem {item['id']}: unbekannter Inhalt {domain}/{cid}")
        key=(domain,cid)
        if key in seen_content: raise ValueError(f"LearningItem {item['id']}: Inhalt {domain}/{cid} mehrfach abgebildet")
        seen_content.add(key)
        if not item.get('competencyIds') or any(sid not in skill_ids for sid in item['competencyIds']):
            raise ValueError(f"LearningItem {item['id']}: Kompetenzbezug ungültig")
        if not item.get('exerciseTemplateIds') or any(tid not in template_by_id for tid in item['exerciseTemplateIds']):
            raise ValueError(f"LearningItem {item['id']}: Übungstemplate ungültig")
        missing_prereq=[pid for pid in item.get('prerequisiteItemIds',[]) if pid not in item_by_id]
        if missing_prereq: raise ValueError(f"LearningItem {item['id']}: unbekannte Voraussetzungen {missing_prereq}")
    expected={(d,cid) for d,ids in content_ids.items() for cid in ids}
    if seen_content != expected:
        missing=sorted(expected-seen_content)[:10]
        raise ValueError(f"LearningItems: Inhaltsabdeckung unvollständig, z. B. {missing}")
    # Course activities may only use templates that actually exist and are runnable.
    for path_name in ('learningPath','quranPath','islamicPaths'):
        for chapter in content[path_name]:
            for unit in chapter.get('units',[]):
                for step in unit.get('learningSteps',[]):
                    comps=step.get('competencyIds',[])
                    if not comps or any(sid not in skill_ids for sid in comps):
                        raise ValueError(f"{step.get('id')}: stabile Kompetenz-IDs fehlen")
                for phase in unit.get('phases',[]):
                    for activity in phase.get('activities',[]):
                        comps=activity.get('competencyIds',[])
                        if comps and any(sid not in skill_ids for sid in comps):
                            raise ValueError(f"{activity.get('id')}: unbekannte Kompetenz-ID")
                        if activity.get('kind')=='exercise':
                            tid=activity.get('exerciseTemplateId')
                            if not tid or tid not in template_by_id:
                                raise ValueError(f"{activity.get('id')}: ExerciseTemplate fehlt")
                            if template_by_id[tid].get('runtimeStatus')=='planned':
                                raise ValueError(f"{activity.get('id')}: geplantes Template {tid} darf nicht im Lernpfad verwendet werden")


def collect_stable_id_keys(content: dict[str, list[dict]]) -> set[str]:
    keys: set[str] = set()
    for dataset, items in content.items():
        for item in items:
            item_id = item.get('id')
            if isinstance(item_id, str) and item_id:
                keys.add(f'{dataset}:{item_id}')
            if dataset not in {'learningPath', 'quranPath', 'islamicPaths'}:
                continue
            chapter_id = item.get('id')
            if isinstance(chapter_id, str) and chapter_id:
                keys.add(f'chapter:{chapter_id}')
            exam = item.get('exam') or {}
            if isinstance(exam.get('id'), str): keys.add(f'exam:{exam["id"]}')
            for unit in item.get('units', []):
                if isinstance(unit.get('id'), str): keys.add(f'module:{unit["id"]}')
                if isinstance(unit.get('learningId'), str): keys.add(f'learningContainer:{unit["learningId"]}')
                unit_exam = unit.get('exam') or {}
                if isinstance(unit_exam.get('id'), str): keys.add(f'exam:{unit_exam["id"]}')
                for step in unit.get('learningSteps', []):
                    if isinstance(step.get('id'), str): keys.add(f'step:{step["id"]}')
                for phase in unit.get('phases', []):
                    if isinstance(phase.get('id'), str): keys.add(f'phase:{phase["id"]}')
                    for activity in phase.get('activities', []):
                        if isinstance(activity.get('id'), str): keys.add(f'activity:{activity["id"]}')
                for question in unit.get('knowledgeQuestions', []):
                    if isinstance(question.get('id'), str): keys.add(f'knowledgeQuestion:{question["id"]}')
    return keys


def validate_release_id_contract(content: dict[str, list[dict]]) -> dict:
    contract_path = SOURCE / 'release-id-contract.json'
    aliases_path = SOURCE / 'id-aliases.json'
    if not contract_path.exists() or not aliases_path.exists():
        raise ValueError('Release-ID-Vertrag oder Aliasdatei fehlt.')
    contract = read_json(contract_path)
    alias_payload = read_json(aliases_path)
    aliases = alias_payload.get('aliases', {})
    if not isinstance(aliases, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not k or not v for k, v in aliases.items()):
        raise ValueError('Content-ID-Aliase sind ungültig.')
    current = collect_stable_id_keys(content)
    baseline = set(contract.get('stableKeys', []))
    if not baseline:
        raise ValueError('Release-ID-Vertrag enthält keine stabilen IDs.')
    missing = sorted(key for key in baseline if key not in current and key not in aliases)
    if missing:
        raise ValueError(f'Stabile Release-IDs entfernt, ohne Alias: {missing[:10]}')
    for old, new in aliases.items():
        if old == new:
            raise ValueError(f'Content-ID-Alias zeigt auf sich selbst: {old}')
        if old not in baseline:
            raise ValueError(f'Content-ID-Alias ist nicht im Release-Vertrag: {old}')
        if new not in current:
            raise ValueError(f'Content-ID-Alias zeigt auf unbekannte Ziel-ID: {old} -> {new}')
    return alias_payload



QURAN_STRUCTURE = load_quran_structure(
    SOURCE / 'static' / 'quran-structure.json',
    ROOT / 'src' / 'shared' / 'quran-structure.generated.ts',
)
QURAN_AYAH_COUNTS = QURAN_STRUCTURE['ayahCounts']
QURAN_STRUCTURE_TS = ROOT / 'src' / 'shared' / 'quran-structure.generated.ts'
QURAN_STRUCTURE_TS.write_text(
    '// Generated from content-src/static/quran-structure.json by scripts/build-content.py. Do not edit.\n'
    + f"export const QURAN_AYAH_COUNTS = {json.dumps(QURAN_STRUCTURE['ayahCounts'], separators=(',', ':'))} as const;\n"
    + f"export const JUZ_STARTS = {json.dumps(QURAN_STRUCTURE['juzStarts'], ensure_ascii=False, separators=(',', ':'))} as const;\n"
    + f"export const QURAN_SURAH_NAMES_AR = {json.dumps(QURAN_STRUCTURE['surahNamesArabic'], ensure_ascii=False, separators=(',', ':'))} as const;\n"
    + "export const TOTAL_QURAN_AYAHS = QURAN_AYAH_COUNTS.reduce((sum, count) => sum + count, 0);\n",
    encoding='utf-8'
)


def _quran_reference(value: object) -> tuple[str, int, int] | None:
    text = str(value or '').strip()
    match = re.fullmatch(r'(\d{1,3}):(\d{1,3})', text)
    if not match:
        return None
    surah, ayah = int(match.group(1)), int(match.group(2))
    if surah < 1 or surah > 114 or ayah < 1 or ayah > QURAN_AYAH_COUNTS[surah - 1]:
        return None
    return f'{surah}:{ayah}', surah, ayah


def _quran_records(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict) and isinstance(payload.get('records'), list):
        return [item for item in payload['records'] if isinstance(item, dict)]
    return []


def _reader_id(layer_id: str, dataset_id: str, index: int, record: dict) -> str:
    explicit = str(record.get('id', '')).strip()
    if explicit:
        return explicit
    ref = str(record.get('reference', '')).strip().replace(':', '_')
    suffix = ref or str(index + 1)
    return f'{layer_id}_{dataset_id}_{suffix}_{index + 1}'


def build_quran_reader_runtime() -> dict:
    meta_path = SOURCE / 'runtime-meta' / 'quran-reader-meta.json'
    empty = {
        'schemaVersion': 1,
        'generatedAt': UPDATED,
        'editorialOpen': True,
        'datasets': [],
        'ayahs': [],
        'translations': [],
        'tafsir': [],
        'words': [],
        'tajweed': [],
        'mushafLines': [],
        'audio': []
    }
    if not meta_path.exists():
        return empty
    meta = read_json(meta_path)
    if not isinstance(meta, dict):
        return empty
    runtime = {**empty, 'datasets': [], 'ayahs': [], 'translations': [], 'tafsir': [], 'words': [], 'tajweed': [], 'mushafLines': [], 'audio': []}
    for layer in meta.get('layers', []):
        if not isinstance(layer, dict):
            continue
        layer_id = str(layer.get('id', '')).strip()
        if layer_id not in {'quran_text','translation','tafsir','word_analysis','tajweed','mushaf_13_line','recitation_audio'}:
            continue
        for entry_index, entry in enumerate(layer.get('entries', [])):
            if not isinstance(entry, dict):
                continue
            dataset_id = str(entry.get('id', '')).strip() or f'{layer_id}_{entry_index + 1}'
            data_path = str(entry.get('dataPath', '')).strip().replace('\\', '/')
            data_file = SOURCE / data_path if data_path and '..' not in Path(data_path).parts else None
            records: list[dict] = []
            if data_file and data_file.is_file():
                try:
                    records = _quran_records(read_json(data_file))
                except Exception as exc:
                    print(f'WARN: Quran-Reader-Datensatz {data_path} konnte nicht gelesen werden: {exc}')
            review_status = str(entry.get('reviewStatus', 'missing')).strip() or 'missing'
            editorial_open = not (
                review_status == 'approved'
                and bool(str(entry.get('sourceId', '')).strip())
                and bool(str(entry.get('locatorText', '')).strip())
                and bool(str(entry.get('license', '')).strip())
                and entry.get('licenseVerified') is True
                and bool(records)
            )
            runtime['datasets'].append({
                'id': dataset_id,
                'layerId': layer_id,
                'label': str(entry.get('label', layer.get('label', layer_id))).strip() or layer_id,
                'sourceId': str(entry.get('sourceId', '')).strip(),
                'locatorText': str(entry.get('locatorText', '')).strip(),
                'license': str(entry.get('license', '')).strip(),
                'licenseVerified': entry.get('licenseVerified') is True,
                'reviewStatus': review_status,
                'language': str(entry.get('language', '')).strip() or ('de' if layer_id == 'translation' else 'ar'),
                'recordCount': len(records),
                'editorialOpen': editorial_open
            })
            for record_index, record in enumerate(records):
                rid = _reader_id(layer_id, dataset_id, record_index, record)
                ref_info = _quran_reference(record.get('reference'))
                if layer_id == 'quran_text':
                    text_value = str(record.get('text', '')).strip()
                    if not ref_info or not text_value:
                        continue
                    reference, surah, ayah = ref_info
                    runtime['ayahs'].append({'id': rid, 'datasetId': dataset_id, 'reference': reference, 'surah': surah, 'ayah': ayah, 'text': text_value})
                elif layer_id == 'translation':
                    text_value = str(record.get('text', '')).strip()
                    if ref_info and text_value:
                        runtime['translations'].append({'id': rid, 'datasetId': dataset_id, 'reference': ref_info[0], 'text': text_value})
                elif layer_id == 'tafsir':
                    text_value = str(record.get('text', '')).strip()
                    if ref_info and text_value:
                        item = {'id': rid, 'datasetId': dataset_id, 'reference': ref_info[0], 'text': text_value}
                        title = str(record.get('title', '')).strip()
                        if title:
                            item['title'] = title
                        runtime['tafsir'].append(item)
                elif layer_id == 'word_analysis':
                    text_value = str(record.get('text', '')).strip()
                    if not ref_info or not text_value:
                        continue
                    try:
                        word_index = max(0, int(record.get('wordIndex', 0)))
                    except (TypeError, ValueError):
                        word_index = 0
                    item = {'id': rid, 'datasetId': dataset_id, 'reference': ref_info[0], 'wordIndex': word_index, 'text': text_value}
                    for key in ('translation','lemma','root','morphology'):
                        value = str(record.get(key, '')).strip()
                        if value:
                            item[key] = value
                    if item.get('translation'):
                        item['translationDatasetId'] = dataset_id
                    runtime['words'].append(item)
                elif layer_id == 'tajweed':
                    rule = str(record.get('rule', '')).strip()
                    explanation = str(record.get('explanation', '')).strip()
                    if not ref_info or not rule:
                        continue
                    item = {'id': rid, 'datasetId': dataset_id, 'reference': ref_info[0], 'rule': rule, 'explanation': explanation}
                    for key in ('startWord','endWord'):
                        value = record.get(key)
                        if value not in (None, ''):
                            try: item[key] = max(0, int(value))
                            except (TypeError, ValueError): pass
                    text_value = str(record.get('text', '')).strip()
                    if text_value: item['text'] = text_value
                    runtime['tajweed'].append(item)
                elif layer_id == 'mushaf_13_line':
                    try:
                        page = int(record.get('page', 0)); line = int(record.get('line', 0))
                    except (TypeError, ValueError):
                        continue
                    text_value = str(record.get('text', '')).strip()
                    if page < 1 or line < 1 or line > 13:
                        continue
                    item = {'id': rid, 'datasetId': dataset_id, 'page': page, 'line': line, 'text': text_value}
                    if ref_info: item['reference'] = ref_info[0]
                    for key in ('startReference','endReference','lineType','alignment'):
                        value = str(record.get(key, '')).strip()
                        if value: item[key] = value
                    for key in ('firstWordId','lastWordId','surahNumber'):
                        value = record.get(key)
                        if value not in (None, ''):
                            try: item[key] = max(0, int(value))
                            except (TypeError, ValueError): pass
                    for key in ('sourceAyahIndex','sourceWordStartIndex'):
                        value = record.get(key)
                        if value not in (None, ''):
                            try: item[key] = int(value)
                            except (TypeError, ValueError): pass
                    runtime['mushafLines'].append(item)
                elif layer_id == 'recitation_audio':
                    audio_path = str(record.get('audioPath', '')).strip()
                    if not ref_info or not audio_path:
                        continue
                    item = {'id': rid, 'datasetId': dataset_id, 'reference': ref_info[0], 'audioPath': audio_path}
                    for key in ('qari','label'):
                        value = str(record.get(key, '')).strip()
                        if value: item[key] = value
                    runtime['audio'].append(item)
    # Consolidate word-analysis overlays (e.g. baseline tokenization + licensed translations)
    # into one runtime token per Sure:Vers + 1-based word index. Later datasets enrich but never duplicate.
    merged_words = {}
    for word in runtime['words']:
        key = (word.get('reference'), word.get('wordIndex'))
        current = merged_words.get(key)
        if current is None:
            merged_words[key] = dict(word)
            continue
        for field in ('translation','lemma','root','morphology'):
            if word.get(field):
                current[field] = word[field]
                if field == 'translation' and word.get('translationDatasetId'):
                    current['translationDatasetId'] = word['translationDatasetId']
        if current.get('text') in ('', '—') and word.get('text'):
            current['text'] = word['text']
    runtime['words'] = list(merged_words.values())
    if len(runtime['words']) != EXPECTED_QURAN_WORDS:
        raise ValueError(f"Quran-Wortbasis unvollständig: {len(runtime['words'])}/{EXPECTED_QURAN_WORDS}")
    translated_words = sum(1 for item in runtime['words'] if str(item.get('translation', '')).strip())
    if translated_words != EXPECTED_QURAN_WORDS:
        raise ValueError(f"Deutsche Quran-Wortübersetzungen unvollständig: {translated_words}/{EXPECTED_QURAN_WORDS}")

    runtime['editorialOpen'] = any(dataset['editorialOpen'] for dataset in runtime['datasets']) or not runtime['datasets']
    runtime['mushafLines'].sort(key=lambda item: (item['page'], item['line']))
    runtime['words'].sort(key=lambda item: (item['reference'], item['wordIndex']))
    return runtime


_ARABIC_MARKS = re.compile(r'[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]')
_ARABIC_CHAR = re.compile(r'[\u0600-\u06ff]')


def normalize_arabic_surface(value: object) -> str:
    text = unicodedata.normalize('NFKC', str(value or ''))
    text = _ARABIC_MARKS.sub('', text).replace('ـ', '')
    for source, target in [('ٱ', 'ا'), ('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ى', 'ي'), ('ؤ', 'و'), ('ئ', 'ي')]:
        text = text.replace(source, target)
    return ''.join(char for char in text if _ARABIC_CHAR.fullmatch(char))


def _quran_reference_order(reference: str) -> int:
    parsed = _quran_reference(reference)
    if not parsed:
        return 10**9
    _, surah, ayah = parsed
    return sum(QURAN_AYAH_COUNTS[:surah - 1]) + ayah


def load_quran_vocabulary_link_reviews() -> dict[str, dict]:
    path = SOURCE / 'static' / 'quran-vocabulary-link-reviews.json'
    if not path.exists():
        return {}
    payload = read_json(path)
    if not isinstance(payload, dict) or payload.get('schemaVersion') != 1:
        raise ValueError('quran-vocabulary-link-reviews.json: schemaVersion 1 erforderlich')
    reviews = payload.get('reviews', [])
    if not isinstance(reviews, list):
        raise ValueError('quran-vocabulary-link-reviews.json: reviews muss eine Liste sein')
    output: dict[str, dict] = {}
    for review in reviews:
        if not isinstance(review, dict):
            raise ValueError('quran-vocabulary-link-reviews.json: Review-Eintrag ungültig')
        vocabulary_id = str(review.get('vocabularyId', '')).strip()
        fingerprint = str(review.get('fingerprint', '')).strip()
        status = str(review.get('status', '')).strip()
        if not vocabulary_id or not fingerprint or status not in {'verified', 'rejected'}:
            raise ValueError(f'quran-vocabulary-link-reviews.json: Review für {vocabulary_id or "(ohne ID)"} ungültig')
        if vocabulary_id in output:
            raise ValueError(f'quran-vocabulary-link-reviews.json: Doppeltes Review {vocabulary_id}')
        output[vocabulary_id] = {'fingerprint': fingerprint, 'status': status}
    return output


def quran_vocabulary_link_fingerprint(vocabulary_id: str, match_kind: str, normalized: str, references: list[str]) -> str:
    material = '|'.join([vocabulary_id, match_kind, normalized, *references])
    return hashlib.sha256(material.encode('utf-8')).hexdigest()[:24]


def build_quran_vocabulary_links(vocabulary: list[dict], runtime: dict, reviews: dict[str, dict] | None = None) -> list[dict]:
    """Build conservative Fusha→Quran hints; editorial verification is fingerprint-bound."""
    reviews = reviews or {}
    words_by_surface: dict[str, list[dict]] = defaultdict(list)
    words_by_lemma: dict[str, list[dict]] = defaultdict(list)
    words_by_root: dict[str, list[dict]] = defaultdict(list)
    for word in runtime.get('words', []):
        surface = normalize_arabic_surface(word.get('text'))
        lemma = normalize_arabic_surface(word.get('lemma'))
        root = normalize_arabic_surface(word.get('root'))
        if surface: words_by_surface[surface].append(word)
        if lemma: words_by_lemma[lemma].append(word)
        if root: words_by_root[root].append(word)

    output: list[dict] = []
    for entry in vocabulary:
        candidates: list[tuple[str, str, list[dict]]] = []
        lemma = normalize_arabic_surface(entry.get('lemmaUnvocalized') or entry.get('lemmaVocalized'))
        surface = normalize_arabic_surface(entry.get('arabicUnvocalized') or entry.get('arabicVocalized'))
        root = normalize_arabic_surface(entry.get('root'))
        # Lemma is semantically stronger when a licensed morphology layer exists.
        if lemma and words_by_lemma.get(lemma): candidates.append(('lemma_exact', lemma, words_by_lemma[lemma]))
        if surface and words_by_surface.get(surface): candidates.append(('surface_exact', surface, words_by_surface[surface]))
        if root and words_by_root.get(root): candidates.append(('root_exact', root, words_by_root[root]))
        if not candidates:
            continue
        match_kind, normalized, matches = candidates[0]
        deduped = {str(word.get('id') or f"{word.get('reference')}:{word.get('wordIndex')}"): word for word in matches}
        references = sorted({str(word.get('reference', '')) for word in deduped.values() if _quran_reference(str(word.get('reference', '')))}, key=_quran_reference_order)
        if not references:
            continue
        references = references[:24]
        fingerprint = quran_vocabulary_link_fingerprint(entry['id'], match_kind, normalized, references)
        review = reviews.get(entry['id'])
        review_status = 'verified' if review and review.get('status') == 'verified' and review.get('fingerprint') == fingerprint else 'derived'
        # Rejected fingerprints stay out of the runtime graph until the source match changes.
        if review and review.get('status') == 'rejected' and review.get('fingerprint') == fingerprint:
            continue
        output.append({
            'id': f"qvl_{entry['id']}",
            'vocabularyId': entry['id'],
            'normalizedForm': normalized,
            'matchKind': match_kind,
            'occurrenceCount': len(deduped),
            'surahCount': len({int(reference.split(':', 1)[0]) for reference in references}),
            'references': references,
            'reviewFingerprint': fingerprint,
            # Only fingerprint-bound editorial approval can unlock graded Quran transfer.
            'reviewStatus': review_status
        })
    return output


def enrich_quran_lessons_with_corpus(lessons: list[dict], runtime: dict) -> None:
    words_by_surface: dict[str, list[str]] = defaultdict(list)
    for word in runtime.get('words', []):
        normalized = normalize_arabic_surface(word.get('text'))
        reference = str(word.get('reference', ''))
        if normalized and _quran_reference(reference): words_by_surface[normalized].append(reference)
    ayahs = [item for item in runtime.get('ayahs', []) if isinstance(item, dict)]
    for lesson in lessons:
        refs: set[str] = set()
        for example in lesson.get('examples', []):
            arabic = str(example.get('arabic', '')).strip()
            normalized = normalize_arabic_surface(arabic)
            if normalized and len(normalized) <= 18:
                refs.update(words_by_surface.get(normalized, [])[:12])
            if len(arabic) <= 4:
                for ayah in ayahs:
                    if arabic and arabic in str(ayah.get('text', '')):
                        refs.add(str(ayah['reference']))
                        if len(refs) >= 12: break
        lesson['quranReferences'] = sorted(refs, key=_quran_reference_order)[:6]


def attach_learning_item_quran_refs(content: dict[str, list[dict]], links: list[dict]) -> None:
    link_by_vocabulary = {entry['vocabularyId']: entry for entry in links}
    quran_by_id = {entry['id']: entry for entry in content['quran']}
    for item in content['learningItems']:
        refs: list[str] = []
        if item.get('contentModule') == 'vocabulary':
            refs = list(link_by_vocabulary.get(item.get('contentId'), {}).get('references', []))
        elif item.get('contentModule') == 'quran':
            refs = list(quran_by_id.get(item.get('contentId'), {}).get('quranReferences', []))
        item['quranReferences'] = refs



def main() -> None:
    content={'alphabet':ensure_metadata(read_json(SOURCE/'static/alphabet.json')),'vocabulary':load_vocabulary(),'grammar':expand_grammar_quiz_pools(ensure_metadata(read_json(SOURCE/'grammar/lessons.json'))),'writing':ensure_metadata(read_json(SOURCE/'static/writing.json')),'reading':ensure_metadata(read_json(SOURCE/'static/reading.json')),'quran':ensure_metadata(read_json(SOURCE/'quran/lessons.json'),'quranic'),'learningPath':ensure_metadata(enrich_paths(read_json(SOURCE/'static/learning-path.json'))),'quranPath':ensure_metadata(enrich_paths(read_json(SOURCE/'static/quran-path.json')),'quranic'),'islamicPaths':ensure_metadata(enrich_paths(load_split_array(SOURCE/'islamic/paths') + load_fiqh_paths(SOURCE))),'skills':ensure_semantic_metadata(read_json(SOURCE/'static/skills.json')),'exerciseTemplates':ensure_semantic_metadata(read_json(SOURCE/'static/exercise-templates.json')),'sources':read_json(SOURCE/'static/sources.json')}
    quran_reader_runtime = build_quran_reader_runtime()
    enrich_quran_lessons_with_corpus(content['quran'], quran_reader_runtime)
    enhance_v012_course_exercises(content)
    content['learningItems']=build_learning_items(content)
    quran_vocabulary_links = build_quran_vocabulary_links(content['vocabulary'], quran_reader_runtime, load_quran_vocabulary_link_reviews())
    attach_learning_item_quran_refs(content, quran_vocabulary_links)
    content.update(build_source_layer(content, content['sources']))
    apply_source_verification(content)
    attach_module_quality(content)
    validate_module_quality(content)
    validate_source_layer(content)
    for dataset,items in content.items(): validate_unique(dataset,items)
    validate_references(content)
    validate_semantic_layer(content)
    id_aliases = validate_release_id_contract(content)
    counts={k:len(v) for k,v in content.items()}
    counts['quranVocabularyLinks'] = len(quran_vocabulary_links)
    islamic_search_index = [
        {
            'id': unit['id'],
            'title': unit['title'],
            'objective': unit.get('objective', ''),
            'chapterTitle': chapter.get('title', ''),
            'track': chapter.get('track', '')
        }
        for chapter in content['islamicPaths']
        for unit in chapter.get('units', [])
    ]
    vocabulary_detail_fields = ('examples','collocations','wordFamily','translationNote','usageNote','hint')
    vocabulary_index=[]
    vocabulary_details={level:[] for level in LEVELS}
    for entry in content['vocabulary']:
        indexed=dict(entry)
        details={'id':entry['id']}
        for field in vocabulary_detail_fields:
            value=indexed.pop(field, None)
            if value not in (None, [], ''): details[field]=value
        indexed['examples']=[]
        indexed['collocations']=[]
        indexed['wordFamily']=[]
        vocabulary_index.append(indexed)
        vocabulary_details[entry['cefrLevel']].append(details)
    vocabulary_datasets=['vocabulary-index.json',*[f'vocabulary-details/{level}.json' for level in LEVELS]]
    manifest={'contentVersion':VERSION,'releaseOrder':RELEASE_ORDER,'catalogSchemaVersion':CATALOG_SCHEMA_VERSION,'status':'draft','source':'Versionierter Lernkatalog v0.12.1 mit Claim-/Citation-Quellenlayer, Review-Gates und Kompetenzdiagnostik – fachliche Endprüfung ausstehend','lastUpdated':UPDATED,'language':'ar-MSA','languageName':'Modernes Hocharabisch (Fusha) mit optionaler Quran-Lesebrücke','arabicVariety':'fusha','stableIds':True,'supportedLevels':LEVELS,'datasets':['alphabet.json',*vocabulary_datasets,'grammar.json','writing.json','reading.json','quran.json','learning-path.json','quran-path.json',*[f'islamic-paths/{track}.json' for track in ISLAMIC_TRACKS],'skills.json','learning-items.json','exercise-templates.json','sources.json','source-evidence/*.json','quran-vocabulary-links.json','islamic-search-index.json','quran-reader-core.json','quran-reader/surah/*.json'],'counts':counts,'editorialNotice':'Fusha-, Quran-, Muṣḥaf-, Tajwīd-, Fiqh-, Uṣūl- und Hadith-Inhalte sind redaktionelle Entwürfe und müssen vor Veröffentlichung fachlich und lizenzrechtlich geprüft werden.','showEditorialNotice':True,'editorialReviewMode':True}
    OUTPUT.mkdir(parents=True,exist_ok=True)
    legacy_quran_reader = OUTPUT / 'quran-reader.json'
    if legacy_quran_reader.exists(): legacy_quran_reader.unlink()
    legacy_content_relations = OUTPUT / 'content-relations.json'
    if legacy_content_relations.exists(): legacy_content_relations.unlink()
    write_json(OUTPUT/'manifest.json',manifest)
    # Runtime is intentionally sharded: no monolithic quran-reader.json is emitted.
    write_json(OUTPUT/'quran-vocabulary-links.json', quran_vocabulary_links)
    write_json(OUTPUT/'islamic-search-index.json', islamic_search_index)
    # P1: keep only metadata in the reader core. All Quran records are loaded per
    # surah so opening the reader no longer parses the complete ~5 MiB corpus.
    quran_reader_core = {
        **quran_reader_runtime,
        'ayahs': [],
        'translations': [],
        'tafsir': [],
        'words': [],
        'tajweed': [],
        'mushafLines': [],
        'audio': []
    }
    write_json(OUTPUT/'quran-reader-core.json', quran_reader_core)
    shard_dir = OUTPUT / 'quran-reader' / 'surah'
    shard_dir.mkdir(parents=True, exist_ok=True)
    for old in shard_dir.glob('*.json'):
        old.unlink()
    for surah in range(1, 115):
        prefix = f'{surah}:'
        write_json(shard_dir / f'{surah:03d}.json', {
            'schemaVersion': 1,
            'generatedAt': quran_reader_runtime['generatedAt'],
            'surah': surah,
            'ayahs': [item for item in quran_reader_runtime['ayahs'] if int(item.get('surah', 0)) == surah],
            'translations': [item for item in quran_reader_runtime['translations'] if str(item.get('reference', '')).startswith(prefix)],
            'tafsir': [item for item in quran_reader_runtime['tafsir'] if str(item.get('reference', '')).startswith(prefix)],
            'words': [item for item in quran_reader_runtime['words'] if str(item.get('reference', '')).startswith(prefix)],
            'tajweed': [item for item in quran_reader_runtime['tajweed'] if str(item.get('reference', '')).startswith(prefix)],
            'mushafLines': [item for item in quran_reader_runtime['mushafLines'] if int(item.get('surahNumber') or 0) == surah or str(item.get('reference', '')).startswith(prefix) or str(item.get('startReference', '')).startswith(prefix)],
            'audio': [item for item in quran_reader_runtime['audio'] if str(item.get('reference', '')).startswith(prefix)]
        })
    # P1: source evidence is sharded by source. The source catalogue stays small,
    # while claims/citations are fetched only for the selected work.
    evidence_dir = OUTPUT / 'source-evidence'
    evidence_dir.mkdir(parents=True, exist_ok=True)
    for old in evidence_dir.glob('*.json'):
        old.unlink()
    citations_by_source = defaultdict(list)
    for citation in content['citations']:
        citations_by_source[citation['sourceId']].append(citation)
    links_by_citation = defaultdict(list)
    for link in content['claimSourceLinks']:
        links_by_citation[link['citationId']].append(link)
    claims_by_id = {claim['id']: claim for claim in content['claims']}
    for source in content['sources']:
        source_citations = citations_by_source.get(source['id'], [])
        source_links = [link for citation in source_citations for link in links_by_citation.get(citation['id'], [])]
        source_claim_ids = {link['claimId'] for link in source_links}
        write_json(evidence_dir / f"{source['id']}.json", {
            'schemaVersion': 1,
            'sourceId': source['id'],
            'citations': source_citations,
            'claims': [claims_by_id[claim_id] for claim_id in sorted(source_claim_ids) if claim_id in claims_by_id],
            'claimSourceLinks': source_links
        })
    for legacy_name in ('citations.json', 'claims.json', 'claim-source-links.json'):
        legacy = OUTPUT / legacy_name
        if legacy.exists():
            legacy.unlink()
    files={'alphabet':'alphabet.json','grammar':'grammar.json','writing':'writing.json','reading':'reading.json','quran':'quran.json','learningPath':'learning-path.json','quranPath':'quran-path.json','skills':'skills.json','learningItems':'learning-items.json','exerciseTemplates':'exercise-templates.json','sources':'sources.json'}
    for key,name in files.items(): write_json(OUTPUT/name,content[key])
    write_json(OUTPUT/'vocabulary-index.json', vocabulary_index)
    vocabulary_runtime = OUTPUT/'vocabulary-details'
    vocabulary_runtime.mkdir(parents=True, exist_ok=True)
    for old in vocabulary_runtime.glob('*.json'): old.unlink()
    for level, details in vocabulary_details.items(): write_json(vocabulary_runtime/f'{level}.json', details)
    legacy_vocabulary = OUTPUT/'vocabulary.json'
    if legacy_vocabulary.exists(): legacy_vocabulary.unlink()
    legacy_islamic = OUTPUT/'islamic-paths.json'
    if legacy_islamic.exists(): legacy_islamic.unlink()
    islamic_runtime = OUTPUT/'islamic-paths'
    for old in islamic_runtime.glob('*.json') if islamic_runtime.exists() else []: old.unlink()
    by_track={}
    for chapter in content['islamicPaths']: by_track.setdefault(chapter['track'], []).append(chapter)
    for track, chapters in sorted(by_track.items()): write_json(islamic_runtime/f'{track}.json', chapters)
    write_json(OUTPUT/'id-aliases.json', id_aliases)
    (OUTPUT / '.build-stamp').write_text(UPDATED + '\n', encoding='utf-8')
    print('Kurskatalog 0.12.1 gebaut:')
    for key,value in counts.items(): print(f'  {key}: {value}')

if __name__=='__main__': main()
