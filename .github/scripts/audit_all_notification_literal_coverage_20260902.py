from __future__ import annotations

import json
import re
from pathlib import Path

# Full one-time registry audit: every static notification detail/action literal.
root = Path('.')
templates = (root / 'src/features/notifications/notificationTemplates.tsx').read_text(encoding='utf-8')
localization = (root / 'src/features/notifications/notificationLocalization.ts').read_text(encoding='utf-8')
en_notifications = json.loads((root / 'src/i18n/locales/en/notifications.json').read_text(encoding='utf-8'))

norm = lambda s: re.sub(r'\s+', ' ', re.sub(r'[_-]+', ' ', s.strip())).lower()

# Flatten English notification resources into normalized English value -> keys.
def flatten(value, prefix=''):
    out = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f'{prefix}.{key}' if prefix else key
            out.extend(flatten(child, path))
    elif isinstance(value, str) and '{{' not in value:
        out.append((prefix, value))
    return out

reverse_en = {}
for key, value in flatten(en_notifications):
    reverse_en.setdefault(norm(value), []).append(key)

# Static detail labels used by detailRow('...').
detail_labels = sorted(set(re.findall(r"detailRow\(\s*['\"]([^'\"]+)['\"]", templates)))
# Translation-map normalized labels.
detail_map_block = re.search(r"const DETAIL_LABEL_KEYS:[\s\S]*?= \{([\s\S]*?)\n\}", localization)
detail_map = set()
if detail_map_block:
    detail_map = set(re.findall(r"['\"]([^'\"]+)['\"]\s*:\s*['\"]", detail_map_block.group(1)))

# Literal action labels in template registry.
action_labels = sorted(set(re.findall(r"\blabel:\s*['\"]([^'\"]+)['\"]", templates)))
action_map_block = re.search(r"const ACTION_KEY_BY_LABEL:[\s\S]*?= \{([\s\S]*?)\n\}", localization)
action_map = set()
if action_map_block:
    action_map = set(re.findall(r"['\"]([^'\"]+)['\"]\s*:\s*['\"]", action_map_block.group(1)))

# Exact literal statuses / short values that are common leakage sources.
literal_fallbacks = sorted(set(re.findall(r"\|\|\s*['\"]([^'\"\n]{2,80})['\"]", templates)))

missing_detail = [x for x in detail_labels if norm(x) not in detail_map]
reverse_detail = [x for x in missing_detail if norm(x) in reverse_en]
unresolved_detail = [x for x in missing_detail if norm(x) not in reverse_en]
missing_actions = [x for x in action_labels if norm(x) not in action_map and not norm(x).startswith('open ')]
reverse_actions = [x for x in missing_actions if norm(x) in reverse_en]
unresolved_actions = [x for x in missing_actions if norm(x) not in reverse_en]

print(f'Static detail labels: {len(detail_labels)}')
print(f'Manually mapped detail labels: {len(detail_labels)-len(missing_detail)}')
print(f'Resolvable via English resource reverse lookup: {len(reverse_detail)}')
print(f'UNRESOLVED DETAIL LABELS ({len(unresolved_detail)}):')
for value in unresolved_detail:
    print('  -', value)

print(f'\nStatic action labels: {len(action_labels)}')
print(f'Resolvable actions via English resource reverse lookup: {len(reverse_actions)}')
print(f'UNRESOLVED ACTION LABELS ({len(unresolved_actions)}):')
for value in unresolved_actions:
    print('  -', value)

print(f'\nLiteral fallback values ({len(literal_fallbacks)}):')
for value in literal_fallbacks:
    print('  -', value)
