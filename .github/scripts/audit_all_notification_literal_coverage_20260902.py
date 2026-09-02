from __future__ import annotations

import json
import re
from pathlib import Path

# Full one-time registry audit: every static notification detail/action literal.
root = Path('.')
templates = (root / 'src/features/notifications/notificationTemplates.tsx').read_text(encoding='utf-8')
localization = (root / 'src/features/notifications/notificationLocalization.ts').read_text(encoding='utf-8')
en_dir = root / 'src/i18n/locales/en'
en_notifications = json.loads((en_dir / 'notifications.json').read_text(encoding='utf-8'))

norm = lambda s: re.sub(r'\s+', ' ', re.sub(r'[_-]+', ' ', s.strip())).lower()

def flatten(value, prefix=''):
    out = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f'{prefix}.{key}' if prefix else key
            out.extend(flatten(child, path))
    elif isinstance(value, str) and '{{' not in value:
        out.append((prefix, value))
    return out

# Build a reverse index across every loaded English namespace, so notification
# labels can reuse existing game translations before needing new copy.
reverse_all_en = {}
for path in sorted(en_dir.glob('*.json')):
    namespace = path.stem
    data = json.loads(path.read_text(encoding='utf-8'))
    for key, value in flatten(data):
        reverse_all_en.setdefault(norm(value), []).append((namespace, key))

reverse_notifications = {}
for key, value in flatten(en_notifications):
    reverse_notifications.setdefault(norm(value), []).append(key)

template_words = {str(k).lower() for k in en_notifications.get('templateWords', {}).keys()}

def words(value: str):
    return [w.lower() for w in re.findall(r"[A-Za-z0-9]+", value)]

# Static detail labels used by detailRow('...').
detail_labels = sorted(set(re.findall(r"detailRow\(\s*['\"]([^'\"]+)['\"]", templates)))
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

literal_fallbacks = sorted(set(re.findall(r"\|\|\s*['\"]([^'\"\n]{2,80})['\"]", templates)))

missing_detail = [x for x in detail_labels if norm(x) not in detail_map]
notif_reverse_detail = [x for x in missing_detail if norm(x) in reverse_notifications]
cross_reverse_detail = [x for x in missing_detail if norm(x) in reverse_all_en]
unresolved_detail = [x for x in missing_detail if norm(x) not in reverse_all_en]
missing_actions = [x for x in action_labels if norm(x) not in action_map and not norm(x).startswith('open ')]
notif_reverse_actions = [x for x in missing_actions if norm(x) in reverse_notifications]
cross_reverse_actions = [x for x in missing_actions if norm(x) in reverse_all_en]
unresolved_actions = [x for x in missing_actions if norm(x) not in reverse_all_en]

remaining_phrases = unresolved_detail + unresolved_actions
missing_words = sorted({w for phrase in remaining_phrases for w in words(phrase) if w not in template_words})
fully_tokenizable_detail = [x for x in unresolved_detail if all(w in template_words for w in words(x))]
fully_tokenizable_actions = [x for x in unresolved_actions if all(w in template_words for w in words(x))]

print(f'Static detail labels: {len(detail_labels)}')
print(f'Manually mapped detail labels: {len(detail_labels)-len(missing_detail)}')
print(f'Resolvable inside notifications namespace: {len(notif_reverse_detail)}')
print(f'Resolvable across all game namespaces: {len(cross_reverse_detail)}')
print(f'Additional fully tokenizable detail labels: {len(fully_tokenizable_detail)}')
print(f'UNRESOLVED DETAIL LABELS AFTER CROSS-NS + TOKENS ({len(unresolved_detail)-len(fully_tokenizable_detail)}):')
for value in unresolved_detail:
    if value not in fully_tokenizable_detail:
        print('  -', value)

print(f'\nStatic action labels: {len(action_labels)}')
print(f'Resolvable actions inside notifications namespace: {len(notif_reverse_actions)}')
print(f'Resolvable actions across all game namespaces: {len(cross_reverse_actions)}')
print(f'Additional fully tokenizable actions: {len(fully_tokenizable_actions)}')
print(f'UNRESOLVED ACTION LABELS AFTER CROSS-NS + TOKENS ({len(unresolved_actions)-len(fully_tokenizable_actions)}):')
for value in unresolved_actions:
    if value not in fully_tokenizable_actions:
        print('  -', value)

print(f'\nMISSING VOCABULARY WORDS ({len(missing_words)}):')
for value in missing_words:
    print('  -', value)

print(f'\nLiteral fallback values: {len(literal_fallbacks)} total')
