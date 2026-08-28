import json
import re
from pathlib import Path

EN_PATH = Path('src/i18n/locales/en/manual.json')
SR_PATH = Path('src/i18n/locales/sr-Latn/manual.json')

en = json.loads(EN_PATH.read_text(encoding='utf-8'))
data = json.loads(SR_PATH.read_text(encoding='utf-8'))

REPLACEMENTS = [
    ('također', 'takođe'), ('Također', 'Takođe'),
    ('sustav', 'sistem'), ('Sustav', 'Sistem'),
    ('izvješće', 'izveštaj'), ('Izvješće', 'Izveštaj'),
    ('izvješća', 'izveštaji'), ('Izvješća', 'Izveštaji'),
    ('razina', 'nivo'), ('Razina', 'Nivo'),
    ('sljedeći', 'sledeći'), ('Sljedeći', 'Sledeći'),
    ('trenutačno', 'trenutno'), ('Trenutačno', 'Trenutno'),
    ('točka', 'tačka'), ('Točka', 'Tačka'),
    ('odjeljak', 'odeljak'), ('Odjeljak', 'Odeljak'),
    ('smještaj', 'smeštaj'), ('Smještaj', 'Smeštaj'),
    ('izbornik', 'meni'), ('Izbornik', 'Meni'),
    ('povijest', 'istorija'), ('Povijest', 'Istorija'),
    ('tjedan', 'nedelja'), ('Tjedan', 'Nedelja'),
    ('mjesec', 'mesec'), ('Mjesec', 'Mesec'),
    ('natjecanje', 'takmičenje'), ('Natjecanje', 'Takmičenje'),
    ('usporedba', 'poređenje'), ('Usporedba', 'Poređenje'),
    ('vrijeme', 'vreme'), ('Vrijeme', 'Vreme'),
    ('provjer', 'prover'), ('cijen', 'cen'), ('tijekom', 'tokom'),
    ('uvjet', 'uslov'), ('zahtijeva', 'zahteva'), ('zahtjeva', 'zahteva'),
    ('vrijednost', 'vrednost'), ('financij', 'finansij'),
    ('rostera', 'sastava'), ('rosteru', 'sastavu'), ('roster', 'sastav'),
    ('sponsorsku', 'sponzorsku'), ('sponsorski', 'sponzorski'),
    ('screenshot-ove', 'snimke ekrana'), ('screenshotove', 'snimke ekrana'),
    ('Widget-i', 'Vidžeti'), ('widget-i', 'vidžeti'),
    ('equipment setup', 'podešavanje opreme'),
    ('setup-e', 'podešavanja'), ('setup-u', 'podešavanju'),
    ('setup etape', 'podešavanje etape'),
    ('summit finish', 'cilj na usponu'),
    ('live stanje', 'stanje uživo'),
    ('replay frame-ove', 'kadrove replay-a'),
    ('cashflow-a', 'toka novca'), ('cashflow', 'tok novca'),
    ('metadata datuma igre', 'metapodataka o datumu igre'),
    ('created_at timestamp-a', 'created_at vremenskog zapisa'),
    ('plata plate', 'plati plate'),
    ('referral linkovima', 'linkovima preporuke'),
    ('referral linka', 'linka preporuke'), ('referral link', 'link preporuke'),
    ('Footeru', 'podnožju'), ('footeru', 'podnožju'),
    ('sidebar-u', 'bočnoj navigaciji'), ('sidebar', 'bočna navigacija'),
    ('browseru', 'pregledaču'), ('pool-a', 'skupa'),
    ('generički fallback', 'generičku rezervnu varijantu'),
    ('Naming-rights', 'Prava sponzora na ime'),
    ('naming-rights', 'prava sponzora na ime'),
    ('Naming Rights', 'Prava sponzora na ime'),
    ('naming rights', 'prava sponzora na ime'),
    ('Emergency Debt Health', 'Stanje hitnog duga'),
    ('Finance Health', 'Finansijsko stanje'),
    ('Squad Pulse', 'Stanje ekipe'),
]

COIN_FORMS = re.compile(
    r'\b(?:Novčići|novčići|Novčića|novčića|Novčić|novčić|Novčićima|novčićima|kovanice|Kovanice)\b'
)


def polish(value):
    if isinstance(value, str):
        value = COIN_FORMS.sub('Coins', value)
        for old, new in REPLACEMENTS:
            value = value.replace(old, new)
        value = re.sub(r'\bspasavanj\w*\b', 'hitne finansijske pomoći', value, flags=re.IGNORECASE)
        value = re.sub(r' {2,}', ' ', value)
        return value
    if isinstance(value, list):
        return [polish(item) for item in value]
    if isinstance(value, dict):
        return {key: polish(item) for key, item in value.items()}
    return value


data = polish(data)
s = data['sections']

# Core UI/game terminology.
s['coins']['title'] = 'Coins, paketi i nagrade za preporuke'
s['coins']['subtitle'] = 'Razlika između Coins valute naloga i novca kluba.'
s['coins']['overview'] = (
    'Coins su valuta korisničkog naloga. Novac kluba je ekonomija tima. '
    'Nemojte mešati Coins sa novcem u igri koji se koristi za plate, transfere, opremu i infrastrukturu.'
)
s['notifications-inbox']['overview'] = (
    'Obaveštenja su upozorenja igre ili administratora. Sanduče je namenjeno direktnim ili administratorskim razgovorima. '
    'Zajedno pomažu korisnicima da ne propuste rokove i da komuniciraju sa drugim menadžerima ili administratorima.'
)
s['finance']['overview'] = (
    'Finansije prikazuju dugoročnu sigurnost vašeg kluba. Jaki vozači ne znače ništa ako klub ne može da plati '
    'plate, poreze, politike, opremu ili obavezne troškove.'
)
s['emergency-liquidation']['title'] = 'Hitna finansijska pomoć, dug i likvidacija kluba'
s['emergency-liquidation']['overview'] = (
    'Igra ima sistem hitne finansijske pomoći i likvidacije. Hitna finansijska pomoć privremeno štiti klub, '
    'ali ponovljeni neuspeh u pokrivanju obaveza može dovesti do zatvaranja kluba.'
)

# Deep sections that were specifically found to be unacceptable in the Helsinki pass.
x = s['first-squad-deep']
x['title'] = 'Detaljni vodič za Prvi tim'
x['subtitle'] = 'Glavni sastav vozača i prikazi liste.'
x['overview'] = 'Prvi tim je mesto gde korisnici pregledaju glavni sastav, finansijske podatke, veštine i formu.'
x['details'] = [
    'Opšti prikaz pokazuje identitet, ulogu, godine, Overall i status.',
    'Finansijski prikaz pokazuje platu, tržišnu vrednost i podatke o ugovoru.',
    'Veštine prikazuju specijalističke atribute.',
    'Forma i razvoj prikazuju umor, moral, dostupnost, potencijal i povezane informacije o razvoju.',
    'Sažetak kontrolne table može prikazati pobede, podijume, plasmane u top 10, poslednju trku i izbor za sledeću trku.',
]
x['facts'] = [
    {'label': 'Maksimum Prvog tima', 'value': '18 vozača'},
    {'label': 'Prikazi', 'value': 'Opšti, Finansijski, Veštine, Forma i razvoj'},
]
x['tips'] = ['Otvorite profil vozača pre važnih odluka.']
x['relatedLinks'] = ['Ekipa']

x = s['rider-skills-deep']
x['title'] = 'Veštine vozača i specijalistički atributi'
x['subtitle'] = 'Kako treba tumačiti atribute vozača.'
x['overview'] = 'Overall je sažeta ocena. Specijalističke veštine određuju šta vozač može da uradi u određenim trkama i situacijama.'
x['details'] = [
    'Sprint je najvažniji u brzim završnicama i sprinterskim ulogama.',
    'Uspon je važan na planinskim i brdskim profilima.',
    'Hronometar je važan u ITT/TTT situacijama.',
    'Izdržljivost pomaže tokom dugih etapa i dugih trka.',
    'Ravničarski atribut pomaže na ravnim putevima, pri pozicioniranju i održavanju stabilne brzine.',
    'Oporavak je posebno važan tokom etapnih trka.',
    'Otpornost pomaže pri dugotrajnim naporima visokog intenziteta.',
    'Race IQ predstavlja kvalitet taktičkog odlučivanja.',
    'Timski rad pomaže vozačima da efikasnije podrže plan tima.',
]
x['facts'] = [
    {'label': 'Atributi', 'value': 'Sprint, uspon, hronometar, izdržljivost, ravničarski, oporavak, otpornost, Race IQ, timski rad'},
    {'label': 'Ostale važne vrednosti', 'value': 'Potencijal, moral, umor, Race Sharpness'},
]
x['tips'] = ['Gradite uravnoteženu ekipu umesto da kupujete samo vozače sa visokim Overall-om.']

x = s['rider-profile-deep']
x['title'] = 'Detaljni vodič za profil vozača'
x['subtitle'] = 'Sopstveni vozač, spoljašnji vozač, poređenje i istorija.'
x['overview'] = 'Profil vozača se menja u zavisnosti od toga da li vozač pripada vašem klubu ili je spoljašnji vozač.'
x['details'] = [
    'Pregled prikazuje identitet, formu, spremnost, ključne veštine i informacije o klubu.',
    'Ugovor prikazuje status ugovora i akcije pregovora ili otpuštanja za vozače vašeg kluba.',
    'Trening prikazuje trenutne informacije o treningu za vozače vašeg kluba.',
    'Poređenje otvara prikaz dva vozača jedan pored drugog.',
    'Istorija može prikazati rezultate po sezonama i trkama, kao i podatke o karijeri.',
    'Profili spoljašnjih vozača mogu prikazati akcije skauting izveštaja i stanje na tržištu.',
]
x['facts'] = [
    {'label': 'Kartice sopstvenog vozača', 'value': 'Pregled, Ugovor, Trening, Poređenje, Istorija'},
    {'label': 'Spoljašnji vozači', 'value': 'Tačni atributi mogu biti skriveni dok ne postoji skauting izveštaj'},
]
x['tips'] = ['Ne oslanjajte se na tačne atribute spoljašnjeg vozača dok ih skauting ne potvrdi.']

x = s['fitness-health-deep']
x['title'] = 'Forma, umor, povrede i bolest'
x['subtitle'] = 'Zašto jak vozač ipak može biti loš izbor za trku.'
x['overview'] = 'Dostupnost i umor mogu smanjiti stvarnu vrednost vozača na trci čak i kada su Overall i veštine visoki.'
x['details'] = [
    'Vozač koji je zdrav i spreman i dalje može imati visok umor.',
    'Povređeni ili bolesni vozači zahtevaju medicinski oporavak, a ne normalan izbor za trku.',
    'Nepotpuno spreman znači da vozač može da se trka, ali nije u idealnom stanju.',
    'Težak trening i gust raspored trka povećavaju rizik od preopterećenja.',
    'Medicinsko osoblje i sistemi oporavka mogu poboljšati rešavanje zdravstvenih problema.',
]
x['facts'] = [
    {'label': 'Dostupnost', 'value': 'Spreman, nepotpuno spreman, povređen, bolestan'},
    {'label': 'Umor', 'value': 'Predstavlja nagomilani umor i stres'},
]
x['tips'] = ['Zaštitite ključne vozače pre važnih etapnih trka.']

x = s['race-sharpness-deep']
x['title'] = 'Race Sharpness'
x['subtitle'] = 'Ritam trkanja u odnosu na rizik od preopterećenja.'
x['overview'] = 'Race Sharpness nagrađuje dobar ritam trkanja, ali mora biti uravnotežen sa umorom i svežinom vozača.'
x['details'] = [
    'Race Sharpness nije isto što i forma stečena treningom.',
    'Odmoran vozač i dalje može imati nedovoljno trkačkog ritma.',
    'Vozač sa dobrim Race Sharpness-om i dalje može biti previše umoran za dobar rezultat.',
    'Najbolje stanje zavisi od sledeće ciljane trke i uloge vozača.',
]
x['facts'] = [
    {'label': 'Premalo trkanja', 'value': 'Može smanjiti Race Sharpness'},
    {'label': 'Previše trkanja', 'value': 'Može povećati umor i rizik od preopterećenja'},
]
x['tips'] = ['Koristite manje trke za pripremu ključnih vozača kada to odgovara planu.']

x = s['contracts-renewals-release']
x['title'] = 'Ugovori vozača, produženje i otpuštanje'
x['subtitle'] = 'Kako se upravlja ugovorima vozača vašeg kluba.'
x['overview'] = 'Profili vozača vašeg kluba sadrže podatke o ugovoru i mogu omogućiti produženje ugovora, otpuštanje ili radnje povezane sa transferom.'
x['details'] = [
    'Produženje ugovora treba razmotriti pre nego što se ugovor previše približi isteku.',
    'Dugi ugovori smanjuju neposredni rizik od isteka, ali stvaraju dugoročnu obavezu za plate.',
    'Otpuštanje vozača može imati finansijske posledice i uticati na sastav.',
    'Vozači na transfer listi prolaze kroz tok transfer pregovora umesto jednostavnog otpuštanja.',
    'Pre potpisivanja novih vozača proverite slobodna mesta u Prvom timu.',
]
x['facts'] = [
    {'label': 'Podaci ugovora', 'value': 'Plata, početna sezona, završna sezona, status'},
    {'label': 'Faktori odluke', 'value': 'Plata, trajanje, interesovanje kluba/nivoa i spremnost vozača'},
]
x['tips'] = ['Pre produženja ugovora zajedno proverite Finansijski prikaz i profil vozača.']

x = s['developing-team-deep']
x['title'] = 'Detaljni vodič za Razvojni tim'
x['subtitle'] = 'Kupovina, status, sastav i pravila perioda za premeštanje.'
x['overview'] = 'Razvojni tim se vodi odvojeno, ali ostaje povezan sa glavnim klubom i korisničkim nalogom.'
x['details'] = [
    'Status kupovine učitava se iz backenda i zavisi od zahteva sistema i Coins stanja.',
    'Nakon kupovine Razvojnog tima aktivni kontekst se vraća na glavni klub.',
    'Promocija vozača zahteva otvoren period za premeštanje i slobodno mesto u Prvom timu.',
    'Vozače starosti 24+ treba premestiti kada igra to dozvoljava.',
    'Ako je period zatvoren, UI može upozoriti korisnika da reaguje u sledećem periodu.',
]
# Preserve the English/source fact exactly; localization must not alter game balance.
x['facts'] = [
    {'label': 'Maksimum sastava', 'value': '8'},
    {'label': 'Premeštanje', 'value': 'Samo tokom otvorenih perioda za premeštanje'},
    {'label': 'Upozorenje za starijeg vozača', 'value': '24+ godina'},
]
x['tips'] = ['Planirajte premeštanje pre nego što upozorenje o godinama postane hitno.']
x['relatedLinks'] = ['Podešavanja']

x = s['staff-roles-deep']
x['title'] = 'Detaljni vodič za uloge osoblja'
x['subtitle'] = 'Šta svaka uloga osoblja doprinosi klubu.'
x['overview'] = 'Uloge osoblja podržavaju različite delove razvoja vozača, pripreme trke, medicinske nege, skautinga i opreme.'
x['details'] = [
    'Glavni trener vodi kvalitet treninga i razvoj vozača.',
    'Treneri proširuju podršku treningu i kapacitet za rad sa vozačima.',
    'Sportski direktor podržava taktike, Stage Plans i predloge za pripremu trke.',
    'Doktor tima i Fizioterapeut podržavaju zdravlje i oporavak.',
    'Nutricionista podržava ishranu i sisteme oporavka.',
    'Mehaničar podržava popravke i tehničke sisteme.',
    'Skaut / Analitičar podržava prikupljanje informacija o spoljašnjim vozačima.',
    'U23 Glavni trener podržava vozače Razvojnog tima.',
]
x['facts'] = [
    {'label': 'Uloge za performanse', 'value': 'Glavni trener, Trener, Sportski direktor'},
    {'label': 'Medicinske uloge', 'value': 'Doktor tima, Fizioterapeut, Nutricionista'},
    {'label': 'Tehničke i analitičke uloge', 'value': 'Mehaničar, Skaut / Analitičar, U23 Glavni trener'},
]
x['tips'] = ['Zaposlite osoblje koje rešava trenutno usko grlo u klubu.']

x = s['staff-capacity-deep']
x['title'] = 'Kapacitet osoblja i infrastruktura'
x['subtitle'] = 'Zašto uloga osoblja može biti zaključana čak i kada klub ima dovoljno novca.'
x['overview'] = 'Kapacitet osoblja povezan je sa objektima. Unapređenje infrastrukture može otključati dodatna mesta za osoblje.'
x['details'] = [
    'Ponuda na tržištu osoblja nije dovoljna ako je kapacitet za tu ulogu već popunjen.',
    'Stranice Infrastrukture prikazuju iskorišćena i maksimalna mesta za grupe osoblja.',
    'Planovi unapređenja treba da uzmu u obzir i trenutne koristi i buduće potrebe za zapošljavanjem.',
    'Zapošljavanje bez provere kapaciteta može nepotrebno potrošiti vreme za planiranje.',
]
x['facts'] = [
    {'label': 'Osoblje za trening', 'value': 'Povezano sa pravilima Trening centra / Sedišta kluba'},
    {'label': 'Medicinsko osoblje', 'value': 'Povezano sa Medicinskim centrom'},
    {'label': 'Mehaničari', 'value': 'Povezani sa Mehaničarskom radionicom'},
    {'label': 'Skauting', 'value': 'Povezan sa Skauting kancelarijom'},
]
x['tips'] = ['Proverite Infrastrukturu pre zapošljavanja dodatnog člana osoblja.']

x = s['staff-courses-deep']
x['title'] = 'Kursevi za osoblje'
x['subtitle'] = 'Privremeni programi razvoja osoblja.'
x['overview'] = 'Kurs za osoblje košta novac, traje određeni broj dana igre i može poboljšati izabrane atribute člana osoblja.'
x['details'] = [
    'Kurs može započeti samo član osoblja koji ispunjava uslove.',
    'Pre plaćanja proverite pregled detalja kursa.',
    'Aktivni kursevi prikazuju napredak i podatke o preostalom vremenu ili završetku.',
    'Završeni kursevi mogu se prikazati u nedavnoj istoriji.',
    'Troškove kurseva treba planirati zajedno sa Finansijama.',
]
x['facts'] = [
    {'label': 'Podaci kursa', 'value': 'Naslov, kategorija, trajanje, cena i poboljšanje atributa'},
    {'label': 'Status kursa', 'value': 'Aktivan i nedavno završen'},
]
x['tips'] = ['Razvijajte vredno dugoročno osoblje, a ne svakog privremenog zaposlenog.']

x = s['regular-training-deep']
x['title'] = 'Detaljni vodič za redovni trening'
x['subtitle'] = 'Podrazumevani timski trening, individualni planovi i intenzitet.'
x['overview'] = 'Redovni trening je osnovni kontinuirani sistem razvoja vozača kada nisu u trening kampu.'
x['details'] = [
    'Podrazumevani timski trening daje celoj ekipi osnovni pristup treningu.',
    'Individualni planovi imaju prednost nad timskim podešavanjem kada vozaču treba specijalistički rad.',
    'Visok intenzitet povećava opterećenje treninga i rizik od umora.',
    'Intenzitet oporavka koristan je oko teških blokova trka.',
    'Trening treba uskladiti sa ulogom vozača i ciljevima u kalendaru.',
]
x['facts'] = [
    {'label': 'Fokus', 'value': 'Opšti, oporavak, sprint, uspon, ravničarski, hronometar, izdržljivost, otpornost, Race IQ, timski rad'},
    {'label': 'Intenzitet', 'value': 'Oporavak, lagano, normalno, jako'},
]
x['tips'] = ['Nemojte koristiti jak intenzitet kao trajno podrazumevano podešavanje za celu ekipu.']

x = s['training-camps-deep']
x['title'] = 'Detaljni vodič za trening kampove'
x['subtitle'] = 'Lokacije, ponude, vreme i pravila rezervacije kampa.'
x['overview'] = 'Trening kampovi su snažniji planirani razvojni blokovi koji uključuju putovanje, smeštaj, naknadu za kamp i posebne efekte treninga.'
x['details'] = [
    'Lokacije kampova imaju kvalitet, nadmorsku visinu, teren i kalendarske preference.',
    'Preporučene nedelje mogu poboljšati iskustvo kampa, dok rizične nedelje mogu smanjiti njegovu vrednost.',
    'Zatvorene nedelje sprečavaju rezervaciju.',
    'Ponudu treba pregledati pre potvrde jer putovanje i smeštaj mogu biti veliki troškovi.',
    'Vreme može smanjiti vrednost treninga ili dovesti do propuštenih sesija.',
    'Izbor osoblja i vozača utiče na rezultat kampa.',
]
x['facts'] = [
    {'label': 'Tipovi kampova', 'value': 'Opšti, sprint, uspon, ravničarski, hronometar'},
    {'label': 'Stavke ponude', 'value': 'Putovanje, smeštaj, naknada za kamp, logistika, ukupna cena'},
    {'label': 'Vreme', 'value': 'Može promeniti modifikator, verovatnoću propuštenog dana i upozorenja'},
]
x['tips'] = ['Rezervišite kampove prema glavnim ciljevima, a ne nasumično.']

x = s['current-camp-deep']
x['title'] = 'Trenutni trening kamp'
x['subtitle'] = 'Kako čitati stranicu aktivnog kampa.'
x['overview'] = 'Stranica aktivnog kampa prikazuje učesnike, osoblje, vreme, plan treninga, dnevne izveštaje i napredak.'
x['details'] = [
    'Stranicu trenutnog kampa koristite za praćenje onoga što se stvarno dešava, a ne samo prvobitne ponude rezervacije.',
    'Vreme i efekti osoblja mogu promeniti stvarni kvalitet treninga.',
    'Dnevni izveštaji prikazuju završene sesije i njihov uticaj na vozače.',
    'Predstojeći plan treninga menjajte samo kada igra to dozvoljava.',
    'Umor iz kampa treba uzeti u obzir pre sledeće trke.',
]
x['facts'] = [
    {'label': 'Učesnici', 'value': 'Izabrani vozači i dodeljeno osoblje'},
    {'label': 'Plan', 'value': 'Slobodan dan, lagano, normalno ili jako za dane kampa'},
    {'label': 'Izveštaji', 'value': 'Dobici završenog dana i efekti umora'},
]
x['tips'] = ['Posle kampa ostavite vozačima dovoljno vremena za oporavak pre ključnih trka.']

SR_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Strict final validation.
assert len(en['sections']) == 92
assert len(data['sections']) == 92
assert set(en['sections']) == set(data['sections']), 'Section IDs differ from English'

text = json.dumps(data, ensure_ascii=False)
lowered = text.lower()
for marker in ['ZXQ', 'QXml', '�', 'Ã', 'Â', 'æ', 'è', 'ð', 'jahač', 'rasni svet', 'vr›']:
    assert marker.lower() not in lowered, f'Forbidden marker/term: {marker}'
assert not re.search(r'\bZIK\d*\b', text), 'ZIK placeholder remained'
assert not re.search(r'[\u0400-\u04ff]', text), 'Cyrillic remained in sr-Latn manual'

for word in [
    'također', 'sustav', 'izvješće', 'razina', 'sljedeći', 'trenutačno', 'točka',
    'odjeljak', 'smještaj', 'izbornik', 'povijest', 'tjedan', 'mjesec', 'natjecanje', 'usporedba',
]:
    assert word not in lowered, f'Croatian terminology remained: {word}'

for phrase in [
    'vremenski suđenje', 'formula i razvoj', 'razvijački odred', 'sučelje može',
    'knjižni logori', 'hranioc', 'direktor sporta', 'rasne pripreme', 'trka ik',
    'najbolja država zavisi', 'medicinsku oporavak', 'akumulisano umor',
    'prisušni plan', 'redovni vođa za obuku', 'privremeni radni mesta', 'plata plate',
]:
    assert phrase not in lowered, f'Known bad machine translation remained: {phrase}'

assert not re.search(r'\bnovči', lowered), 'Coins was translated to novčić/novčići'
assert 'sponsorsk' not in lowered, 'Bad sponzorski spelling remained'

en_text = json.dumps(en, ensure_ascii=False)
for term in ['Race Plan', 'Stage Plans', 'Startlist', 'Race Engine', 'Coins']:
    if term in en_text:
        assert term in text, f'Missing preserved game term: {term}'

print('Manual quality validation passed for all 92 sections.')
print('Representative Serbian manual QA:')
for sid in [
    'quick-start', 'coins', 'squad-riders', 'rider-skills-deep', 'rider-profile-deep',
    'fitness-health-deep', 'race-sharpness-deep', 'developing-team-deep',
    'staff-roles-deep', 'staff-capacity-deep', 'training-camps-deep', 'current-camp-deep',
    'equipment-category-deep', 'race-preparation', 'transfers-scouting', 'finance',
    'emergency-liquidation', 'support-account',
]:
    section = data['sections'][sid]
    print(f"\n[{sid}] {section['title']}")
    print(section['overview'])
    if section.get('details'):
        print(' - ' + section['details'][0])
