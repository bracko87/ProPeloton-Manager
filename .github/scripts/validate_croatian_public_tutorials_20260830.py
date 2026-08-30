from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('src/i18n/locales')
FILES = ['publicInfo.json', 'tutorials.json']
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
    r'\bovde\b', r'\bvideti\b', r'\bmožete da\b', r'\btreba da\b', r'\bzavisno\b',
    r'\butič', r'\bkorisćen|\bkorišćen', r'\bkreiran',
]

def check(a,b,path):
    assert type(a) is type(b), f'{path}: type mismatch'
    if isinstance(a,dict):
        assert list(a)==list(b), f'{path}: key/order mismatch'
        for k in a: check(a[k],b[k],f'{path}.{k}')
    elif isinstance(a,list):
        assert len(a)==len(b), f'{path}: list length mismatch'
        for i,(x,y) in enumerate(zip(a,b)): check(x,y,f'{path}[{i}]')
    elif isinstance(a,str):
        assert sorted(PH.findall(a))==sorted(PH.findall(b)), f'{path}: placeholder mismatch'

def walk(v,path,out):
    if isinstance(v,dict):
        for k,x in v.items(): walk(x,f'{path}.{k}',out)
    elif isinstance(v,list):
        for i,x in enumerate(v): walk(x,f'{path}[{i}]',out)
    elif isinstance(v,str):
        for p in BAD:
            if re.search(p,v,re.I):
                out.append(f'{path}: /{p}/ -> {v}')
                break

issues=[]
for filename in FILES:
    en=json.loads((ROOT/'en'/filename).read_text(encoding='utf-8'))
    hr=json.loads((ROOT/'hr'/filename).read_text(encoding='utf-8'))
    check(en,hr,filename)
    walk(hr,filename,issues)
if issues:
    print(f'Croatian public/tutorial gate found {len(issues)} issue(s):')
    print('\n'.join(issues[:300]))
    raise SystemExit(1)
print('PASS: Croatian public/tutorial resources match schema/placeholders and terminology gate.')
