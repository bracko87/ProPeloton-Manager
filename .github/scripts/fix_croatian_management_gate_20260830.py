from __future__ import annotations

import json
from pathlib import Path

ROOT = Path('src/i18n/locales/hr')
PATCHES: dict[str, dict[str, str]] = {
    'finance.json': {
        'overview.lastPeriods': 'posljednjih {{count}} razdoblja',
        'sponsors.historyLabel': 'Naziv u povijesti nakon ugovora: {{name}}',
        'sponsors.historyLabelPrefix': 'Naziv u povijesti nakon ugovora:',
        'sponsors.contractSummaryDescription': 'Ova polja pripadaju aktivnom ugovoru glavnog sponzora i promijenit će se kada se u nekoj sljedećoj sezoni potpiše novi glavni sponzor.',
        'sponsors.noSlotSponsor': 'Još nema sponzora dodijeljenog ovom mjestu.',
        'sponsors.previewCheckedAfterRacesDescription': 'Ciljevi se provjeravaju nakon konačnog rezultata ciljane utrke ili etape, a bonus se zatim isplaćuje kroz financije.',
        'transactions.noMonth': 'Nema transakcija u razdoblju {{month}}.',
        'transactions.showMonth': 'Prikazano {{start}}-{{end}} od {{total}} stavki u razdoblju {{month}}.',
        'policies.saveFailed': 'Politike tima nije bilo moguće spremiti.',
        'policies.staffEquipmentDescription': 'Minimalni paket opreme koji se primjenjuje jednokratno kada se zaposli novi član osoblja.',
        'policies.applyChangesDescription': 'Time se odjednom primjenjuju sva promijenjena polja politika. Izmjene se spremaju tek nakon što kliknete Primijeni.',
    },
    'transfers.json': {
        'staffMarket.noCurrentStaff': 'Trenutačno nema osoblja dodijeljenog ovoj ulozi',
        'staffMarket.noStaffOpen': 'Nema dodijeljenog osoblja • {{slots}} slobodnih mjesta',
        'intelligence.premiumLimit': 'Premium: do {{limit}} spremljenih pretraga',
        'intelligence.limitReached': 'Dosegnuto je ograničenje spremljenih pretraga ({{limit}}).',
        'intelligence.slotUnlocked': 'Mjesto za spremljenu pretragu {{slot}} trajno je otključano.',
        'negotiation.lockExplanation': 'Vozač nije bio zadovoljan vašom posljednjom ponudom i pauzirao je pregovore do',
    },
    'riderProfile.json': {
        'premiumBid.statuses.likely_counteroffer': 'Vjerojatna protuponuda',
        'ownedContract.u23Open': 'Ovaj vozač napunio je 24 godine i više nema pravo nastupa za Razvojni tim. Mora biti premješten u Prvi tim ili otpušten prije zatvaranja trenutačnog razdoblja za premještanje.',
        'ownedContract.u23Closed': 'Ovaj vozač napunio je 24 godine i više nema pravo nastupa za Razvojni tim. Može ostati tamo do sljedećeg razdoblja za premještanje, ali prije zatvaranja tog razdoblja mora biti premješten u Prvi tim ili otpušten.',
        'ownedTraining.teamDefault': 'Zadano za tim:',
        'ownedAnalysis.attributeHeatmapSubtitle': 'Trenutačna vizualna klasifikacija elitnih, jakih, prosječnih i slabih područja',
        'ownedRenewal.likelyMinimum': 'Vjerojatni minimum',
    },
    'preferences.json': {
        'groups.racePreparation.description': 'Prikaži osnovne statusne obavijesti i posljedice povezane s pripremom utrke. Proaktivni savjeti o rokovima vozača pripadaju sustavu Sports Director Advisory.',
        'groups.systemMessages.label': 'Sustavne poruke',
        'developingTeam.movementRule': 'Vozači prelaze između ekipa samo tijekom razdoblja za premještanje.',
    },
    'notifications.json': {
        'page.subtitle': 'Događaji u igri, administratorske poruke i sustavna ažuriranja za vaš klub.',
        'categories.systemMessages': 'Sustavne poruke',
        'headCoach.windowStart': 'Početak razdoblja',
        'headCoach.windowEnd': 'Kraj razdoblja',
    },
}


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for part in parts[:-1]:
        node = node[part]
    node[parts[-1]] = value


count = 0
for filename, patches in PATCHES.items():
    path = ROOT / filename
    data = json.loads(path.read_text(encoding='utf-8'))
    for dotted, value in patches.items():
        set_path(data, dotted, value)
        count += 1
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{filename}: fixed {len(patches)} Croatian wording issues')

print(f'Applied {count} exact Croatian management wording fixes.')
