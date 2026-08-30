from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

FILES = [
    'manual.json', 'manualCore.json', 'manualDeepA.json', 'manualDeepB1.json',
    'manualDeepB2.json', 'manualDynamic.json', 'manualFaq.json', 'manualLegacyDynamic.json',
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
    r'\bporesk', r'\bpobeda', r'\bpodijum', r'\bhronomet', r'\bopšt', r'\bovde\b',
    r'\bvideti\b', r'\btreba da\b', r'\bmožete da\b', r'\bzavisno\b', r'\butič',
    r'\bkorišćen', r'\bkreiran', r'\bdešav', r'\btačn', r'\bopseg', r'\bdeo\b',
]

def walk(v,path,out,counts):
    if isinstance(v,dict):
        for k,x in v.items(): walk(x,f'{path}.{k}',out,counts)
    elif isinstance(v,list):
        for i,x in enumerate(v): walk(x,f'{path}[{i}]',out,counts)
    elif isinstance(v,str):
        for p in BAD:
            if re.search(p,v,re.I):
                out.append(f'{path} = {v}')
                counts[path.split('.',1)[0]] += 1
                break

root=Path('src/i18n/locales/hr')
issues=[]; counts=Counter()
for filename in FILES:
    walk(json.loads((root/filename).read_text(encoding='utf-8')),filename,issues,counts)
print(f'Croatian Manual family candidates: {len(issues)}')
for filename in FILES:
    print(f'COUNT {filename}: {counts[filename]}')
print('--- DETAILS ---')
for issue in issues:
    print(issue)
