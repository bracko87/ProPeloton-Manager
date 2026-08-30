from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')

PATCHES: dict[str, dict[str, str]] = {
    'appShell.json': {
        'restartWelcome.body2': 'Ime kluba, logo, dres, država i mjesto u natjecanju ostaju sačuvani. Stari vozači postali su slobodni igrači, a klub je spreman za novi početak.',
        'liquidation.accountNotice': 'Vaš korisnički račun i Coins i dalje su aktivni. Zatvoren je samo ovaj klub. Možete izraditi potpuno novi klub na sljedećem dostupnom slobodnom mjestu ili ponovno pokrenuti ovaj tim na istom mjestu u natjecanju s novim sastavom, bez osoblja i s 0 bodova.',
        'restartModal.intro': 'Ponovno pokretanje tima zadržava identitet kluba i mjesto u natjecanju, ali vraća sportsko i igračko stanje tima na početne vrijednosti.',
        'restartModal.keepCompetition': 'Trenutnu razinu/diviziju/mjesto u natjecanju',
        'restartModal.loseNotifications': 'Obavijesti i vidljivu povijest',
        'rollover.body': 'Prijelaz između sezona trenutačno je u tijeku. Podaci vašeg kluba i igre sigurni su dok se nova sezona završno priprema.',
        'rollover.autoCheck': 'Ova stranica automatski provjerava stanje prijelaza svakih 20 sekundi i vraća vas u igru čim postupak završi.',
        'rollover.phases.rewardsApplied': 'Sezonske nagrade su primijenjene',
    },
    'auth.json': {
        'register.clubStatusFailed': 'Vaš račun je izrađen i prijavljeni ste, ali trenutačno ne možemo provjeriti status kluba. Pokušajte ponovno uskoro.',
        'reset.updateFailed': 'Nismo mogli promijeniti lozinku. Poveznica za ponovno postavljanje možda nije valjana ili je istekla. Zatražite novi e-mail za ponovno postavljanje i pokušajte ponovno.',
    },
    'calendarPage.json': {
        'weather.mixed': 'Promjenjivi uvjeti',
        'filters.showing': 'Prikazano {{shown}} od {{total}} utrka u mjesecu {{month}}',
        'tutorial.welcomeBody': 'Možemo vam pokazati kako funkcionira Kalendar, uključujući dnevne aktivnosti tima, mjesece utrka, ciljeve sponzora i profile utrka.',
    },
    'home.json': {
        'hero.description': 'ProPeloton Manager je online igra upravljanja biciklističkim timom u kojoj stvarate svoj klub, razvijate vozače, planirate kalendar utrka, pregovarate o transferima i natječete se protiv pravih menadžera u sezonskom biciklističkom svijetu.',
        'guide.howText': 'Menadžeri sastavljaju momčad, proučavaju kalendar utrka, prijavljuju se za odgovarajuće utrke, pripremaju Race Plan, biraju vozače, dodjeljuju uloge, upravljaju zalihama i prate rezultate. Dobre odluke ovise o sposobnostima vozača, umoru, moralu, profilu utrke, vremenu, budžetu i ciljevima sezone.',
        'guide.preparationText': 'Snažan vozač sam po sebi nije dovoljan. Priprema utrke povezuje vozače, osoblje, vozila, opremu, zalihe i taktiku. Planiranje unaprijed pomaže timu da bude spreman za sprintove, uspone, kronometre, etapne utrke i zahtjevne vremenske uvjete.',
        'reviews.leaveReview': 'Ostavite ocjenu',
        'reviews.addReview': 'Dodajte ocjenu',
        'reviews.addFirst': 'Dodajte prvu ocjenu',
        'reviews.privacyNote': 'Ocjene se provjeravaju prije javnog prikazivanja. Nemojte unositi lozinke, podatke platnih kartica ili privatne podatke računa.',
        'reviews.submit': 'Pošalji ocjenu',
        'reviews.ratingInvalid': 'Odaberite ocjenu od 1 do 5.',
        'cta.badge': 'Pridružite se natjecanju',
        'cta.body': 'Izradite klub, dovedite vozače i natječite se u sezonskim ligama.',
        'footer.connectText': 'Pitanja, zahtjeve za podršku i povratne informacije možete poslati putem stranice Kontakt ili e-mailom.',
    },
    'overview.json': {
        'staffBriefing.title': 'Centar za izvještaje osoblja',
        'staffBriefing.subtitle': 'Dodijelite članove osoblja kao opcionalne savjetnike za dodatne analize i izvještaje.',
        'staffBriefing.infoTitle': 'Što dobivam sa savjetnikom?',
        'staffBriefing.infoIntro': 'Zapošljavanje osoblja i kupnja usluge Staff Advisory odvojene su stvari. Vaši zaposlenici nastavljaju obavljati svoje uobičajene poslove i bez usluge Staff Advisory. Opcija od 5 Coins dodaje proaktivnu analizu i izvještaje specifične za ulogu tijekom jednog mjeseca u igri.',
        'staffBriefing.withText': 'Odabrani zaposlenik postaje vaš savjetnik za tu ulogu. Pristup savjetniku dodaje proaktivne analitičke izvještaje i obavijesti dostupne samo uz savjetnika. Ti izvještaji tumače informacije koje već imate; ne otkrivaju skrivene atribute, ne mijenjaju izračun utrke, ne poboljšavaju statistike vozača i ne zamjenjuju besplatna upozorenja.',
        'staffBriefing.noAdvisor': 'Savjetnik nije dodijeljen',
        'staffBriefing.assignAdvisor': 'Dodijeli savjetnika',
        'staffBriefing.assign': 'Dodijeli savjetnika',
        'staffBriefing.hireRole': 'Zaposlite odgovarajućeg člana osoblja za ulogu {{role}} na stranici Osoblje prije dodjeljivanja savjetnika.',
        'staffBriefing.assignForCoins': 'Dodijeli za {{count}} Coins',
        'races.lastSubtitle': 'Posljednja završena utrka u kojoj je sudjelovala prva ili razvojna momčad.',
        'honours.premiumDescription': 'Otključajte praktičan povijesni pregled pet najvećih rezultata u povijesti kluba.',
        'honours.subtitle': 'Pet najvećih rezultata ostvarenih u povijesti kluba.',
        'honours.viewAllAria': 'Otvori cijelu povijest kluba',
        'honours.none': 'Još nema dostupnih povijesnih uspjeha.',
        'seasonSnapshot.subtitle': 'Rezultati tekuće sezone, bodovi, postolja, dresovi i opseg nastupa na utrkama.',
    },
    'squad.json': {
        'nav.unlockDeveloping': 'Najprije otključajte Razvojni tim u Postavkama.',
        'roster.advancedPremium': 'Napredni prikazi momčadi zahtijevaju Premium.',
        'status.average': 'Prosječan',
    },
}


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for key in parts[:-1]:
        if key not in node:
            raise KeyError(f'Missing key {dotted!r}')
        node = node[key]
    if parts[-1] not in node:
        raise KeyError(f'Missing key {dotted!r}')
    node[parts[-1]] = value


for filename, patch in PATCHES.items():
    path = ROOT / filename
    data = json.loads(path.read_text(encoding='utf-8'))
    for dotted, value in patch.items():
        set_path(data, dotted, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{filename}: polished {len(patch)} strings')

print(f'Croatian core polish prepared: {sum(len(v) for v in PATCHES.values())} strings.')
