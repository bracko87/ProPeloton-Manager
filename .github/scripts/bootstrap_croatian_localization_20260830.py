from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('.')
I18N = ROOT / 'src/i18n'
SRC = I18N / 'locales/sr-Latn'
EN = I18N / 'locales/en'
DST = I18N / 'locales/hr'

# Serbian Latin is the safest seed for Croatian because the two packages share
# grammar, placeholders and almost all game terminology. These replacements
# deliberately target Serbian-specific vocabulary/orthography while leaving
# protected game terms (Race Plan, Stage Plans, Startlist, Race Engine, etc.)
# untouched.
REPLACEMENTS: list[tuple[str, str]] = [
    ('prijemno sanduče', 'ulaznu poštu'),
    ('neželjene pošte', 'neželjene pošte'),
    ('multiplayer svetu', 'multiplayer svijetu'),
    ('razvojni tim', 'razvojni tim'),
    ('vremenski uslovi', 'vremenski uvjeti'),
    ('uslovi korišćenja', 'uvjeti korištenja'),
    ('opšti uslovi', 'opći uvjeti'),
    ('početna strana', 'početna stranica'),
    ('lični podaci', 'osobni podaci'),
    ('lične podatke', 'osobne podatke'),
    ('ličnih podataka', 'osobnih podataka'),
    ('sledećeg meseca', 'sljedećeg mjeseca'),
    ('sledeće nedelje', 'sljedećeg tjedna'),
    ('ove nedelje', 'ovog tjedna'),
    ('prošle nedelje', 'prošlog tjedna'),
    ('svake nedelje', 'svakog tjedna'),
    ('nedeljno', 'tjedno'),
    ('nedeljni', 'tjedni'),
    ('nedeljna', 'tjedna'),
    ('nedeljne', 'tjedne'),
    ('mesečno', 'mjesečno'),
    ('mesečni', 'mjesečni'),
    ('mesečna', 'mjesečna'),
    ('mesečne', 'mjesečne'),
    ('podešavanja', 'postavke'),
    ('podešavanje', 'postavka'),
    ('obaveštenjima', 'obavijestima'),
    ('obaveštenja', 'obavijesti'),
    ('obaveštenje', 'obavijest'),
    ('obavešten', 'obaviješten'),
    ('takmičenjima', 'natjecanjima'),
    ('takmičenja', 'natjecanja'),
    ('takmičenje', 'natjecanje'),
    ('takmičarski', 'natjecateljski'),
    ('takmičarska', 'natjecateljska'),
    ('takmičarske', 'natjecateljske'),
    ('takmičarsko', 'natjecateljsko'),
    ('učestvovanje', 'sudjelovanje'),
    ('učestvovati', 'sudjelovati'),
    ('učestvuju', 'sudjeluju'),
    ('učestvuje', 'sudjeluje'),
    ('učesnicima', 'sudionicima'),
    ('učesnici', 'sudionici'),
    ('učesnika', 'sudionika'),
    ('učesnik', 'sudionik'),
    ('učešće', 'sudjelovanje'),
    ('uslovima', 'uvjetima'),
    ('uslovi', 'uvjeti'),
    ('uslova', 'uvjeta'),
    ('uslov', 'uvjet'),
    ('vrednostima', 'vrijednostima'),
    ('vrednosti', 'vrijednosti'),
    ('vrednost', 'vrijednost'),
    ('vremenu', 'vremenu'),
    ('vreme', 'vrijeme'),
    ('mestima', 'mjestima'),
    ('mestu', 'mjestu'),
    ('mesta', 'mjesta'),
    ('mesto', 'mjesto'),
    ('sledećeg', 'sljedećeg'),
    ('sledećem', 'sljedećem'),
    ('sledećih', 'sljedećih'),
    ('sledeći', 'sljedeći'),
    ('sledeća', 'sljedeća'),
    ('sledeće', 'sljedeće'),
    ('izveštajima', 'izvještajima'),
    ('izveštaji', 'izvještaji'),
    ('izveštaja', 'izvještaja'),
    ('izveštaj', 'izvještaj'),
    ('neuspešno', 'neuspješno'),
    ('neuspeh', 'neuspjeh'),
    ('uspešnosti', 'uspješnosti'),
    ('uspešno', 'uspješno'),
    ('uspešna', 'uspješna'),
    ('uspešan', 'uspješan'),
    ('uspeh', 'uspjeh'),
    ('platama', 'plaćama'),
    ('plate', 'plaće'),
    ('platu', 'plaću'),
    ('plata', 'plaća'),
    ('povređenima', 'ozlijeđenima'),
    ('povređeni', 'ozlijeđeni'),
    ('povređena', 'ozlijeđena'),
    ('povređen', 'ozlijeđen'),
    ('povredama', 'ozljedama'),
    ('povrede', 'ozljede'),
    ('povreda', 'ozljeda'),
    ('savetnicima', 'savjetnicima'),
    ('savetnika', 'savjetnika'),
    ('savetnici', 'savjetnici'),
    ('savetnik', 'savjetnik'),
    ('saveta', 'savjeta'),
    ('savet', 'savjet'),
    ('ličnih', 'osobnih'),
    ('ličnim', 'osobnim'),
    ('lični', 'osobni'),
    ('lična', 'osobna'),
    ('lične', 'osobne'),
    ('lično', 'osobno'),
    ('bezbednosti', 'sigurnosti'),
    ('bezbednost', 'sigurnost'),
    ('bezbedan', 'siguran'),
    ('bezbedna', 'sigurna'),
    ('bezbedno', 'sigurno'),
    ('promenama', 'promjenama'),
    ('promenite', 'promijenite'),
    ('promenjena', 'promijenjena'),
    ('promenjeno', 'promijenjeno'),
    ('promenjen', 'promijenjen'),
    ('promene', 'promjene'),
    ('promena', 'promjena'),
    ('promeni', 'promijeni'),
    ('proveravamo', 'provjeravamo'),
    ('proverite', 'provjerite'),
    ('proverena', 'provjerena'),
    ('provereno', 'provjereno'),
    ('proveren', 'provjeren'),
    ('provere', 'provjere'),
    ('provera', 'provjera'),
    ('proveri', 'provjeri'),
    ('odeljcima', 'odjeljcima'),
    ('odeljci', 'odjeljci'),
    ('odeljka', 'odjeljka'),
    ('odeljak', 'odjeljak'),
    ('izaberite', 'odaberite'),
    ('izabrani', 'odabrani'),
    ('izabrana', 'odabrana'),
    ('izabrano', 'odabrano'),
    ('izabrane', 'odabrane'),
    ('izaberi', 'odaberi'),
    ('izbor', 'odabir'),
    ('dugmeta', 'gumba'),
    ('dugme', 'gumb'),
    ('ocenama', 'ocjenama'),
    ('ocenite', 'ocijenite'),
    ('ocene', 'ocjene'),
    ('ocena', 'ocjena'),
    ('prosečna', 'prosječna'),
    ('prosečni', 'prosječni'),
    ('prosečno', 'prosječno'),
    ('prosečne', 'prosječne'),
    ('prosek', 'prosjek'),
    ('verovatnoća', 'vjerojatnost'),
    ('verovatno', 'vjerojatno'),
    ('hiljada', 'tisuća'),
    ('hiljade', 'tisuće'),
    ('miliona', 'milijuna'),
    ('milion', 'milijun'),
    ('točkova', 'kotača'),
    ('točkovi', 'kotači'),
    ('točak', 'kotač'),
    ('menjača', 'mjenjača'),
    ('menjač', 'mjenjač'),
    ('mesecima', 'mjesecima'),
    ('meseca', 'mjeseca'),
    ('meseci', 'mjeseci'),
    ('mesec', 'mjesec'),
    ('istorijskim', 'povijesnim'),
    ('istorijskog', 'povijesnog'),
    ('istorijske', 'povijesne'),
    ('istorijska', 'povijesna'),
    ('istorijski', 'povijesni'),
    ('istorije', 'povijesti'),
    ('istorija', 'povijest'),
    ('delovima', 'dijelovima'),
    ('delovi', 'dijelovi'),
    ('dodeljeno', 'dodijeljeno'),
    ('dodeljena', 'dodijeljena'),
    ('dodeliti', 'dodijeliti'),
    ('dodela', 'dodjela'),
    ('podelite', 'podijelite'),
    ('podela', 'podjela'),
    ('primenite', 'primijenite'),
    ('primenjeno', 'primijenjeno'),
    ('primenjen', 'primijenjen'),
    ('primeni', 'primijeni'),
    ('zamena', 'zamjena'),
    ('zameni', 'zamijeni'),
    ('predlozi', 'prijedlozi'),
    ('predloga', 'prijedloga'),
    ('predlog', 'prijedlog'),
    ('rešenjima', 'rješenjima'),
    ('rešenja', 'rješenja'),
    ('rešenje', 'rješenje'),
    ('zahtevima', 'zahtjevima'),
    ('zahtevi', 'zahtjevi'),
    ('zahteva', 'zahtjeva'),
    ('zahtev', 'zahtjev'),
    ('prevodi', 'prijevodi'),
    ('prevod', 'prijevod'),
    ('prenosa', 'prijenosa'),
    ('prenos', 'prijenos'),
    ('poslednjih', 'posljednjih'),
    ('poslednji', 'posljednji'),
    ('poslednja', 'posljednja'),
    ('poslednje', 'posljednje'),
    ('lekara', 'liječnika'),
    ('lekar', 'liječnik'),
    ('odeća', 'odjeća'),
    ('bedž', 'značka'),
    ('fajlove', 'datoteke'),
    ('fajla', 'datoteke'),
    ('fajl', 'datoteka'),
    ('sačuvajte', 'spremite'),
    ('sačuvano', 'spremljeno'),
    ('sačuvaj', 'spremi'),
    ('čuvanje', 'spremanje'),
    ('veštinama', 'vještinama'),
    ('veštine', 'vještine'),
    ('veština', 'vještina'),
    ('trkačkog', 'natjecateljskog'),
    ('trkačke', 'natjecateljske'),
    ('trkačka', 'natjecateljska'),
    ('trkačko', 'natjecateljsko'),
    ('trkački', 'natjecateljski'),
    ('trkama', 'utrkama'),
    ('trkom', 'utrkom'),
    ('trke', 'utrke'),
    ('trku', 'utrku'),
    ('trci', 'utrci'),
    ('trka', 'utrka'),
    ('nalogom', 'računom'),
    ('nalozima', 'računima'),
    ('naloga', 'računa'),
    ('nalogu', 'računu'),
    ('nalozi', 'računi'),
    ('nalog', 'račun'),
    ('svetu', 'svijetu'),
    ('sveta', 'svijeta'),
    ('svet', 'svijet'),
    ('ponovo', 'ponovno'),
    ('tačno', 'točno'),
    ('tačna', 'točna'),
    ('tačni', 'točni'),
    ('uputstva', 'upute'),
    ('uputstvo', 'uputa'),
    ('juče', 'jučer'),
    ('ponedeljak', 'ponedjeljak'),
    ('sreda', 'srijeda'),
    ('novčićima', 'Coins'),
    ('novčića', 'Coins'),
    ('novčiće', 'Coins'),
    ('novčići', 'Coins'),
    ('novčić', 'Coins'),
    ('januar', 'siječanj'),
    ('februar', 'veljača'),
    ('mart', 'ožujak'),
    ('april', 'travanj'),
    ('maj', 'svibanj'),
    ('jun', 'lipanj'),
    ('jul', 'srpanj'),
    ('avgust', 'kolovoz'),
    ('septembar', 'rujan'),
    ('oktobar', 'listopad'),
    ('novembar', 'studeni'),
    ('decembar', 'prosinac'),
]


def preserve_case(source: str, replacement: str) -> str:
    if source.isupper():
        return replacement.upper()
    if source[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def transform_text(text: str) -> str:
    out = text
    for source, replacement in sorted(REPLACEMENTS, key=lambda item: len(item[0]), reverse=True):
        pattern = re.compile(r'(?<!\w)' + re.escape(source) + r'(?!\w)', re.IGNORECASE)
        out = pattern.sub(lambda m: preserve_case(m.group(0), replacement), out)
    return out


def transform_value(value):
    if isinstance(value, dict):
        return {key: transform_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [transform_value(item) for item in value]
    if isinstance(value, str):
        return transform_text(value)
    return value


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for key in parts[:-1]:
        node = node[key]
    node[parts[-1]] = value


# Explicit high-visibility overrides. These are reviewed Croatian strings rather
# than mechanical conversions and form the first human-quality checkpoint.
OVERRIDES: dict[str, dict[str, str]] = {
    'common.json': {
        'language.description': 'Odaberite jezik koji će se koristiti u ProPeloton Manageru.',
        'actions.save': 'Spremi',
        'actions.cancel': 'Odustani',
        'actions.close': 'Zatvori',
        'actions.continue': 'Nastavi',
        'actions.confirm': 'Potvrdi',
        'actions.back': 'Natrag',
        'actions.skipTutorial': 'Preskoči tutorijal',
        'forum.movingTitle': 'Rasprave zajednice sele se na Discord',
        'forum.movingText': 'Na ovoj stranici neće biti foruma unutar igre. Svi razgovori o igri, priručnici, pitanja i rasprave zajednice bit će dostupni na našem Discord kanalu.',
        'forum.joinHint': 'Pridružite se našem Discord serveru pomoću gumba ispod.',
        'forum.joinText': 'Razgovarajte s drugim igračima, postavljajte pitanja, potražite pomoć u priručnicima i pratite najnovije obavijesti zajednice.',
    },
    'auth.json': {
        'signInTitle': 'Prijavite se u ProPeloton Manager',
        'signInSubtitle': 'Unesite svoje podatke za nastavak.',
        'createAccount': 'Izradi račun',
        'home': 'Početna',
        'checkingSession': 'Provjera vaše sesije...',
        'errors.missingCredentials': 'Unesite e-mail i lozinku',
        'errors.signInFailed': 'Prijava nije uspjela',
        'errors.clubStatus': 'Prijavljeni ste, ali trenutačno ne možemo provjeriti status vašeg kluba. Pokušajte ponovno za trenutak.',
        'info.passwordResetSuccess': 'Lozinka je uspješno promijenjena. Prijavite se novom lozinkom.',
        'info.accountUnconfirmed': 'Račun postoji, ali još nije potvrđen. Provjerite svoj e-mail.',
        'register.title': 'Izradite račun menadžera',
        'register.subtitle': 'Pridružite se multiplayer svijetu igre ProPeloton Manager.',
        'register.emailAddress': 'E-mail adresa',
        'register.checkingEmail': 'Provjera dostupnosti e-mail adrese...',
        'register.resendActivation': 'Ponovno pošalji aktivacijski e-mail',
        'register.resendingActivation': 'Ponovno slanje aktivacijskog e-maila...',
        'register.resendHelp': 'Upotrijebite ovo ako ste se već registrirali, ali niste primili ili ste izgubili aktivacijski e-mail.',
        'register.strongPassword': 'Odaberite snažnu lozinku',
        'register.confirmPassword': 'Potvrdite lozinku',
        'register.repeatPassword': 'Ponovite lozinku',
        'register.birthdayHelp': 'Vaš rođendan koristi se za rođendanske nagrade. Poslat ćemo vam rođendansku čestitku i dodati 10 Coins na račun. Rođendan se može unijeti samo jednom tijekom registracije i poslije se ne može mijenjati u igri.',
        'register.month': 'Mjesec',
        'register.selectMonth': 'Odaberite mjesec',
        'register.yearOptional': 'Godina nije obavezna',
        'register.createAccount': 'Izradi račun',
        'register.alreadyHave': 'Već imate račun? Prijavite se',
        'register.validEmail': 'Unesite ispravnu e-mail adresu',
        'register.birthdayMonthRequired': 'Mjesec rođenja je obavezan',
        'register.enterEmailFirst': 'Najprije unesite e-mail adresu',
        'register.emailInUse': 'Ova e-mail adresa već se koristi. Prijavite se ili upotrijebite drugu e-mail adresu.',
        'register.emailAlreadyRegistered': 'E-mail adresa već je registrirana',
        'register.signupFailed': 'Registracija nije uspjela',
        'register.verifyEmailFailed': 'Nismo mogli provjeriti koristi li se ova e-mail adresa već. Pokušajte ponovno.',
        'register.alreadyConfirmed': 'Ova e-mail adresa već je potvrđena. Prijavite se i nastavite na izradu tima.',
        'register.activationSent': 'Novi aktivacijski e-mail je poslan. Otvorite najnoviji e-mail i upotrijebite aktivacijsku poveznicu za nastavak.',
        'register.activationFailed': 'Aktivacijski e-mail nije se mogao ponovno poslati',
        'register.accountCreatedConfirm': 'Račun je izrađen. Potvrdite e-mail prije prijave. Ako aktivacijski e-mail ne stigne, upotrijebite opciju "Ponovno pošalji aktivacijski e-mail" ispod.',
        'forgot.subtitle': 'Unesite e-mail svojeg računa i poslat ćemo vam upute za ponovno postavljanje lozinke.',
        'forgot.emailRequired': 'Unesite svoju e-mail adresu.',
        'forgot.validEmail': 'Unesite ispravnu e-mail adresu.',
        'forgot.networkError': 'Nismo se mogli povezati sa serverom. Provjerite internetsku vezu i pokušajte ponovno.',
        'forgot.sent': 'Ako račun s ovom e-mail adresom postoji, poslali smo upute za ponovno postavljanje lozinke. Provjerite ulaznu poštu i mapu neželjene pošte.',
        'forgot.sending': 'Slanje poveznice za ponovno postavljanje...',
        'forgot.send': 'Pošalji poveznicu za ponovno postavljanje',
        'forgot.backToSignIn': 'Natrag na prijavu',
        'reset.title': 'Postavite novu lozinku',
        'reset.subtitle': 'Odaberite snažnu lozinku koju ne koristite nigdje drugdje.',
        'reset.verifying': 'Provjera poveznice za ponovno postavljanje...',
        'reset.newPasswordPlaceholder': 'Unesite novu lozinku',
        'reset.confirmPassword': 'Potvrdite novu lozinku',
        'reset.confirmPlaceholder': 'Ponovite novu lozinku',
        'reset.update': 'Promijeni lozinku',
        'reset.requestNew': 'Zatraži novu poveznicu za ponovno postavljanje',
        'reset.backToSignIn': 'Natrag na prijavu',
    },
    'calendar.json': {
        'weekdays.Sunday': 'Nedjelja',
        'weekdays.Monday': 'Ponedjeljak',
        'weekdays.Tuesday': 'Utorak',
        'weekdays.Wednesday': 'Srijeda',
        'weekdays.Thursday': 'Četvrtak',
        'weekdays.Friday': 'Petak',
        'weekdays.Saturday': 'Subota',
        'months.January': 'Siječanj',
        'months.February': 'Veljača',
        'months.March': 'Ožujak',
        'months.April': 'Travanj',
        'months.May': 'Svibanj',
        'months.June': 'Lipanj',
        'months.July': 'Srpanj',
        'months.August': 'Kolovoz',
        'months.September': 'Rujan',
        'months.October': 'Listopad',
        'months.November': 'Studeni',
        'months.December': 'Prosinac',
    },
}

# Croatian month names in auth are keyed in lowercase English.
AUTH_MONTHS = {
    'january': 'Siječanj', 'february': 'Veljača', 'march': 'Ožujak',
    'april': 'Travanj', 'may': 'Svibanj', 'june': 'Lipanj',
    'july': 'Srpanj', 'august': 'Kolovoz', 'september': 'Rujan',
    'october': 'Listopad', 'november': 'Studeni', 'december': 'Prosinac',
}

DST.mkdir(parents=True, exist_ok=True)
source_files = sorted(SRC.glob('*.json'))
if not source_files:
    raise SystemExit('No Serbian Latin locale files found.')

for source in source_files:
    data = json.loads(source.read_text(encoding='utf-8'))
    data = transform_value(data)
    for dotted, value in OVERRIDES.get(source.name, {}).items():
        set_path(data, dotted, value)
    if source.name == 'auth.json':
        for key, value in AUTH_MONTHS.items():
            data['months'][key] = value
    (DST / source.name).write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )

# Wire Croatian into the supported language registry.
languages_path = I18N / 'languages.ts'
languages = languages_path.read_text(encoding='utf-8')
if "code: 'hr'" not in languages:
    croatian = """  {
    code: 'hr',
    label: 'Hrvatski',
    shortLabel: 'HR',
    flag: '🇭🇷',
    countryCode: 'HR',
    htmlLang: 'hr',
    locale: 'hr-HR',
  },
"""
    languages = languages.replace('\n] as const', '\n' + croatian + '] as const', 1)
    languages_path.write_text(languages, encoding='utf-8')

# Wire the Croatian resource imports and resource object into i18next.
index_path = I18N / 'index.ts'
index = index_path.read_text(encoding='utf-8')
namespace_imports = re.findall(r"import de([A-Za-z0-9_]+) from './locales/de/([^']+)'", index)
if not namespace_imports:
    raise SystemExit('Could not discover German namespace imports in i18n index.')
if "./locales/hr/" not in index:
    hr_imports = '\n'.join(
        f"import hr{symbol} from './locales/hr/{filename}'"
        for symbol, filename in namespace_imports
    )
    index = index.replace('\nimport {\n  DEFAULT_LANGUAGE,', '\n' + hr_imports + '\n\nimport {\n  DEFAULT_LANGUAGE,', 1)

if '\n  hr: {' not in index:
    hr_block = ['  hr: {']
    for symbol, filename in namespace_imports:
        namespace = filename.removesuffix('.json')
        hr_block.append(f'    {namespace}: hr{symbol},')
    hr_block.append('  },')
    block = '\n'.join(hr_block)
    index = index.replace('\n} as const\n\nconst initialLanguage', '\n' + block + '\n} as const\n\nconst initialLanguage', 1)

index = index.replace("supportedLngs: ['en', 'sr-Latn', 'de'],", "supportedLngs: ['en', 'sr-Latn', 'de', 'hr'],")
index_path.write_text(index, encoding='utf-8')

selector_path = ROOT / 'src/components/i18n/LanguageSelector.tsx'
selector = selector_path.read_text(encoding='utf-8')
if "  hr: 'hr'," not in selector:
    selector = selector.replace("  de: 'de',\n", "  de: 'de',\n  hr: 'hr',\n", 1)
    selector_path.write_text(selector, encoding='utf-8')

bridge_path = ROOT / 'src/components/i18n/LocaleDateFormattingBridge.tsx'
bridge = bridge_path.read_text(encoding='utf-8')
if "startsWith('hr')" not in bridge:
    bridge = bridge.replace(
        "  if (language?.startsWith('de')) return 'de-DE'\n",
        "  if (language?.startsWith('de')) return 'de-DE'\n  if (language?.startsWith('hr')) return 'hr-HR'\n",
        1,
    )
    bridge_path.write_text(bridge, encoding='utf-8')

print(f'Prepared {len(source_files)} Croatian locale files and wired hr/hr-HR into the application.')
