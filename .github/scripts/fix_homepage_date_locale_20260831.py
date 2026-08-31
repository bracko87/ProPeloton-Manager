from pathlib import Path

path = Path('src/pages/Home.tsx')
text = path.read_text(encoding='utf-8')
old = """function getUiLocale(language?: string): string {\n  return language?.toLowerCase().startsWith('sr') ? 'sr-Latn-RS' : 'en-US'\n}\n"""
new = """function getUiLocale(language?: string): string {\n  const normalized = String(language ?? 'en').toLowerCase()\n\n  if (normalized.startsWith('sr')) return 'sr-Latn-RS'\n  if (normalized.startsWith('de')) return 'de-DE'\n  if (normalized.startsWith('hr')) return 'hr-HR'\n  if (normalized.startsWith('es')) return 'es-ES'\n  if (normalized.startsWith('it')) return 'it-IT'\n  if (normalized.startsWith('fr')) return 'fr-FR'\n  if (normalized.startsWith('ru')) return 'ru-RU'\n  return 'en-GB'\n}\n"""
if old not in text:
    raise SystemExit('Expected getUiLocale implementation not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Updated homepage game-time locale mapping for all supported languages.')
