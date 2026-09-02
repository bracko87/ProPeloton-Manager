from __future__ import annotations

import re
from pathlib import Path

root = Path('.')
templates = (root / 'src/features/notifications/notificationTemplates.tsx').read_text(encoding='utf-8')
localization = (root / 'src/features/notifications/notificationLocalization.ts').read_text(encoding='utf-8')

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

norm = lambda s: re.sub(r'[_-]+', ' ', s.strip()).lower()
missing_detail = [x for x in detail_labels if norm(x) not in detail_map]
missing_actions = [x for x in action_labels if norm(x) not in action_map and not norm(x).startswith('open ')]

print(f'Static detail labels: {len(detail_labels)}')
print(f'Mapped detail labels: {len(detail_labels)-len(missing_detail)}')
print(f'MISSING DETAIL LABELS ({len(missing_detail)}):')
for value in missing_detail:
    print('  -', value)

print(f'\nStatic action labels: {len(action_labels)}')
print(f'MISSING ACTION LABELS ({len(missing_actions)}):')
for value in missing_actions:
    print('  -', value)

print(f'\nLiteral fallback values ({len(literal_fallbacks)}):')
for value in literal_fallbacks:
    print('  -', value)
