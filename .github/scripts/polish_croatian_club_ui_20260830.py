from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')

PATCHES: dict[str, dict[str, str]] = {
    'developingTeam.json': {
        'page.unlockInPreferences': 'Najprije omogućite razvojni tim u Postavkama.',
    },
    'club.json': {
        'teamProfile.inactiveDescription': 'Ovaj tim trenutačno nije aktivan, ali ostaje u tablicama, povijesti utrka, rezultatima i kalendaru.',
        'identity.historyName': 'Povijesno/puno ime',
        'dashboardAccess.welcomeBodyTwo': 'Ime kluba, logo, dres, država i mjesto u natjecanju ostaju zadržani. Stari vozači pušteni su na tržište slobodnih vozača, a klub je spreman za novi početak.',
        'dashboardAccess.accessCheckFailed': 'Nije moguće provjeriti pristup klubu',
        'dashboardAccess.accessStatusFailed': 'Nije moguće provjeriti status pristupa klubu.',
        'history.totalHonoursHint': 'Spremljeni top-10 rezultati jednodnevnih utrka i etapa',
        'history.deferred': 'Postignuća u konačnom GC-u, bodovnoj, brdskoj i omladinskoj klasifikaciji bit će dodana kada se potvrdi njihov mjerodavni izvor spremljenih rezultata.',
    },
    'createClub.json': {
        'jersey.description': 'Odaberite jedan dres kako biste mogli izraditi tim. Kasnije ga možete promijeniti u opciji Prilagodi tim.',
        'patterns.customDescription': 'Dizajn grba primjenjuje se samo na automatski generirani grb tima.',
        'logo.description': 'Neobavezno. Prenesite logo ili unesite URL slike. Ako ništa ne odaberete, upotrijebit će se automatski generirani grb iznad.',
        'logo.applying': 'Primjena...',
    },
    'customizeTeam.json': {
        'identity.lockedPrefix': 'Vaš se tim ove sezone natječe kao',
        'identity.applying': 'Primjena...',
        'identity.colorsChanged': 'Boje tima promijenjene su u {{primary}} i {{secondary}}.',
        'logo.blocked': 'Ne možete primijeniti ili ukloniti logo dok nemate najmanje {{cost}} Coins.',
        'logo.notEnough': 'Nemate dovoljno Coins za promjenu logotipa tima. Ova promjena košta {{cost}} Coins, trenutačno imate {{balance}}, a nedostaje vam još {{missing}} Coins.',
        'logo.notEnoughOne': 'Nemate dovoljno Coins za promjenu logotipa tima. Ova promjena košta {{cost}} Coins, trenutačno imate {{balance}}, a nedostaje vam još {{missing}} Coins.',
        'logo.notEnoughRestore': 'Nemate dovoljno Coins za promjenu logotipa tima. Vraćanje generiranog grba također se računa kao promjena logotipa i košta {{cost}} Coins. Trenutačno imate {{balance}}; nedostaje vam još {{missing}} Coins.',
        'logo.notEnoughRestoreOne': 'Nemate dovoljno Coins za promjenu logotipa tima. Vraćanje generiranog grba također se računa kao promjena logotipa i košta {{cost}} Coins. Trenutačno imate {{balance}}; nedostaje vam još {{missing}} Coins.',
        'jersey.applying': 'Primjena...',
        'jersey.loadSavedFailed': 'Spremljeni dres nije se mogao učitati.',
        'jersey.loadSavedWithError': 'Spremljeni dres nije se mogao učitati: {{error}}',
        'jersey.ready': 'Nova slika dresa je spremna. Kliknite Primijeni dres kako biste je spremili.',
        'jersey.urlAccepted': 'URL dresa je prihvaćen. Kliknite Primijeni dres kako biste ga spremili.',
        'jersey.originalRestored': 'Izvorni dres tima vraćen je u pregled. Kliknite Primijeni dres kako biste ga spremili.',
        'jersey.defaultRestored': 'Zadani dres temeljen na bojama vraćen je u pregled. Kliknite Primijeni dres kako biste ga spremili.',
        'jersey.saveFailed': 'Dres nije bilo moguće spremiti.',
        'jersey.saveFailedWithError': 'Dres nije bilo moguće spremiti: {{error}}',
        'jersey.savedPaid': 'Dres je primijenjen i spremljen za {{cost}} Coins.',
        'jersey.savedFree': 'Dres je primijenjen i spremljen. Iskorištena je besplatna promjena dresa za ovu sezonu.',
        'kitDesigner.tableNotReady': 'Tablica timskih dresova još nije spremna. I dalje možete pregledati dres i pokušati ga spremiti.',
        'kitDesigner.saved': 'Dres je spremljen.',
        'kitDesigner.saveFailed': 'Dres nije bilo moguće spremiti.',
    },
    'accountPages.json': {
        'profile.birthdayHelp': 'Rođendanske nagrade postavljaju se tijekom registracije i kasnije se ne mogu mijenjati. Na rođendan dobivate 10 Coins.',
        'profile.sendPasswordEmail': 'Pošalji e-mail za promjenu lozinke',
        'profile.passwordHelp': 'Nakon otvaranja poveznice iz e-maila moći ćete odabrati novu lozinku na stranici za ponovno postavljanje.',
        'profile.saved': 'Profil je uspješno spremljen.',
        'profile.savedEmail': 'Profil je spremljen. Ako je potvrda e-maila uključena, potvrdite novu e-mail adresu.',
        'profile.saveFailed': 'Profil nije bilo moguće spremiti.',
        'profile.resetSent': 'E-mail za ponovno postavljanje lozinke poslan je na {{email}}. Provjerite ulaznu poštu i mapu neželjene pošte, zatim slijedite poveznicu kako biste odabrali novu lozinku.',
        'profile.languageSaveFailed': 'Jezik igre nije bilo moguće spremiti. Pokušajte ponovno.',
    },
    'help.json': {
        'first.s4Text': 'Koristite Kalendar i Pripremu utrke kako biste se prijavili na utrke, poslali Race Plan, odabrali vozače i izradili taktiku za etape.',
        'manual.squadText': 'Upravljajte vozačima, otvarajte profile vozača, uspoređujte vještine, provjeravajte ugovore, pratite Razvojni tim i pristupajte informacijama o osoblju.',
        'manual.trainingText': 'Upravljajte redovitim treningom vozača, zadanim postavkama momčadi, individualnim fokusom, intenzitetom, danima odmora i trening kampovima.',
        'manual.equipmentText': 'Upravljajte postavkama za utrku, inventarom, kupnjom na tržištu i zalihama za utrke. Bolja oprema i zalihe mogu poboljšati učinak i zaštititi vozače u zahtjevnim uvjetima.',
        'manual.statisticsText': 'Uspoređujte timove i vozače prema međunarodnim bodovima, pobjedama, postoljima, dresovima, povijesti i učinku u tekućoj sezoni.',
        'faq.a8': 'Oprema može poboljšati učinak kroz postavke za utrku i bonuse predmeta. Zalihe za utrku mogu zaštititi vozače od teškog vremena ili zahtjevnih uvjeta.',
        'faq.a17': 'Obavijesti upozoravaju na važne rokove i događaje kao što su priprema utrke, novosti sponzora, financije, transferi i druge radnje u igri koje zahtijevaju pažnju.',
    },
}


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for key in parts[:-1]:
        node = node[key]
    if parts[-1] not in node:
        raise KeyError(f'Missing Croatian key: {dotted}')
    node[parts[-1]] = value


for filename, patches in PATCHES.items():
    path = ROOT / filename
    data = json.loads(path.read_text(encoding='utf-8'))
    for dotted, value in patches.items():
        set_path(data, dotted, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{filename}: polished {len(patches)} strings')

print(f'Croatian club/account UI polish prepared: {sum(len(v) for v in PATCHES.values())} strings.')
