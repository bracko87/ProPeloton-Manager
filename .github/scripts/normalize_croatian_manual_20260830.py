from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')
FILES = [
    'manual.json', 'manualCore.json', 'manualDeepA.json', 'manualDeepB1.json',
    'manualDeepB2.json', 'manualDynamic.json', 'manualFaq.json', 'manualLegacyDynamic.json',
]

# Exact word-form substitutions only. Placeholders are protected separately.
WORDS = {
    'podrazumevano':'zadano','podrazumevani':'zadani','podrazumevana':'zadana','podrazumevane':'zadane','podrazumevanom':'zadanom','podrazumevanu':'zadanu',
    'odeljak':'odjeljak','odeljci':'odjeljci','odeljaka':'odjeljaka','odeljku':'odjeljku','odeljkom':'odjeljkom',
    'ovde':'ovdje','Ovde':'Ovdje','gde':'gdje','Gde':'Gdje','uvek':'uvijek','Uvek':'Uvijek',
    'finansije':'financije','Finansije':'Financije','finansijski':'financijski','Finansijski':'Financijski','finansijska':'financijska','finansijske':'financijske','finansijskog':'financijskog','finansijskim':'financijskim',
    'tačan':'točan','tačna':'točna','tačne':'točne','tačno':'točno','tačnu':'točnu','tačnih':'točnih','Tačan':'Točan','Tačna':'Točna','Tačne':'Točne','Tačno':'Točno',
    'aktuelan':'aktualan','aktuelna':'aktualna','aktuelne':'aktualne','aktuelni':'aktualni','aktuelno':'aktualno','aktuelnu':'aktualnu','aktuelnih':'aktualnih','Aktuelne':'Aktualne',
    'cena':'cijena','cene':'cijene','cenu':'cijenu','cenom':'cijenom','cena':'cijena','Cena':'Cijena','Cene':'Cijene',
    'vrednost':'vrijednost','vrednosti':'vrijednosti','vrijednost':'vrijednost','Vrednost':'Vrijednost',
    'proverite':'provjerite','Proverite':'Provjerite','proveriti':'provjeriti','proverava':'provjerava','proveravaju':'provjeravaju','provera':'provjera','provere':'provjere','proverom':'provjerom','proveru':'provjeru',
    'promena':'promjena','promene':'promjene','promenu':'promjenu','promenom':'promjenom','promeniti':'promijeniti','promenjen':'promijenjen','promenjena':'promijenjena','promenjene':'promijenjene','promenilo':'promijenilo','promeni':'promijeni','Promena':'Promjena','Promene':'Promjene',
    'razumeti':'razumjeti','razumete':'razumijete','razume':'razumije','razumeju':'razumiju','razumevanje':'razumijevanje','Razumeti':'Razumjeti',
    'deo':'dio','Deo':'Dio','delovi':'dijelovi','delove':'dijelove','delova':'dijelova','delu':'dijelu','delom':'dijelom','dela':'dijela',
    'savet':'savjet','saveti':'savjeti','saveta':'savjeta','savetu':'savjetu','savetnik':'savjetnik','savetnika':'savjetnika','savetnici':'savjetnici','savetnikom':'savjetnikom','savetodavni':'savjetodavni','savetodavna':'savjetodavna',
    'uticaj':'utjecaj','uticaja':'utjecaja','uticajem':'utjecajem','utiče':'utječe','utiču':'utječu','uticalo':'utjecalo','uticati':'utjecati','Uticaj':'Utjecaj',
    'svežina':'svježina','svežinu':'svježinu','svežine':'svježine',
    'rešiti':'riješiti','rešava':'rješava','rešavanje':'rješavanje','rešenje':'rješenje','rešenja':'rješenja','rešen':'riješen','rešeno':'riješeno','reše':'riješe','Rešenje':'Rješenje',
    'umesto':'umjesto','Umesto':'Umjesto','pre':'prije','Pre':'Prije',
    'posledica':'posljedica','posledice':'posljedice','poslednji':'posljednji','poslednja':'posljednja','poslednje':'posljednje','poslednjeg':'posljednjeg','poslednjem':'posljednjem','Poslednji':'Posljednji','Poslednja':'Posljednja',
    'sledeći':'sljedeći','sledeća':'sljedeća','sledeće':'sljedeće','sledećeg':'sljedećeg','sledećem':'sljedećem','sledeću':'sljedeću','Sledeći':'Sljedeći','Sledeća':'Sljedeća',
    'uslov':'uvjet','uslovi':'uvjeti','uslova':'uvjeta','uslove':'uvjete','uslovima':'uvjetima','uslovom':'uvjetom','uslovu':'uvjetu','Uslovi':'Uvjeti','Uslov':'Uvjet',
    'dodela':'dodjela','dodele':'dodjele','dodelu':'dodjelu','dodeljen':'dodijeljen','dodeljena':'dodijeljena','dodeljeno':'dodijeljeno','dodeljeni':'dodijeljeni','dodeljene':'dodijeljene','dodeljuje':'dodjeljuje','dodeliti':'dodijeliti','Dodela':'Dodjela',
    'primena':'primjena','primene':'primjene','primenu':'primjenu','primenjuje':'primjenjuje','primenjuju':'primjenjuju','primeniti':'primijeniti','primenjen':'primijenjen','primenjena':'primijenjena','primenjeno':'primijenjeno','Primena':'Primjena',
    'bezbedan':'siguran','bezbedna':'sigurna','bezbedno':'sigurno','bezbedni':'sigurni','bezbedniji':'sigurniji','bezbednost':'sigurnost','Bezbednost':'Sigurnost',
    'ocena':'ocjena','ocene':'ocjene','ocenu':'ocjenu','ocenom':'ocjenom','oceniti':'ocijeniti','proceniti':'procijeniti','procenjuje':'procjenjuje','procenjuju':'procjenjuju','procenjen':'procijenjen','procenjena':'procijenjena','procenjene':'procijenjene','procenjeno':'procijenjeno',
    'prosečan':'prosječan','prosečna':'prosječna','prosečne':'prosječne','prosečno':'prosječno','Prosečan':'Prosječan',
    'neizvesnost':'neizvjesnost','neizvesnosti':'neizvjesnosti','neizvestan':'neizvjestan','neizvesna':'neizvjesna',
    'zameniti':'zamijeniti','zamena':'zamjena','zamene':'zamjene','zamenu':'zamjenu','zamenite':'zamijenite','zamenjen':'zamijenjen','zamenjena':'zamijenjena',
    'spoljni':'vanjski','spoljna':'vanjska','spoljne':'vanjske','spoljnih':'vanjskih','spoljnog':'vanjskog','spoljašnji':'vanjski','spoljašnje':'vanjske',
    'izveštaj':'izvještaj','izveštaja':'izvještaja','izveštaji':'izvještaji','izveštaje':'izvještaje','izveštajem':'izvještajem','Izveštaj':'Izvještaj',
    'garantovan':'zajamčen','garantovana':'zajamčena','garantovano':'zajamčeno','garantovani':'zajamčeni','garantovane':'zajamčene','Garantovani':'Zajamčeni',
    'poreski':'porezni','poreska':'porezna','poreske':'porezne','poresko':'porezno','poreskog':'poreznog','poreskih':'poreznih','Poreski':'Porezni','Poreska':'Porezna',
    'opciona':'opcionalna','opcione':'opcionalne','opcioni':'opcionalni','opciono':'opcionalno','opcionih':'opcionalnih',
    'pominjanje':'spominjanje','pominje':'spominje','neprimetno':'neprimjetno',
    'uspeh':'uspjeh','uspeha':'uspjeha','uspešan':'uspješan','uspešna':'uspješna','uspešno':'uspješno','uspela':'uspjela','uspelo':'uspjelo','uspeo':'uspio','uspeju':'uspiju','Uspeh':'Uspjeh',
    'izolovan':'izoliran','izolovana':'izolirana','izolovani':'izolirani',
    'zvanično':'službeno','zvanični':'službeni','zvanična':'službena','zvanične':'službene','Zvanično':'Službeno',
    'sačuvan':'spremljen','sačuvana':'spremljena','sačuvano':'spremljeno','sačuvani':'spremljeni','sačuvane':'spremljene','sačuvati':'spremiti','sačuvajte':'spremite','Sačuvano':'Spremljeno',
    'celog':'cijelog','celom':'cijelom','ceo':'cijeli','cela':'cijela','celo':'cijelo','cele':'cijele','celu':'cijelu','Ceo':'Cijeli',
    'vesti':'vijesti','Vesti':'Vijesti','izbegnete':'izbjegnete','izbegava':'izbjegava','izbegavati':'izbjegavati',
    'korišćen':'korišten','korišćena':'korištena','korišćeno':'korišteno','korišćenje':'korištenje','korišćenja':'korištenja','korišćenjem':'korištenjem','Korišćenje':'Korištenje',
    'zahtev':'zahtjev','zahteva':'zahtjeva','zahteve':'zahtjeve','zahtevi':'zahtjevi','zahtevu':'zahtjevu','zahtjeva':'zahtijeva','zahtjevaju':'zahtijevaju','Zahtjev':'Zahtjev',
    'usmeri':'usmjeri','usmerava':'usmjerava','usmeriti':'usmjeriti','usmerena':'usmjerena','usmerene':'usmjerene',
    'dešava':'događa','dešavaju':'događaju','dešavanje':'događanje','Dešava':'Događa',
    'takmičenje':'natjecanje','takmičenja':'natjecanja','takmičenju':'natjecanju','takmičenjima':'natjecanjima','takmičiti':'natjecati','takmiči':'natječe','Takmičenje':'Natjecanje',
    'učestvovati':'sudjelovati','učestvuje':'sudjeluje','učestvuju':'sudjeluju','učestvovao':'sudjelovao','učešće':'sudjelovanje','učešća':'sudjelovanja',
    'pobeda':'pobjeda','pobede':'pobjede','pobedu':'pobjedu','pobednik':'pobjednik','pobednici':'pobjednici','pobednika':'pobjednika','Pobeda':'Pobjeda',
    'podijum':'postolje','podijuma':'postolja','podijumi':'postolja','podijume':'postolja','Podijum':'Postolje',
    'hronometar':'kronometar','hronometra':'kronometra','hronometru':'kronometru','hronometraš':'kronometraš','Hronometar':'Kronometar','Hronometraš':'Kronometraš',
    'opšti':'opći','opšta':'opća','opšte':'opće','opštim':'općim','Opšte':'Opće',
    'istorija':'povijest','istorije':'povijesti','istoriju':'povijest','istorijski':'povijesni','istorijska':'povijesna','istorijske':'povijesne','istorijskog':'povijesnog','Istorija':'Povijest',
    'merodavan':'mjerodavan','merodavna':'mjerodavna','merodavne':'mjerodavne','merodavni':'mjerodavni',
    'prenos':'prijenos','prenosa':'prijenosa','prenositi':'prenositi','prenosivost':'prenosivost',
    'lekar':'liječnik','lekara':'liječnika','lekaru':'liječniku','Lekar':'Liječnik',
    'nalog':'račun','naloga':'računa','nalogu':'računu','nalozi':'računi','naloge':'račune','Nalog':'Račun',
    'ponovo':'ponovno','Ponovo':'Ponovno','uputstvo':'upute','uputstva':'upute','Uputstvo':'Upute',
    'tabela':'tablica','tabele':'tablice','tabeli':'tablici','tabelu':'tablicu','Tabela':'Tablica',
    'nivo':'razina','nivoa':'razine','nivou':'razini','nivoi':'razine','nivoima':'razinama','Nivo':'Razina',
    'objekat':'objekt','objekta':'objekta','objekti':'objekti','objekte':'objekte','objektu':'objektu',
    'projekat':'projekt','projekta':'projekta','projekti':'projekti','projektu':'projektu','projekatima':'projektima',
    'period':'razdoblje','perioda':'razdoblja','periodi':'razdoblja','periodu':'razdoblju','periodima':'razdobljima','Period':'Razdoblje',
    'milion':'milijun','miliona':'milijuna','milioni':'milijuni','hiljada':'tisuća','hiljade':'tisuće','Hiljada':'Tisuća',
    'točak':'kotač','točkovi':'kotači','točkova':'kotača','točkove':'kotače','menjač':'mjenjač','menjača':'mjenjača',
    'mesec':'mjesec','meseca':'mjeseca','meseci':'mjeseci','mesecu':'mjesecu','Mesec':'Mjesec',
    'osveži':'osvježi','Osveži':'Osvježi','podsetnik':'podsjetnik','podsetnici':'podsjetnici','Podsetnik':'Podsjetnik',
    'penzionisanje':'umirovljenje','penzionisanja':'umirovljenja','Penzionisanje':'Umirovljenje',
    'preusmeren':'preusmjeren','preusmerena':'preusmjerena','preusmeriti':'preusmjeriti',
}

PLACEHOLDER = re.compile(r'(\{\{[^{}]+\}\})')
WORD_RE = re.compile(r'(?<![\w-])(' + '|'.join(sorted((re.escape(k) for k in WORDS), key=len, reverse=True)) + r')(?![\w-])')


def convert_segment(text: str) -> str:
    return WORD_RE.sub(lambda m: WORDS[m.group(0)], text)


def convert_text(text: str) -> str:
    parts = PLACEHOLDER.split(text)
    return ''.join(part if PLACEHOLDER.fullmatch(part) else convert_segment(part) for part in parts)


def walk(value):
    if isinstance(value, dict): return {k: walk(v) for k,v in value.items()}
    if isinstance(value, list): return [walk(v) for v in value]
    if isinstance(value, str): return convert_text(value)
    return value

for filename in FILES:
    path=ROOT/filename
    data=walk(json.loads(path.read_text(encoding='utf-8')))
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
    print(f'Normalized Croatian Manual word forms: {filename}')
