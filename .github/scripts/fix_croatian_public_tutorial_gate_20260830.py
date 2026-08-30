from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')
PATCHES: dict[str, dict[str, str]] = {
    'publicInfo.json': {
        'how.step4Text': 'Kalendar utrka sadrži različite kategorije, države, rute i tipove etapa. Birajte utrke koje odgovaraju vašoj momčadi. Mali ili mladi tim ne bi trebao preopteretiti vozače prevelikim brojem utrka.',
        'support.accountText': 'Koristite podršku ako se ne možete prijaviti, ne možete pristupiti klubu, imate problem s ponovnim postavljanjem lozinke ili mislite da se podaci računa ne učitavaju ispravno.',
        'privacy.s4p1': 'ProPeloton Manager trenutačno ne koristi oglašavanje trećih strana. Ako se to u budućnosti promijeni, ova Politika privatnosti bit će ažurirana prije uporabe takvih usluga.',
        'privacy.s10p1': 'Ovisno o primjenjivom zakonu, možete imati prava na pristup, ispravak, brisanje, ograničenje obrade, prigovor ili pravo na prijenos osobnih podataka. Neke podatke igre, plaćanja ili sigurnosti možda ćemo morati zadržati kada je čuvanje zakonski obvezno ili potrebno radi zaštite usluge.',
        'terms.heroText': 'Ovi uvjeti objašnjavaju pravila uporabe ProPeloton Managera, upravljanja računom, kupnje Coins i korištenja Premium funkcija.',
        'terms.s5p1': 'Coins su valuta u igri povezana s računom i koriste se samo unutar ProPeloton Managera. Coins nisu pravi novac, nemaju novčanu vrijednost, ne mogu se povući niti prodavati, slati drugom korisniku ili mijenjati izvan igre osim ako takvu mogućnost izričito ne uvedemo.',
        'terms.s5p4': 'Neiskorišteni Coins ostaju povezani s računom i ne istječu tijekom normalne uporabe računa niti nakon otkazivanja Premiuma. Coins povezani s refundiranim, storniranim, osporenim, prijevarnim ili neovlaštenim plaćanjem mogu biti uklonjeni ili korigirani.',
    },
    'tutorials.json': {
        'training.welcome.body': 'Možemo vam pokazati kako funkcioniraju redovni trening i trening kampovi te kako utječu na razvoj vozača, umor i pripremu za utrke.',
        'facilities.projects.body': 'Kada otvorite detalje objekta, možete vidjeti cijenu sljedeće razine, trajanje izgradnje i bonuse ili otključavanja koje će donijeti.\n\nProjekt izgradnje ili nadogradnje možete pokrenuti kada klub ima dovoljno novca i slobodan kapacitet za projekte.\n\nProjekt infrastrukture možete i otkazati. Ako ga otkažete odmah, dobit ćete puni povrat novca. Ako ga otkažete kasnije, povrat može biti manji.',
        'calendar.season.body': 'Ovo je Kalendar sezone.\n\nDaje vam pregled svakodnevnih aktivnosti vašeg tima. Za svaki dan možete vidjeti što se događa u klubu, uključujući utrke, trening kampove, događaje, praznike i druge važne aktivnosti.\n\nKoristite ovaj prikaz kada želite razumjeti raspored tima iz dana u dan.',
        'calendar.races.body': 'Ovo je Kalendar utrka.\n\nOvdje možete vidjeti sve utrke u sezoni. Utrke mogu biti jednodnevne ili višednevne etapne utrke. Svaka utrka prikazuje korisne informacije kao što su datum, status utrke, kategorija, tip utrke, ograničenja broja timova i status prijave.\n\nUtrke su podijeljene po mjesecima, tako da svaki mjesec ima svoj popis dostupnih utrka.',
        'raceDetail.overview.body': 'Ovo je stranica Profil utrke.\n\nOvdje možete vidjeti najvažnije informacije o utrci: koliko timova može sudjelovati, nagradni fond, kada se prijave zatvaraju, kada se objavljuju timovi sudionici i koliko vozača svaki tim može prijaviti.\n\nKod etapnih utrka možete vidjeti i koliko etapa utrka ima.',
        'racePreparation.acceptedRaces.body': 'Ovo je stranica Priprema utrke.\n\nKartica Prihvaćene utrke prikazuje utrke na kojima je vaš tim prihvaćen za sudjelovanje.\n\nOvdje možete vidjeti najvažnije informacije o utrci, ali i status pripreme vašeg tima. Primjerice, možete vidjeti Race Plan otvoren, Stage Plans otvoreni, rok za vozače dosegnut, utrka aktivna, utrka završena ili Sve spremno.\n\nKada vaš tim bude prihvaćen na utrku, ovdje trebate pripremiti vozače, osoblje, sredstva, opremu, zalihe i taktiku. Ovo je jedna od stranica koju ćete najčešće posjećivati tijekom sezone.',
        'teamRanking.points.body': 'Timovi osvajaju međunarodne bodove na utrkama. Bolji rezultati na većim utrkama obično donose više bodova.\n\nTi bodovi određuju poziciju svakog tima unutar njegova natjecanja. Na kraju sezone timovi mogu biti promovirani u višu razinu ili ispasti u nižu, ovisno o konačnoj poziciji.\n\nOva stranica važna je jer pokazuje gdje se vaš tim nalazi u odnosu na druge i što morate ostvariti kako biste napredovali.\n\nNakon Rangiranja timova, sljedeća preporučena stranica je Statistika.',
        'statistics.teamsCurrent.body': 'Ovo je stranica Statistika.\n\nOdjeljak Timovi prikazuje statistiku timova iz svih natjecanja na jednom mjestu. U prikazu Trenutačno možete vidjeti aktualnu sezonu i usporediti koji su timovi najuspješniji po broju bodova.\n\nFiltrima možete pregledati različite razine, divizije, države, korisničke timove, AI timove te aktivne i neaktivne timove. Također možete otvoriti profil tima i vidjeti više detalja.',
        'statistics.teamsHistory.body': 'Odjeljak Povijest prikazuje prethodne sezone.\n\nOvdje možete pregledati ranije pobjednike, stare presjeke sezona, povijesne pozicije i učinak timova u prethodnim sezonama.\n\nOvaj dio postaje sve korisniji kako vaš svijet prolazi kroz više sezona.',
        'finance.sponsors.body': 'Kartica Sponzori prikazuje sponzore s kojima je vaš tim već potpisao ugovor.\n\nSponzori mogu donositi novac klubu, ali mogu imati i ciljeve ili bonus zadatke. Ti ciljevi objašnjavaju što vaš tim mora ostvariti i koliko novca možete dobiti.\n\nSponzorski ugovori mogu biti standardni ili ugovori s naming-rights pravima. Standardni ugovor donosi sponzorski novac bez promjene imena vašeg tima.\n\nUgovor s naming-rights pravima obično vrijedi više, ali ime sponzora postaje dio imena vašeg tima tijekom sezone. Na početku sljedeće sezone vraća se izvorno ime tima.\n\nAko vaš tim još nema sponzora, možete koristiti dio s ponudama sponzora kako biste pronašli novi ugovor.',
    },
}


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for part in parts[:-1]: node = node[part]
    node[parts[-1]] = value

for filename, patch in PATCHES.items():
    path = ROOT / filename
    data = json.loads(path.read_text(encoding='utf-8'))
    for dotted, value in patch.items(): set_path(data, dotted, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{filename}: fixed {len(patch)} remaining public/tutorial issues')
