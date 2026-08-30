from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')
FILES = [
    'finance.json',
    'transfers.json',
    'riderProfile.json',
    'preferences.json',
    'preferencesDynamic.json',
    'notifications.json',
]

# Phrase-level fixes first. These are intentionally explicit where a simple
# Serbian->Croatian token swap would produce awkward grammar.
PHRASES = {
    'Praktična postavke:': 'Praktične postavke:',
    'Osnovna obavijesti': 'Osnovne obavijesti',
    'Standardna obavijesti igre': 'Standardne obavijesti igre',
    'Plaćena savetodavna obavijesti': 'Plaćene savjetodavne obavijesti',
    'Osnovno obavijest': 'Osnovna obavijest',
    'Advisor obavijest': 'obavijest savjetnika',
    'Prikaži sva obavijesti': 'Prikaži sve obavijesti',
    'Nijedno obavijest': 'Nijedna obavijest',
    'buduća obavijesti': 'buduće obavijesti',
    'Ostala obavijesti': 'Ostale obavijesti',
    'tačan tip': 'točan tip',
    'ovaj tačan tip': 'ovu točnu vrstu',
    'Podesite standarde': 'Postavite standarde',
    'za ceo klub': 'za cijeli klub',
    'na osnovu': 'na temelju',
    'Zasnovano na': 'Temelji se na',
    'podrazumevano': 'zadano',
    'u bilo kom trenutku': 'u bilo kojem trenutku',
    'Još uvek': 'Još uvijek',
    'može normalno da se prijavljuje': 'može se normalno prijavljivati',
    'moći ćete da': 'moći ćete',
    'nije mogao da se': 'nije se mogao',
    'nisu mogli da se': 'nisu se mogli',
    'nije mogla da se': 'nije se mogla',
    'nisu mogle da se': 'nisu se mogle',
    'može da prihvati': 'može prihvatiti',
    'može da pregovara': 'može pregovarati',
    'mora ručno da je prihvati': 'mora je ručno prihvatiti',
    'može da koristi': 'može koristiti',
    'možete da koristite': 'možete koristiti',
    'možete da izaberete': 'možete odabrati',
    'treba da budu': 'trebaju biti',
    'treba da ostanu': 'trebaju ostati',
    'treba da proveri': 'treba provjeriti',
    'biće ': 'bit će ',
    'biće': 'bit će',
    'će biti ': 'će biti ',
    'email': 'e-mail',
    'spam folder': 'mapu neželjene pošte',
    'slobodnih agenata': 'slobodnih vozača',
    'slobodni agenti': 'slobodni vozači',
    'slobodnog agenta': 'slobodnog vozača',
    'slobodan agent': 'slobodan vozač',
    'pune širine': 'preko cijele širine',
    'spoljne profile': 'vanjske profile',
    'po strani': 'po stranici',
    'Strana {{page}}': 'Stranica {{page}}',
    'Overall od višeg ka nižem': 'Overall od višeg prema nižem',
    'Overall od nižeg ka višem': 'Overall od nižeg prema višem',
    'OVR od višeg ka nižem': 'OVR od višeg prema nižem',
    'OVR od nižeg ka višem': 'OVR od nižeg prema višem',
    'od više ka nižoj': 'od više prema nižoj',
    'od niže ka višoj': 'od niže prema višoj',
    'od manje ka većoj': 'od manje prema većoj',
    'od veće ka manjoj': 'od veće prema manjoj',
    'Od višeg ka nižem': 'Od višeg prema nižem',
    'Od nižeg ka višem': 'Od nižeg prema višem',
    'ka vozaču': 'prema vozaču',
    'Ka': 'Prema',
    'Finansije': 'Financije',
    'finansije': 'financije',
    'Finansijska': 'Financijska',
    'finansijska': 'financijska',
    'Finansijski': 'Financijski',
    'finansijski': 'financijski',
    'poreski': 'porezni',
    'Poreski': 'Porezni',
    'poreska': 'porezna',
    'Poreska': 'Porezna',
    'poreske': 'porezne',
    'Poreske': 'Porezne',
    'poreza': 'poreza',
    'Cena': 'Cijena',
    'cena': 'cijena',
    'Cene': 'Cijene',
    'cene': 'cijene',
    'Pobeda': 'Pobjeda',
    'pobeda': 'pobjeda',
    'Pobede': 'Pobjede',
    'pobede': 'pobjede',
    'Podijum': 'Postolje',
    'podijum': 'postolje',
    'Podijumi': 'Postolja',
    'podijumi': 'postolja',
    'Garantovano': 'Zajamčeno',
    'garantovano': 'zajamčeno',
    'Garantovani': 'Zajamčeni',
    'garantovani': 'zajamčeni',
    'Garantovana': 'Zajamčena',
    'garantovana': 'zajamčena',
    'Generisanje': 'Generiranje',
    'generisanje': 'generiranje',
    'generisani': 'generirani',
    'generisana': 'generirana',
    'generisane': 'generirane',
    'grupisan': 'grupiran',
    'korigovano': 'korigirano',
    'procenjeno': 'procijenjeno',
    'Procenjeno': 'Procijenjeno',
    'procenjeni': 'procijenjeni',
    'Procenjeni': 'Procijenjeni',
    'efikasnost': 'učinkovitost',
    'Efikasnost': 'Učinkovitost',
    'smeštaj': 'smještaj',
    'Smeštaj': 'Smještaj',
    'ramovi': 'okviri',
    'Ramovi': 'Okviri',
    'setovi kotača': 'kompleti kotača',
    'Setovi kotača': 'Kompleti kotača',
    'Hronometar': 'Kronometar',
    'hronometar': 'kronometar',
    'Opšte': 'Opće',
    'opšte': 'opće',
    'Veoma ': 'Vrlo ',
    'veoma ': 'vrlo ',
    'nedelje': 'tjedna',
    'nedelja': 'tjedan',
    'Nedelje': 'Tjedna',
    'Nedelja': 'Tjedan',
}

# Conservative Serbian-form substitutions. Word boundaries/stems are used only
# for forms that have a clear Croatian equivalent in this UI domain.
REGEX = [
    (r'\bpodešav(?:anje|anja|anjima|ati|a|eno|ene|en)?\b', 'postavke'),
    (r'\bobaveštenj(?:e|a|ima)?\b', 'obavijest'),
    (r'\btakmičenj(?:e|a|u|ima)?\b', 'natjecanje'),
    (r'\btakmiči(?:ti|š|se)?\b', 'natječe'),
    (r'\bučešć(?:e|a|u)\b', 'sudjelovanje'),
    (r'\bučestv(?:ovao|ovala|ovali|ovati|uje|uju|ovao)?\b', 'sudjel'),
    (r'\buslov(?:i|a|e|ima|om)?\b', 'uvjet'),
    (r'\bvrednost(?:i|ima)?\b', 'vrijednost'),
    (r'\bsledeć(?:i|a|e|eg|em|oj|u)?\b', 'sljedeći'),
    (r'\bizveštaj(?:i|a|e|ima)?\b', 'izvještaj'),
    (r'\bpovred(?:a|e|u|om|ama|jen|jena|jeni)?\b', 'ozljeda'),
    (r'\bsavet(?:i|a|e|om|ima|nik|nika|nici|nikom|ovanje|odavn\w*)?\b', 'savjet'),
    (r'\bbezbedn(?:o|ost|osti|osni|osna|osno|osne)?\b', 'sigurnost'),
    (r'\bpromen(?:a|e|u|om|ama|iti|jen|jena|jeno|jene)?\b', 'promjena'),
    (r'\bprover(?:a|e|u|om|iti|ava|avati|eno|ena)?\b', 'provjera'),
    (r'\bodelj(?:ak|ka|ci|ku|aka)?\b', 'odjeljak'),
    (r'\bizaber(?:i|ite|emo|ete|u)?\b', 'odaberite'),
    (r'\bocen(?:a|e|u|om|iti|jeno|jena)?\b', 'ocjena'),
    (r'\bproseč(?:an|na|no|ni|ne|nog)?\b', 'prosječan'),
    (r'\bverovatn(?:o|ost|osti)?\b', 'vjerojatno'),
    (r'\bhiljad(?:a|e|u|ama)?\b', 'tisuća'),
    (r'\bmilion(?:a|i|u)?\b', 'milijun'),
    (r'\btočak(?:a|ovi|ove|ovima)?\b', 'kotač'),
    (r'\bmenjač(?:a|i|em)?\b', 'mjenjač'),
    (r'\bmesec(?:a|i|u|om)?\b', 'mjesec'),
    (r'\bistorij(?:a|e|u|om|ski|ska|sko|ske|skih)?\b', 'povijest'),
    (r'\bdodel(?:a|e|u|iti|jen|jena|jeno|jeni|jene)?\b', 'dodjela'),
    (r'\bprimen(?:a|e|u|iti|jen|jena|jeno|jene)?\b', 'primjena'),
    (r'\brešen(?:je|ja|ju|o|a|i)?\b', 'rješenje'),
    (r'\bzahtev(?:i|a|e|u|om|ima)?\b', 'zahtjev'),
    (r'\bprevod(?:i|a|u|om)?\b', 'prijevod'),
    (r'\bprenos(?:i|a|u|om)?\b', 'prijenos'),
    (r'\bposlednj(?:i|a|e|eg|em|oj|u)?\b', 'posljednji'),
    (r'\blekar(?:a|i|u|om)?\b', 'liječnik'),
    (r'\bsačuv(?:aj|ajte|an|ana|ano|ani|ane|ati|a|ano)?\b', 'spremi'),
    (r'\btrka(?:a|e|u|om|ama)?\b', 'utrka'),
    (r'\bnalog(?:a|u|om|e|i)?\b', 'račun'),
    (r'\bponovo\b', 'ponovno'),
    (r'\buputstv(?:o|a|u|ima)?\b', 'upute'),
    (r'\bosveži\b', 'osvježi'),
    (r'\bOsveži\b', 'Osvježi'),
    (r'\bpodsetnik(?:a|e|u|om|ci|cima)?\b', 'podsjetnik'),
    (r'\bPodsetnik(?:a|e|u|om|ci|cima)?\b', 'Podsjetnik'),
    (r'\bpenzionisanj(?:e|a|u|em)?\b', 'umirovljenje'),
    (r'\bPenzionisanj(?:e|a|u|em)?\b', 'Umirovljenje'),
    (r'\bzvaničn(?:e|a|o|i|ih)?\b', 'službeno'),
    (r'\bpreusmeren(?:i|a|o)?\b', 'preusmjeren'),
    (r'\buspešn(?:o|a|i|e)?\b', 'uspješno'),
    (r'\bpreusmer(?:iti|en|ena|eno)?\b', 'preusmjeriti'),
    (r'\broster(?:a|u)?\b', 'kader'),
]

EXACT_PATCHES: dict[str, dict[str, str]] = {
    'preferences.json': {
        'page.description': 'Praktične postavke: upravljanje obavijestima u igri i rizičnim radnjama povezanim s timom.',
        'notifications.description': 'Osnovne obavijesti igre i plaćene obavijesti sustava Staff Advisor postavljaju se odvojeno.',
        'notifications.coreTitle': 'Osnovne obavijesti',
        'notifications.coreDescription': 'Standardne obavijesti igre koje ostaju dostupne i bez plaćene usluge Staff Advisor.',
        'notifications.advisorTitle': 'Obavijesti Staff Advisor',
        'notifications.advisorDescription': 'Plaćene savjetodavne obavijesti grupirane su po temi. Isključivanje kategorije utišava sve vrste obavijesti u toj temi. Pojedinačne vrste poslije se mogu ponovno uključiti na njihovoj kartici bez promjene cijele kategorije.',
        'notifications.advisorSaveError': 'Nije moguće spremiti postavke obavijesti Staff Advisor. Pokušajte ponovno.',
        'notifications.advisorInactiveSuffix': 'Aktivirajte potrebnog Staff Advisor kako biste upravljali ovom obavijesti.',
        'notifications.coreAdvisorNote': 'Osnovna obavijest i obavijest savjetnika mogu pokrivati istu temu, a da nisu isti događaj. Primjer: Race Supplies Low ostaje osnovna obavijest, dok je Equipment & Workshop Review plaćena analiza.',
        'developingTeam.eligibility': 'Uvjet: 30 stvarnih dana ili 60 dana u igri.',
        'developingTeam.notEligible': 'Uvjet još nije ispunjen',
        'developingTeam.notEligibleDescription': 'Razvojni tim postaje dostupan nakon 30 stvarnih dana ili 60 dana u igri.',
        'developingTeam.teamNameRule': 'Ime tima bit će ime vašeg glavnog kluba uz dodatak U23.',
        'developingTeam.raceRule': 'Ovaj tim može se normalno prijavljivati na utrke dok je sezonski pristup aktivan.',
        'developingTeam.competitionRule': 'Ovaj tim ne može biti promoviran iznad Continental razine.',
        'developingTeam.rosterRule': 'Maksimalna veličina kadra: 8 vozača.',
        'developingTeam.ageRule': 'Mogu sudjelovati samo vozači od 23 godine ili mlađi.',
        'dangerZone.description': 'Ovo su destruktivne radnje i trebaju ostati odvojene od uobičajenih postavki.',
        'dangerZone.restartDescription': 'Vratite ovaj klub u početno stanje uz zadržavanje istog imena kluba, logotipa, dresa, države i mjesta u natjecanju.',
        'dangerZone.shutdownDescription': 'Trajno izbrišite ovaj korisnički tim i autentifikacijski račun. Nakon uspješnog brisanja bit ćete preusmjereni na početnu stranicu i moći ćete se ponovno registrirati istim e-mailom.',
        'dangerZone.systemNote': 'Sustav obavijesti treba provjeriti spremljene postavke prije stvaranja ili prikazivanja svake vrste obavijesti.',
    },
    'notifications.json': {
        'page.showAll': 'Prikaži sve obavijesti',
        'empty.noMatch': 'Nijedna obavijest ne odgovara pretrazi ili filtru.',
        'mute.muteTitle': 'Zaustavi buduće obavijesti samo za ovu točnu vrstu izvještaja Staff Advisory. Ostale obavijesti savjetnika neće se promijeniti.',
        'mute.unmuteTitle': 'Ponovno uključi buduće obavijesti za ovu točnu vrstu izvještaja Staff Advisory.',
        'mute.errorMute': 'Ovu vrstu obavijesti nije moguće isključiti. Pokušajte ponovno.',
        'mute.errorUnmute': 'Ovu vrstu obavijesti nije moguće ponovno uključiti. Pokušajte ponovno.',
        'time.minutesAgo': 'prije {{count}} min',
        'time.hoursAgo': 'prije {{count}} h',
        'time.daysAgo': 'prije {{count}} d',
    },
    'finance.json': {
        'page.title': 'Financije',
        'page.subtitle': 'Pregled prihoda, rashoda i transakcija.',
        'page.refresh': 'Osvježi',
        'page.loadFailed': 'Financijske podatke nije moguće učitati.',
        'transactionLabels.taxWithholding': 'Porezno zadržavanje',
        'transactionLabels.taxPayment': 'Plaćanje poreza',
        'transactionLabels.taxRefund': 'Povrat poreza',
        'policyNotifications.reminder': 'Podsjetnik',
        'overview.chooseAggregation': 'Odaberite način grupiranja grafikona.',
        'overview.operatingView': 'Poslovni pregled odabranog razdoblja.',
        'overview.hoverBar': 'Prijeđite pokazivačem preko stupca za detalje.',
        'overview.hoverDot': 'Prijeđite pokazivačem preko točke za detalje.',
        'tax.title': 'Porez',
        'tax.loading': 'Učitavanje poreznih podataka…',
        'tax.currentTaxable': 'Trenutačni oporezivi prihod',
        'tax.expectedTax': 'Očekivani porez do sada',
        'tax.statement': 'Porezni izvod',
        'tax.auditHistory': 'Povijest kontrola',
        'tax.noAuditHistory': 'Nema pronađenih poreznih kontrola.',
    },
    'transfers.json': {
        'common.direction': 'Smjer',
        'common.page': 'Stranica {{page}} / {{pages}}',
        'sort.priceHighLow': 'Cijena od više prema nižoj',
        'sort.priceLowHigh': 'Cijena od niže prema višoj',
        'transferHelp.title': 'Kako funkcioniraju transfer ponude',
        'transferHelp.sendOffer': 'Najprije šaljete ponudu za odštetu klubu prodavatelju. Klub prodavatelj odlučuje može li vaš klub pregovarati s vozačem.',
        'transferHelp.belowAsking': 'Ako je vaša ponuda <strong>niža od tražene cijene</strong>, klub prodavatelj mora je ručno prihvatiti ili odbiti.',
        'transferHelp.atOrAboveAsking': 'Ako je vaša ponuda <strong>jednaka ili viša od tražene cijene</strong>, uvjeti između klubova automatski se prihvaćaju.',
        'transferHelp.afterAcceptance': 'Nakon što prodavatelj prihvati ponudu ili nakon automatskog prihvaćanja, dobit ćete obavijest s poveznicom za početak pregovora o ugovoru s vozačem.',
        'transferHelp.riderNegotiation': 'Tijekom pregovora vozač može prihvatiti vaše uvjete, zatražiti veću plaću, drugačije trajanje ugovora ili potpuno odbiti transfer. Razlozi odbijanja trebaju biti vidljivi u obavijestima i detaljima pregovora.',
        'transferHelp.rejectedExpired': 'Ako klub prodavatelj odbije vašu ponudu ili ne odgovori prije isteka roka, dobit ćete obavijest da je ponuda odbijena ili istekla.',
    },
    'riderProfile.json': {
        'common.jerseys': 'Dresovi',
        'common.wins': 'Pobjede',
        'skills.climbing': 'Uspon',
        'skills.timeTrial': 'Kronometar',
        'skills.raceExperience': 'Natjecateljsko iskustvo',
        'skills.general': 'Opće',
        'simpleProfile.showHistory': 'Prikaži povijest',
        'simpleProfile.hideHistory': 'Sakrij povijest',
        'external.noCareer': 'Još nema podataka o povijesti karijere ovog vozača.',
        'external.veryLow': 'Vrlo nizak',
        'scouting.chooseScout': 'Odaberite skauta.',
        'scouting.chooseTitle': 'Odaberi skauta',
        'scouting.selectScout': 'Odaberi skauta',
        'scouting.chooseOption': 'Odaberite skauta...',
        'scouting.estimatedDuration': 'Procijenjeno trajanje:',
        'scouting.efficiency': 'Učinkovitost:',
    },
    'preferencesDynamic.json': {
        'coins.reactivationPrice': 'Cijena ponovne aktivacije: {{cost}} Coins',
        'service.summary': 'Dostupno igračima s besplatnim i Premium računom. Prva aktivacija košta {{activation}} Coins. Svaka sljedeća sezonska obnova ili reaktivacija košta {{renewal}} Coins. Premium članstvo ne ukida ove troškove usluge.',
        'service.eligibilityCosts': 'Uvjet: 30 stvarnih dana ili 60 dana u igri. Prva aktivacija: {{activation}} Coins. Obnova i reaktivacija: {{renewal}} Coins po sezoni.',
        'service.autoRenewHelp': 'Kada je uključeno, {{cost}} Coins bit će oduzeto na početku sljedeće sezone. Ako je stanje prenisko, obnova neće uspjeti i Razvojni tim prijeći će u način samo za čitanje.',
        'service.activationAccess': 'Pristup traje do kraja trenutačne sezone u igri. Automatska obnova zadano je uključena i možete je isključiti u bilo kojem trenutku.',
        'service.autoRenewModal': 'Automatska obnova bit će zadano uključena. Možete je isključiti u bilo kojem trenutku u Postavkama ili na stranici Premium i naplata.',
    },
}


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for part in parts[:-1]:
        node = node[part]
    node[parts[-1]] = value


def normalize_text(text: str) -> str:
    for old, new in PHRASES.items():
        text = text.replace(old, new)
    for pattern, replacement in REGEX:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    # General high-confidence Croatian orthography/lexicon.
    text = text.replace('sistem', 'sustav').replace('Sistem', 'Sustav')
    text = text.replace('region', 'regija').replace('Region', 'Regija')
    text = text.replace('period', 'razdoblje').replace('Period', 'Razdoblje')
    text = text.replace('linkom', 'poveznicom').replace('link', 'poveznica').replace('Link', 'Poveznica')
    text = text.replace('filterima', 'filtrima').replace('filteri', 'filtri').replace('filteru', 'filtru')
    text = text.replace('prodavac', 'prodavatelj').replace('Prodavac', 'Prodavatelj')
    text = text.replace('kupac', 'kupac')
    text = text.replace('cen', 'cijen') if False else text
    return text


def walk(value):
    if isinstance(value, dict):
        return {k: walk(v) for k, v in value.items()}
    if isinstance(value, list):
        return [walk(v) for v in value]
    if isinstance(value, str):
        return normalize_text(value)
    return value


for filename in FILES:
    path = ROOT / filename
    data = json.loads(path.read_text(encoding='utf-8'))
    data = walk(data)
    for dotted, value in EXACT_PATCHES.get(filename, {}).items():
        set_path(data, dotted, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Polished Croatian management namespace: {filename}')

print('Croatian management polish prepared for 6 namespaces.')
