from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / 'src/i18n/index.ts'
EN = ROOT / 'src/i18n/locales/en'
IT = ROOT / 'src/i18n/locales/it'

PREVIEW_NAMESPACES = [
    'accountPages',
    'auth',
    'common',
    'createClub',
    'home',
    'navigation',
    'profile',
]

IMPORTS = """\
import itAccountPages from './locales/it/accountPages.json'
import itAuth from './locales/it/auth.json'
import itCommon from './locales/it/common.json'
import itCreateClub from './locales/it/createClub.json'
import itHome from './locales/it/home.json'
import itNavigation from './locales/it/navigation.json'
import itProfile from './locales/it/profile.json'
"""

RESOURCE_BLOCK = """\
  it: {
    accountPages: itAccountPages,
    auth: itAuth,
    common: itCommon,
    createClub: itCreateClub,
    home: itHome,
    navigation: itNavigation,
    profile: itProfile,
  },
"""

PLACEHOLDER = re.compile(r'{{[^{}]+}}')


def walk_pair(src, dst, path: str, errors: list[str]) -> None:
    if type(src) is not type(dst):
        errors.append(f'{path}: type mismatch')
        return
    if isinstance(src, dict):
        if list(src) != list(dst):
            errors.append(f'{path}: keys/order mismatch')
        for key in src:
            if key in dst:
                walk_pair(src[key], dst[key], f'{path}.{key}', errors)
    elif isinstance(src, list):
        if len(src) != len(dst):
            errors.append(f'{path}: list length mismatch')
        for i, (a, b) in enumerate(zip(src, dst)):
            walk_pair(a, b, f'{path}[{i}]', errors)
    elif isinstance(src, str):
        if sorted(PLACEHOLDER.findall(src)) != sorted(PLACEHOLDER.findall(dst)):
            errors.append(f'{path}: placeholder mismatch')


def wire_index() -> None:
    text = INDEX.read_text(encoding='utf-8')

    if "import itAccountPages" not in text:
        marker = "import esTutorials from './locales/es/tutorials.json'\n"
        if marker not in text:
            raise SystemExit('Could not find Spanish import marker in src/i18n/index.ts')
        text = text.replace(marker, marker + '\n' + IMPORTS, 1)

    if '\n  it: {\n' not in text:
        marker = '} as const\n\nconst initialLanguage'
        if marker not in text:
            raise SystemExit('Could not find resources closing marker in src/i18n/index.ts')
        text = text.replace(marker, RESOURCE_BLOCK + '} as const\n\nconst initialLanguage', 1)

    text = text.replace(
        "supportedLngs: ['en', 'sr-Latn', 'de', 'hr', 'es'],",
        "supportedLngs: ['en', 'sr-Latn', 'de', 'hr', 'es', 'it'],",
    )

    INDEX.write_text(text, encoding='utf-8')


def future_proof_spanish_audits() -> None:
    old = "supportedLngs: ['en', 'sr-Latn', 'de', 'hr', 'es']"
    new = "supportedLngs: ['en', 'sr-Latn', 'de', 'hr', 'es', 'it']"
    for pattern in ('*.py', '*.yml', '*.yaml'):
        for path in (ROOT / '.github').rglob(pattern):
            text = path.read_text(encoding='utf-8')
            if old in text:
                path.write_text(text.replace(old, new), encoding='utf-8')


def validate_preview() -> None:
    errors: list[str] = []
    for namespace in PREVIEW_NAMESPACES:
        en_path = EN / f'{namespace}.json'
        it_path = IT / f'{namespace}.json'
        if not it_path.exists():
            errors.append(f'Missing Italian preview namespace: {namespace}')
            continue
        src = json.loads(en_path.read_text(encoding='utf-8'))
        dst = json.loads(it_path.read_text(encoding='utf-8'))
        walk_pair(src, dst, namespace, errors)

    index = INDEX.read_text(encoding='utf-8')
    languages = (ROOT / 'src/i18n/languages.ts').read_text(encoding='utf-8')
    selector = (ROOT / 'src/components/i18n/LanguageSelector.tsx').read_text(encoding='utf-8')
    date_bridge = (ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx').read_text(encoding='utf-8')
    migration = (ROOT / 'supabase/migrations/20260831102500_allow_italian_preferred_language.sql').read_text(encoding='utf-8')

    required = [
        ("code: 'it'", languages, 'Italian language metadata'),
        ("locale: 'it-IT'", languages, 'Italian locale metadata'),
        ("it: 'it'", selector, 'Italian flag mapping'),
        ("language?.startsWith('it')", date_bridge, 'Italian date locale routing'),
        ("return 'it-IT'", date_bridge, 'Italian date locale value'),
        ("supportedLngs: ['en', 'sr-Latn', 'de', 'hr', 'es', 'it']", index, 'Italian i18next support'),
        ("it: {", index, 'Italian i18next resource bundle'),
        ("'it'::text", migration, 'Italian preferred_language constraint'),
    ]
    for needle, haystack, label in required:
        if needle not in haystack:
            errors.append(f'Missing {label}')

    if errors:
        print('\n'.join('ERROR: ' + error for error in errors))
        raise SystemExit(f'Italian preview validation failed with {len(errors)} error(s).')

    print('Italian preview validation passed.')
    print('Preview namespaces:', ', '.join(PREVIEW_NAMESPACES))
    print('Deeper namespaces intentionally fall back to English until the full Italian package is completed.')


def main() -> None:
    wire_index()
    future_proof_spanish_audits()
    validate_preview()


if __name__ == '__main__':
    main()
