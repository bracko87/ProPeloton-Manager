from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('src/i18n/locales')
EN = ROOT / 'en'
HR = ROOT / 'hr'
PH = re.compile(r'\{\{[^{}]+\}\}')
repairs: list[str] = []
errors: list[str] = []


def repair(en_value, hr_value, path: str):
    if isinstance(en_value, dict) and isinstance(hr_value, dict):
        return {key: repair(en_value[key], hr_value[key], f'{path}.{key}') for key in en_value}
    if isinstance(en_value, list) and isinstance(hr_value, list):
        return [repair(a, b, f'{path}[{i}]') for i, (a, b) in enumerate(zip(en_value, hr_value))]
    if isinstance(en_value, str) and isinstance(hr_value, str):
        en_ph = PH.findall(en_value)
        hr_ph = PH.findall(hr_value)
        # Croatian may naturally reorder the same placeholders (especially dates
        # and summary sentences). Preserve that local word order when the set of
        # canonical placeholder names is already correct.
        if en_ph == hr_ph or sorted(en_ph) == sorted(hr_ph):
            return hr_value
        if len(en_ph) != len(hr_ph):
            errors.append(f'{path}: English {en_ph} Croatian {hr_ph}')
            return hr_value
        # For inherited Serbian strings where the placeholder *name* changed in
        # English (for example positionNumber -> positionOrdinal), rename by the
        # corresponding position while keeping all surrounding Croatian text.
        iterator = iter(en_ph)
        repaired = PH.sub(lambda _m: next(iterator), hr_value)
        repairs.append(f'{path}: {hr_ph} -> {en_ph}')
        return repaired
    return hr_value


for en_path in sorted(EN.glob('*.json')):
    hr_path = HR / en_path.name
    en_data = json.loads(en_path.read_text(encoding='utf-8'))
    hr_data = json.loads(hr_path.read_text(encoding='utf-8'))
    fixed = repair(en_data, hr_data, en_path.name)
    hr_path.write_text(json.dumps(fixed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print(f'Croatian placeholder-name repairs applied: {len(repairs)}')
for item in repairs[:100]:
    print('  ' + item)
if errors:
    print('Unrepairable placeholder count mismatches:')
    for item in errors[:100]:
        print('  ' + item)
    raise SystemExit(f'{len(errors)} Croatian strings have a different placeholder count from English.')
