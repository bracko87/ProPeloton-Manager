from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('src/i18n/locales')
FILES = [
    'scouting.json', 'statistics.json', 'teamRanking.json', 'staff.json',
    'profile.json', 'proPackages.json', 'seasonReset.json', 'sharedRiderModal.json',
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
    r'\bzvaničn', r'\bpreusmeren', r'\bpodrazumevan', r'\bspoljn', r'\bfinansij',
    r'\bporesk', r'\bpobeda', r'\bpodijum', r'\bhronomet', r'\bopšt',
]

def check(a,b,path):
    assert type(a) is type(b), f'{path}: type mismatch'
    if isinstance(a, dict):
        assert list(a) == list(b), f'{path}: key/order mismatch'
        for k in a: check(a[k], b[k], f'{path}.{k}')
    elif isinstance(a, list):
        assert len(a) == len(b), f'{path}: list length mismatch'
        for i,(x,y) in enumerate(zip(a,b)): check(x,y,f'{path}[{i}]')
    elif isinstance(a, str):
        assert sorted(PH.findall(a)) == sorted(PH.findall(b)), f'{path}: placeholder mismatch'

def walk(v,path,failures):
    if isinstance(v,dict):
        for k,x in v.items(): walk(x,f'{path}.{k}',failures)
    elif isinstance(v,list):
        for i,x in enumerate(v): walk(x,f'{path}[{i}]',failures)
    elif isinstance(v,str):
        for p in BAD:
            if re.search(p,v,re.I):
                failures.append(f'{path}: /{p}/ -> {v}')
                break

failures=[]
for filename in FILES:
    en=json.loads((ROOT/'en'/filename).read_text(encoding='utf-8'))
    hr=json.loads((ROOT/'hr'/filename).read_text(encoding='utf-8'))
    check(en,hr,filename)
    walk(hr,filename,failures)
if failures:
    print(f'Croatian secondary-core gate found {len(failures)} issue(s):')
    print('\n'.join(failures[:250]))
    raise SystemExit(1)
print('PASS: Croatian secondary-core namespaces match schema/placeholders and terminology gate.')
