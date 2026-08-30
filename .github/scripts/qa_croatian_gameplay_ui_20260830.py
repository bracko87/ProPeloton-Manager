from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('src/i18n/locales')
EN = ROOT / 'en'
HR = ROOT / 'hr'
PH = re.compile(r'\{\{[^{}]+\}\}')

files = sorted(p.name for p in EN.glob('*.json'))
assert files == sorted(p.name for p in HR.glob('*.json')), 'Croatian file set differs from English'

def check(a, b, path: str):
    assert type(a) is type(b), f'{path}: type mismatch'
    if isinstance(a, dict):
        assert list(a) == list(b), f'{path}: key/order mismatch'
        for key in a:
            check(a[key], b[key], f'{path}.{key}')
    elif isinstance(a, list):
        assert len(a) == len(b), f'{path}: list length mismatch'
        for index, (x, y) in enumerate(zip(a, b)):
            check(x, y, f'{path}[{index}]')
    elif isinstance(a, str):
        assert sorted(PH.findall(a)) == sorted(PH.findall(b)), f'{path}: placeholder mismatch'

for name in files:
    check(
        json.loads((EN / name).read_text(encoding='utf-8')),
        json.loads((HR / name).read_text(encoding='utf-8')),
        name,
    )

polished = ['racePreparation.json','raceDetail.json','training.json','equipment.json','infrastructure.json']
bad = [
    r'\bpodešav',r'\bobavešten',r'\btakmič',r'\bučestv|\bučešće',r'\buslov',r'\bvrednost',r'\bslede',
    r'\bizvešt',r'\bpovre',r'\bsavet',r'\bbezbed',r'\bpromen',r'\bprover',r'\bodelj',r'\bizaber',r'\bocen',
    r'\bprose',r'\bverovat',r'\bhiljad',r'\bmilion',r'\btočkov|\btočak',r'\bmenjač',r'\bmesec',r'\bistorij',
    r'\bdodel',r'\bprimen',r'\brešen',r'\bzahtev',r'\bprevod',r'\bprenos',r'\bposled',r'\blekar',r'\bsačuv',
    r'\bvešt',r'\btrka',r'\bnalog',r'\bponovo\b',r'\buputstv'
]
failures: list[str] = []

def walk(value, path: str):
    if isinstance(value, dict):
        for key, child in value.items():
            walk(child, f'{path}.{key}')
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, f'{path}[{index}]')
    elif isinstance(value, str) and any(re.search(pattern, value, re.I) for pattern in bad):
        failures.append(f'{path}: {value}')

for name in polished:
    walk(json.loads((HR / name).read_text(encoding='utf-8')), name)

if failures:
    raise SystemExit('Croatian gameplay terminology gate failed:\n' + '\n'.join(failures[:250]))

print(f'Croatian schema validated across {len(files)} files; gameplay terminology gate passed.')
