from __future__ import annotations

import json
import re
from pathlib import Path

FILES = [
    'scouting.json',
    'statistics.json',
    'teamRanking.json',
    'staff.json',
    'profile.json',
    'proPackages.json',
    'publicInfo.json',
    'seasonReset.json',
    'sharedRiderModal.json',
    'tutorials.json',
]
BAD = [
    r'\bpodešav', r'\bobavešten', r'\btakmič', r'\bučestv|\bučešće', r'\buslov',
    r'\bvrednost', r'\bslede', r'\bizvešt', r'\bpovred', r'\bsavet', r'\bbezbed',
    r'\bpromen', r'\bprover', r'\bodelj', r'\bizaber', r'\bocen', r'\bprose',
    r'\bverovat', r'\bhiljad', r'\bmilion', r'\btočak', r'\bmenjač', r'\bmesec',
    r'\bistorij', r'\bdodel', r'\bprimen', r'\brešen', r'\bzahtev', r'\bprevod',
    r'\bprenos', r'\bposled', r'\blekar', r'\bsačuv', r'\btrka', r'\bnalog',
    r'\bponovo\b', r'\buputstv', r'\bosveži\b', r'\bpodsetnik', r'\bpenzionisanj',
    r'\bzvaničn', r'\bpreusmeren', r'\bpodrazumevan', r'\bspoljn', r'\bfinansij',
    r'\bporesk', r'\bpobeda', r'\bpodijum', r'\bhronomet', r'\bopšt',
]


def walk(value, path, out):
    if isinstance(value, dict):
        for key, item in value.items():
            walk(item, f'{path}.{key}', out)
    elif isinstance(value, list):
        for i, item in enumerate(value):
            walk(item, f'{path}[{i}]', out)
    elif isinstance(value, str):
        for pattern in BAD:
            if re.search(pattern, value, re.I):
                out.append(f'{path} = {value}')
                break

issues = []
root = Path('src/i18n/locales/hr')
for filename in FILES:
    walk(json.loads((root / filename).read_text(encoding='utf-8')), filename, issues)

print(f'Croatian secondary UI candidates: {len(issues)}')
for issue in issues:
    print(issue)
