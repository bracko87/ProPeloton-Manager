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
    'treba da vode': 'trebaju voditi',
    'treba da se tumače': 'trebaju se tumačiti',
    'treba da razmotri': 'treba uzeti u obzir',
    'treba da počne': 'treba započeti',
    'treba da se čitaju': 'trebaju se čitati',
    'treba da se oslobode': 'trebaju se osloboditi',
    'treba da prikazuju': 'trebaju prikazivati',
    'treba da uporedi': 'treba usporediti',
    'treba da odgovara': 'treba odgovarati',
    'treba da dobije': 'treba dobiti',
    'treba da se daje': 'ne treba dobivati',
    'treba da poboljša': 'treba poboljšati',
    'treba da investiraju': 'trebaju ulagati',
    'treba da obaveštavaju': 'trebaju informirati',
    'treba da porede': 'trebaju usporediti',
    'treba da odredi': 'treba odrediti',
    'treba da odrede': 'trebaju odrediti',
    'treba da uključe': 'trebaju uključiti',
    'treba da sadrže': 'trebaju sadržavati',
    'treba da dolaze': 'trebaju dolaziti',
    'treba da idu': 'trebaju ići',
    'treba da ignorišu': 'trebaju ignorirati',
    'treba da tretira': 'treba tretirati',
    'treba da tretiraju': 'trebaju tretirati',
    'treba da čita': 'treba čitati',
    'treba da prate': 'trebaju pratiti',
    'treba da se prati': 'treba se pratiti',
    'treba da se vrati': 'treba se vratiti',
    'treba da se filtrira': 'treba se filtrirati',
    'treba da dolazi': 'treba dolaziti',
    'treba da se smatra': 'treba se smatrati',
    'treba da se pogreši': 'ne treba zamijeniti',
    'može da pokaže': 'može prikazati',
    'može da ograniči': 'može ograničiti',
    'može da smanji': 'može smanjiti',
    'mogu da smanji': 'mogu smanjiti',
    'može privremeno da': 'može privremeno',
    'mogu da rešavaju': 'mogu rješavati',
    'mogu da rješavaju': 'mogu rješavati',
    'ne treba da blokiraju': 'ne trebaju blokirati',
    'ne treba da ignorišu': 'ne trebaju ignorirati',
    'ne treba da se ignorišu': 'ne trebaju se ignorirati',
    'ne treba da zamjene': 'ne trebaju zamijeniti',
    'ne treba da zamijene': 'ne trebaju zamijeniti',
    'ne treba da se popravlja': 'ne treba se popravljati',
    'ne treba da se prodaje': 'ne treba se prodavati',
    'ne treba da se': 'ne treba se',
    'Mora da zadovolji': 'Mora zadovoljiti',
    'mora da zadovolji': 'mora zadovoljiti',
    'da li': 'je li', 'Da li': 'Je li',
    'u zavisnosti od': 'ovisno o', 'U zavisnosti od': 'Ovisno o',
    'u odnosu na': 'u odnosu na',
    'sa potrebama': 's potrebama', 'sa ciljevima': 's ciljevima', 'sa vrijednosti': 's vrijednošću',
    'sa setom': 'sa setupom', 'sa vremenom': 's vremenom', 'sa aplikacijom': 's prijavom',
    'sa najjačim': 's najjačim', 'sa sportskim': 'sa sportskim', 'sa vidljivom': 's vidljivom',
    'posle prihvatanja': 'nakon prihvaćanja',
    'prije izbora': 'prije odabira',
    'previše trkanja': 'previše utrkivanja', 'Premalo trkanja': 'Premalo utrkivanja', 'Previše trkanja': 'Previše utrkivanja',
    'ritam trkanja': 'ritam utrkivanja',
    'trkačkim performansama': 'učinku na utrkama',
    'finansijsko zdravlje': 'financijsko zdravlje', 'Finansijsko zdravlje': 'Financijsko zdravlje',
    'Finansija': 'Financija', 'Finansijama': 'Financijama', 'Finansijska': 'Financijska',
    'screenshot-ove': 'snimke zaslona', 'screenshotove': 'snimke zaslona',
    'referral linkovima': 'poveznicama za preporuke',
    'Discord notice stranica': 'Discord informativna stranica',
    'email adrese': 'e-mail adrese', 'email adresu': 'e-mail adresu',
    'backend konfiguracije': 'backend konfiguracije',
    'Widget-i': 'Widgeti',
    'top 10': 'top 10',
    'slobodni agenti': 'slobodni vozači', 'slobodni agent': 'slobodni vozač',
    'prodavački klub': 'klub prodavatelj',
    'transfer popisu': 'transfer listi',
    'transfernu naknadu': 'transfernu naknadu',
}

WORDS = {
    'zahtevaju':'zahtijevaju','zahteva':'zahtijeva','zahtevaće':'zahtijevat će','zahtevan':'zahtjevan','zahtevna':'zahtjevna','zahtevno':'zahtjevno','zahtevni':'zahtjevni','zahtevne':'zahtjevne','zahtevnim':'zahtjevnim','zahtevanog':'zahtjevnog','Zahtevaju':'Zahtijevaju',
    'meri':'mjeri','mere':'mjere','merenje':'mjerenje','meriti':'mjeriti',
    'Podrazumevani':'Zadani','Podrazumevana':'Zadana','Podrazumevane':'Zadane','Podrazumevano':'Zadano',
    'Dodeljene':'Dodijeljene','Dodeljeni':'Dodijeljeni','Dodeljen':'Dodijeljen','Dodeljena':'Dodijeljena','dodeljenja':'dodjele','dodeljene':'dodijeljene','dodeljeni':'dodijeljeni',
    'Sačuvani':'Spremljeni','Sačuvan':'Spremljen','Sačuvana':'Spremljena','Sačuvane':'Spremljene',
    'korišćene':'korištene','korišćeni':'korišteni','korišćenih':'korištenih','korišćenu':'korištenu','Korišćene':'Korištene',
    'kursevi':'tečajevi','kurseva':'tečajeva','kurs':'tečaj','kursa':'tečaja','kursu':'tečaju','Kursevi':'Tečajevi',
    'istorijatu':'povijesti','istorijatom':'poviješću','Istorijatu':'Povijesti',
    'performansama':'učinku','performanse':'učinak','performansi':'učinka',
    'kombinovanom':'kombiniranom','kombinovani':'kombinirani','kombinovana':'kombinirana',
    'izbegnu':'izbjegnu','izbegne':'izbjegne','izbegavanje':'izbjegavanje','Izbegnite':'Izbjegnite',
    'rezervišu':'rezerviraju','rezerviše':'rezervira','rezervisati':'rezervirati','rezervisan':'rezerviran','rezervisana':'rezervirana',
    'uporedi':'usporedi','uporediti':'usporediti','upoređuje':'uspoređuje','upoređuju':'uspoređuju','upoređivanje':'uspoređivanje','Uporedite':'Usporedite',
    'menjanja':'mijenjanja','menjati':'mijenjati','menja':'mijenja','menjaju':'mijenjaju','menjanje':'mijenjanje',
    'neophodnu':'potrebnu','neophodan':'potreban','neophodna':'potrebna','neophodno':'potrebno','neophodni':'potrebni',
    'sinhronizovani':'sinkronizirani','sinhronizovana':'sinkronizirana','sinhronizovano':'sinkronizirano',
    'konzistentni':'dosljedan','konzistentno':'dosljedno','konzistentna':'dosljedna',
    'zvaničnih':'službenih','zvaničnog':'službenog','zvanični':'službeni','zvanična':'službena',
    'posle':'nakon','Posle':'Nakon','prihvatanja':'prihvaćanja','prihvatanje':'prihvaćanje','prihvatanju':'prihvaćanju',
    'odeljenje':'divizija','odeljenja':'divizije','odeljenju':'diviziji','odeljenjima':'divizijama','Odeljenje':'Divizija',
    'takmičenjem':'natjecanjem','takmičenjima':'natjecanjima',
    'najzahtevnijim':'najzahtjevnijim','najzahtevnije':'najzahtjevnije','najzahtevniji':'najzahtjevniji',
    'zasnovan':'temeljen','zasnovana':'temeljena','zasnovano':'temeljeno','zasnovane':'temeljene','zasnovani':'temeljeni','Zasnovan':'Temeljen',
    'nedelju':'tjedan','nedelje':'tjedna','nedelja':'tjedan','Nedelja':'Tjedan',
    'Regularno':'Redovito','regularno':'redovito','beleške':'bilješke','beleška':'bilješka',
    'ocenjivanih':'ocijenjenih','ocenjivani':'ocijenjeni','ocenjivanje':'ocjenjivanje',
    'spiska':'kadra','spisak':'kadar','spisku':'kadru',
    'finalizacije':'dovršavanja','finalizacija':'dovršavanje','finalizirati':'dovršiti',
    'rešavaju':'rješavaju','rešava':'rješava','rešio':'riješio','rešila':'riješila',
    'investiraju':'ulažu','investirati':'ulagati','investicija':'ulaganje','investicije':'ulaganja',
    'obaveštavaju':'informiraju','obaveštava':'informira','obavešten':'obaviješten','obaveštena':'obaviještena',
    'sugestije':'prijedloge','sugestija':'prijedlog','predloge':'prijedloge','predlog':'prijedlog','predložiti':'predložiti',
    'ranging':'rangiranje','ranga':'ranga',
    'promovisani':'promovirani','promovisana':'promovirana','promovisati':'promovirati','promovišu':'promoviraju','promocije':'promocije',
    'relegacije':'ispadanja','relegacija':'ispadanje',
    'oslobađaju':'ispadaju','oslobađa':'ispada',
    'stojeće':'poretka','plasmani':'plasmani',
    'moćilni':'kvalitetni','moćni':'snažni',
    'nesrećna':'nezadovoljna','nesrećan':'nezadovoljan',
    'prenosu':'transferu','prenosa':'transfera',
    'prodavački':'prodavateljski',
    'angažovanju':'zapošljavanju','angažovanje':'zapošljavanje',
    'pozajmljivanje':'zaduživanje','pozajmice':'posuđeni','pozajmica':'zajam',
    'balansa':'stanja','balans':'stanje',
    'logori':'kampovi','logora':'kampova',
    'boji':'boji','originalni':'izvorni','Originalni':'Izvorni',
    'programama':'prijavama','program':'prijava','programa':'prijave',
    'opravdanja':'prihvatljivosti','opravdanje':'prihvatljivost',
    'nađite':'pronađite','naći':'pronaći',
    'unošeno':'uneseno','unošenje':'unos','unošeni':'uneseni',
    'podeljene':'podijeljene','podeljen':'podijeljen','podeliti':'podijeliti','Podeli':'Podijeli',
    'redosled':'redoslijed','redosleda':'redoslijeda','redosledu':'redoslijedu',
    'klikće':'klikne','klikanja':'klikanja',
    'kontrolišu':'kontroliraju','kontroliše':'kontrolira','kontrolisati':'kontrolirati',
    'posmatra':'promatra','posmatrati':'promatrati','posmatrajte':'promatrajte',
    'rešite':'riješite','rešite':'riješite',
    'kupovinom':'kupnjom','kupovina':'kupnja','kupovine':'kupnje','kupovinu':'kupnju','Kupovina':'Kupnja',
    'čuvanja':'spremanja','čuvanje':'spremanje',
    'sačeka':'pričeka','sačekati':'pričekati','sačekajte':'pričekajte',
    'porede':'usporede','porediti':'usporediti','poređenje':'usporedba','Poređenje':'Usporedba',
    'akciju':'radnju','akcije':'radnje','akcija':'radnja','Akcija':'Radnja',
    'kontekstu':'kontekstu','slotove':'mjesta','slotova':'mjesta','slot':'mjesto',
    'specijalizovane':'specijalizirane','specijalizovan':'specijaliziran','specijalističke':'specijalističke',
}

PLACEHOLDER = re.compile(r'(\{\{[^{}]+\}\})')
WORD_RE = re.compile(r'(?<![\w-])(' + '|'.join(sorted((re.escape(k) for k in WORDS), key=len, reverse=True)) + r')(?![\w-])')

def convert_segment(text: str) -> str:
    for old, new in PHRASES.items():
        text = text.replace(old, new)
    return WORD_RE.sub(lambda m: WORDS[m.group(0)], text)

def convert_text(text: str) -> str:
    parts = PLACEHOLDER.split(text)
    return ''.join(p if PLACEHOLDER.fullmatch(p) else convert_segment(p) for p in parts)

def walk(v):
    if isinstance(v, dict): return {k: walk(x) for k, x in v.items()}
    if isinstance(v, list): return [walk(x) for x in v]
    if isinstance(v, str): return convert_text(v)
    return v

for filename in FILES:
    path = ROOT / filename
    data = walk(json.loads(path.read_text(encoding='utf-8')))
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Croatian Manual pass 3: {filename}')
