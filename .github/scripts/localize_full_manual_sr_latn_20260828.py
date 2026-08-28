from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import json5
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
MANUAL_PATH = ROOT / 'src/pages/dashboard/Manual.tsx'
I18N_PATH = ROOT / 'src/i18n/index.ts'
EN_PATH = ROOT / 'src/i18n/locales/en/manual.json'
SR_PATH = ROOT / 'src/i18n/locales/sr-Latn/manual.json'
MODEL_NAME = 'Helsinki-NLP/opus-mt-en-sla'
TARGET_PREFIX = '>>srp_Latn<< '


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    return text.replace(old, new, 1)


def extract_sections(source: str) -> list[dict[str, Any]]:
    marker = 'const manualSections: ManualSection[] = ['
    start = source.index(marker)
    array_start = source.index('[', start)
    end_marker = '\n]\n\nconst manualCategories'
    end = source.index(end_marker, array_start) + 2
    return json5.loads(source[array_start:end])


def category_key(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')


UI_EN = {
    'eyebrow': 'Manual',
    'title': 'ProPeloton Manager Manual',
    'description': (
        'This expanded manual is a deep player reference for ProPeloton Manager. It covers account pages, coins, referrals, club identity, dashboard navigation, notifications, riders, staff, training, camps, equipment, infrastructure, calendar, race detail, race preparation, replay, rankings, statistics, transfers, scouting, finance, sponsors, taxes, policies, liquidation and FAQ topics. Sections are closed by default, so open only the topic you need.'
    ),
    'sectionCount_one': '{{count}} section',
    'sectionCount_other': '{{count}} sections',
    'categoryCount_one': '{{count}} category',
    'categoryCount_other': '{{count}} categories',
    'closedByDefault': 'All sections closed by default',
    'backToHelp': 'Back to Help',
    'printPdf': 'Print / Save as PDF',
    'askDiscord': 'Ask on Discord',
    'startHereTitle': 'Start here',
    'startHereDescription': (
        'New managers should first read Quick Start, Game Time, Overview, Squad, Training, Race Preparation and Finance. Experienced managers can use search for specific topics like sponsor naming rights, race supplies, playoffs, tax audits, emergency rescues or developing-team movement windows.'
    ),
    'searchLabel': 'Search manual',
    'searchPlaceholder': 'Search coins, sponsors, race preparation, tax, equipment...',
    'categoryLabel': 'Category',
    'allCategories': 'All categories',
    'openVisible': 'Open visible',
    'closeAll': 'Close all',
    'visibleCount_one': 'Showing {{count}} section.',
    'visibleCount_other': 'Showing {{count}} sections.',
    'noSectionsTitle': 'No manual sections found',
    'noSectionsDescription': 'Try a different search term or switch category back to all.',
    'open': 'Open',
    'close': 'Close',
    'summary': 'Summary',
    'detailedExplanation': 'Detailed explanation',
    'rule': 'Rule {{count}}',
    'practicalTips': 'Practical tips',
    'maintenanceTitle': 'Manual maintenance note',
    'maintenanceDescription': (
        'This manual is a deep first version based on the current pages and systems. Exact values that are loaded from the database, such as live coin package prices, some policy option costs, camp quotes, sponsor offer values and infrastructure costs, should always be trusted from the live page if the backend config changes.'
    ),
    'contactUs': 'Contact Us',
}

UI_SR = {
    'eyebrow': 'PRIRUČNIK',
    'title': 'ProPeloton Manager priručnik',
    'description': (
        'Ovaj prošireni priručnik je detaljna referenca za igrače ProPeloton Managera. Obuhvata stranice naloga, Coins, preporuke, identitet kluba, navigaciju kontrolne table, obaveštenja, vozače, osoblje, trening, kampove, opremu, infrastrukturu, kalendar, detalje trke, pripremu trke, replay, rang-liste, statistiku, transfere, skauting, finansije, sponzore, poreze, politike, likvidaciju i česta pitanja. Odeljci su podrazumevano zatvoreni, pa otvorite samo temu koja vam je potrebna.'
    ),
    'sectionCount_one': '{{count}} odeljak',
    'sectionCount_few': '{{count}} odeljka',
    'sectionCount_other': '{{count}} odeljaka',
    'categoryCount_one': '{{count}} kategorija',
    'categoryCount_few': '{{count}} kategorije',
    'categoryCount_other': '{{count}} kategorija',
    'closedByDefault': 'Svi odeljci su podrazumevano zatvoreni',
    'backToHelp': 'Nazad na pomoć',
    'printPdf': 'Štampaj / sačuvaj kao PDF',
    'askDiscord': 'Pitaj na Discordu',
    'startHereTitle': 'Počnite ovde',
    'startHereDescription': (
        'Novi menadžeri prvo treba da pročitaju Brzi početak, Vreme u igri, Pregled, Ekipu, Trening, Pripremu trke i Finansije. Iskusni menadžeri mogu koristiti pretragu za određene teme kao što su prava sponzora na naziv, zalihe za trku, plej-of, poreske provere, hitna finansijska pomoć ili periodi za prebacivanje vozača u Razvojni tim.'
    ),
    'searchLabel': 'Pretraži priručnik',
    'searchPlaceholder': 'Pretraži Coins, sponzore, pripremu trke, porez, opremu...',
    'categoryLabel': 'Kategorija',
    'allCategories': 'Sve kategorije',
    'openVisible': 'Otvori prikazano',
    'closeAll': 'Zatvori sve',
    'visibleCount_one': 'Prikazan je {{count}} odeljak.',
    'visibleCount_few': 'Prikazana su {{count}} odeljka.',
    'visibleCount_other': 'Prikazano je {{count}} odeljaka.',
    'noSectionsTitle': 'Nema pronađenih odeljaka priručnika',
    'noSectionsDescription': 'Pokušajte sa drugim pojmom za pretragu ili vratite kategoriju na sve.',
    'open': 'Otvori',
    'close': 'Zatvori',
    'summary': 'Sažetak',
    'detailedExplanation': 'Detaljno objašnjenje',
    'rule': 'Pravilo {{count}}',
    'practicalTips': 'Praktični saveti',
    'maintenanceTitle': 'Napomena o održavanju priručnika',
    'maintenanceDescription': (
        'Ovaj priručnik je detaljna prva verzija zasnovana na trenutnim stranicama i sistemima. Tačne vrednosti koje se učitavaju iz baze podataka, kao što su aktuelne cene Coins paketa, troškovi pojedinih opcija politika, ponude kampova, vrednosti sponzorskih ponuda i troškovi infrastrukture, uvek treba proveravati na aktuelnoj stranici igre ako se backend konfiguracija promeni.'
    ),
    'contactUs': 'Kontaktirajte nas',
}

CATEGORY_SR = {
    'Getting Started': 'Početak',
    'Coins and Account': 'Coins i nalog',
    'Club Identity': 'Identitet kluba',
    'Dashboard': 'Kontrolna tabla',
    'Riders': 'Vozači',
    'Training': 'Trening',
    'Equipment': 'Oprema',
    'Infrastructure': 'Infrastruktura',
    'Calendar and Races': 'Kalendar i trke',
    'Race Preparation': 'Priprema trke',
    'Rankings and Statistics': 'Rang-liste i statistika',
    'Transfers': 'Transferi',
    'Transfers and Scouting': 'Transferi i skauting',
    'Finance': 'Finansije',
    'Support and Account': 'Podrška i nalog',
    'FAQ': 'Česta pitanja',
}

GUIDE_EN = {
    'factParagraph': 'Important reference values for this topic are: {{factText}}. Treat live values from the game page as authoritative whenever a value is database-driven, because prices, quotes, statuses or future balancing can change without the manual needing a code rewrite.',
    'noFactParagraph': 'This topic does not depend on one fixed numeric value. Use the live page state, warnings and available actions as the authoritative source when making the final decision.',
    'categoryIntro': {
        'getting-started': '{{title}} should be understood as part of the first-management routine. New users should not try to optimize everything immediately. First identify what the page controls, what information is authoritative, what deadlines exist, and which actions can create permanent or expensive consequences.',
        'coins-and-account': '{{title}} belongs to the account layer, not the normal club-cash economy. Users should separate account-level coins and identity/profile settings from team finance. If a feature uses coins, check the account balance and exact live package/service price before confirming anything.',
        'club-identity': '{{title}} affects the public identity of the club. Branding decisions can be visible in rankings, race lists and team profiles, while naming-rights sponsor rules can temporarily lock or replace parts of that identity.',
        'dashboard': '{{title}} is part of the daily information flow. Dashboard pages are designed to tell the manager what needs attention now. When a card or alert links to another page, use that deeper page for the final decision instead of relying only on the summary.',
        'riders': '{{title}} is connected to squad quality and long-term roster planning. Rider/staff decisions should combine current performance, potential, fatigue/health, contract cost, capacity and future race needs rather than focusing on one headline number.',
        'training': '{{title}} is a development decision with a freshness cost. Training quality matters, but the best training plan is the one that improves riders while still allowing them to arrive at important races fit enough to perform.',
        'equipment': '{{title}} connects owned items, setup bonuses, condition and race preparation. Equipment should be selected for the actual race profile and kept in usable condition; buying expensive gear without setups and maintenance planning wastes value.',
        'infrastructure': '{{title}} is a long-term capacity investment. Facility and asset decisions should solve a real bottleneck, fit the finance plan and be timed around construction/repair durations rather than upgraded automatically.',
        'calendar-and-races': '{{title}} belongs to the competition timeline. Always compare race/application/rider-submission information with authoritative game time, then use Race Detail and Race Preparation for the deeper rules and actions.',
        'race-preparation': '{{title}} is part of the final pre-race workflow. Accepted entry is not enough: riders, support resources, equipment, supplies, roles and tactics must be complete before the relevant lock/deadline.',
        'rankings-and-statistics': '{{title}} explains the competitive context of the club. Points, standings and specialist tables should guide season targets and scouting, but managers should still open team/rider profiles before making decisions from ranking numbers alone.',
        'transfers': '{{title}} is a squad-building decision with both sporting and financial consequences. Before committing, check role fit, scouting certainty, salary, duration, transfer fee if applicable, roster capacity and the effect on future club cashflow.',
        'transfers-and-scouting': '{{title}} combines market action with information quality. The manager should use scouting to reduce uncertainty, then negotiate only for realistic targets that fit both the squad and the budget.',
        'finance': '{{title}} affects club survival. Always distinguish operating income/expense from debt movement, use transaction rows to explain balance changes, and keep enough cash for mandatory recurring costs before paying for optional improvements.',
        'support-and-account': '{{title}} is an account/support function. Protect account information, use the correct support channel, and remember that user-profile data is separate from public club branding and club-finance systems.',
        'faq': '{{title}} is a troubleshooting entry. The fastest answer normally comes from identifying which game state is blocking the action, then checking the page that owns that state instead of repeatedly clicking the disabled action.',
    },
    'commonMistake': {
        'equipment': 'A common mistake is to buy the strongest-looking item without checking condition, assignment status, race profile or setup compatibility. The safer approach is to build complete specialist setups and maintain the items that those setups depend on.',
        'finance': 'A common mistake is to look only at the current balance. A healthy balance can hide future salary, tax, policy, trip or debt obligations. Use recurring-cost information and Transactions together before committing cash.',
        'calendar-and-races': 'A common mistake is to treat the race date as the only important date. Application, team-list, rider-submission and Stage Plan deadlines can all happen earlier and can block the team before the actual race starts.',
        'race-preparation': 'A common mistake is to see a saved plan and assume the race is ready. Saved, complete and usable are not always the same state. Read the readiness summary and fix missing supplies, roles or tactical blocks before lock.',
        'transfers': 'A common mistake is to judge a deal only by transfer fee or overall rating. Salary, contract length, scouting uncertainty, role fit, roster capacity and future cashflow can make a cheap-looking transfer expensive.',
        'transfers-and-scouting': 'A common mistake is to negotiate before reducing uncertainty. Scout important targets first, then use negotiation feedback to improve the weakest part of the offer rather than randomly increasing every cost.',
        'training': 'A common mistake is to maximize training intensity every day. Development only helps if the rider still has enough freshness, morale and health to perform when the important race arrives.',
        'infrastructure': 'A common mistake is to upgrade a facility because a higher level looks better. Infrastructure should solve staff-capacity, training, medical, scouting, mechanic or logistics needs that the club actually has.',
        'default': 'A common mistake is to ignore disabled-state messages, deadlines or prerequisites. When an action is unavailable, first read the visible requirement and then open the related page shown in the manual links.',
    },
    'detail': {
        'soldDiscarded': 'Once equipment is sold or discarded it leaves the active inventory. Before confirming, check whether the item is still used in a default or specialist setup and whether a replacement exists. Selling is a finance action as well as an equipment action because the decision changes both stock depth and club cash.',
        'readyWorn': 'Status should be read before condition. Ready means the item can normally participate in normal actions; Assigned means another setup/event currently owns the item; In Maintenance means it is temporarily unavailable; Worn means condition needs attention. The safest pre-race routine is to verify both status and condition for every item in the selected setup.',
        'assigned': 'Assigned is a protection state. It prevents the user from accidentally selling, repairing or reusing an item or asset that another plan currently depends on. Open the setup, race plan or assignment that owns it, replace/remove it there, then return to the inventory action.',
        'quote': 'A quote is the game’s preview of the real consequence before confirmation. Always review total cost/refund, duration, eligibility and warnings. The quoted value is more reliable than an old manual example because backend balance/configuration can change over time.',
        'condition': 'Condition is a durability signal. Lower condition increases the need for maintenance and can reduce how safe it is to rely on the item/asset for important plans. Do not wait until every key item is worn at the same time; rotate repairs so the club keeps enough usable depth.',
        'nutrition': 'Consumables are multiplied by riders and stages. The manager should calculate required stock using the actual number of selected riders and the whole stage count, then leave a small reserve when possible. A one-day stock estimate is not enough for a multi-stage race.',
        'durableSupplies': 'Durable race supplies are tracked differently from one-use consumables. Their remaining stage-use capacity matters. Mandatory jersey shortages can block readiness; rain-jacket shortages mainly reduce weather flexibility. Replace worn-out units before an important race block.',
        'sponsor': 'Sponsor information should be read before signing or targeting races. Guaranteed money is only one part of the deal. Objectives, bonus pools, technical discounts, naming-rights locks and deadlines can change what the club should do during the season. A good sponsor deal fits the team calendar and squad strength.',
        'tax': 'Tax is not optional background text. It is part of the finance system and can change the real value of income. When income rises from sponsors, prizes or bonuses, the manager should expect tax withholding or monthly adjustment rows and should use the Tax tab to understand the final cash position.',
        'deadline': 'Windows and deadlines are strict because the race engine and season systems need stable data before simulation. If a deadline passes, the user may lose the chance to edit a plan, apply for a race, move a rider or submit a roster. Always compare the page date with the footer game time.',
        'training': 'Training and fatigue must be balanced together. The manager is not trying to maximize every training session; the manager is trying to arrive at important races with riders who are both improving and fresh enough to perform. If fatigue rises too high, reduce intensity or plan recovery.',
        'scouting': 'Scouting reduces uncertainty. A player should treat unscouted external riders as incomplete information, not as confirmed values. Scout reports make transfer decisions safer because they reveal or estimate overall, potential, strengths and other hidden information with a precision level.',
        'finance': 'Any mention of cost should be connected to the Finance page. The user should ask: is this a one-time cost, a weekly cost, a monthly cost, a per-trip cost, or a seasonal cost? The difference matters because recurring costs can quietly create more danger than a single purchase.',
        'roleSkills': 'Roles and skills should be matched to the race profile. Overall is useful for a quick comparison, but sprint, climbing, time trial, flat, endurance, recovery, resistance, race IQ and teamwork decide how a rider performs in specific situations. Pick riders for the route, not only for the highest number.',
        'results': 'Replay and results should be read as an explanation of what happened, not only as a final ranking. Groups, gaps, points, bonus seconds, stage results and classifications can tell the user whether the team tactic worked, whether a rider was isolated, or whether the next race plan should change.',
        'default': 'In practical terms, this means the user should connect this rule to the visible controls on the {{title}} page. Read the status first, then check whether the button is enabled, then understand what will change after clicking it. If the page shows a warning, disabled state, date, cost, count or requirement, that information is usually more important than the button label itself.',
    },
}

GUIDE_SR = {
    'factParagraph': 'Važne referentne vrednosti za ovu temu su: {{factText}}. Kad god se vrednost učitava iz baze podataka, kao merodavne koristite aktuelne vrednosti sa stranice igre, jer se cene, ponude, statusi ili budući balans mogu promeniti bez izmene koda priručnika.',
    'noFactParagraph': 'Ova tema ne zavisi od jedne fiksne brojčane vrednosti. Pri konačnoj odluci koristite aktuelno stanje stranice, upozorenja i dostupne radnje kao merodavan izvor.',
    'categoryIntro': {
        'getting-started': '{{title}} treba razumeti kao deo početne rutine upravljanja. Novi igrači ne treba odmah da pokušavaju da optimizuju sve. Najpre utvrdite čime stranica upravlja, koji podaci su merodavni, koji rokovi postoje i koje radnje mogu imati trajne ili skupe posledice.',
        'coins-and-account': '{{title}} pripada nivou korisničkog naloga, a ne standardnoj ekonomiji klupskog novca. Razdvojite Coins i podešavanja identiteta/profila na nivou naloga od timskih finansija. Ako funkcija koristi Coins, pre potvrde proverite stanje naloga i tačnu aktuelnu cenu paketa ili usluge.',
        'club-identity': '{{title}} utiče na javni identitet kluba. Odluke o brendiranju mogu biti vidljive na rang-listama, startnim listama i profilima timova, dok pravila sponzora sa pravom na naziv mogu privremeno zaključati ili zameniti delove tog identiteta.',
        'dashboard': '{{title}} je deo svakodnevnog toka informacija. Stranice kontrolne table treba da pokažu menadžeru šta trenutno zahteva pažnju. Kada kartica ili upozorenje vodi na drugu stranicu, za konačnu odluku koristite tu detaljniju stranicu umesto samo sažetka.',
        'riders': '{{title}} je povezano sa kvalitetom ekipe i dugoročnim planiranjem rostera. Odluke o vozačima i osoblju treba da kombinuju trenutne performanse, potencijal, umor/zdravlje, trošak ugovora, kapacitet i buduće potrebe na trkama, umesto fokusiranja na samo jedan glavni broj.',
        'training': '{{title}} je odluka o razvoju koja utiče na svežinu. Kvalitet treninga je važan, ali najbolji plan treninga je onaj koji razvija vozače i istovremeno im omogućava da na važne trke stignu dovoljno odmorni za dobar učinak.',
        'equipment': '{{title}} povezuje posedovane predmete, bonuse podešavanja, stanje i pripremu trke. Opremu birajte prema stvarnom profilu trke i održavajte je upotrebljivom; kupovina skupe opreme bez planiranja setova i održavanja rasipa vrednost.',
        'infrastructure': '{{title}} je dugoročno ulaganje u kapacitet. Odluke o objektima i resursima treba da reše stvarno usko grlo, uklapaju se u finansijski plan i budu tempirane prema trajanju izgradnje ili popravke, umesto automatskog unapređivanja.',
        'calendar-and-races': '{{title}} pripada vremenskoj liniji takmičenja. Uvek uporedite podatke o trci, prijavi i predaji vozača sa merodavnim vremenom u igri, a zatim koristite Detalje trke i Pripremu trke za detaljnija pravila i radnje.',
        'race-preparation': '{{title}} je deo završnog toka pripreme pre trke. Prihvaćena prijava nije dovoljna: vozači, podrška, oprema, zalihe, uloge i taktike moraju biti kompletirani pre odgovarajućeg zaključavanja ili roka.',
        'rankings-and-statistics': '{{title}} objašnjava takmičarski kontekst kluba. Bodovi, plasmani i specijalističke tabele treba da usmere sezonske ciljeve i skauting, ali menadžeri i dalje treba da otvore profile timova i vozača pre donošenja odluka samo na osnovu rangiranja.',
        'transfers': '{{title}} je odluka o izgradnji ekipe sa sportskim i finansijskim posledicama. Pre potvrde proverite uklapanje u ulogu, sigurnost skautinga, platu, trajanje, transfernu naknadu kada postoji, kapacitet rostera i uticaj na budući novčani tok kluba.',
        'transfers-and-scouting': '{{title}} kombinuje tržišne radnje sa kvalitetom informacija. Koristite skauting da smanjite neizvesnost, a zatim pregovarajte samo za realne mete koje odgovaraju i ekipi i budžetu.',
        'finance': '{{title}} utiče na opstanak kluba. Uvek razlikujte operativne prihode i rashode od kretanja duga, koristite transakcije da objasnite promene stanja i zadržite dovoljno novca za obavezne ponavljajuće troškove pre plaćanja opcionih poboljšanja.',
        'support-and-account': '{{title}} je funkcija naloga i podrške. Zaštitite podatke naloga, koristite odgovarajući kanal podrške i zapamtite da su podaci korisničkog profila odvojeni od javnog brendiranja kluba i sistema klupskih finansija.',
        'faq': '{{title}} je stavka za rešavanje problema. Najbrži odgovor se obično dobija utvrđivanjem koje stanje igre blokira radnju, a zatim proverom stranice koja upravlja tim stanjem, umesto ponovnog klikanja na onemogućenu radnju.',
    },
    'commonMistake': {
        'equipment': 'Česta greška je kupovina predmeta koji izgleda najjače bez provere stanja, statusa dodele, profila trke ili kompatibilnosti sa setom. Bezbedniji pristup je izgraditi kompletne specijalističke setove i održavati predmete od kojih oni zavise.',
        'finance': 'Česta greška je gledati samo trenutno stanje. Dobro stanje može skrivati buduće obaveze za plate, porez, politike, putovanja ili dug. Pre trošenja novca zajedno proverite ponavljajuće troškove i Transakcije.',
        'calendar-and-races': 'Česta greška je posmatrati datum trke kao jedini važan datum. Rokovi za prijavu, listu timova, predaju vozača i Stage Plan mogu nastupiti ranije i blokirati tim pre početka same trke.',
        'race-preparation': 'Česta greška je videti sačuvan plan i pretpostaviti da je trka spremna. Sačuvano, kompletno i upotrebljivo nisu uvek isto stanje. Pročitajte sažetak spremnosti i ispravite nedostajuće zalihe, uloge ili taktičke blokove pre zaključavanja.',
        'transfers': 'Česta greška je proceniti posao samo prema transfernoj naknadi ili overall oceni. Plata, dužina ugovora, neizvesnost skautinga, uklapanje u ulogu, kapacitet rostera i budući novčani tok mogu naizgled jeftin transfer učiniti skupim.',
        'transfers-and-scouting': 'Česta greška je pregovarati pre smanjenja neizvesnosti. Prvo skautirajte važne mete, a zatim koristite povratne informacije iz pregovora da poboljšate najslabiji deo ponude umesto nasumičnog povećavanja svih troškova.',
        'training': 'Česta greška je svakog dana maksimalno povećavati intenzitet treninga. Razvoj pomaže samo ako vozač i dalje ima dovoljno svežine, morala i zdravlja da nastupi kada stigne važna trka.',
        'infrastructure': 'Česta greška je unaprediti objekat samo zato što viši nivo izgleda bolje. Infrastruktura treba da rešava stvarne potrebe kluba za kapacitetom osoblja, treningom, medicinom, skautingom, mehaničarima ili logistikom.',
        'default': 'Česta greška je ignorisati poruke o onemogućenom stanju, rokove ili preduslove. Kada radnja nije dostupna, prvo pročitajte vidljiv zahtev, a zatim otvorite povezanu stranicu navedenu u linkovima priručnika.',
    },
    'detail': {
        'soldDiscarded': 'Kada se oprema proda ili odbaci, napušta aktivni inventar. Pre potvrde proverite da li se predmet još koristi u podrazumevanom ili specijalističkom setu i da li postoji zamena. Prodaja je i finansijska i operativna odluka jer menja dubinu zaliha i klupski novac.',
        'readyWorn': 'Status treba čitati pre stanja. Ready znači da predmet normalno može učestvovati u uobičajenim radnjama; Assigned znači da ga trenutno koristi drugi set ili događaj; In Maintenance znači da je privremeno nedostupan; Worn znači da stanje zahteva pažnju. Najbezbednija rutina pre trke je proveriti i status i stanje svakog predmeta u izabranom setu.',
        'assigned': 'Assigned je zaštitno stanje. Sprečava slučajnu prodaju, popravku ili ponovnu upotrebu predmeta ili resursa od kojeg drugi plan trenutno zavisi. Otvorite set, Race Plan ili dodelu koja ga koristi, tamo ga zamenite ili uklonite, pa se vratite na radnju u inventaru.',
        'quote': 'Ponuda je pregled stvarne posledice u igri pre potvrde. Uvek proverite ukupan trošak ili povraćaj, trajanje, uslove i upozorenja. Prikazana ponuda je pouzdanija od starog primera iz priručnika jer se backend balans i konfiguracija mogu menjati tokom vremena.',
        'condition': 'Stanje je signal izdržljivosti. Niže stanje povećava potrebu za održavanjem i može smanjiti pouzdanost predmeta ili resursa u važnim planovima. Ne čekajte da svi ključni predmeti budu istrošeni istovremeno; rotirajte popravke kako bi klub zadržao dovoljnu upotrebljivu dubinu.',
        'nutrition': 'Potrošne zalihe se množe brojem vozača i etapa. Potrebnu količinu računajte prema stvarnom broju izabranih vozača i ukupnom broju etapa, a kada je moguće ostavite malu rezervu. Procena za jedan dan nije dovoljna za višednevnu trku.',
        'durableSupplies': 'Trajne zalihe za trku prate se drugačije od potrošnog materijala za jednokratnu upotrebu. Važan je njihov preostali kapacitet korišćenja po etapama. Nedostatak obaveznih dresova može blokirati spremnost; nedostatak jakni za kišu uglavnom smanjuje fleksibilnost po lošem vremenu. Zamenite istrošene jedinice pre važnog bloka trka.',
        'sponsor': 'Informacije o sponzoru treba pročitati pre potpisivanja ili ciljanja trka. Garantovani novac je samo jedan deo ugovora. Ciljevi, bonus fondovi, tehnički popusti, zaključavanje prava na naziv i rokovi mogu promeniti šta klub treba da radi tokom sezone. Dobar sponzorski ugovor odgovara kalendaru tima i snazi ekipe.',
        'tax': 'Porez nije opciona pozadinska informacija. On je deo finansijskog sistema i može promeniti stvarnu vrednost prihoda. Kada prihodi porastu zbog sponzora, nagrada ili bonusa, očekujte poresko zadržavanje ili mesečne korekcije i koristite karticu Porez da razumete konačnu poziciju gotovine.',
        'deadline': 'Periodi i rokovi su strogi jer Race Engine i sezonski sistemi moraju imati stabilne podatke pre simulacije. Ako rok prođe, možete izgubiti mogućnost da izmenite plan, prijavite trku, premestite vozača ili predate roster. Uvek uporedite datum na stranici sa vremenom igre u podnožju.',
        'training': 'Trening i umor moraju biti u ravnoteži. Cilj nije maksimalno opteretiti svaki trening, već stići na važne trke sa vozačima koji napreduju i istovremeno su dovoljno sveži za dobar nastup. Ako umor postane previsok, smanjite intenzitet ili planirajte oporavak.',
        'scouting': 'Skauting smanjuje neizvesnost. Neskautirane spoljne vozače posmatrajte kao nepotpunu informaciju, a ne kao potvrđene vrednosti. Skautski izveštaji čine transferne odluke sigurnijim jer otkrivaju ili procenjuju overall, potencijal, prednosti i druge skrivene podatke uz određeni nivo preciznosti.',
        'finance': 'Svako pominjanje troška treba povezati sa stranicom Finansije. Pitajte se: da li je ovo jednokratni, nedeljni, mesečni, trošak po putovanju ili sezonski trošak? Razlika je važna jer ponavljajući troškovi mogu neprimetno stvoriti više opasnosti od jedne kupovine.',
        'roleSkills': 'Uloge i veštine treba uskladiti sa profilom trke. Overall je koristan za brzo poređenje, ali sprint, climbing, time trial, flat, endurance, recovery, resistance, race IQ i teamwork odlučuju kako vozač nastupa u određenim situacijama. Birajte vozače prema ruti, ne samo prema najvišem broju.',
        'results': 'Replay i rezultate treba čitati kao objašnjenje onoga što se dogodilo, a ne samo kao konačan plasman. Grupe, razlike, bodovi, bonus sekunde, rezultati etapa i klasifikacije mogu pokazati da li je taktika uspela, da li je vozač ostao izolovan ili treba promeniti plan za sledeću trku.',
        'default': 'U praksi to znači da ovo pravilo treba povezati sa vidljivim kontrolama na stranici {{title}}. Prvo pročitajte status, zatim proverite da li je dugme omogućeno, pa razumite šta će se promeniti nakon klika. Ako stranica prikazuje upozorenje, onemogućeno stanje, datum, trošak, broj ili zahtev, ta informacija je obično važnija od samog naziva dugmeta.',
    },
}

EXACT_OVERRIDES = {
    **CATEGORY_SR,
    'Quick Start for New Managers': 'Brzi početak za nove menadžere',
    'Game Time and Deadlines': 'Vreme u igri i rokovi',
    'Overview Page': 'Stranica Pregled',
    'Notifications and Inbox': 'Obaveštenja i Inbox',
    'Squad, First Team and Rider List Views': 'Ekipa, Prvi tim i prikazi liste vozača',
    'Developing Team': 'Razvojni tim',
    'Open Overview': 'Otvori Pregled',
    'Open Squad': 'Otvori Ekipu',
    'Open Finance': 'Otvori Finansije',
    'Customize Team': 'Prilagodi tim',
    'Coin Packages': 'Coins paketi',
    'Invite Friends': 'Pozovi prijatelje',
    'Preferences': 'Podešavanja',
    'Staff Market': 'Tržište osoblja',
    'First Team': 'Prvi tim',
    'Overview': 'Pregled',
    'Squad': 'Ekipa',
    'Finance': 'Finansije',
    'Calendar': 'Kalendar',
    'Training': 'Trening',
    'Equipment': 'Oprema',
    'Infrastructure': 'Infrastruktura',
    'Transfers': 'Transferi',
    'Scouting': 'Skauting',
    'Statistics': 'Statistika',
    'Notifications': 'Obaveštenja',
    'Inbox': 'Inbox',
}

CYR_LAT = str.maketrans({
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z','И':'I','Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R','С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Č','Џ':'Dž','Ш':'Š',
    'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c','ч':'č','џ':'dž','ш':'š',
})

PROTECT_RE = re.compile(
    r'https?://\S+|/dashboard/[A-Za-z0-9_?=&/.-]+|\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b|'
    r'\b(?:ProPeloton Manager|Supabase|Stripe|Discord|Coins?|RPC|GC|TT|U23|UI|FAQ|JPG|PNG|WEBP|PDF|Race Engine|Replay Engine|Stage Plan|Race Plan)\b',
    re.IGNORECASE,
)


def protect_text(value: str) -> tuple[str, dict[str, str]]:
    saved: dict[str, str] = {}

    def repl(match: re.Match[str]) -> str:
        token = f'ZXQ{len(saved)}QXZ'
        saved[token] = match.group(0)
        return token

    return PROTECT_RE.sub(repl, value), saved


def restore_text(value: str, saved: dict[str, str]) -> str:
    out = value
    for token, original in saved.items():
        out = out.replace(token, original)
        out = out.replace(token.lower(), original)
    return out


def translate_strings(values: list[str]) -> dict[str, str]:
    unique = []
    seen = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
    model.eval()
    torch.set_num_threads(max(1, min(4, torch.get_num_threads())))

    translated: dict[str, str] = {}
    pending: list[str] = []
    protected_inputs: dict[str, tuple[str, dict[str, str]]] = {}

    for value in unique:
        if value in EXACT_OVERRIDES:
            translated[value] = EXACT_OVERRIDES[value]
            continue
        if not re.search(r'[A-Za-z]', value):
            translated[value] = value
            continue
        protected, saved = protect_text(value)
        protected_inputs[value] = (protected, saved)
        pending.append(value)

    batch_size = 12
    for start in range(0, len(pending), batch_size):
        batch_sources = pending[start:start + batch_size]
        batch = [TARGET_PREFIX + protected_inputs[src][0] for src in batch_sources]
        encoded = tokenizer(batch, return_tensors='pt', padding=True, truncation=True, max_length=512)
        with torch.no_grad():
            output = model.generate(**encoded, max_new_tokens=512, num_beams=1)
        decoded = tokenizer.batch_decode(output, skip_special_tokens=True)

        for src, result in zip(batch_sources, decoded):
            result = restore_text(result.strip(), protected_inputs[src][1])
            result = result.translate(CYR_LAT)
            translated[src] = result

        done = min(start + batch_size, len(pending))
        print(f'Translated {done}/{len(pending)} manual strings')

    return translated


def collect_section_strings(sections: list[dict[str, Any]]) -> list[str]:
    result: list[str] = []
    for section in sections:
        for key in ('category', 'title', 'subtitle', 'overview'):
            value = section.get(key)
            if isinstance(value, str): result.append(value)
        for fact in section.get('facts') or []:
            for key in ('label', 'value'):
                value = fact.get(key)
                if isinstance(value, str): result.append(value)
        result.extend(value for value in (section.get('details') or []) if isinstance(value, str))
        result.extend(value for value in (section.get('tips') or []) if isinstance(value, str))
        for link in section.get('relatedLinks') or []:
            value = link.get('label')
            if isinstance(value, str): result.append(value)
    return result


def section_resource(section: dict[str, Any], translate: dict[str, str] | None = None) -> dict[str, Any]:
    def value(text: str) -> str:
        return translate.get(text, text) if translate is not None else text

    resource: dict[str, Any] = {
        'category': value(section['category']),
        'title': value(section['title']),
        'subtitle': value(section['subtitle']),
        'overview': value(section['overview']),
        'details': [value(item) for item in section.get('details') or []],
    }
    if section.get('facts'):
        resource['facts'] = [
            {'label': value(item['label']), 'value': value(item['value'])}
            for item in section['facts']
        ]
    if section.get('tips'):
        resource['tips'] = [value(item) for item in section['tips']]
    if section.get('relatedLinks'):
        resource['relatedLinks'] = [value(item['label']) for item in section['relatedLinks']]
    return resource


def patch_i18n(source: str) -> str:
    if "import enManual from './locales/en/manual.json'" not in source:
        source = replace_once(
            source,
            "import enHelp from './locales/en/help.json'\n",
            "import enHelp from './locales/en/help.json'\nimport enManual from './locales/en/manual.json'\n",
            'en manual import',
        )
    if "import srManual from './locales/sr-Latn/manual.json'" not in source:
        source = replace_once(
            source,
            "import srHelp from './locales/sr-Latn/help.json'\n",
            "import srHelp from './locales/sr-Latn/help.json'\nimport srManual from './locales/sr-Latn/manual.json'\n",
            'sr manual import',
        )
    if 'manual: enManual,' not in source:
        source = replace_once(source, '    help: enHelp,\n', '    help: enHelp,\n    manual: enManual,\n', 'en manual resource')
    if 'manual: srManual,' not in source:
        source = replace_once(source, '    help: srHelp,\n', '    help: srHelp,\n    manual: srManual,\n', 'sr manual resource')
    if "      'manual'," not in source:
        source = replace_once(source, "      'help',\n", "      'help',\n      'manual',\n", 'manual namespace')
    return source


HELPERS = r'''
function manualCategoryKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function localizeManualSection(section: ManualSection, t: any): ManualSection {
  const base = `sections.${section.id}`
  return {
    ...section,
    category: t(`${base}.category`, { defaultValue: section.category }),
    title: t(`${base}.title`, { defaultValue: section.title }),
    subtitle: t(`${base}.subtitle`, { defaultValue: section.subtitle }),
    overview: t(`${base}.overview`, { defaultValue: section.overview }),
    facts: section.facts?.map((fact, index) => ({
      label: t(`${base}.facts.${index}.label`, { defaultValue: fact.label }),
      value: t(`${base}.facts.${index}.value`, { defaultValue: fact.value }),
    })),
    details: section.details.map((detail, index) =>
      t(`${base}.details.${index}`, { defaultValue: detail }),
    ),
    tips: section.tips?.map((tip, index) =>
      t(`${base}.tips.${index}`, { defaultValue: tip }),
    ),
    relatedLinks: section.relatedLinks?.map((link, index) => ({
      ...link,
      label: t(`${base}.relatedLinks.${index}`, { defaultValue: link.label }),
    })),
  }
}

const manualSectionById = new Map(manualSections.map(section => [section.id, section]))

function getLocalizedSectionGuideParagraphs(
  section: ManualSection,
  sourceCategory: string,
  t: any,
): string[] {
  const facts = section.facts ?? []
  const factText = facts.map(fact => `${fact.label}: ${fact.value}`).join('; ')
  const key = manualCategoryKey(sourceCategory)
  const intro = t(`guide.categoryIntro.${key}`, { title: section.title })
  const factParagraph = factText
    ? t('guide.factParagraph', { factText })
    : t('guide.noFactParagraph')
  const mistakeKey = [
    'equipment',
    'finance',
    'calendar-and-races',
    'race-preparation',
    'transfers',
    'transfers-and-scouting',
    'training',
    'infrastructure',
  ].includes(key) ? key : 'default'
  return [intro, factParagraph, t(`guide.commonMistake.${mistakeKey}`)]
}

function getLocalizedExpandedDetailExplanation(
  section: ManualSection,
  sourceDetail: string,
  t: any,
): string {
  const d = sourceDetail.toLowerCase()
  let key = 'default'

  if (d.includes('sold') || d.includes('discarded')) key = 'soldDiscarded'
  else if (d.includes('ready') && d.includes('worn')) key = 'readyWorn'
  else if (d.includes('assigned')) key = 'assigned'
  else if (d.includes('repair quote') || d.includes('quote')) key = 'quote'
  else if (d.includes('condition')) key = 'condition'
  else if (d.includes('bidons') || d.includes('gels') || d.includes('nutrition')) key = 'nutrition'
  else if (d.includes('jersey') || d.includes('rain jackets') || d.includes('rain jacket')) key = 'durableSupplies'
  else if (d.includes('sponsor') || d.includes('objectives')) key = 'sponsor'
  else if (d.includes('tax')) key = 'tax'
  else if (d.includes('deadline') || d.includes('window')) key = 'deadline'
  else if (d.includes('training') || d.includes('fatigue')) key = 'training'
  else if (d.includes('scout') || d.includes('scouting')) key = 'scouting'
  else if (d.includes('cash') || d.includes('cost') || d.includes('salary') || d.includes('balance')) key = 'finance'
  else if (d.includes('role') || d.includes('skills') || d.includes('overall')) key = 'roleSkills'
  else if (d.includes('replay') || d.includes('results') || d.includes('classification')) key = 'results'

  return t(`guide.detail.${key}`, { title: section.title })
}
'''


def patch_manual(source: str) -> str:
    if "useTranslation } from 'react-i18next'" not in source:
        source = replace_once(
            source,
            "import React, { useMemo, useState } from 'react'\nimport { Link } from 'react-router'\n",
            "import React, { useMemo, useState } from 'react'\nimport { useTranslation } from 'react-i18next'\nimport { Link } from 'react-router'\n",
            'manual import',
        )

    helper_anchor = 'const manualCategories = Array.from(new Set(manualSections.map(section => section.category)))\n'
    if 'function localizeManualSection(' not in source:
        source = replace_once(source, helper_anchor, helper_anchor + '\n' + HELPERS + '\n', 'manual helpers')

    source = replace_once(
        source,
        "export default function ManualPage(): JSX.Element {\n  const [query, setQuery] = useState('')",
        "export default function ManualPage(): JSX.Element {\n  const { t, i18n } = useTranslation('manual')\n  const [query, setQuery] = useState('')",
        'manual hook',
    )

    old_filter = """  const filteredSections = useMemo(() => {\n    return manualSections.filter(section => {\n      const matchesCategory = category === 'all' || section.category === category\n      const matchesQuery = sectionMatchesQuery(section, query)\n      return matchesCategory && matchesQuery\n    })\n  }, [category, query])\n\n  const visibleCountLabel = filteredSections.length === 1 ? '1 section' : `${filteredSections.length} sections`\n"""
    new_filter = """  const filteredSections = useMemo(() => {\n    return manualSections\n      .filter(section => category === 'all' || section.category === category)\n      .map(section => localizeManualSection(section, t))\n      .filter(section => sectionMatchesQuery(section, query))\n  }, [category, query, t, i18n.language])\n\n  const visibleCountLabel = t('ui.visibleCount', { count: filteredSections.length })\n"""
    source = replace_once(source, old_filter, new_filter, 'localized filtering')

    replacements = [
        ('<p className="text-xs uppercase tracking-[0.2em] text-yellow-300">Manual</p>', '<p className="text-xs uppercase tracking-[0.2em] text-yellow-300">{t(\'ui.eyebrow\')}</p>'),
        ('          ProPeloton Manager Manual\n', "          {t('ui.title')}\n"),
        ("""          This expanded manual is a deep player reference for ProPeloton Manager. It covers\n          account pages, coins, referrals, club identity, dashboard navigation, notifications,\n          riders, staff, training, camps, equipment, infrastructure, calendar, race detail,\n          race preparation, replay, rankings, statistics, transfers, scouting, finance,\n          sponsors, taxes, policies, liquidation and FAQ topics. Sections are closed by\n          default, so open only the topic you need.\n""", "          {t('ui.description')}\n"),
        ('            {manualSections.length} sections\n', "            {t('ui.sectionCount', { count: manualSections.length })}\n"),
        ('            {manualCategories.length} categories\n', "            {t('ui.categoryCount', { count: manualCategories.length })}\n"),
        ('            All sections closed by default\n', "            {t('ui.closedByDefault')}\n"),
        ('            Back to Help\n', "            {t('ui.backToHelp')}\n"),
        ('            Print / Save as PDF\n', "            {t('ui.printPdf')}\n"),
        ('            Ask on Discord\n', "            {t('ui.askDiscord')}\n"),
        ('<h2 className="text-lg font-semibold text-slate-900">Start here</h2>', '<h2 className="text-lg font-semibold text-slate-900">{t(\'ui.startHereTitle\')}</h2>'),
        ("""          New managers should first read <strong>Quick Start</strong>, <strong>Game Time</strong>,{' '}\n          <strong>Overview</strong>, <strong>Squad</strong>, <strong>Training</strong>,{' '}\n          <strong>Race Preparation</strong> and <strong>Finance</strong>. Experienced managers can use\n          search for specific topics like sponsor naming rights, race supplies, playoffs,\n          tax audits, emergency rescues or developing-team movement windows.\n""", "          {t('ui.startHereDescription')}\n"),
        ('<span className="text-sm font-medium text-slate-700">Search manual</span>', '<span className="text-sm font-medium text-slate-700">{t(\'ui.searchLabel\')}</span>'),
        ('              placeholder="Search coins, sponsors, race preparation, tax, equipment..."\n', "              placeholder={t('ui.searchPlaceholder')}\n"),
        ('<span className="text-sm font-medium text-slate-700">Category</span>', '<span className="text-sm font-medium text-slate-700">{t(\'ui.categoryLabel\')}</span>'),
        ('              <option value="all">All categories</option>\n', "              <option value=\"all\">{t('ui.allCategories')}</option>\n"),
        ('                  {categoryName}\n', "                  {t(`categories.${manualCategoryKey(categoryName)}`, { defaultValue: categoryName })}\n"),
        ('              Open visible\n', "              {t('ui.openVisible')}\n"),
        ('              Close all\n', "              {t('ui.closeAll')}\n"),
        ('        <div className="mt-3 text-sm text-slate-500">Showing {visibleCountLabel}.</div>\n', '        <div className="mt-3 text-sm text-slate-500">{visibleCountLabel}</div>\n'),
        ('<h2 className="text-base font-semibold text-slate-900">No manual sections found</h2>', '<h2 className="text-base font-semibold text-slate-900">{t(\'ui.noSectionsTitle\')}</h2>'),
        ('              Try a different search term or switch category back to all.\n', "              {t('ui.noSectionsDescription')}\n"),
        ("                    {isOpen ? 'Close' : 'Open'}\n", "                    {isOpen ? t('ui.close') : t('ui.open')}\n"),
        ('<h3 className="text-sm font-semibold text-slate-900">Summary</h3>', '<h3 className="text-sm font-semibold text-slate-900">{t(\'ui.summary\')}</h3>'),
        ('<h3 className="text-sm font-semibold text-slate-900">Detailed explanation</h3>', '<h3 className="text-sm font-semibold text-slate-900">{t(\'ui.detailedExplanation\')}</h3>'),
        ('                        {getSectionGuideParagraphs(section).map(paragraph => (\n', "                        {getLocalizedSectionGuideParagraphs(\n                          section,\n                          manualSectionById.get(section.id)?.category ?? section.category,\n                          t,\n                        ).map(paragraph => (\n"),
        ('                            Rule {index + 1}\n', "                            {t('ui.rule', { count: index + 1 })}\n"),
        ('                            {getExpandedDetailExplanation(section, paragraph)}\n', "                            {getLocalizedExpandedDetailExplanation(\n                              section,\n                              manualSectionById.get(section.id)?.details[index] ?? paragraph,\n                              t,\n                            )}\n"),
        ('<h3 className="text-sm font-semibold text-slate-900">Practical tips</h3>', '<h3 className="text-sm font-semibold text-slate-900">{t(\'ui.practicalTips\')}</h3>'),
        ('<h2 className="text-lg font-semibold">Manual maintenance note</h2>', '<h2 className="text-lg font-semibold">{t(\'ui.maintenanceTitle\')}</h2>'),
        ("""          This manual is a deep first version based on the current pages and systems.\n          Exact values that are loaded from the database, such as live coin package prices,\n          some policy option costs, camp quotes, sponsor offer values and infrastructure costs,\n          should always be trusted from the live page if the backend config changes.\n""", "          {t('ui.maintenanceDescription')}\n"),
        ('            Contact Us\n', "            {t('ui.contactUs')}\n"),
    ]

    for old, new in replacements:
        source = replace_once(source, old, new, f'UI replacement: {old[:60]}')

    return source


def main() -> None:
    manual_source = MANUAL_PATH.read_text(encoding='utf-8')
    if "useTranslation('manual')" in manual_source and EN_PATH.exists() and SR_PATH.exists():
        print('Manual localization already present; nothing to do.')
        return

    sections = extract_sections(manual_source)
    if len(sections) != 92:
        raise SystemExit(f'Expected 92 manual sections, found {len(sections)}')

    strings = collect_section_strings(sections)
    translation_map = translate_strings(strings)

    categories_en = {category_key(section['category']): section['category'] for section in sections}
    categories_sr = {
        category_key(section['category']): CATEGORY_SR.get(section['category'], translation_map.get(section['category'], section['category']))
        for section in sections
    }

    en_resource = {
        'ui': UI_EN,
        'categories': categories_en,
        'guide': GUIDE_EN,
        'sections': {section['id']: section_resource(section) for section in sections},
    }
    sr_resource = {
        'ui': UI_SR,
        'categories': categories_sr,
        'guide': GUIDE_SR,
        'sections': {section['id']: section_resource(section, translation_map) for section in sections},
    }

    EN_PATH.write_text(json.dumps(en_resource, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    SR_PATH.write_text(json.dumps(sr_resource, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    MANUAL_PATH.write_text(patch_manual(manual_source), encoding='utf-8')
    I18N_PATH.write_text(patch_i18n(I18N_PATH.read_text(encoding='utf-8')), encoding='utf-8')

    print(f'Localized {len(sections)} manual sections.')
    print(f'Generated {EN_PATH.relative_to(ROOT)} and {SR_PATH.relative_to(ROOT)}.')


if __name__ == '__main__':
    main()
