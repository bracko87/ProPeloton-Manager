from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')
FILES = [
    'manual.json', 'manualCore.json', 'manualDeepA.json', 'manualDeepB1.json',
    'manualDeepB2.json', 'manualDynamic.json', 'manualFaq.json', 'manualLegacyDynamic.json',
]

PHRASES = {
    'na osnovu': 'na temelju', 'Na osnovu': 'Na temelju',
    'treba da pročitaju': 'trebaju pročitati',
    'treba da pokažu': 'trebaju pokazati',
    'treba da kombinuju': 'trebaju kombinirati',
    'treba da riješe': 'trebaju riješiti',
    'treba da usmere': 'trebaju usmjeriti',
    'treba da otvore': 'trebaju otvoriti',
    'treba da radi': 'treba raditi',
    'treba da koristi': 'treba koristiti',
    'treba da koriste': 'trebaju koristiti',
    'treba da bude': 'treba biti',
    'treba da budu': 'trebaju biti',
    'treba da ima': 'treba imati',
    'treba da imaju': 'trebaju imati',
    'treba da ostane': 'treba ostati',
    'treba da ostanu': 'trebaju ostati',
    'treba da se koristi': 'treba se koristiti',
    'treba da se koriste': 'trebaju se koristiti',
    'treba da se pojavi': 'treba se pojaviti',
    'treba da se prikaže': 'treba se prikazati',
    'treba da se primeni': 'treba se primijeniti',
    'treba da se primijeni': 'treba se primijeniti',
    'treba da se proveri': 'treba se provjeriti',
    'treba da se provjeri': 'treba se provjeriti',
    'možete da vidite': 'možete vidjeti',
    'možete da otvorite': 'možete otvoriti',
    'možete da koristite': 'možete koristiti',
    'možete da izaberete': 'možete odabrati',
    'možete da provjerite': 'možete provjeriti',
    'možete da proverite': 'možete provjeriti',
    'možete da pratite': 'možete pratiti',
    'možete da promenite': 'možete promijeniti',
    'možete da promijenite': 'možete promijeniti',
    'možete da upravljate': 'možete upravljati',
    'ne može da bude': 'ne može biti',
    'ne mogu da budu': 'ne mogu biti',
    'ne može da koristi': 'ne može koristiti',
    'ne može da se': 'ne može se',
    'može da bude': 'može biti',
    'mogu da budu': 'mogu biti',
    'može da koristi': 'može koristiti',
    'mogu da koriste': 'mogu koristiti',
    'može da se': 'može se',
    'mogu da se': 'mogu se',
    'najpre': 'najprije', 'Najpre': 'Najprije',
    'pre svega': 'prije svega', 'Pre svega': 'Prije svega',
}

WORDS = {
    'sistem':'sustav','sistema':'sustava','sistemu':'sustavu','sistemi':'sustavi','sisteme':'sustave','sistemima':'sustavima','sistemski':'sustavni','sistemska':'sustavna','sistemske':'sustavne','sistemsko':'sustavno','Sistem':'Sustav','Sistemi':'Sustavi',
    'šta':'što','Šta':'Što','tokom':'tijekom','Tokom':'Tijekom',
    'trenutno':'trenutačno','Trenutno':'Trenutačno','trenutni':'trenutačni','trenutna':'trenutačna','trenutne':'trenutačne','trenutnog':'trenutačnog','trenutnom':'trenutačnom','trenutnu':'trenutačnu','Trenutni':'Trenutačni',
    'aktuelnoj':'aktualnoj','aktuelnog':'aktualnog','aktuelnim':'aktualnim','aktuelnih':'aktualnih','aktuelno':'aktualno','Aktuelno':'Aktualno',
    'proveravati':'provjeravati','proveravajte':'provjeravajte','proveravanjem':'provjeravanjem','provereno':'provjereno','proverena':'provjerena','provereni':'provjereni',
    'finansija':'financija','finansijama':'financijama','finansijsku':'financijsku','finansijskog':'financijskog','finansijskim':'financijskim','finansijskih':'financijskih',
    'posledicama':'posljedicama','posledicu':'posljedicu','posledicom':'posljedicom',
    'Bezbedniji':'Sigurniji','Bezbedan':'Siguran','Bezbedno':'Sigurno','bezbednije':'sigurnije',
    'videti':'vidjeti','Videti':'Vidjeti','vidite':'vidite','vide':'vide',
    'oceni':'ocjeni','ocenama':'ocjenama','ocenjen':'ocijenjen','ocenjena':'ocijenjena','ocenjivanje':'ocjenjivanje',
    'unaprediti':'unaprijediti','unapređenje':'nadogradnja','unapređenja':'nadogradnje','unapređenjem':'nadogradnjom','unapređivanje':'nadograđivanje','unapređuje':'nadograđuje','unapređuju':'nadograđuju','unapređen':'nadograđen','unapređena':'nadograđena','Unapređenje':'Nadogradnja',
    'kreiranje':'stvaranje','kreiranja':'stvaranja','kreiranjem':'stvaranjem','kreirati':'stvoriti','kreirate':'stvarate','kreira':'stvara','kreiraju':'stvaraju','kreiran':'stvoren','kreirana':'stvorena','kreirano':'stvoreno','Kreiranje':'Stvaranje',
    'sortiranje':'razvrstavanje','sortiranja':'razvrstavanja','paginaciju':'straničenje',
    'verovati':'vjerovati','Verovati':'Vjerovati','verovatno':'vjerojatno','Verovatno':'Vjerojatno','verovatna':'vjerojatna','verovatni':'vjerojatni','verovatnoća':'vjerojatnost',
    'prodavnica':'trgovina','prodavnice':'trgovine','prodavnici':'trgovini','Prodavnica':'Trgovina',
    'uploadovan':'prenesen','uploadovana':'prenesena','uploadovane':'prenesene','uploadovani':'preneseni','upload':'prijenos','Upload':'Prijenos',
    'zavisno':'ovisno','Zavisno':'Ovisno','zavisi':'ovisi','zavise':'ovise','zavisiti':'ovisiti',
    'izabran':'odabran','izabrana':'odabrana','izabrano':'odabrano','izabrani':'odabrani','izabrane':'odabrane','izabranog':'odabranog','izabranoj':'odabranoj','izabrati':'odabrati','izaberite':'odaberite','Izaberite':'Odaberite',
    'režim':'način','režima':'načina','režimu':'načinu','režimi':'načini',
    'Opšti':'Opći','Opšta':'Opća','Opštim':'Općim',
    'prebacivanje':'premještanje','prebacivanja':'premještanja','prebacivanju':'premještanju','prebaciti':'premjestiti','prebačen':'premješten','prebačena':'premještena',
    'plej-of':'doigravanje','plej-ofu':'doigravanju',
    'fokusiranje':'usredotočivanje','fokusirati':'usredotočiti','fokusira':'usredotočuje','fokusirane':'usredotočene',
    'performanse':'učinak','performansi':'učinka','performansom':'učinkom',
    'poboljšanje':'poboljšanje','poboljšanja':'poboljšanja',
    'pregledač':'preglednik','browseru':'pregledniku','browser':'preglednik',
    'link':'poveznica','linka':'poveznice','linkom':'poveznicom','linkove':'poveznice','Link':'Poveznica',
    'lista':'popis','liste':'popisa','listi':'popisu','listu':'popis','Lista':'Popis',
    'rang-lista':'poredak','rang-liste':'poretci','rang-listama':'poredcima',
    'pominje':'spominje','pominju':'spominju','pominjanje':'spominjanje',
    'sprečava':'sprječava','sprečavaju':'sprječavaju','sprečiti':'spriječiti','sprečavanje':'sprječavanje','Sprečava':'Sprječava',
    'uključen':'uključen','uključena':'uključena','uključeno':'uključeno',
    'dostignut':'dosegnut','dostignuta':'dosegnuta','dostignuto':'dosegnuto','dostigne':'dosegne','dostignu':'dosegnu','dostiže':'doseže',
    'greška':'pogreška','greške':'pogreške','grešku':'pogrešku','Greška':'Pogreška','grešaka':'pogrešaka',
    'duplo':'dvostruko','duple':'dvostruke','dupli':'dvostruki','duplu':'dvostruku',
    'neovlašćen':'neovlašten','neovlašćena':'neovlaštena','neovlašćeno':'neovlašteno','neovlašćene':'neovlaštene',
    'refundacija':'povrat novca','refundacije':'povrata novca','refundiran':'refundiran','refundiranim':'refundiranima',
    'takođe':'također','Takođe':'Također','odmah':'odmah',
    'dozvoljen':'dopušten','dozvoljena':'dopuštena','dozvoljeno':'dopušteno','dozvoljeni':'dopušteni','dozvoljene':'dopuštene','dozvoljava':'dopušta','dozvoljavaju':'dopuštaju',
    'ograničenje':'ograničenje','ograničenja':'ograničenja',
    'podesiti':'postaviti','podesite':'postavite','podešen':'postavljen','podešena':'postavljena','podešavanje':'postavljanje','podešavanja':'postavke','Podešavanja':'Postavke',
}

PLACEHOLDER=re.compile(r'(\{\{[^{}]+\}\})')
WORD_RE=re.compile(r'(?<![\w-])('+'|'.join(sorted((re.escape(k) for k in WORDS),key=len,reverse=True))+r')(?![\w-])')


def convert_segment(text:str)->str:
    for old,new in PHRASES.items(): text=text.replace(old,new)
    return WORD_RE.sub(lambda m: WORDS[m.group(0)],text)

def convert_text(text:str)->str:
    parts=PLACEHOLDER.split(text)
    return ''.join(p if PLACEHOLDER.fullmatch(p) else convert_segment(p) for p in parts)

def walk(v):
    if isinstance(v,dict): return {k:walk(x) for k,x in v.items()}
    if isinstance(v,list): return [walk(x) for x in v]
    if isinstance(v,str): return convert_text(v)
    return v

for filename in FILES:
    path=ROOT/filename
    data=walk(json.loads(path.read_text(encoding='utf-8')))
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Croatian Manual pass 2: {filename}')
