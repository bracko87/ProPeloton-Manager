from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('src/i18n/locales')
FILES = [
    'finance.json',
    'transfers.json',
    'riderProfile.json',
    'preferences.json',
    'preferencesDynamic.json',
    'notifications.json',
]
PH = re.compile(r'\{\{[^{}]+\}\}')
BAD = [
    r'\bpodešav', r'\bobavešten', r'\btakmič', r'\bučestv|\bučešće', r'\buslov',
    r'\bvrednost', r'\bslede', r'\bizvešt', r'\bpovred', r'\bsavet', r'\bbezbed',
    r'\bpromen', r'\bprover', r'\bodelj', r'\bizaber', r'\bocen', r'\bprose',
    r'\bverovat', r'\bhiljad', r'\bmilion', r'\btočak', r'\bmenjač', r'\bmesec',
    r'\bistorij', r'\bdodel', r'\bprimen', r'\brešen', r'\bzahtev', r'\bprevod',
    r'\bprenos', r'\bposled', r'\blekar', r'\bsačuv', r'\btrka', r'\bnalog',
    r'\bponovo\b', r'\buputstv', r'\bosveži\b', r'\bpodsetnik', r'\bpenzionisanj',
    r'\bzvaničn', r'\bpreusmeren', r'\bpodrazumevan', r'\bspoljn',
]
CORRUPTION = [
    r'razdoblje[a-zčćžšđ]+', r'sustavsk\w*', r'regijaa\w*', r'regijaal\w*',
    r'\bpostavke\s+obavijest\b', r'\bobavijest\s+igre\s+koja\b',
]


def check_schema(a, b, path):
    if type(a) is not type(b):
        raise AssertionError(f'{path}: type mismatch {type(a).__name__} != {type(b).__name__}')
    if isinstance(a, dict):
        if list(a) != list(b):
            raise AssertionError(f'{path}: key/order mismatch')
        for key in a:
            check_schema(a[key], b[key], f'{path}.{key}')
    elif isinstance(a, list):
        if len(a) != len(b):
            raise AssertionError(f'{path}: list length mismatch')
        for i, (x, y) in enumerate(zip(a, b)):
            check_schema(x, y, f'{path}[{i}]')
    elif isinstance(a, str):
        if sorted(PH.findall(a)) != sorted(PH.findall(b)):
            raise AssertionError(f'{path}: placeholder mismatch {PH.findall(a)} != {PH.findall(b)}')


def walk(value, path, failures):
    if isinstance(value, dict):
        for k, v in value.items():
            walk(v, f'{path}.{k}', failures)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            walk(v, f'{path}[{i}]', failures)
    elif isinstance(value, str):
        for pattern in BAD:
            if re.search(pattern, value, re.I):
                failures.append(f'{path}: Serbian form /{pattern}/ -> {value}')
                break
        for pattern in CORRUPTION:
            if re.search(pattern, value, re.I):
                failures.append(f'{path}: suspicious normalization /{pattern}/ -> {value}')
                break

for filename in FILES:
    en = json.loads((ROOT / 'en' / filename).read_text(encoding='utf-8'))
    hr = json.loads((ROOT / 'hr' / filename).read_text(encoding='utf-8'))
    check_schema(en, hr, filename)

failures = []
for filename in FILES:
    data = json.loads((ROOT / 'hr' / filename).read_text(encoding='utf-8'))
    walk(data, filename, failures)

if failures:
    print(f'Croatian management terminology gate found {len(failures)} issue(s):')
    for failure in failures[:250]:
        print(failure)
    raise SystemExit(1)

print('PASS: Croatian management files match English schema/placeholders and terminology gate.')
