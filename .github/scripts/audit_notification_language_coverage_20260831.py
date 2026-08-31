#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_FILE = ROOT / 'src/features/notifications/notificationTemplates.tsx'
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']

text = TEMPLATE_FILE.read_text(encoding='utf-8')
registry_start = text.index('export const NOTIFICATION_TEMPLATES')
registry_end = text.index('export function getNotificationTemplate', registry_start)
registry = text[registry_start:registry_end]

type_codes = set(re.findall(r'^\s{2}([A-Z][A-Z0-9_]+):\s*\{', registry, re.MULTILINE))
type_codes.update(re.findall(r"typeCode === ['\"]([A-Z][A-Z0-9_]+)['\"]", text[registry_end:]))

tokens = set()
for code in type_codes:
    tokens.update(part for part in code.split('_') if part)

print(f'Notification type codes discovered: {len(type_codes)}')
print(f'Unique type-code tokens: {len(tokens)}')
print('Types:')
for code in sorted(type_codes):
    print(f'  {code}')

has_missing = False
for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'notifications.json'
    if not path.exists():
        print(f'[{locale}] MISSING notifications.json')
        has_missing = True
        continue
    data = json.loads(path.read_text(encoding='utf-8'))
    words = set((data.get('templateWords') or {}).keys())
    missing = sorted(tokens - words)
    print(f'[{locale}] templateWords={len(words)} missing={len(missing)}')
    if missing:
        has_missing = True
        print('  ' + ', '.join(missing))

if has_missing:
    raise SystemExit(1)

print('Notification localization token coverage: OK')
