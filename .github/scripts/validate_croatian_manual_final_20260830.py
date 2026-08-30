from __future__ import annotations

import json
import re
from pathlib import Path

ROOT=Path('src/i18n/locales')
FILES=['manual.json','manualCore.json','manualDeepA.json','manualDeepB1.json','manualDeepB2.json','manualDynamic.json','manualFaq.json','manualLegacyDynamic.json']
PH=re.compile(r'\{\{[^{}]+\}\}')
BAD=[
 r'\bpodešav',r'\bobavešten',r'\btakmič',r'\bučestv|\bučešće',r'\buslov',r'\bvrednost',
 r'\bslede',r'\bizvešt',r'\bpovred',r'\bsavet',r'\bbezbed',r'\bpromen',r'\bprover',
 r'\bodelj',r'\bizaber',r'\bocen',r'\bprose',r'\bverovat',r'\bhiljad',r'\bmilion',
 r'\btočak',r'\bmenjač',r'\bmesec',r'\bistorij',r'\bdodel',r'\bprimen',r'\brešen',
 r'\bzahtev',r'\bprevod',r'\bprenos',r'\bposled',r'\blekar',r'\bsačuv',r'\btrka',
 r'\bnalog',r'\bponovo\b',r'\buputstv',r'\bosveži\b',r'\bpodsetnik',r'\bpenzionisanj',
 r'\bzvaničn',r'\bpreusmeren',r'\bpodrazumevan',r'\bspoljn',r'\bfinansij',r'\bporesk',
 r'\bpobeda',r'\bpodijum',r'\bhronomet',r'\bopšt',r'\bovde\b',r'\bvideti\b',
 r'\btreba da\b',r'\bmožete da\b',r'\bzavisno\b',r'\butič',r'\bkorišćen',r'\bkreiran',
 r'\bdešav',r'\btačn',r'\bdeo\b',r'\bdugmad',r'\bfunkcioni',r'\bupored',r'\bprežive',
 r'\bnajbezbed',r'\bprocena',r'\bdeluj',r'\bizabran',r'\brazume',r'\bmerodav',r'\bpodel',
 r'\bkontroli',r'\bkupovin',r'\btačk',r'\bangažov',r'\bkursev',r'\brezerviš',r'\bsinhron',
]
CORRUPTION=[r'�',r'Ã',r'Â',r'›',r'drolja',r'akcii',r'mješain',r'katest',r'moćil',r'citatat',r'\bje li je\b',r'\bviši razina\b',r'\bne ne\b']

def schema(a,b,path):
    assert type(a) is type(b),f'{path}: type mismatch'
    if isinstance(a,dict):
        assert list(a)==list(b),f'{path}: key/order mismatch'
        for k in a:schema(a[k],b[k],f'{path}.{k}')
    elif isinstance(a,list):
        assert len(a)==len(b),f'{path}: list length mismatch'
        for i,(x,y) in enumerate(zip(a,b)):schema(x,y,f'{path}[{i}]')
    elif isinstance(a,str):
        assert sorted(PH.findall(a))==sorted(PH.findall(b)),f'{path}: placeholder mismatch {PH.findall(a)} != {PH.findall(b)}'

def walk(v,path,out):
    if isinstance(v,dict):
        for k,x in v.items():walk(x,f'{path}.{k}',out)
    elif isinstance(v,list):
        for i,x in enumerate(v):walk(x,f'{path}[{i}]',out)
    elif isinstance(v,str):
        for p in BAD:
            if re.search(p,v,re.I):
                out.append(f'{path}: Serbian/non-Croatian form /{p}/ -> {v}')
                break
        for p in CORRUPTION:
            if re.search(p,v,re.I):
                out.append(f'{path}: corruption /{p}/ -> {v}')
                break

issues=[]
for f in FILES:
    en=json.loads((ROOT/'en'/f).read_text(encoding='utf-8'))
    hr=json.loads((ROOT/'hr'/f).read_text(encoding='utf-8'))
    schema(en,hr,f)
    walk(hr,f,issues)
if issues:
    print(f'FINAL Croatian Manual gate found {len(issues)} issue(s):')
    print('\n'.join(issues[:400]))
    raise SystemExit(1)
print('PASS: all 8 Croatian Manual resources preserve canonical schema/placeholders and pass the Croatian wording/corruption gate.')
