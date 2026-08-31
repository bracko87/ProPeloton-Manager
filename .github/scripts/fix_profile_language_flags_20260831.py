from pathlib import Path

path = Path('src/pages/MyProfile.tsx')
text = path.read_text(encoding='utf-8')

active_old = """src={activeLanguageDefinition.code === 'sr-Latn'\n        ? 'https://flagcdn.com/w40/rs.png'\n        : 'https://flagcdn.com/w40/gb.png'}"""
active_new = """src={`https://flagcdn.com/w40/${activeLanguageDefinition.countryCode.toLowerCase()}.png`}"""

option_old = """src={language.code === 'sr-Latn'\n                ? 'https://flagcdn.com/w40/rs.png'\n                : 'https://flagcdn.com/w40/gb.png'}"""
option_new = """src={`https://flagcdn.com/w40/${language.countryCode.toLowerCase()}.png`}"""

if text.count(active_old) != 1:
    raise SystemExit(f'Expected exactly one active-language hard-coded flag block, found {text.count(active_old)}')
if text.count(option_old) != 1:
    raise SystemExit(f'Expected exactly one language-option hard-coded flag block, found {text.count(option_old)}')

text = text.replace(active_old, active_new)
text = text.replace(option_old, option_new)

if "activeLanguageDefinition.code === 'sr-Latn'" in text:
    raise SystemExit('Old active-language flag special case still present')
if "language.code === 'sr-Latn'" in text:
    raise SystemExit('Old language-option flag special case still present')
if 'activeLanguageDefinition.countryCode.toLowerCase()' not in text:
    raise SystemExit('Active language flag no longer derives from countryCode')
if 'language.countryCode.toLowerCase()' not in text:
    raise SystemExit('Language option flag no longer derives from countryCode')

path.write_text(text, encoding='utf-8')
print('Updated My Profile language flags to use each language countryCode.')
