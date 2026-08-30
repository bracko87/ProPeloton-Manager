from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')
PATCHES: dict[str, dict[str, str]] = {
    'scouting.json': {
        'skills.timeTrial': 'Kronometar',
    },
    'statistics.json': {
        'teams.noTitlesDescription': 'Kada prethodni pobjednici budu spremljeni, ovdje će se prikazati tablica naslova.',
        'teams.noHistoryDescription': 'Igra je trenutačno u Sezoni 1, pa još nema završenih povijesnih sezona za prikaz.',
        'riders.mostPodiums': 'Najviše postolja',
        'riders.averageOverall': 'Prosječan overall',
        'riders.averageFatigue': 'Prosječan umor',
        'riders.noFinanceData': 'Nema financijskih podataka vozača',
        'roles.timeTrialist': 'Kronometraš',
        'roles.tt': 'Kronometraš',
        'tutorial.welcomeBody': 'Možemo vam pokazati kako funkcioniraju statistike timova i vozača, uključujući poretke trenutačne sezone, povijesne rezultate, bodove vozača, postolja i dresove.',
        'tutorial.ridersBody': 'Odjeljak Vozači prikazuje najbolje vozače biciklističkog svijeta.\n\nMožete uspoređivati vozače prema međunarodnim bodovima, bodovima za plasmane na etapama, bodovima za generalni plasman i bodovima jednodnevnih utrka. Možete vidjeti i vozače s najviše postolja i osvojenih dresova.\n\nOva stranica pomaže vam vidjeti koji vozači dominiraju sezonom i koje bi vozače moglo biti zanimljivo pratiti, skautirati ili potpisati.\n\nNakon Statistike, sljedeća preporučena stranica su Transferi.',
    },
    'teamRanking.json': {
        'tutorial.competitionsBody': 'Ovo je stranica Rangiranje timova.\n\nOvdje možete vidjeti poretke svih natjecanja i rangova, uključujući WorldTeam, ProTeam, Continental i Amateur divizije.\n\nSvaki tim zauzima mjesto u svojem natjecanju prema međunarodnim bodovima osvojenima tijekom sezone. Možete mijenjati rangove i divizije kako biste vidjeli poredak timova u cijelom biciklističkom svijetu.',
        'tutorial.pointsBody': 'Timovi osvajaju međunarodne bodove na utrkama. Bolji rezultati na većim utrkama obično donose više bodova.\n\nTi bodovi određuju mjesto svakog tima u njegovu natjecanju. Na kraju sezone timovi mogu napredovati u viši rang ili ispasti u niži, ovisno o konačnoj poziciji.\n\nOva stranica važna je jer pokazuje gdje se vaš tim nalazi u odnosu na druge timove i što morate ostvariti kako biste napredovali.\n\nNakon Rangiranja timova, sljedeća preporučena stranica je Statistika.',
    },
    'staff.json': {
        'rolesSection.noAssigned': 'Nema dodijeljenih: {{role}}',
        'assignment.notAssigned': 'Trenutačno nije dodijeljen',
        'analysis.averageSkillProfile': 'Prosječan profil vještina',
        'analysis.averageSkillProfileSubtitle': 'Prosječne vrijednosti osoblja trenutačno dodijeljenog ovoj grupi utjecaja.',
        'analysis.noStaff': 'Još nema osoblja dodijeljenog ovoj grupi utjecaja, pa nema aktivnog profila vještina za prikaz.',
        'analysis.recentCourseResultsSubtitle': 'Završeni tečajevi razvoja osoblja i primijenjena poboljšanja atributa.',
        'detail.lastCourseGains': 'Poboljšanja posljednjeg tečaja',
        'course.liveStartText': 'Pokretanjem tečaja stvara se stvarni zapis tečaja za osoblje. Poboljšanja atributa primjenjuju se kada pozadinski proces završi tečaj. Tečaj se ne može otkazati nakon rezervacije. Bonusi ove uloge pauzirani su dok tečaj ne završi.',
        'impactI18n.combinedCoach': 'Trenerski učinak koji sustav primjenjuje preko člana osoblja {{name}}.',
        'scoutingExplainer.body': 'Atributi skauta određuju njegovu stvarnu sposobnost. Razina Skauting ureda može ograničiti konačnu kvalitetu izvještaja, pa čak i vrlo dobar skaut može izrađivati samo osnovne izvještaje dok se ured ne nadogradi.',
        'courseOptions.mechanic_tt_setup.title': 'Tečaj postavki za kronometar',
        'courseOptions.mechanic_weather_adaptation.description': 'Usredotočuje se na tehničku podršku u mokrim i promjenjivim uvjetima.',
    },
    'proPackages.json': {
        'page.refresh': 'Osvježi',
        'premium.marketTools': 'Spremljene pretrage, upozorenja s tržišta, uži odabir vozača i dublje analize.',
        'premium.confirming': 'Plaćanje je završeno. Potvrđujemo Premium pristup i dodjelu 50 Coins…',
        'premium.processing': 'Plaćanje je završeno, ali Stripe potvrda još se obrađuje. Za nekoliko trenutaka upotrijebite Osvježi; nemojte ponovno kupovati.',
        'advantages.a3': 'Premium alati za transfere: spremljene pretrage, automatska upozorenja, uži odabir i analiza pregovora.',
        'services.readOnly': 'Tim i svi spremljeni podaci ostaju dostupni u načinu samo za čitanje.',
        'services.reactivatePreferences': 'Ponovno aktiviraj u Postavkama',
        'services.managePreferences': 'Upravljaj u Postavkama',
        'history.premiumInvoicesSubtitle': 'Uspješne Premium uplate i mjesečne dodjele Coins',
        'history.ledgerSubtitle': 'Sve dodjele, kupnje, nagrade i potrošnja Coins na opcionalne funkcije',
        'history.show': 'Prikaži povijest',
        'history.hide': 'Sakrij povijest',
        'history.coinsGranted': 'Dodijeljeni Coins',
        'transactions.dailyUnlock': 'Povijesno dnevno otključavanje igranja',
    },
    'sharedRiderModal.json': {
        'common.showHistory': 'Prikaži povijest',
        'common.hideHistory': 'Sakrij povijest',
        'roles.timeTrialist': 'Kronometraš',
    },
    'seasonReset.json': {
        'page.description': 'Pregledajte promocije i ispadanja prije primjene prijelaza u novu sezonu.',
        'page.failed': 'Pregled prijelaza u novu sezonu nije moguće učitati.',
        'summary.subtitle': 'Izračunate promjene na temelju trenutačnog poretka.',
        'summary.promotedWorld': 'Promovirani u World',
        'summary.promotedProWest': 'Promovirani u Pro West',
        'summary.promotedProEast': 'Promovirani u Pro East',
        'summary.promotedAmateur': 'Promovirani iz Amateur',
        'sections.worldDirect': 'Promovirani u World — izravno',
        'sections.worldPlayoff': 'Promovirani u World — doigravanje',
        'sections.proWestDirect': 'Promovirani u Pro West — izravno',
        'sections.proWestPlayoff': 'Promovirani u Pro West — doigravanje',
        'sections.proEastDirect': 'Promovirani u Pro East — izravno',
        'sections.proEastPlayoff': 'Promovirani u Pro East — doigravanje',
        'sections.amateurEurope': 'Promovirani iz Amateur u Continental Europe',
        'sections.amateurAmerica': 'Promovirani iz Amateur u Continental America',
        'sections.amateurAsia': 'Promovirani iz Amateur u Continental Asia',
        'sections.amateurAfrica': 'Promovirani iz Amateur u Continental Africa',
        'sections.amateurOceania': 'Promovirani iz Amateur u Continental Oceania',
        'sections.all': 'Sve promjene',
        'sections.allSubtitle': 'Potpuni popis promocija, ispadanja i uklanjanja.',
        'empty.noMovements': 'Nema izračunatih sezonskih promjena.',
        'empty.worldDirect': 'Nema izravnih promocija u World.',
        'empty.worldPlayoff': 'Nema promocija u World kroz doigravanje.',
        'empty.proWestDirect': 'Nema izravnih promocija u Pro West.',
        'empty.proWestPlayoff': 'Nema promocija u Pro West kroz doigravanje.',
        'empty.proEastDirect': 'Nema izravnih promocija u Pro East.',
        'empty.proEastPlayoff': 'Nema promocija u Pro East kroz doigravanje.',
        'reasons.promoted': 'Promoviran',
        'reasons.directPromotion': 'Izravna promocija',
        'reasons.playoffPromotion': 'Promocija kroz doigravanje',
        'divisions.northAmerica': 'Sjeverna Amerika',
        'divisions.westernEurope': 'Zapadna Europa',
        'divisions.centralEurope': 'Srednja Europa',
        'divisions.southernBalkanEurope': 'Južna i Balkanska Europa',
        'divisions.northernEasternEurope': 'Sjeverna i Istočna Europa',
        'divisions.westNorthAfrica': 'Zapadna i Sjeverna Afrika',
        'divisions.centralSouthAfrica': 'Srednja i Južna Afrika',
        'divisions.westCentralAsia': 'Zapadna i Srednja Azija',
    },
}


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for part in parts[:-1]:
        node = node[part]
    if parts[-1] not in node:
        raise KeyError(f'Missing {filename}:{dotted}')
    node[parts[-1]] = value

count = 0
for filename, patch in PATCHES.items():
    path = ROOT / filename
    data = json.loads(path.read_text(encoding='utf-8'))
    for dotted, value in patch.items():
        set_path(data, dotted, value)
        count += 1
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{filename}: polished {len(patch)} strings')
print(f'Croatian secondary core polish prepared: {count} strings.')
