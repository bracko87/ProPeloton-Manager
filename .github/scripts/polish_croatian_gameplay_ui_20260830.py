from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')

PATCHES: dict[str, dict[str, str]] = {
    'racePreparation.json': {
        'racePlan.sharpnessHelp': 'Race Sharpness pokazuje ima li vozač dovoljno nedavnog natjecateljskog ritma. Viši Race Sharpness pomaže vozaču da utrku započne spremnije i vozi stabilnije.',
        'racePlan.blockedRiders': '{{count}} vozača nije dostupno jer su već dodijeljeni utrci koja se preklapa.',
        'racePlan.blockedRider': '{{count}} vozač nije dostupan jer je već dodijeljen utrci koja se preklapa.',
        'racePlan.blockedStaff': '{{count}} članova osoblja nije dostupno jer su već dodijeljeni utrci koja se preklapa.',
        'racePlan.blockedStaffOne': '{{count}} član osoblja nije dostupan jer je već dodijeljen utrci koja se preklapa.',
        'racePlan.saved': 'Race Plan je spremljen.',
        'racePlan.savedU23': 'Race Plan je spremljen. U23 Glavni trener preuzet će kontrolu kada Race Plan bude poslan.',
        'dialog.changeSquadTitle': 'Promijeniti momčad koja nastupa?',
        'errors.blockedRider': 'Ovaj vozač već je dodijeljen drugoj poslanoj utrci koja se preklapa.',
        'errors.blockedStaff': 'Ovaj član osoblja već je dodijeljen drugoj poslanoj utrci koja se preklapa.',
        'errors.blockedU23': 'Ovaj U23 Glavni trener već je dodijeljen drugoj poslanoj utrci koja se preklapa.',
        'stagePlans.saved': 'Stage Plan je spremljen.',
        'stagePlans.rolesHelp': 'Dodijelite jednu ulogu svakom odabranom vozaču za ovu etapu.',
        'weatherCancellation.likelyBody': 'Trenutačna prognoza ispod je sigurnosnog praga. Konačna odluka donosi se 24 sata u igri prije starta.',
    },
    'raceDetail.json': {
        'weather.stageCanceledDetails': 'Etapa {{stage}} otkazana je zbog vremenskih uvjeta ({{reason}}). Za ovu etapu nisu generirani rezultati, bodovi, nagrade, umor ni repriza. Etapna utrka nastavlja se sljedećom etapom koja se može održati.',
        'participants.favoritesDescription': 'Izračunato na temelju sposobnosti vozača, rezultata ove sezone, profila utrke i dodijeljene uloge.',
        'participants.teamRiderCount': '{{teams}} timova · {{riders}} dodijeljenih vozača',
        'participants.assignedRiders': '{{count}} dodijeljenih vozača',
        'participants.noRiders': 'Još nema dodijeljenih vozača.',
        'replay.unlockDescription': 'Repriza je dostupna. Timovi koji nisu sudjelovali mogu je otključati za {{coins}} coins.',
        'replay.pointNoAward': 'Bodovni punkt dosegnut je bez dodijeljenog rezultata.',
    },
    'training.json': {
        'page.focusedRiderHelp': 'Upotrijebite ovaj riderId kako biste unaprijed učitali karticu vozača, trenutačna zaduženja i spremili individualne izmjene treninga.',
        'weather.mixed': 'Promjenjivo',
        'coach.description': 'Uključite automatsko planiranje. Današnja odluka Glavnog trenera prikazuje se u Individualnim postavkama vozača, dok budući plan ostaje interni.',
        'coach.safetyTitle': 'Prioriteti i sigurnosna pravila',
        'camps.overlapInfo': 'Postojeći termini kampova označeni su plavim okvirom u odabiru datuma. Preklapanje se provjerava po vozaču, pa se drugi kamp u istom razdoblju može planirati ako vozači nisu u sukobu.',
        'camps.overlapWarning': 'Neki vozači nisu dostupni za odabrano razdoblje jer su već dodijeljeni trening kampu koji se vremenski preklapa.',
        'camps.staffOverlap': 'Nedostupan: već je dodijeljen trening kampu koji se preklapa.',
        'camps.assignedRiders': 'Dodijeljeni vozači',
        'camps.noAssignedRiders': 'Nema dodijeljenih vozača.',
        'camps.genericLong': 'Ovaj kamp u mjestu {{city}} pruža strukturirane uvjete za {{type}} trening, pripremu momčadi i razvoj vozača.',
        'camps.genericWeatherNote': 'Pažljivo provjerite prognozu i sezonske uvjete prije rezervacije.',
        'currentCamp.activeSubtitle': 'Napredak aktivnog kampa, razvoj vozača, vrijeme i podrška dodijeljenog osoblja.',
        'currentCamp.completedSubtitle': 'Pregled završenog kampa, razvoj vozača, dnevni izvještaji i podrška dodijeljenog osoblja.',
        'currentCamp.plansSaved': 'Planovi treninga uspješno su spremljeni.',
        'currentCamp.noEditableDays': 'Nema dostupnih budućih dana kampa za izmjenu. Kamp je možda završen ili je već na posljednjem danu.',
        'currentCamp.noRiders': 'Još nema vozača dodijeljenih ovom kampu.',
        'currentCamp.staffBoostSubtitle': 'Aktivni učinci podrške osoblja dodijeljenog ovom trening kampu.',
        'tutorial.regularBody': 'Ovo je stranica Trening.\n\nU Redovitom treningu možete kontrolirati što vaši vozači treniraju kada nisu dodijeljeni drugoj aktivnosti kao što su utrka ili trening kamp.\n\nMožete postaviti zadani trening za Prvi tim i Razvojni tim, a trening možete mijenjati i za svakog vozača pojedinačno. Svaki vozač može trenirati određeni fokus kao što su sprint, uspon, ravničarski teren, kronometar, izdržljivost, otpornost, Race IQ, timski rad ili oporavak.\n\nIntenzitet treninga je važan. Jači trening može brže poboljšavati vozača, ali ga može i više umoriti prije sljedećih utrka. Možete odabrati i Dan odmora kada vozaču treba odmor i oporavak od umora.',
        'tutorial.campsBody': 'Trening kampovi su posebni blokovi treninga tijekom kojih odabrane vozače šaljete na nekoliko dana treninga.\n\nTrening kamp može pružiti snažniji razvoj vještina od redovitog dnevnog treninga, ali košta znatno više. Birate vrstu kampa, lokaciju, datume, trajanje, vozače i dostupno osoblje.\n\nOsoblje može poboljšati učinak kampa ili dodatno zaštititi vozače, ovisno o njihovim sposobnostima i dostupnosti. Prije rezervacije možete provjeriti cijenu, vremenski rizik, odabrane vozače, osoblje i sva upozorenja provjere.\n\nNakon Treninga, sljedeća preporučena stranica je Oprema.',
    },
    'equipment.json': {
        'overview.defaultSaved': 'Zadani Race Setup je spremljen.',
        'inventory.reminderSaved': 'Podsjetnik za održavanje spremljen je na {{threshold}}% stanja.',
        'presets.complete': 'Setup je potpun i može se spremiti.',
        'presets.saved': '{{name}} je spremljen.',
        'supplies.restockDescription': 'Kada ova stranica provjerava stanje, aktivna pravila kupuju normalnu količinu iz kataloga novcem kluba. Ne daje se dodatni popust ni besplatna zaliha.',
        'supplies.rulesSaved': 'Pravila automatske dopune su spremljena. Uvijek se primjenjuju normalne cijene koje plaća klub.',
        'tutorial.overviewBody': 'Ovo je stranica Oprema.\n\nKartica Pregled prikazuje sažetak opreme vašeg tima i vaših Race Setup konfiguracija.\n\nZadani Race Setup koristi se kada za utrku ne odaberete poseban setup. Ispod njega možete izraditi različite Race Setup konfiguracije koje kasnije možete odabrati u Race Preparation.\n\nSvaki setup može dati različite bonuse vašim vozačima, ovisno o opremi koja ga čini i broju dostupnih upotrebljivih jedinica.',
        'tutorial.inventoryBody': 'Kartica Inventar prikazuje svu opremu koju vaš tim trenutačno posjeduje.\n\nOvdje možete vidjeti bicikle, kotače, gume i drugu kupljenu opremu. Možete provjeriti kvalitetu, stanje, vrijednost, bonuse i dostupnost.\n\nAko vam neka oprema više nije potrebna, možete je prodati iz inventara.',
        'tutorial.suppliesBody': 'Kartica Zalihe za utrke prikazuje zalihe koje vaš tim može koristiti tijekom utrka.\n\nNeke zalihe koriste se samo jednom, dok se druge mogu koristiti više puta. Zalihe mogu pomoći u zaštiti vozača od teških uvjeta na utrci.\n\nBez odgovarajućih zaliha vozači mogu dobiti negativne učinke u vrlo toplim, hladnim ili zahtjevnim vremenskim uvjetima.\n\nNakon Opreme, sljedeća preporučena stranica je Infrastruktura.',
    },
    'infrastructure.json': {
        'facilityDescriptions.scoutingOfficeShort': 'Centar za skauting, izvještaje, informacije s tržišta i otkrivanje talenata.',
        'facilityDescriptions.scoutingOfficeLong': 'Ured za skauting određuje maksimalnu kvalitetu skautskih izvještaja, kapacitet skautinga i buduće sustave tržišnih informacija. Više razine otključavaju dodatna mjesta za skaute i kvalitetnije izvještaje.',
        'assets.teamCarAssignment': 'Garaža prikazuje što klub posjeduje i što je trenutačno u isporuci. Bonusi na utrci trebaju dolaziti samo od automobila dodijeljenih konkretnom događaju. Jača garaža daje više opcija, ali samo dodijeljena i dostupna vozila trebaju utjecati na rezultat.',
        'assets.teamBusAssignment': 'Garaža prikazuje što klub posjeduje i što je u isporuci. Bonusi trebaju dolaziti samo od autobusa dodijeljenih konkretnom događaju ili turi.',
        'assets.equipmentVanAssignment': 'Garaža prikazuje što klub posjeduje i što je u isporuci. Bonusi trebaju dolaziti samo od kombija za opremu dodijeljenih konkretnom događaju.',
        'assets.mobileWorkshopAssignment': 'Garaža prikazuje što klub posjeduje i što je u isporuci. Tehnički bonusi trebaju dolaziti samo od mobilnih radionica dodijeljenih konkretnom događaju.',
        'assets.medicalVanAssignment': 'Garaža prikazuje što klub posjeduje i što je u isporuci. Medicinski bonusi trebaju dolaziti samo od medicinskih kombija dodijeljenih konkretnom događaju.',
        'tutorial.assetsBody': 'Kartica Vozila i oprema prikazuje vozila i prateću opremu koju tim može koristiti.\n\nTu spadaju timski automobili, timski autobusi, kombiji za opremu, mobilne radionice i medicinski kombiji. Oni mogu podržati tim tijekom utrka, putovanja, priprema i trening kampova.\n\nSvako vozilo može imati različite razine, cijene, stanje, bonuse i ograničenja. Otvorite detalje kako biste vidjeli što konkretno donosi timu.\n\nNeke napredne funkcije, opcije upravljanja ili dodatni alati mogu zahtijevati Premium račun ili kupnju uz Coins.',
        'facilityUpgrades.mechanics_workshop.level2.effect': 'Popravci opreme postaju brži kada sustav opreme primjenjuje ovaj učinak.',
        'facilityUpgrades.youth_academy.level2.effect': 'U23 vozači dobivaju 10% bonusa na trening i razvoj kada U23 sustav primjenjuje ovaj učinak.',
    },
}


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for key in parts[:-1]: node = node[key]
    if parts[-1] not in node: raise KeyError(f'Missing Croatian key: {dotted}')
    node[parts[-1]] = value

for filename, patches in PATCHES.items():
    path=ROOT/filename
    data=json.loads(path.read_text(encoding='utf-8'))
    for dotted,value in patches.items(): set_path(data,dotted,value)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'{filename}: polished {len(patches)} strings')
print(f'Croatian gameplay UI polish prepared: {sum(len(v) for v in PATCHES.values())} strings.')
