from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('src/i18n/locales')
EN = ROOT / 'en'
HR = ROOT / 'hr'
fallbacks: list[str] = []
extras: list[str] = []


def align(en_value, hr_value, path: str):
    if isinstance(en_value, dict):
        hr_dict = hr_value if isinstance(hr_value, dict) else {}
        out = {}
        for key, value in en_value.items():
            if key in hr_dict:
                out[key] = align(value, hr_dict[key], f'{path}.{key}')
            else:
                fallbacks.append(f'{path}.{key}')
                out[key] = value
        for key in hr_dict:
            if key not in en_value:
                extras.append(f'{path}.{key}')
        return out

    if isinstance(en_value, list):
        hr_list = hr_value if isinstance(hr_value, list) else []
        out = []
        for index, value in enumerate(en_value):
            if index < len(hr_list):
                out.append(align(value, hr_list[index], f'{path}[{index}]'))
            else:
                fallbacks.append(f'{path}[{index}]')
                out.append(value)
        if len(hr_list) > len(en_value):
            for index in range(len(en_value), len(hr_list)):
                extras.append(f'{path}[{index}]')
        return out

    if type(en_value) is type(hr_value):
        return hr_value

    fallbacks.append(path)
    return en_value


for en_path in sorted(EN.glob('*.json')):
    hr_path = HR / en_path.name
    if not hr_path.exists():
        raise SystemExit(f'Missing Croatian locale file: {en_path.name}')
    en_data = json.loads(en_path.read_text(encoding='utf-8'))
    hr_data = json.loads(hr_path.read_text(encoding='utf-8'))
    aligned = align(en_data, hr_data, en_path.name)
    hr_path.write_text(json.dumps(aligned, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print(f'Croatian locale aligned to English canonical key order. Fallbacks={len(fallbacks)} extras_removed={len(extras)}')
if fallbacks:
    print('English fallbacks introduced:')
    for item in fallbacks[:100]:
        print('  ' + item)
if extras:
    print('Non-canonical Croatian keys removed:')
    for item in extras[:100]:
        print('  ' + item)
