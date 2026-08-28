from __future__ import annotations

import importlib.util
import os
import re
from pathlib import Path
from typing import Any

from staff_course_options_de_20260828 import COURSE_OPTIONS

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / '.github/scripts/localize_full_de_20260828.py'


def load_translator_module():
    spec = importlib.util.spec_from_file_location('ppm_de_translator', MODULE_PATH)
    if spec is None or spec.loader is None:
        raise SystemExit(f'Cannot load translator module: {MODULE_PATH}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def placeholders(value: str) -> list[str]:
    return sorted(re.findall(r'\{\{[^{}]+\}\}', value))


def validate_shape(source: Any, target: Any, path: str = 'root') -> None:
    if type(source) is not type(target):
        raise SystemExit(f'{path}: type mismatch')
    if isinstance(source, dict):
        if list(source) != list(target):
            raise SystemExit(f'{path}: keys/order mismatch')
        for key in source:
            validate_shape(source[key], target[key], f'{path}.{key}')
    elif isinstance(source, list):
        if len(source) != len(target):
            raise SystemExit(f'{path}: list length mismatch')
        for index, (left, right) in enumerate(zip(source, target)):
            validate_shape(left, right, f'{path}[{index}]')
    elif isinstance(source, str):
        if placeholders(source) != placeholders(target):
            raise SystemExit(f'{path}: placeholders changed')


def iter_pairs(source: Any, target: Any, path: str = 'root'):
    if isinstance(source, dict):
        for key in source:
            yield from iter_pairs(source[key], target[key], f'{path}.{key}')
    elif isinstance(source, list):
        for index, (left, right) in enumerate(zip(source, target)):
            yield from iter_pairs(left, right, f'{path}[{index}]')
    elif isinstance(source, str):
        yield path, source, target


def main() -> None:
    selected_raw = os.environ.get('DE_TRANSLATION_FILES', '').strip()
    selected = [name for name in selected_raw.split() if name]
    if not selected:
        raise SystemExit('DE_TRANSLATION_FILES must contain one or more JSON filenames')

    module = load_translator_module()
    sources = {}
    for name in selected:
        en_path = module.EN_DIR / name
        if not en_path.exists():
            raise SystemExit(f'Unknown English locale file: {name}')
        if name in module.POLISHED_FILES:
            raise SystemExit(f'Refusing to overwrite polished German file: {name}')
        sources[name] = module.load_json(en_path)

    # Staff is special: its page/core dialogs were already manually polished.
    # Only courseOptions remained unreviewed, so preserve the current German file
    # and replace that deep section with deliberate human-reviewed German text.
    normal_sources = {name: data for name, data in sources.items() if name != 'staff.json'}
    translated_by_name: dict[str, Any] = {}

    if normal_sources:
        translator = module.Translator()
        chunks: list[str] = []
        for data in normal_sources.values():
            for value in module.iter_strings(data):
                if value in module.EXACT_OVERRIDES:
                    continue
                for protected, chunk in module.split_protected(value):
                    if not protected:
                        chunks.append(chunk)
        translator.translate_chunks(chunks)
        for name, source in normal_sources.items():
            translated_by_name[name] = module.translate_value(source, translator)

    if 'staff.json' in sources:
        source = sources['staff.json']
        current = module.load_json(module.DE_DIR / 'staff.json')
        if list(source.get('courseOptions', {})) != list(COURSE_OPTIONS):
            raise SystemExit('Reviewed Staff courseOptions no longer mirror English keys/order')
        current['courseOptions'] = COURSE_OPTIONS
        translated_by_name['staff.json'] = current

    bad_patterns = [
        r'\bJahreszeiten?\b',
        r'\bSchulungslager\b',
        r'\bPfadfinder(?:n|s)?\b',
        r'\bRassen?\b',
        r'\bReiter(?:in(?:nen)?|n|s)?\b',
        r'\bBühnen?\b',
        r'\bÜbertragungsgebühr\b',
        r'\bSignierbonus\b',
        r'\bHauptfach\b',
        r'\bVertragsglück\b',
        r'\bSaisonbeschäftigte\b',
        r'\bVermißt\b',
        r'\bFahrrad-Vermächtnis\b',
        r'\bIch unterschreibe\b',
        r'L 347 vom',
    ]
    informal = re.compile(r'\b(?:du|dich|dir|dein|deine|deinen|deinem|deiner|deines)\b', re.IGNORECASE)
    cyrillic = re.compile(r'[\u0400-\u04ff]')
    semantic_findings: list[str] = []

    module.DE_DIR.mkdir(parents=True, exist_ok=True)
    for name, source in sources.items():
        translated = translated_by_name[name]
        validate_shape(source, translated, name)
        for path, src, dst in iter_pairs(source, translated, name):
            # Hard failures: corruption/script problems mean the candidate is unsafe even for review.
            if cyrillic.search(dst):
                raise SystemExit(f'{path}: Cyrillic text remained: {dst!r}')
            for marker in ('�', 'Ã', 'Â', 'ZXQ', 'QXml'):
                if marker in dst:
                    raise SystemExit(f'{path}: corrupt marker {marker!r}: {dst!r}')

            # Semantic findings are collected, not discarded. The merged global audit is the
            # authoritative release gate and will report all of them together before any push.
            if informal.search(dst):
                semantic_findings.append(f'{path}: informal German tone; use Sie/Ihr: {dst!r}')
            for pattern in bad_patterns:
                if re.search(pattern, dst, re.IGNORECASE):
                    semantic_findings.append(f'{path}: rejected German game terminology {pattern!r}: {dst!r}')
            if src == dst and len(src) >= 38 and len(src.split()) >= 7:
                if not any(term in src for term in module.PROTECTED_PHRASES):
                    semantic_findings.append(f'{path}: likely untranslated English: {dst!r}')

        module.save_json(module.DE_DIR / name, translated)
        print('Wrote structurally checked candidate', name)

    if semantic_findings:
        print(f'BATCH SEMANTIC REVIEW FINDINGS: {len(semantic_findings)}')
        for finding in semantic_findings[:250]:
            print('REVIEW:', finding)
    else:
        print('Batch semantic precheck found no known issues.')


if __name__ == '__main__':
    main()
