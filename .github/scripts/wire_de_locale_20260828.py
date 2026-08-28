from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / 'src/i18n/index.ts'
LANGUAGES = ROOT / 'src/i18n/languages.ts'
SELECTOR = ROOT / 'src/components/i18n/LanguageSelector.tsx'
DATE_BRIDGE = ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f'Missing anchor while wiring German locale: {label}')
    return text.replace(old, new, 1)


def wire_languages() -> None:
    text = LANGUAGES.read_text(encoding='utf-8')
    german_block = """  {
    code: 'de',
    label: 'Deutsch',
    shortLabel: 'DE',
    flag: '🇩🇪',
    countryCode: 'DE',
    htmlLang: 'de',
    locale: 'de-DE',
  },
"""
    if "code: 'de'" not in text:
        anchor = "] as const\n\nexport type SupportedLanguage"
        if anchor not in text:
            raise SystemExit('Could not find SUPPORTED_LANGUAGES closing anchor')
        text = text.replace(anchor, german_block + "] as const\n\nexport type SupportedLanguage", 1)
    LANGUAGES.write_text(text, encoding='utf-8')


def wire_selector() -> None:
    text = SELECTOR.read_text(encoding='utf-8')
    if "de: 'de'" not in text:
        text = replace_once(
            text,
            "  'sr-Latn': 'rs',\n",
            "  'sr-Latn': 'rs',\n  de: 'de',\n",
            'German selector flag',
        )

    preview_block = """
    // German is exposed as a preview while its resource bundle is being completed.
    // Until the generated `de` resources land, i18next falls back to English keys.
    if (language === 'de') {
      const supported = Array.isArray(i18n.options.supportedLngs)
        ? i18n.options.supportedLngs
        : []
      if (!supported.includes('de')) {
        i18n.options.supportedLngs = [...supported, 'de']
      }
    }
"""
    text = text.replace(preview_block, '')
    SELECTOR.write_text(text, encoding='utf-8')


def wire_date_bridge() -> None:
    text = DATE_BRIDGE.read_text(encoding='utf-8')
    old = "function localeForLanguage(language: string | undefined): string {\n  return language?.startsWith('sr') ? 'sr-Latn-RS' : 'en-GB'\n}"
    new = "function localeForLanguage(language: string | undefined): string {\n  if (language?.startsWith('sr')) return 'sr-Latn-RS'\n  if (language?.startsWith('de')) return 'de-DE'\n  return 'en-GB'\n}"
    text = replace_once(text, old, new, 'German date locale')
    DATE_BRIDGE.write_text(text, encoding='utf-8')


def wire_index() -> None:
    text = INDEX.read_text(encoding='utf-8')

    # Build the German import block directly from the English namespace imports,
    # guaranteeing the registered German namespaces mirror English one-to-one.
    en_import_lines = re.findall(
        r"^import (en[A-Za-z0-9_]+) from '(\./locales/en/[^']+\.json)'$",
        text,
        flags=re.MULTILINE,
    )
    if not en_import_lines:
        raise SystemExit('No English i18n imports found in src/i18n/index.ts')

    de_import_block = '\n'.join(
        f"import de{variable[2:]} from '{path.replace('/en/', '/de/')}'"
        for variable, path in en_import_lines
    ) + '\n\n'

    if "./locales/de/" not in text:
        marker = "import {\n  DEFAULT_LANGUAGE,"
        if marker not in text:
            raise SystemExit('Could not find language-helper import anchor')
        text = text.replace(marker, de_import_block + marker, 1)

    # Extract the English resource namespace body and mirror it with de variables.
    match = re.search(r"  en: \{\n(?P<body>.*?)\n  \},\n  'sr-Latn': \{", text, flags=re.DOTALL)
    if not match:
        raise SystemExit('Could not extract English resources block')
    en_body = match.group('body')
    de_body = re.sub(r'\ben([A-Z][A-Za-z0-9_]*)\b', r'de\1', en_body)
    de_block = "  de: {\n" + de_body + "\n  },\n"

    if re.search(r"\n  de: \{", text) is None:
        marker = "} as const\n\nconst initialLanguage"
        if marker not in text:
            raise SystemExit('Could not find resources closing anchor')
        text = text.replace(marker, de_block + "} as const\n\nconst initialLanguage", 1)

    text = replace_once(
        text,
        "supportedLngs: ['en', 'sr-Latn'],",
        "supportedLngs: ['en', 'sr-Latn', 'de'],",
        'supportedLngs',
    )

    INDEX.write_text(text, encoding='utf-8')


def validate_wiring() -> None:
    languages = LANGUAGES.read_text(encoding='utf-8')
    selector = SELECTOR.read_text(encoding='utf-8')
    date_bridge = DATE_BRIDGE.read_text(encoding='utf-8')
    index = INDEX.read_text(encoding='utf-8')

    checks = {
        'German language metadata': "code: 'de'" in languages and "locale: 'de-DE'" in languages,
        'German selector flag': "de: 'de'" in selector,
        'German preview workaround removed': 'German is exposed as a preview' not in selector,
        'German date locale': "return 'de-DE'" in date_bridge,
        'German resources': "./locales/de/" in index and re.search(r"\n  de: \{", index) is not None,
        'German i18next support': "supportedLngs: ['en', 'sr-Latn', 'de']" in index,
        'English fallback unchanged': 'fallbackLng: DEFAULT_LANGUAGE' in index,
    }
    failures = [label for label, ok in checks.items() if not ok]
    if failures:
        raise SystemExit('German locale wiring validation failed: ' + ', '.join(failures))

    en_imports = set(re.findall(r"import en([A-Za-z0-9_]+) from './locales/en/", index))
    de_imports = set(re.findall(r"import de([A-Za-z0-9_]+) from './locales/de/", index))
    if en_imports != de_imports:
        raise SystemExit(f'German i18n imports do not mirror English: en={sorted(en_imports)} de={sorted(de_imports)}')

    print(f'German locale wired for {len(en_imports)} registered i18next namespaces.')


def main() -> None:
    wire_languages()
    wire_selector()
    wire_date_bridge()
    wire_index()
    validate_wiring()


if __name__ == '__main__':
    main()
