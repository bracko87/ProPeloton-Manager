from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')
PATCHES: dict[str, dict[str, str]] = {
    'manual.json': {
        'guide.commonMistake.infrastructure': 'Česta pogreška je nadograditi objekt samo zato što viša razina izgleda bolje. Infrastruktura treba rješavati stvarne potrebe kluba za kapacitetom osoblja, treningom, medicinom, skautingom, mehaničarima ili logistikom.',
        'sections.support-account.overview': 'Stranice računa i podrške pomažu korisnicima upravljati profilom, postavkama obavijesti, Razvojnim timom, poveznicama za preporuke, Discord podrškom i prijavama pogrešaka.',
        'sections.profile-settings.details[1]': 'Promjena e-mail adrese koristi sustav autentifikacije i može zahtijevati potvrdu.',
        'sections.top-menu.details[0]': 'Korisnici iz izbornika mogu pristupiti postavkama profila i alatima za lozinku.',
        'sections.first-squad-deep.details[4]': 'Sažetak nadzorne ploče može prikazati pobjede, postolja, plasmane među prvih deset, posljednju utrku i sljedeći odabir utrke.',
        'sections.fitness-health-deep.details[2]': 'Status djelomične spremnosti znači da se vozač može utrkivati, ali nije idealno pripremljen.',
        'sections.race-sharpness-deep.facts[0].label': 'Premalo utrkivanja',
        'sections.equipment-caps-deep.overview': 'Bonusi opreme korisni su, ali trebaju ostati unutar ograničenja igre. Setup je paket opreme za određeni tip utrke, a menadžer treba uzeti u obzir kombinirani učinak umjesto da se usredotoči na samo jedan broj bez konteksta.',
        'sections.equipment-inventory-deep.tips[1]': 'Ne prodajte dodijeljenu opremu prije nego što promijenite setup koji je koristi.',
        'sections.race-supplies-deep.overview': 'Zalihe za utrku povezuju opremu s pripremom za utrku. Menadžer unaprijed kupuje zalihe, a Stage Plans zatim troše ili dodjeljuju potrebnu količinu po vozaču i etapi.',
        'sections.technical-sponsor-deep.details[3]': 'Ponudu tehničkog sponzora treba usporediti s potrebama kluba za opremom. Velik popust manje je koristan ako je klub u toj kategoriji već dobro opremljen.',
        'sections.technical-sponsor-deep.facts[1].label': 'Primjenjuje se',
        'sections.facility-jobs-deep.details[0]': 'Prije početka nadogradnje objekta stranica treba pokazati jesu li ispunjeni svi preduvjeti i financijski zahtjevi.',
        'sections.facility-jobs-deep.details[2]': 'Datum dovršetka prikazuje se u vremenu igre. Menadžer ga treba usporediti s trenutačnim vremenom igre u podnožju i budućim planovima u kalendaru.',
        'sections.assets-deep.tips[0]': 'Popravite pomoćna sredstva prije važnih blokova utrka.',
        'sections.assets-deep.tips[1]': 'Ne prodajte sredstvo koje je potrebno u predstojećem Race Plan.',
        'sections.race-calendar-deep.details[2]': 'Menadžer treba provjeriti koliko timova utrka može prihvatiti te koliko se timova već prijavilo ili je prihvaćeno.',
        'sections.stage-terrain-points.overview': 'Profil etape pokazuje što ruta zahtijeva. Mješavina terena, tip etape, nadmorska visina, međusprintovi i planinski bodovi trebaju utjecati na odabir vozača i Stage Plans.',
        'sections.race-plan-deep.details[0]': 'Race Plan treba izraditi ubrzo nakon prihvaćanja prijave jer preklapanje događaja kasnije može blokirati vozače ili sredstva.',
        'sections.race-plan-deep.facts[0].value': 'Mora zadovoljiti ograničenja broja vozača',
        'sections.stage-plan-deep.details[6]': 'Prije zaključavanja plana pregled spremnosti treba tretirati kao završnu kontrolnu listu.',
        'sections.stage-readiness-deep.facts[0].value': 'Spremljeni planovi, upotrebljivi planovi, planovi koji nedostaju, prazni planovi, zalihe i taktička potpunost',
        'sections.ranking-tiers-deep.tips[0]': 'Postavite sezonski cilj prema točnoj zoni promocije ili ispadanja u svojoj diviziji.',
        'sections.ranking-tiers-deep.tips[1]': 'Redovito pratite rangiranje timova umjesto da čekate posljednji tjedan.',
        'sections.transfer-list-deep.details[4]': 'Menadžer treba provjeriti kapacitet kadra prije dovršetka novog potpisa.',
        'sections.scouting-deep.details[5]': 'Izvještaji trebaju pomoći pri donošenju odluka, ali ne jamče da će vozač prihvatiti klub niti da će klub prodavatelj prihvatiti ponudu.',
        'sections.finance-health-deep.overview': 'Financijsko zdravlje pokazuje može li klub održivo pokrivati svoje uobičajeno poslovanje. Hitno zaduživanje može privremeno spasiti klub, ali posuđeni novac ne smije se zamijeniti sa zdravim operativnim prihodom.',
        'sections.transactions-deep.details[1]': 'Plaće, osoblje, porez, sponzorske isplate, nagrade, politike, oprema, infrastruktura, kampovi i bonusi trebaju biti vidljivi u transakcijama.',
        'sections.team-policies-deep.overview': 'Politike omogućuju menadžeru odabrati operativni standard kluba. Bolje opcije mogu poboljšati udobnost i podršku, ali mogu stvoriti i veće ponavljajuće troškove te dodatne troškove putovanja.',
        'sections.faq-application-blocked.tips[0]': 'Zajedno provjerite trenutačno vrijeme igre u podnožju i rok za prijavu na utrku.',
        'sections.faq-money.details[0]': 'Otvorite Transakcije i pronađite negativne stavke oko datuma igre kada se stanje računa promijenilo.',
        'sections.faq-money.details[3]': 'Politike i sudjelovanje na utrkama mogu stvarati troškove čak i kada klub nije obavio transfer.',
        'sections.faq-money.details[5]': 'Povrat glavnice kredita predstavlja kretanje duga, a ne operativni rashod.',
        'sections.faq-equipment.subtitle': 'Status, stanje i ograničenja dodjele.',
    },
    'manualCore.json': {
        'sections.supportAccount.overview': 'Stranice računa i podrške pomažu korisnicima upravljati profilom, postavkama obavijesti, Razvojnim timom, poveznicama za preporuke, Discord podrškom i prijavama pogrešaka.',
    },
    'manualDeepA.json': {
        'sections.profileSettings.details[1]': 'Promjena e-mail adrese koristi sustav autentifikacije i može zahtijevati potvrdu.',
        'sections.topMenu.details[0]': 'Korisnici iz izbornika mogu pristupiti postavkama profila i alatima za lozinku.',
        'sections.firstSquadDeep.details[4]': 'Widgeti sezone mogu prikazati pobjede, postolja, plasmane među prvih deset, najbolji GC rezultat, posljednju utrku i sljedeći odabir utrke.',
        'sections.riderSkillsDeep.details[6]': 'Otpornost pomaže u teškim vremenskim uvjetima, pri visokom tempu i na zahtjevnom terenu.',
        'sections.fitnessHealthDeep.details[1]': 'Vozači koji nisu potpuno spremni mogu predstavljati rizik i mogu zahtijevati medicinsku podršku.',
        'sections.fitnessHealthDeep.details[2]': 'Ozlijeđeni ili bolesni vozači obično ne bi trebali nastupati na utrkama niti trenirati visokim intenzitetom.',
        'sections.raceSharpnessDeep.subtitle': 'Ritam utrkivanja i rizik od preopterećenja.',
        'sections.contractsRenewalsRelease.subtitle': 'Financijske odluke povezane s vozačima.',
    },
    'manualDeepB1.json': {
        'sections.assetsDeep.overview': 'Vozila su pomoćna sredstva s različitim razinama, stanjem, statusom dodjele i vrijednostima podrške.',
        'sections.stageTerrainPoints.overview': 'Definicije terena i bodova pomažu korisniku odabrati vozače, taktiku i opremu.',
        'sections.stageTerrainPoints.details[3]': 'TT i prolog etape odgovaraju kronometrašima i specijaliziranoj TT opremi.',
        'sections.stageTerrainPoints.tips[0]': 'Teren etape treba određivati uloge u Stage Plan.',
        'sections.stagePlanDeep.details[2]': 'Zalihe se dodjeljuju po etapi i mogu biti jednokratne ili koristiti trajni kapacitet.',
    },
    'manualDeepB2.json': {
        'sections.freeAgentsDeep.details[1]': 'I dalje mogu zahtijevati visoku plaću ili bonuse.',
        'sections.transactionsDeep.overview': 'Transakcije su mjesto za točnu provjeru razloga promjene stanja novca.',
        'sections.taxDeep.title': 'Porezne kontrole',
        'sections.teamPoliciesDeep.details[2]': 'Oprema osoblja može se primjenjivati pri zapošljavanju novih članova osoblja.',
    },
    'manualDynamic.json': {
        'category.gettingStarted': 'Ovaj dio priručnika koristite kao orijentaciju, a ne samo kao popis gumba. Kada novi menadžer otvori {{title}}, najvažnije je razumjeti redoslijed radnji: prvo pročitajte trenutačno vrijeme igre i upozorenja, zatim pregledajte tim, potom odaberite utrke, pripremite utrku i tek onda trošite veće iznose novca. Mnoge pogreške nastaju zato što korisnik klikne prebrzo prije nego što razumije koji su rok, status vozača ili financijsko pravilo povezani s tom stranicom.',
        'category.coinsAccount': 'Coins pripadaju korisničkom računu, dok novac pripada klubu. Gumbi kao što su Kupi sada, Povijest kupnji, Kopiraj pozivnu poveznicu ili Podijeli pozivnu poveznicu predstavljaju radnje na razini računa. Oni ne kupuju izravno vozače ili opremu. Kada korisnik odabere paket Coins, trgovina stvara checkout sesiju, a rezultat se poslije pojavljuje u povijesti Coins. Nagrada za pozivnu poveznicu završava tek nakon što preporučeni igrač ispuni potrebne korake prikazane na stranici Pozovi prijatelje.',
        'category.clubIdentity': 'Stranice identiteta kluba kontroliraju ono što drugi menadžeri vide: ime tima, boje, logotip, dres, javni profil i prikazano ime sponzora. Gumbi za prijenos provjeravaju tip i veličinu slike prije spremanja. Gumbi za spremanje trajno upisuju novi identitet putem backend funkcija, zato korisnik treba pričekati potvrdu uspjeha prije napuštanja stranice. Ako su naming rights aktivni, neka polja mogu biti zaključana jer sponzorski ugovor privremeno kontrolira javno prikazano ime.',
        'category.dashboard': 'Stranice nadzorne ploče služe za navigaciju i donošenje odluka. Prikupljaju podatke iz više sustava i pretvaraju ih u upozorenja, brojače, poveznice i statuse nepročitanih stavki. Korisnik ne treba promatrati te kartice kao dekoraciju. Ako kartica sadrži poveznicu, broj, upozorenje ili oznaku nepročitanog, obično postoji stranica na kojoj je potrebna radnja. Otvorite povezanu stranicu, riješite problem, zatim se vratite na Pregled ili Obavijesti kako biste provjerili je li upozorenje nestalo.',
        'category.equipment': 'Stranice opreme podijeljene su na planiranje, kupnju, popravke i upravljanje zalihama. Gumbi tržišta kupuju nove stavke, gumbi inventara upravljaju opremom u vlasništvu, gumbi za popravak traže ponudu održavanja, a kontrole kupnje zaliha povećavaju stanje. Korisnici uvijek trebaju provjeriti status i stanje prije radnje. Dodijeljene stavke obično nisu dostupne jer su već povezane s događajem ili planom, dok istrošene stavke i dalje mogu postojati, ali mogu smanjiti spremnost ili stvoriti rizik.',
        'category.rankingsStatistics': 'Stranice rangiranja i statistike služe za analizu. Filtri, kartice i izbornici divizija pomažu korisnicima usporediti timove i vozače kroz sezonu. Te stranice obično ne mijenjaju klub izravno, ali trebaju utjecati na odluke: koje utrke ciljati, koje vozače kupiti, koje rivale pratiti i zahtijeva li pritisak promocije, doigravanja ili ispadanja agresivniju strategiju.',
        'category.finance': 'Stranice Financija pokazuju može li klub održivo podnijeti svoje odluke. Kartice kao što su Pregled, Sponzori, Transakcije, Porez i Politike tima odgovaraju na različita financijska pitanja. Menadžer treba koristiti Financije prije potvrde skupih transfera, trening kampova, infrastrukturnih projekata, nadogradnje politika ili kupnje opreme. Najsigurnija je navika prije potrošnje provjeriti trenutačno stanje, stalne troškove, poreznu poziciju i prognozu nadolazećih putovanja.',
        'category.default': 'Ovaj odjeljak objašnjava kako {{title}} funkcionira u igri. Prvo pročitajte sažetak, zatim činjenice, a potom detaljna pravila. Cilj nije samo znati da funkcija postoji, nego razumjeti kada je koristiti, što mijenjaju vidljivi gumbi, koje su vrijednosti važne i koju pogrešku igrač treba izbjeći.',
        'decision': 'Logika odluke za ovu temu: prvo provjerite aktualne vrijednosti na stranici, zatim ih usporedite s pravilima u ovom priručniku. Za {{title}}, najvažnije referentne točke su: {{facts}}. Ako aktivna stranica prikazuje vrijednost koja se razlikuje od priručnika zato što se backend konfiguracija promijenila, vjerujte aktivnoj stranici za točan broj, ali koristite priručnik kako biste razumjeli zašto je ta vrijednost važna i kako utječe na sljedeću odluku.',
        'expanded.soldDiscarded': 'Kada je stavka prodana ili odbačena, igrač više ne treba planirati oko nje. Skrivanje takvih redaka iz aktivnog inventara održava fokus na opremi koja još može utjecati na utrke. To je važno jer bi stare prodane stavke inače mogle navesti menadžera da misli kako ima više dostupne opreme nego što tim stvarno može koristiti.',
        'expanded.readyWorn': 'Spremna oprema obično je dostupna za utrku ili upravljačke radnje. Istrošena oprema i dalje postoji, ali predstavlja upozorenje: stavka može zahtijevati popravak prije važnih događaja. Korisnik ne treba ignorirati istrošene stavke jer istrošen setup može postati slabost u Race Preparation baš u najgorem trenutku.',
        'expanded.quote': 'Ponuda je siguran korak prije trajne radnje. Objašnjava cijenu, dopuštenost radnje i ponekad razlog zašto je radnja blokirana. Korisnici trebaju pročitati ponudu umjesto nagađati. Ako ponuda kaže da radnja nije dopuštena, razlog obično pokazuje stvarnu blokadu, kao što su zaključavanje zbog dodjele, stanje, nedostatak novca ili status.',
        'expanded.consumables': 'Te zalihe povezane su s podrškom vozača na razini etape. Pojedinačno djeluju male, ali kod sedam ili više vozača i više etapa mogu brzo nestati. Korisnici trebaju računati zalihe prema veličini utrke: broj odabranih vozača pomnožen brojem etapa, zatim prilagođen odabranoj količini po vozaču.',
        'expanded.durable': 'Trajne zalihe za utrke ponašaju se drugačije od jednokratnih potrošnih stavki. Ne troše se odmah, ali imaju ograničen broj korištenja na etapama. Zato menadžer treba provjeriti upotrebljive jedinice, istrošene jedinice i preostala korištenja prije utrke, posebno prije dugih tura gdje će ista oprema biti potrebna više puta.',
        'expanded.tax': 'Porez nije nevažan pozadinski tekst. Dio je financijskog sustava i može promijeniti stvarnu vrijednost prihoda. Kada prihod poraste zbog sponzora, nagrada ili bonusa, menadžer treba očekivati zadržavanje poreza ili mjesečne korekcije i koristiti karticu Porez kako bi razumio konačno novčano stanje.',
        'expanded.cost': 'Svako spominjanje troška treba povezati s Financijama. Korisnik se treba pitati: je li to jednokratni, tjedni, mjesečni, trošak po putovanju ili sezonski trošak? Razlika je važna jer stalni troškovi mogu neprimjetno stvoriti veću opasnost od jedne velike kupnje.',
        'expanded.default': 'U praktičnom smislu, korisnik treba povezati ovo pravilo s vidljivim kontrolama na stranici {{title}}. Prvo pročitajte status, zatim provjerite je li gumb omogućen i onda razumijte što će se promijeniti nakon klika. Ako stranica prikazuje upozorenje, onemogućeno stanje, datum, cijenu, broj ili uvjet, ta informacija obično je važnija od samog naziva gumba.',
    },
    'manualLegacyDynamic.json': {
        'category.coinsAccount': '{{title}} pripada razini korisničkog računa, a ne uobičajenoj ekonomiji kluba. Korisnik treba razlikovati Coins i postavke identiteta/profila od klupskih financija. Ako funkcija koristi Coins, prije potvrde provjerite stanje računa i točnu aktualnu cijenu paketa ili usluge.',
        'category.infrastructure': '{{title}} je dugoročno ulaganje u kapacitet. Odluke o objektima i vozilima trebaju rješavati stvarno usko grlo, uklapati se u financijski plan i biti tempirane prema trajanju izgradnje ili popravka, a nadogradnje se ne trebaju raditi automatski.',
        'category.calendarRaces': '{{title}} pripada natjecateljskom vremenskom toku. Uvijek usporedite informacije o utrci, prijavi i slanju vozača s mjerodavnim vremenom igre, a zatim koristite Detalje utrke i Pripremu utrke za dublja pravila i radnje.',
        'category.rankingsStatistics': '{{title}} objašnjava natjecateljski položaj kluba. Bodovi, plasmani i specijalističke tablice trebaju usmjeravati sezonske ciljeve i skauting, ali menadžer i dalje treba otvoriti profile timova i vozača prije donošenja odluka samo na temelju brojeva na poretku.',
        'mistake.infrastructure': 'Česta pogreška je nadograditi objekt samo zato što viša razina izgleda bolje. Infrastruktura treba rješavati stvarne potrebe za kapacitetom osoblja, treningom, medicinom, skautingom, mehanikom ili logistikom.',
        'expanded.consumables': 'Potrošni materijal množi se brojem vozača i etapa. Menadžer treba izračunati potrebne zalihe prema stvarnom broju odabranih vozača i ukupnom broju etapa, a zatim ostaviti malu rezervu kada je moguće. Procjena za jednodnevnu utrku nije dovoljna za etapnu utrku.',
        'expanded.tax': 'Porez nije nevažan tekst u pozadini. Dio je financijskog sustava i može promijeniti stvarnu vrijednost prihoda. Kada prihod raste zbog sponzora, nagrada ili bonusa, menadžer treba očekivati porezno zadržavanje ili mjesečne korekcije i koristiti karticu Porez za razumijevanje konačnog novčanog stanja.',
        'expanded.cost': 'Svako spominjanje troška treba povezati sa stranicom Financije. Korisnik se treba pitati: je li to jednokratni, tjedni, mjesečni, trošak po putovanju ili sezonski trošak? Razlika je važna jer stalni troškovi mogu neprimjetno stvoriti veću opasnost od jedne kupnje.',
        'expanded.default': 'U praksi to znači da korisnik treba povezati ovo pravilo s vidljivim kontrolama na stranici {{title}}. Prvo pročitajte status, zatim provjerite je li gumb omogućen, pa razumijte što će se promijeniti nakon klika. Ako stranica prikazuje upozorenje, onemogućeno stanje, datum, cijenu, broj ili uvjet, ta informacija obično je važnija od samog naziva gumba.',
    },
}


def parse_path(path: str):
    parts=[]
    for token in path.split('.'):
        if '[' in token:
            base,rest=token.split('[',1)
            if base: parts.append(base)
            parts.append(int(rest.rstrip(']')))
        else:
            parts.append(token)
    return parts


def set_path(data, dotted: str, value: str):
    parts=parse_path(dotted)
    node=data
    for part in parts[:-1]: node=node[part]
    node[parts[-1]]=value

count=0
for filename,patch in PATCHES.items():
    path=ROOT/filename
    data=json.loads(path.read_text(encoding='utf-8'))
    for dotted,value in patch.items():
        set_path(data,dotted,value); count+=1
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'{filename}: final-polished {len(patch)} strings')
print(f'Final Croatian Manual explicit rewrites: {count}')
