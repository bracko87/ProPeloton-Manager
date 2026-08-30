from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('.')
LOCALES = ROOT / 'src/i18n/locales'

summaries = {
    'en': 'Asking price {{price}} · {{time}} · open offers: {{count}}.',
    'sr-Latn': 'Tražena cena {{price}} · {{time}} · otvorene ponude: {{count}}.',
    'de': 'Preis {{price}} · {{time}} · offene Angebote: {{count}}.',
}

for lang, value in summaries.items():
    path = LOCALES / lang / 'riderProfile.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data['ownedContract']['listedSummary'] = value
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

rider_profile = ROOT / 'src/features/squad/components/RiderProfilePage.tsx'
text = rider_profile.read_text(encoding='utf-8')
old = """function getRiderProfileLocale(): string {
  const language = appI18n.resolvedLanguage ?? appI18n.language ?? 'en'
  return language.startsWith('sr') ? 'sr-Latn-RS' : 'en-GB'
}
"""
new = """function getRiderProfileLocale(): string {
  const language = appI18n.resolvedLanguage ?? appI18n.language ?? 'en'
  if (language.startsWith('sr')) return 'sr-Latn-RS'
  if (language.startsWith('de')) return 'de-DE'
  if (language.startsWith('hr')) return 'hr-HR'
  return 'en-GB'
}
"""
if old not in text and "language.startsWith('hr')" not in text:
    raise SystemExit('Expected RiderProfile locale helper was not found.')
if old in text:
    rider_profile.write_text(text.replace(old, new, 1), encoding='utf-8')

print('Canonical transfer-summary placeholders normalized and rider-profile locales extended for de/hr.')
