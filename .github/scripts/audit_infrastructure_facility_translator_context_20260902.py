import json
from pathlib import Path

locales = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']
facility_levels = {
    'club_house': range(0, 6),
    'training_center': range(0, 6),
    'medical_center': range(0, 6),
    'youth_academy': range(0, 3),
    'mechanics_workshop': range(0, 5),
    'scouting_office': range(0, 5),
}
required_guide = [
    'title', 'whatEveryLevelProvides', 'currentPanelTitle', 'nextPanelTitle',
    'activeNow', 'unlocks', 'effects', 'monthlyMaintenance', 'perGameMonth',
    'upgradeCost', 'constructionTime', 'estimatedCompletion', 'levelLabel',
    'currentLevel', 'unlocked', 'futureLevel', 'upgradeToThisLevel',
    'maximumReached', 'levelBadge', 'imageAlt', 'noAdditionalUnlock',
    'noAdditionalEffect',
]

bundles = {}
for locale in locales:
    path = Path('src/i18n/locales') / locale / 'infrastructure.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    bundles[locale] = data
    guide = data.get('facilityGuide', {})
    missing = [k for k in required_guide if not isinstance(guide.get(k), str) or not guide.get(k).strip()]
    if missing:
        raise SystemExit(f'{locale}: missing facilityGuide keys: {missing}')
    levels = data.get('facilityLevelDetails', {})
    for facility, level_range in facility_levels.items():
        if facility not in levels:
            raise SystemExit(f'{locale}: missing facilityLevelDetails.{facility}')
        for level in level_range:
            row = levels[facility].get(f'level{level}', {})
            for field in ('unlock', 'effect'):
                if not isinstance(row.get(field), str) or not row[field].strip():
                    raise SystemExit(f'{locale}: missing facilityLevelDetails.{facility}.level{level}.{field}')

sr = bundles['sr-Latn']
expected_sr = {
    ('facilityGuide', 'title'): 'Vodič kroz nivoe objekta',
    ('facilityGuide', 'whatEveryLevelProvides'): 'Šta pruža svaki nivo',
    ('facilityGuide', 'currentPanelTitle'): 'Trenutni nivo {{level}}',
    ('facilityGuide', 'nextPanelTitle'): 'Sledeći nivo {{level}}',
    ('facilityGuide', 'activeNow'): 'Trenutno aktivno',
    ('facilityGuide', 'unlocks'): 'Otključava:',
    ('facilityGuide', 'effects'): 'Efekti:',
    ('facilityGuide', 'monthlyMaintenance'): 'Mesečno održavanje:',
    ('facilityGuide', 'currentLevel'): 'Trenutni nivo',
    ('facilityGuide', 'unlocked'): 'Otključano',
    ('facilityGuide', 'futureLevel'): 'Budući nivo',
    ('facilities', 'currentStatus'): 'Trenutni status',
    ('facilities', 'status'): 'Status:',
}
for path, expected in expected_sr.items():
    value = sr
    for part in path:
        value = value[part]
    if value != expected:
        raise SystemExit(f'Serbian runtime assertion failed for {".".join(path)}: {value!r}')

sr_level_checks = {
    ('club_house', 'level0', 'unlock'): 'Samo osnovna administracija kluba.',
    ('club_house', 'level1', 'unlock'): 'Nema nove uloge osoblja.',
    ('club_house', 'level2', 'unlock'): 'Otključava mesto za sportskog direktora.',
}
for path, expected in sr_level_checks.items():
    value = sr['facilityLevelDetails'][path[0]][path[1]][path[2]]
    if value != expected:
        raise SystemExit(f'Serbian facility detail assertion failed for {path}: {value!r}')

facilities_src = Path('src/pages/dashboard/infrastructure/FacilitiesSection.tsx').read_text(encoding='utf-8')
infra_src = Path('src/pages/dashboard/Infrastructure.tsx').read_text(encoding='utf-8')

if 'translate: InfrastructureT' not in facilities_src:
    raise SystemExit('FacilitiesSection does not require the parent translator')
if '<InfrastructureTranslationContext.Provider value={translate}>' not in facilities_src:
    raise SystemExit('FacilitiesSection translator provider missing')
if 'translate={t}' not in infra_src:
    raise SystemExit('Infrastructure page does not pass its translator to FacilitiesSection')

for forbidden in [
    '>Facility level guide<',
    '>What every level provides<',
    "'Current level'",
    "'Future level'",
    "'Unlocked'",
    '>Unlocks:<',
    '>Effects:<',
    '>Monthly maintenance:<',
    '>Active now<',
]:
    if forbidden in facilities_src:
        raise SystemExit(f'Hardcoded facility-guide English remains: {forbidden}')

print('Infrastructure facility translator-context audit PASSED')
print('Locales checked:', ', '.join(locales))
print('Facility guide keys checked:', len(required_guide))
print('Facility levels checked:', sum(len(list(v)) for v in facility_levels.values()))
print('Serbian screenshot assertions: PASSED')
print('Parent translator propagation: PASSED')
