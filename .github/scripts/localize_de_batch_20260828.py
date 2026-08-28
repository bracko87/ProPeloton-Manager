from __future__ import annotations

import importlib.util
import os
import re
from pathlib import Path
from typing import Any

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

    translator = module.Translator()
    chunks: list[str] = []
    for data in sources.values():
        for value in module.iter_strings(data):
            if value in module.EXACT_OVERRIDES:
                continue
            for protected, chunk in module.split_protected(value):
                if not protected:
                    chunks.append(chunk)

    translator.translate_chunks(chunks)

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

    module.DE_DIR.mkdir(parents=True, exist_ok=True)
    for name, source in sources.items():
        translated = module.translate_value(source, translator)
        validate_shape(source, translated, name)
        for path, src, dst in iter_pairs(source, translated, name):
            if cyrillic.search(dst):
                raise SystemExit(f'{path}: Cyrillic text remained: {dst!r}')
            if informal.search(dst):
                raise SystemExit(f'{path}: informal German tone; use Sie/Ihr: {dst!r}')
            for pattern in bad_patterns:
                if re.search(pattern, dst, re.IGNORECASE):
                    raise SystemExit(f'{path}: rejected German game terminology {pattern!r}: {dst!r}')
            for marker in ('�', 'Ã', 'Â', 'ZXQ', 'QXml'):
                if marker in dst:
                    raise SystemExit(f'{path}: corrupt marker {marker!r}: {dst!r}')
            if src == dst and len(src) >= 38 and len(src.split()) >= 7:
                if not any(term in src for term in module.PROTECTED_PHRASES):
                    raise SystemExit(f'{path}: likely untranslated English: {dst!r}')
        module.save_json(module.DE_DIR / name, translated)
        print('Wrote and checked', name)


if __name__ == '__main__':
    main()
