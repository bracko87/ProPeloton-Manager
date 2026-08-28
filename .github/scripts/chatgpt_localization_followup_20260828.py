from pathlib import Path
import json
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace(path: str, old: str, new: str, *, required: bool = True) -> int:
    text = read(path)
    count = text.count(old)
    if required and count == 0:
        raise SystemExit(f'Missing required replacement in {path}: {old[:140]!r}')
    if count:
        text = text.replace(old, new)
        write(path, text)
        print(f'{path}: replaced {count}: {old[:90]!r}')
    return count


def regex_replace(path: str, pattern: str, replacement: str, *, required: bool = True, count: int = 0) -> int:
    text = read(path)
    next_text, hits = re.subn(pattern, replacement, text, count=count, flags=re.MULTILINE)
    if required and hits == 0:
        raise SystemExit(f'Missing required regex in {path}: {pattern[:140]!r}')
    if hits:
        write(path, next_text)
        print(f'{path}: regex replaced {hits}: {pattern[:90]!r}')
    return hits


def load_json(path: str):
    return json.loads(read(path))


def save_json(path: str, value) -> None:
    write(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


# ---------------------------------------------------------------------------
# Training Camps: remaining labels and backend warning localization
# ---------------------------------------------------------------------------
training_en_path = 'src/i18n/locales/en/training.json'
training_sr_path = 'src/i18n/locales/sr-Latn/training.json'
training_en = load_json(training_en_path)
training_sr = load_json(training_sr_path)

training_en['common']['wage'] = 'Wage'
training_sr['common']['wage'] = 'Plata'

training_en['camps'].update({
    'ridersLabel': 'Riders',
    'staffLabel': 'Staff',
    'noStaffWarningAllowed': 'No staff selected. This is allowed, but the camp will not receive staff boosts.',
    'noStaffWarningRunning': 'No staff selected. The camp will run without staff boosts.',
})
training_sr['camps'].update({
    'ridersLabel': 'Vozači',
    'staffLabel': 'Osoblje',
    'noStaffWarningAllowed': 'Nije izabrano osoblje. Ovo je dozvoljeno, ali kamp neće dobiti bonuse osoblja.',
    'noStaffWarningRunning': 'Nije izabrano osoblje. Kamp će biti održan bez bonusa osoblja.',
})

save_json(training_en_path, training_en)
save_json(training_sr_path, training_sr)

training_path = 'src/pages/dashboard/Training.tsx'
replace(
    training_path,
    "  const { t } = useTranslation('training')\n  const navigate = useNavigate()",
    "  const { t } = useTranslation('training')\n  const translateCampSystemMessage = (message: string): string => {\n    const normalized = message.trim()\n\n    if (normalized === 'No staff selected. This is allowed, but the camp will not receive staff boosts.') {\n      return t('camps.noStaffWarningAllowed')\n    }\n\n    if (normalized === 'No staff selected. The camp will run without staff boosts.') {\n      return t('camps.noStaffWarningRunning')\n    }\n\n    if (normalized === 'No staff selected. The camp can still be booked, but there will be no coach, doctor, mechanic, or director boost.') {\n      return t('camps.noStaffSelected')\n    }\n\n    return message\n  }\n  const navigate = useNavigate()",
)
replace(
    training_path,
    '                  No staff selected. The camp can still be booked, but there will be no coach, doctor, mechanic, or director boost.',
    "                  {t('camps.noStaffSelected')}",
)
replace(training_path, '<div className="font-medium">Riders</div>', '<div className="font-medium">{t(\'camps.ridersLabel\')}</div>')
replace(training_path, '<div className="font-medium">Staff</div>', '<div className="font-medium">{t(\'camps.staffLabel\')}</div>')
replace(
    training_path,
    "{quote.weather_state === 'unavailable' ? t('common.unavailable') : WEATHER_LABELS[quote.weather_state]}",
    "{t(`weather.${quote.weather_state}`, { defaultValue: WEATHER_LABELS[quote.weather_state] })}",
)
replace(training_path, '<li key={message}>{message}</li>', '<li key={message}>{translateCampSystemMessage(message)}</li>', required=False)
replace(training_path, '<li key={`validation-${message}`}>{message}</li>', '<li key={`validation-${message}`}>{translateCampSystemMessage(message)}</li>')
replace(training_path, '<li key={`quote-${message}`}>{message}</li>', '<li key={`quote-${message}`}>{translateCampSystemMessage(message)}</li>')
replace(
    training_path,
    "{member.club_name || 'Club'} · {member.specialization || 'General'} · OVR{' '}\n                              {member.overall ?? '-'} · Wage {formatCurrency(member.salary_weekly ?? 0)}",
    "{member.club_name || t('common.club')} · {member.specialization === 'General' ? t('common.general') : (member.specialization || t('common.general'))} · OVR{' '}\n                              {member.overall ?? '-'} · {t('common.wage')} {formatCurrency(member.salary_weekly ?? 0)}",
    required=False,
)
replace(training_path, '                                Boost: {member.boost_label}', "                                {t('common.boost', { value: member.boost_label })}", required=False)
replace(training_path, '                  Pick a camp, riders, and optional staff to see the quote.', "                  {t('camps.quotePrompt')}", required=False)
replace(training_path, '                  Cancel Training Camp', "                  {t('camps.cancelTitle')}", required=False)
replace(training_path, '                  Please confirm that you want to cancel this training camp.', "                  {t('camps.cancelSubtitle')}", required=False)
replace(training_path, '                  Camp', "                  {t('camps.camp')}", required=False)


# ---------------------------------------------------------------------------
# Infrastructure translations and asset/facility copy
# ---------------------------------------------------------------------------
infra_en_path = 'src/i18n/locales/en/infrastructure.json'
infra_sr_path = 'src/i18n/locales/sr-Latn/infrastructure.json'
infra_en = load_json(infra_en_path)
infra_sr = load_json(infra_sr_path)

infra_en['common'].update({
    'none': 'None',
    'gameDay': '{{count}} game day',
    'gameDays': '{{count}} game days',
    'currentCoinBalance': 'Current coin balance:',
})
infra_sr['common'].update({
    'none': 'Nema',
    'gameDay': '{{count}} dan igre',
    'gameDays': '{{count}} dana igre',
    'currentCoinBalance': 'Trenutno stanje novčića:',
    'acquire': 'Naruči',
})

# User-facing action wording: an asset is ordered for delivery, not instantly acquired.
for key, en_value, sr_value in [
    ('acquireTeamCar', 'Order Team Car', 'Naruči timski automobil'),
    ('acquireTeamBus', 'Order Team Bus', 'Naruči timski autobus'),
    ('acquireEquipmentVan', 'Order Equipment Van', 'Naruči kombi za opremu'),
    ('acquireMobileWorkshop', 'Order Mobile Workshop', 'Naruči mobilnu radionicu'),
    ('acquireMedicalVan', 'Order Medical Van', 'Naruči medicinski kombi'),
]:
    infra_en['assets'][key] = en_value
    infra_sr['assets'][key] = sr_value

infra_en['assets']['startDelivery'] = 'Order for delivery'
infra_sr['assets']['startDelivery'] = 'Naruči'
infra_en['assets']['unlockCoins'] = 'Unlock permanently · {{coins}} coins'
infra_sr['assets']['unlockCoins'] = 'Trajno otključaj · {{coins}} novčića'
infra_en['assets']['premiumSlotDescription'] = 'Available automatically while Premium is active, or permanently with coins.'
infra_sr['assets']['premiumSlotDescription'] = 'Automatski dostupno dok je Premium aktivan ili trajno uz novčiće.'
infra_en['assets']['renameFailed'] = 'Failed to rename {{asset}}.'
infra_sr['assets']['renameFailed'] = 'Preimenovanje nije uspelo: {{asset}}.'

infra_en['assetStatus'] = {
    'available': 'Available',
    'assigned': 'Assigned',
    'inRepair': 'In repair',
    'sold': 'Sold',
}
infra_sr['assetStatus'] = {
    'available': 'Dostupno',
    'assigned': 'Dodeljeno',
    'inRepair': 'Na popravci',
    'sold': 'Prodato',
}
infra_en['assetCondition'] = {
    'excellent': 'Excellent',
    'good': 'Good',
    'fair': 'Fair',
    'poor': 'Poor',
    'tracked': 'Condition tracked',
}
infra_sr['assetCondition'] = {
    'excellent': 'Odlično',
    'good': 'Dobro',
    'fair': 'Solidno',
    'poor': 'Loše',
    'tracked': 'Stanje se prati',
}
infra_en['supportTiers'] = {
    'none': 'None',
    'basic': 'Basic',
    'solid': 'Solid',
    'strong': 'Strong',
    'elite': 'Elite',
}
infra_sr['supportTiers'] = {
    'none': 'Nema',
    'basic': 'Osnovno',
    'solid': 'Solidno',
    'strong': 'Snažno',
    'elite': 'Elitno',
}

asset_tiers_en = {
    'team_car': {
        'level1': ('Basic Club Car', 'Provides basic race support coverage, mechanical response and feeding support.'),
        'level2': ('Reliable Support Car', 'Improves mechanical response, race-day logistics and basic fatigue protection.'),
        'level3': ('Professional Team Car', 'Improves race support coverage, tactical communication, feeding support and incident response.'),
        'level4': ('Elite Support Car', 'Provides high mechanical response, tactical support, crash/incident response and race-fatigue protection.'),
        'level5': ('World-Class Race Support Car', 'Provides maximum race support quality, mechanical response, tactical communication and incident support.'),
    },
    'team_bus': {
        'level1': ('Basic Team Bus', 'Small fatigue reduction on tours. Minor effect on one-day races.'),
        'level2': ('Recovery Team Bus', 'Good fatigue reduction during stage races and long travel blocks.'),
        'level3': ('Elite Tour Bus', 'Strongest bus fatigue reduction on long tours; limited effect on one-day races.'),
    },
    'equipment_van': {
        'level1': ('Basic Equipment Van', 'Small boost to pre-stage equipment readiness and small reduction to mechanical incident time loss.'),
        'level2': ('Service Equipment Van', 'Medium boost to spare-bike response, pre-stage readiness, and equipment condition-loss reduction.'),
        'level3': ('Pro Equipment Van', 'Strong boost to spare-bike response, wheel-change support, and stage-race equipment readiness.'),
    },
    'mobile_workshop': {
        'level1': ('Mobile Workshop', 'Improves repair speed, lowers repair costs, and supports mechanic response during races and tours.'),
        'level2': ('Pro Mobile Workshop', 'Strong repair speed bonus, stronger repair-cost reduction, and better post-race condition recovery.'),
    },
    'medical_van': {
        'level1': ('Basic Medical Van', 'Small medical response bonus, small minor-injury risk reduction, and basic post-stage recovery support.'),
        'level2': ('Recovery Medical Van', 'Medium medical response bonus, stronger minor-injury risk reduction, hydration support, and better recovery after stages.'),
        'level3': ('Pro Medical Unit', 'Strong medical response bonus, best minor-injury risk reduction, heat/hydration support, and strongest post-stage recovery support.'),
    },
}
asset_tiers_sr = {
    'team_car': {
        'level1': ('Osnovni klupski automobil', 'Pruža osnovnu podršku na trci, mehaničku reakciju i podršku ishrani.'),
        'level2': ('Pouzdani automobil za podršku', 'Poboljšava mehaničku reakciju, logistiku na dan trke i osnovnu zaštitu od umora.'),
        'level3': ('Profesionalni timski automobil', 'Poboljšava podršku na trci, taktičku komunikaciju, ishranu i reakciju na incidente.'),
        'level4': ('Elitni automobil za podršku', 'Pruža visoku mehaničku podršku, taktičku podršku, reakciju na padove/incidente i zaštitu od umora na trci.'),
        'level5': ('Timski automobil svetske klase', 'Pruža maksimalan kvalitet podrške na trci, mehaničku reakciju, taktičku komunikaciju i podršku pri incidentima.'),
    },
    'team_bus': {
        'level1': ('Osnovni timski autobus', 'Malo smanjuje umor na turama i ima manji efekat na jednodnevnim trkama.'),
        'level2': ('Autobus za oporavak', 'Dobro smanjuje umor tokom etapnih trka i dugih putovanja.'),
        'level3': ('Elitni autobus za ture', 'Najviše smanjuje umor na dugim turama, uz ograničen efekat na jednodnevnim trkama.'),
    },
    'equipment_van': {
        'level1': ('Osnovni kombi za opremu', 'Malo poboljšava spremnost opreme pre etape i smanjuje gubitak vremena pri mehaničkim incidentima.'),
        'level2': ('Servisni kombi za opremu', 'Srednje poboljšava reakciju sa rezervnim biciklom, spremnost pre etape i smanjuje trošenje opreme.'),
        'level3': ('Profesionalni kombi za opremu', 'Snažno poboljšava reakciju sa rezervnim biciklom, podršku pri zameni točka i spremnost opreme na etapnim trkama.'),
    },
    'mobile_workshop': {
        'level1': ('Mobilna radionica', 'Ubrzava popravke, smanjuje njihove troškove i podržava reakciju mehaničara tokom trka i tura.'),
        'level2': ('Profesionalna mobilna radionica', 'Snažno ubrzava popravke, dodatno smanjuje troškove i poboljšava oporavak stanja opreme posle trke.'),
    },
    'medical_van': {
        'level1': ('Osnovni medicinski kombi', 'Daje mali bonus medicinskoj reakciji, blago smanjuje rizik manjih povreda i pruža osnovnu podršku oporavku posle etape.'),
        'level2': ('Medicinski kombi za oporavak', 'Daje srednji bonus medicinskoj reakciji, jače smanjuje rizik manjih povreda, podržava hidrataciju i poboljšava oporavak posle etapa.'),
        'level3': ('Profesionalna medicinska jedinica', 'Daje snažan bonus medicinskoj reakciji, najbolje smanjenje rizika manjih povreda, podršku pri vrućini/hidrataciji i najjači oporavak posle etape.'),
    },
}
infra_en['assetTiers'] = {
    asset: {level: {'name': values[0], 'effect': values[1]} for level, values in levels.items()}
    for asset, levels in asset_tiers_en.items()
}
infra_sr['assetTiers'] = {
    asset: {level: {'name': values[0], 'effect': values[1]} for level, values in levels.items()}
    for asset, levels in asset_tiers_sr.items()
}

facility_upgrades_en = {
    'club_house': {
        2: ('Unlocks Sport Director slot.', 'Improves club administration foundation and prepares future sponsor/contract systems.'),
        3: ('Improves club administration, sponsor operations and contract infrastructure.', 'Future sponsor, contract and organization bonuses can scale from this level.'),
        4: ('Supports a larger professional club organization.', 'Future commercial and staff-management systems can scale from this level.'),
        5: ('Elite club operations.', 'Maximum HQ foundation for future elite sponsor, contract and organization bonuses.'),
    },
    'mechanics_workshop': {
        1: ('Removes harsh mechanic cap and unlocks second Mechanic slot.', 'Improves technical support foundation for future equipment and race-service systems.'),
        2: ('Unlocks third Mechanic slot plus 10% faster equipment repair.', 'Future equipment repairs become faster once the equipment system applies this effect.'),
        3: ('Unlocks fourth Mechanic slot plus 20% faster and 20% cheaper equipment repair.', 'Future equipment repairs become faster and cheaper.'),
        4: ('Unlocks fifth Mechanic slot plus 30% faster and 30% cheaper equipment repair.', 'Maximum mechanics-workshop support for equipment maintenance.'),
    },
    'medical_center': {
        1: ('Removes harsh Lv 0 medical cap and unlocks second Physio slot.', 'Improves medical staff effectiveness for injury prevention, recovery duration and fatigue-floor reduction.'),
        2: ('Unlocks Nutritionist slot plus injury recovery bonuses up to 3%.', 'Allows Nutritionist contribution and improves return-to-fitness support.'),
        3: ('Unlocks third Physio slot and second Team Doctor slot.', 'Improves medical capacity and allows stronger combined health/recovery effects.'),
        4: ('Unlocks fourth Physio slot plus injury recovery bonuses up to 5%.', 'Improves recovery speed and medical depth for high-level squads.'),
        5: ('Unlocks fifth Physio slot plus injury recovery bonuses up to 8%.', 'Elite medical center with maximum recovery and prevention support.'),
    },
    'scouting_office': {
        1: ('Basic scouting setup plus unlocks second Scout / Analyst slot.', 'Keeps Basic report-quality cap but improves scouting capacity.'),
        2: ('Unlocks third Scout / Analyst slot plus Solid report quality.', 'Raises scouting report cap to Solid.'),
        3: ('Unlocks fourth Scout / Analyst slot plus Strong report quality.', 'Raises scouting report cap to Strong.'),
        4: ('Unlocks fifth Scout / Analyst slot plus Elite report quality.', 'Raises scouting report cap to Elite.'),
    },
    'training_center': {
        1: ('Removes harsh Lv 0 coaching cap.', 'Allows coaching staff to contribute more effectively to training output, development and overload-risk control.'),
        2: ('Improves trainer contribution.', 'Raises the effective coaching cap for training output and development support.'),
        3: ('Unlocks second Trainer slot.', 'Allows deeper coaching staff and stronger combined training/development impact.'),
        4: ('High-level training infrastructure.', 'Raises coaching effect cap for advanced clubs.'),
        5: ('Elite training and development center.', 'Maximum coaching cap for training output, rider development and overload-risk reduction.'),
    },
    'youth_academy': {
        1: ('Unlocks U23 Head Coach slot.', 'Enables dedicated U23/development-team coaching support.'),
        2: ('Better youth development support.', 'U23 riders receive 10% bonus on training and development once the U23 system applies this effect.'),
    },
}
facility_upgrades_sr = {
    'club_house': {
        2: ('Otključava mesto za Sportskog direktora.', 'Poboljšava osnovu administracije kluba i priprema buduće sisteme sponzora i ugovora.'),
        3: ('Poboljšava administraciju kluba, rad sa sponzorima i infrastrukturu ugovora.', 'Budući bonusi za sponzore, ugovore i organizaciju mogu rasti sa ovim nivoom.'),
        4: ('Podržava veću profesionalnu organizaciju kluba.', 'Budući komercijalni sistemi i sistemi upravljanja osobljem mogu rasti sa ovim nivoom.'),
        5: ('Elitno upravljanje klubom.', 'Maksimalna osnova sedišta kluba za buduće elitne bonuse sponzora, ugovora i organizacije.'),
    },
    'mechanics_workshop': {
        1: ('Uklanja strogo ograničenje za mehaničare i otključava drugo mesto za Mehaničara.', 'Poboljšava osnovu tehničke podrške za buduće sisteme opreme i servisiranje na trkama.'),
        2: ('Otključava treće mesto za Mehaničara i 10% brže popravke opreme.', 'Popravke opreme postaju brže kada sistem opreme primenjuje ovaj efekat.'),
        3: ('Otključava četvrto mesto za Mehaničara i 20% brže i 20% jeftinije popravke opreme.', 'Popravke opreme postaju brže i jeftinije.'),
        4: ('Otključava peto mesto za Mehaničara i 30% brže i 30% jeftinije popravke opreme.', 'Maksimalna podrška mehaničarske radionice za održavanje opreme.'),
    },
    'medical_center': {
        1: ('Uklanja strogo medicinsko ograničenje Nivoa 0 i otključava drugo mesto za Fizioterapeuta.', 'Poboljšava efikasnost medicinskog osoblja u prevenciji povreda, trajanju oporavka i smanjenju minimalnog umora.'),
        2: ('Otključava mesto za Nutricionistu i bonuse oporavka od povrede do 3%.', 'Omogućava doprinos Nutricioniste i poboljšava povratak u punu spremnost.'),
        3: ('Otključava treće mesto za Fizioterapeuta i drugo mesto za Doktora tima.', 'Povećava medicinski kapacitet i omogućava snažnije kombinovane efekte zdravlja i oporavka.'),
        4: ('Otključava četvrto mesto za Fizioterapeuta i bonuse oporavka od povrede do 5%.', 'Poboljšava brzinu oporavka i medicinsku dubinu za timove visokog nivoa.'),
        5: ('Otključava peto mesto za Fizioterapeuta i bonuse oporavka od povrede do 8%.', 'Elitni medicinski centar sa maksimalnom podrškom oporavku i prevenciji.'),
    },
    'scouting_office': {
        1: ('Osnovni skauting sistem i drugo mesto za Skauta / Analitičara.', 'Zadržava Osnovni maksimum kvaliteta izveštaja, ali povećava kapacitet skautinga.'),
        2: ('Otključava treće mesto za Skauta / Analitičara i Solidni kvalitet izveštaja.', 'Podiže maksimalni kvalitet skautskog izveštaja na Solidno.'),
        3: ('Otključava četvrto mesto za Skauta / Analitičara i Snažni kvalitet izveštaja.', 'Podiže maksimalni kvalitet skautskog izveštaja na Snažno.'),
        4: ('Otključava peto mesto za Skauta / Analitičara i Elitni kvalitet izveštaja.', 'Podiže maksimalni kvalitet skautskog izveštaja na Elitno.'),
    },
    'training_center': {
        1: ('Uklanja strogo ograničenje trenerskog efekta na Nivou 0.', 'Omogućava trenerskom osoblju da efikasnije doprinosi treningu, razvoju i kontroli rizika od preopterećenja.'),
        2: ('Poboljšava doprinos trenera.', 'Podiže efektivni maksimum trenerskog efekta za trening i podršku razvoju.'),
        3: ('Otključava drugo mesto za Trenera.', 'Omogućava dublji trenerski kadar i snažniji kombinovani uticaj na trening i razvoj.'),
        4: ('Trening infrastruktura visokog nivoa.', 'Podiže maksimum trenerskog efekta za napredne klubove.'),
        5: ('Elitni centar za trening i razvoj.', 'Maksimalni trenerski efekat za trening, razvoj vozača i smanjenje rizika od preopterećenja.'),
    },
    'youth_academy': {
        1: ('Otključava mesto za U23 Glavnog trenera.', 'Omogućava posebnu trenersku podršku U23/razvojnom timu.'),
        2: ('Bolja podrška razvoju mladih.', 'U23 vozači dobijaju 10% bonusa na trening i razvoj kada U23 sistem primenjuje ovaj efekat.'),
    },
}
infra_en['facilityUpgrades'] = {
    facility: {f'level{level}': {'unlock': values[0], 'effect': values[1]} for level, values in levels.items()}
    for facility, levels in facility_upgrades_en.items()
}
infra_sr['facilityUpgrades'] = {
    facility: {f'level{level}': {'unlock': values[0], 'effect': values[1]} for level, values in levels.items()}
    for facility, levels in facility_upgrades_sr.items()
}

save_json(infra_en_path, infra_en)
save_json(infra_sr_path, infra_sr)

# Proper i18n-aware shared infrastructure formatters and impact lines.
helpers_path = 'src/pages/dashboard/infrastructure/infrastructureHelpers.ts'
replace(helpers_path, " */\n\n//////////////////////////\n// Numeric helpers", " */\n\nimport i18n from '@/i18n'\n\n//////////////////////////\n// Numeric helpers")
regex_replace(
    helpers_path,
    r"export function formatGameDays\([\s\S]*?\n}\n\n/\*\*\n \* Add a number of game days",
    """export function formatGameDays(
  raw:
    | number
    | string
    | null
    | undefined,
): string {
  const days = toNumber(raw, 0)
  const key = days === 1 ? 'common.gameDay' : 'common.gameDays'

  return i18n.t(key, {
    ns: 'infrastructure',
    count: days,
  })
}

/**
 * Add a number of game days""",
)
regex_replace(
    helpers_path,
    r"export function buildFacilityImpactLines\([\s\S]*?\n  return lines\n}\n?$",
    """export function buildFacilityImpactLines(
  options:
    BuildFacilityImpactLinesOptions,
): string[] {
  const {
    kind,
    level,
    capacityByRole,
    coachingEffect,
    medicalEffect,
  } = options

  const normalizedKind =
    typeof kind === 'string' && kind.trim().length > 0
      ? kind.trim().replace(/\\s+/g, '_')
      : 'club'

  const kindLabel = i18n.t(`facilityTypes.${normalizedKind}`, {
    ns: 'infrastructure',
    defaultValue: normalizedKind.replace(/_/g, ' '),
  })

  const lines: string[] = [
    i18n.t('facilities.impactLevel', {
      ns: 'infrastructure',
      level,
      kind: kindLabel,
    }),
  ]

  if (capacityByRole && capacityByRole.size > 0) {
    lines.push(i18n.t('facilities.staffCapacityImpact', { ns: 'infrastructure' }))
  }

  // Apply only the effect that belongs to this facility. The old helper added
  // medical/coaching text to unrelated buildings whenever the global effect
  // context existed.
  if (normalizedKind === 'coaching' && coachingEffect) {
    lines.push(i18n.t('facilities.coachingImpact', { ns: 'infrastructure' }))
  }

  if (normalizedKind === 'medical' && medicalEffect) {
    lines.push(i18n.t('facilities.medicalImpact', { ns: 'infrastructure' }))
  }

  return lines
}
""",
)

infra_page = 'src/pages/dashboard/Infrastructure.tsx'
replace(
    infra_page,
    "        unlockSummary: nextConfig?.unlock_summary ?? null,\n        effectSummary: nextConfig?.effect_summary ?? null,",
    "        unlockSummary: nextConfig\n          ? t(`facilityUpgrades.${item.id}.level${nextLevel}.unlock`, {\n              defaultValue: nextConfig.unlock_summary ?? '',\n            })\n          : null,\n        effectSummary: nextConfig\n          ? t(`facilityUpgrades.${item.id}.level${nextLevel}.effect`, {\n              defaultValue: nextConfig.effect_summary ?? '',\n            })\n          : null,",
)

assets_path = 'src/pages/dashboard/infrastructure/AssetsSection.tsx'
replace(assets_path, "import { useTranslation } from 'react-i18next'", "import { useTranslation } from 'react-i18next'\nimport type { TFunction } from 'i18next'")
regex_replace(
    assets_path,
    r"function getAssetCurrentStatusLabel\([\s\S]*?\n}\n\nfunction canSendAssetToRepair",
    """function getAssetCurrentStatusLabel(row: {
  status: string
  assignment_locked?: boolean
  current_assignment_label?: string | null
  assignment_end_game_date?: string | null
  repair_complete_game_date?: string | null
  metadata?: Record<string, unknown> | null
}, t: TFunction): string {
  if (row.status === 'in_repair') {
    const repairCompleteGameDate = getRepairCompleteGameDate(row)

    return repairCompleteGameDate
      ? t('assets.inRepairUntil', { date: formatGameDate(repairCompleteGameDate) })
      : t('common.inRepair')
  }

  if (row.status === 'assigned' || row.assignment_locked) {
    const assignmentLabel = row.current_assignment_label ?? t('assets.assignedEvent')

    return row.assignment_end_game_date
      ? t('assets.inUseUntil', {
          assignment: assignmentLabel,
          date: formatGameDate(row.assignment_end_game_date),
        })
      : t('assets.inUse', { assignment: assignmentLabel })
  }

  if (row.status === 'available') {
    return t('common.available')
  }

  return row.status.replaceAll('_', ' ')
}

function canSendAssetToRepair""",
)
regex_replace(
    assets_path,
    r"function formatStatusLabel\(status: string \| null \| undefined\): string \{[\s\S]*?\n}\n\nfunction isAssignedOrLockedStatus",
    """function formatStatusLabel(
  status: string | null | undefined,
  t: TFunction,
): string {
  const normalized = normalizeAssetStatus(status)

  if (isAssignedOrLockedStatus(normalized)) return t('assetStatus.assigned')
  if (isInRepairStatus(normalized)) return t('assetStatus.inRepair')
  if (isSoldStatus(normalized)) return t('assetStatus.sold')
  if (normalized === 'available') return t('assetStatus.available')

  return normalized
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function isAssignedOrLockedStatus""",
)
regex_replace(
    assets_path,
    r"function getOwnedAssetLabel<T extends \{ asset_level: number; asset_name\?: string \| null \}>\([\s\S]*?\n}\n\nfunction getStatusBadgeClass",
    """function getOwnedAssetLabel<T extends { asset_level: number; asset_name?: string | null }>(
  row: T,
  fallbackPrefix: string,
  t: TFunction,
  assetKey: AssetGarageKey,
): string {
  const assetName = row.asset_name?.trim()
  const fallback = assetName && assetName.length > 0
    ? assetName
    : `${fallbackPrefix} Lv ${row.asset_level}`

  return t(`assetTiers.${assetKey}.level${row.asset_level}.name`, {
    defaultValue: fallback,
  })
}

function getAssetTierEffect(
  assetKey: AssetGarageKey,
  level: number,
  fallback: string | null | undefined,
  t: TFunction,
): string {
  return t(`assetTiers.${assetKey}.level${level}.effect`, {
    defaultValue: fallback ?? '',
  })
}

function translateAssetConditionStatus(
  value: string | null | undefined,
  t: TFunction,
): string {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\\s+/g, '_')
  const key = normalized === 'excellent'
    ? 'assetCondition.excellent'
    : normalized === 'good'
      ? 'assetCondition.good'
      : normalized === 'fair'
        ? 'assetCondition.fair'
        : normalized === 'poor'
          ? 'assetCondition.poor'
          : 'assetCondition.tracked'

  return t(key, { defaultValue: value || t('assetCondition.tracked') })
}

function translateSupportTier(
  value: string | null | undefined,
  t: TFunction,
): string {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'none' || normalized === 'n/a') {
    return normalized === 'n/a' ? 'N/A' : t('supportTiers.none')
  }

  const known = new Set(['basic', 'solid', 'strong', 'elite'])
  return known.has(normalized)
    ? t(`supportTiers.${normalized}`, { defaultValue: value ?? '' })
    : value ?? 'N/A'
}

function getStatusBadgeClass""",
)

# AssetAcquireModal runtime crash and visible copy.
replace(assets_path, "function AssetAcquireModal({\n  title,", "function AssetAcquireModal({\n  assetKey,\n  title,")
replace(assets_path, "}: {\n  title: string\n  description: string\n  assetLabel: string", "}: {\n  assetKey: AssetGarageKey\n  title: string\n  description: string\n  assetLabel: string", required=False)
replace(assets_path, "<h3 className=\"mt-1 text-lg font-semibold text-gray-900\">{t(assetCopy.title)}</h3>", "<h3 className=\"mt-1 text-lg font-semibold text-gray-900\">{title}</h3>")
replace(assets_path, "<p className=\"mt-1 text-sm text-gray-500\">{t(assetCopy.description)}</p>", "<p className=\"mt-1 text-sm text-gray-500\">{description}</p>")
replace(assets_path, "            Close\n          </button>", "            {t('common.close')}\n          </button>", required=False)
replace(assets_path, "                          {config.asset_name}\n", "                          {t(`assetTiers.${assetKey}.level${config.asset_level}.name`, { defaultValue: config.asset_name })}\n", required=False)
replace(assets_path, "                            {config.effect_summary}\n", "                            {getAssetTierEffect(assetKey, config.asset_level, config.effect_summary, t)}\n", required=False)

# Pass the asset key into both acquire modal usages.
replace(assets_path, "        <AssetAcquireModal\n          title={t('assets.acquireTeamCar')}", "        <AssetAcquireModal\n          assetKey=\"team_car\"\n          title={t('assets.acquireTeamCar')}")
replace(assets_path, "        <AssetAcquireModal\n          title={acquireModalTitle}", "        <AssetAcquireModal\n          assetKey={assetKey}\n          title={t(assetCopy.acquire)}", required=False)
replace(assets_path, "          description={acquireModalDescription}", "          description={t(assetCopy.acquireDescription)}", required=False)
replace(assets_path, "          assetLabel={assetLabelPlural}", "          assetLabel={t(assetCopy.plural)}", required=False)

# Team Car panel screenshot leaks.
replace(assets_path, "{isFull ? t('common.garageFull') : 'Acquire Team Car'}", "{isFull ? t('common.garageFull') : t('assets.acquireTeamCar')}")
replace(assets_path, ": `Owned ${totalCars} · Pending ${pendingQuantity}`", ": t('assets.ownedPending', { owned: totalCars, pending: pendingQuantity })", required=False)
replace(assets_path, "const assetLabel = getOwnedAssetLabel(car, 'Team Car')", "const assetLabel = getOwnedAssetLabel(car, t('assets.teamCar'), t, 'team_car')")
replace(assets_path, "{formatStatusLabel(car.status)}", "{formatStatusLabel(car.status, t)}")
replace(assets_path, "{car.condition_status}", "{translateAssetConditionStatus(car.condition_status, t)}", required=False)
replace(assets_path, "title={getAssetCurrentStatusLabel(car)}", "title={getAssetCurrentStatusLabel(car, t)}")
replace(assets_path, "{getAssetCurrentStatusLabel(car)}", "{getAssetCurrentStatusLabel(car, t)}")
replace(assets_path, "value={summary?.support_tier || 'N/A'}", "value={translateSupportTier(summary?.support_tier, t)}", required=False)
replace(assets_path, "value: summary?.support_tier || 'N/A',", "value: translateSupportTier(summary?.support_tier, t),", required=False)
replace(assets_path, "setRenameError('Enter a Team Car name.')", "setRenameError(t('assets.enterName', { asset: t('assets.teamCar') }))", required=False)
replace(assets_path, ": 'Failed to rename Team Car.',", ": t('assets.renameFailed', { asset: t('assets.teamCar') }),", required=False)
replace(assets_path, "{renameSavingCarId === car.car_id ? 'Saving…' : 'Save'}", "{renameSavingCarId === car.car_id ? t('common.saving') : t('common.save')}", required=False)
replace(assets_path, "                              Cancel\n", "                              {t('common.cancel')}\n", required=False)
replace(assets_path, 'title="Rename Team Car"', "title={t('assets.renameTeamCar')}", required=False)
replace(assets_path, "? 'This asset is already at 100% condition.'", "? t('assets.condition100')", required=False)
replace(assets_path, "? 'This asset is already in repair.'", "? t('assets.alreadyRepair')", required=False)
replace(assets_path, "? 'This asset is currently assigned and locked.'", "? t('assets.assignedLocked')", required=False)
replace(assets_path, "                        Repair\n", "                        {t('common.repair')}\n", required=False)
replace(assets_path, "                        Sell\n", "                        {t('common.sell')}\n", required=False)
replace(assets_path, "                        Team Car Lv {slot.job.asset_level ?? '?'}", "                        {t('assets.teamCar')} · {t('common.level')} {slot.job.asset_level ?? '?'}", required=False)
replace(assets_path, "{isCancelling ? 'Cancelling...' : 'Cancel delivery'}", "{isCancelling ? t('facilities.cancelling') : t('assets.cancelDelivery')}", required=False)
replace(assets_path, "? 'Available automatically while Premium is active, or permanently with coins.'", "? t('assets.premiumSlotDescription')", required=False)
replace(assets_path, ": 'Additional permanent Team Car garage capacity.'", ": t('assets.additionalTeamCarCapacity')", required=False)
replace(assets_path, "                        Current coin balance:{' '}", "                        {t('common.currentCoinBalance')}{' '}", required=False)
replace(assets_path, "                          Unlock with Premium", "                          {t('common.unlockPremium')}", required=False)
replace(assets_path, "? 'Unlocking…'\n                          : `Unlock permanently · ${Number(slotAccess?.coin_cost ?? 20)} coins`", "? t('common.unlocking')\n                          : t('assets.unlockCoins', { coins: Number(slotAccess?.coin_cost ?? 20) })", required=False)
replace(assets_path, "                      Slot #{slot.slotNumber}", "                      {t('assets.slot', { slot: slot.slotNumber })}", required=False)
replace(assets_path, "                      Empty Team Car slot available for a new delivery.", "                      {t('assets.emptyTeamCar')}", required=False)
replace(assets_path, "{isFull ? t('common.garageFull') : 'Acquire'}", "{isFull ? t('common.garageFull') : t('common.acquire')}", required=False)

# Generic asset panel uses the same translated helpers.
replace(assets_path, "const ownedAssetLabel = getOwnedAssetLabel(row, assetLabel)", "const ownedAssetLabel = getOwnedAssetLabel(row, t(assetCopy.singular), t, assetKey)", required=False)
replace(assets_path, "{formatStatusLabel(row.status)}", "{formatStatusLabel(row.status, t)}", required=False)
replace(assets_path, "{row.condition_status || 'Condition tracked'}", "{translateAssetConditionStatus(row.condition_status, t)}", required=False)
replace(assets_path, "{getAssetCurrentStatusLabel(row)}", "{getAssetCurrentStatusLabel(row, t)}", required=False)
replace(assets_path, "const supportTier = getSummaryText(summary, ['support_tier'], 'N/A')", "const supportTier = translateSupportTier(getSummaryText(summary, ['support_tier'], 'N/A'), t)", required=False)
replace(assets_path, "{isFull ? t('common.garageFull') : acquireButtonLabel}", "{isFull ? t('common.garageFull') : t(assetCopy.acquire)}", required=False)
replace(assets_path, "? `Free ${slotAccess.free_slots} · Premium ${slotAccess.premium_slots} · Max ${absoluteMaxSlots}`", "? t('assets.freePremiumMax', { free: slotAccess.free_slots, premium: slotAccess.premium_slots, max: absoluteMaxSlots })", required=False)
replace(assets_path, ": `Owned ${totalAssets} · Pending ${pendingQuantity}`", ": t('assets.ownedPending', { owned: totalAssets, pending: pendingQuantity })", required=False)
replace(assets_path, "? 'Available automatically while Premium is active, or permanently with coins.'", "? t('assets.premiumSlotDescription')", required=False)
replace(assets_path, ": 'Additional permanent garage capacity.'", ": t('assets.additionalCapacity')", required=False)
replace(assets_path, "? 'Unlocking…'", "? t('common.unlocking')", required=False)
regex_replace(
    assets_path,
    r": `Unlock permanently · \$\{Number\(slotAccess\?\.coin_cost \?\? 20\)\} coins`",
    ": t('assets.unlockCoins', { coins: Number(slotAccess?.coin_cost ?? 20) })",
    required=False,
)

# Translate configured tier copy inside the acquire modal and all asset durations.
replace(assets_path, "formatGameDays(config.delivery_game_days)", "formatGameDays(config.delivery_game_days)", required=False)


# ---------------------------------------------------------------------------
# Race Detail: compact dates, weather, cancellation copy and stage point labels
# ---------------------------------------------------------------------------
race_en_path = 'src/i18n/locales/en/raceDetail.json'
race_sr_path = 'src/i18n/locales/sr-Latn/raceDetail.json'
race_en = load_json(race_en_path)
race_sr = load_json(race_sr_path)

race_en.setdefault('dates', {})['compactSeason'] = 'S{{season}}'
race_sr.setdefault('dates', {})['compactSeason'] = 'Sezona {{season}}'

race_en['weather'].update({
    'sunny': 'Sunny',
    'windy': 'Windy',
    'sunnyWindy': 'Sunny and windy',
    'unsafe': 'Unsafe weather',
    'stageAlreadyCanceled': 'The stage has already been canceled by the race engine.',
    'decisionUnavailable': 'Weather is not generated yet, so no cancellation decision can be made.',
    'decisionRule': 'Cancellation is decided automatically 24 in-game hours before the stage start, using the generated stage weather. Snow or an average temperature below 5°C cancels the stage.',
    'raceCanceledNoResult': 'The race was canceled due to weather. No race result was generated.',
    'raceHasCancellationMetadata': 'This race has weather cancellation information.',
    'stageCanceledDetails': 'Stage {{stage}} was canceled due to weather ({{reason}}). No results, points, prize money, fatigue or replay were generated for this stage. The stage race continues with the next runnable stage.',
    'oneDayCanceledDetails': 'This one-day race was canceled due to weather ({{reason}}). No results, points, prize money, fatigue or replay were generated.',
    'noticeStageCanceled': 'Stage canceled due to weather',
    'noticeRaceCanceled': 'Race canceled due to weather',
    'noticeRacePartlyCanceled': 'Race partly canceled by weather',
})
race_sr['weather'].update({
    'sunny': 'Sunčano',
    'windy': 'Vetrovito',
    'sunnyWindy': 'Sunčano i vetrovito',
    'unsafe': 'Nebezbedni vremenski uslovi',
    'stageAlreadyCanceled': 'Etapa je već otkazana od strane Race Engine-a.',
    'decisionUnavailable': 'Vreme još nije generisano, pa odluka o otkazivanju još ne može biti doneta.',
    'decisionRule': 'O otkazivanju se automatski odlučuje 24 sata igre pre starta etape na osnovu generisanog vremena. Sneg ili prosečna temperatura ispod 5°C otkazuju etapu.',
    'raceCanceledNoResult': 'Trka je otkazana zbog vremenskih uslova. Rezultat trke nije generisan.',
    'raceHasCancellationMetadata': 'Za ovu trku postoje informacije o otkazivanju zbog vremenskih uslova.',
    'stageCanceledDetails': 'Etapa {{stage}} je otkazana zbog vremenskih uslova ({{reason}}). Za ovu etapu nisu generisani rezultati, bodovi, nagrade, umor ni repriza. Etapna trka se nastavlja sledećom etapom koja može biti održana.',
    'oneDayCanceledDetails': 'Ova jednodnevna trka je otkazana zbog vremenskih uslova ({{reason}}). Rezultati, bodovi, nagrade, umor i repriza nisu generisani.',
    'noticeStageCanceled': 'Etapa je otkazana zbog vremenskih uslova',
    'noticeRaceCanceled': 'Trka je otkazana zbog vremenskih uslova',
    'noticeRacePartlyCanceled': 'Trka je delimično otkazana zbog vremenskih uslova',
})

save_json(race_en_path, race_en)
save_json(race_sr_path, race_sr)

race_path = 'src/pages/dashboard/RaceDetailPage.tsx'
replace(race_path, "import { supabase } from '../../lib/supabase'", "import { supabase } from '../../lib/supabase'\nimport i18n from '@/i18n'")

# Locale-aware compact month/weekday labels and localized season prefix.
regex_replace(
    race_path,
    r"function getGameMonthShortName\(monthNumber: number\): string \{[\s\S]*?\n}\n\nfunction formatCompactGameDateDisplay",
    """function getRaceDetailLocale(): string {
  return String(i18n.resolvedLanguage || i18n.language || 'en').toLowerCase().startsWith('sr')
    ? 'sr-Latn-RS'
    : 'en-GB'
}

function getGameMonthShortName(monthNumber: number): string {
  if (monthNumber < 1 || monthNumber > 12) return `M${monthNumber}`

  return new Intl.DateTimeFormat(getRaceDetailLocale(), {
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(Date.UTC(2000, monthNumber - 1, 1)))
    .replace(/\\.$/, '')
}

function formatCompactGameDateDisplay""",
)
regex_replace(
    race_path,
    r"function getWeekdayShortName\(date: Date\): string \{\n  return date\.toLocaleDateString\(undefined, \{ weekday: 'short' \}\)\n}",
    """function getWeekdayShortName(date: Date): string {
  return date
    .toLocaleDateString(getRaceDetailLocale(), { weekday: 'short' })
    .replace(/\\.$/, '')
}""",
)
replace(
    race_path,
    "  return `S${parts.seasonNumber} · ${weekdayLabel} · ${monthLabel} ${dayLabel}`",
    "  const seasonLabel = i18n.t('dates.compactSeason', {\n    ns: 'raceDetail',\n    season: parts.seasonNumber,\n  })\n\n  return `${seasonLabel} · ${weekdayLabel} · ${monthLabel} ${dayLabel}`",
)

# Weather condition and decision/cancellation helpers.
replace(
    race_path,
    "      return 'Snow'\n    case 'temperature_below_5c':\n      return 'Average temperature below 5°C'\n    default:\n      return reason ? humanizeCode(reason) : 'Unsafe weather'",
    "      return i18n.t('weather.snow', { ns: 'raceDetail' })\n    case 'temperature_below_5c':\n      return i18n.t('weather.temperatureBelow5', { ns: 'raceDetail' })\n    default:\n      return reason ? humanizeCode(reason) : i18n.t('weather.unsafe', { ns: 'raceDetail' })",
)
regex_replace(
    race_path,
    r"function getStageWeatherDecisionText\(stage\?: RaceStage \| null\): string \{[\s\S]*?\n}\n\nfunction getWeatherCancellationNoticeText",
    """function getStageWeatherDecisionText(stage?: RaceStage | null): string {
  if (isStageWeatherCanceled(stage)) {
    return i18n.t('weather.stageAlreadyCanceled', { ns: 'raceDetail' })
  }

  if (!stage || !hasWeather(stage)) {
    return i18n.t('weather.decisionUnavailable', { ns: 'raceDetail' })
  }

  return i18n.t('weather.decisionRule', { ns: 'raceDetail' })
}

function getWeatherCancellationNoticeText""",
)
regex_replace(
    race_path,
    r"function getWeatherCancellationNoticeText\(stage\?: RaceStage \| null, race\?: Race \| null\): string \{[\s\S]*?\n}\n\nfunction WeatherCancellationNotice",
    """function getWeatherCancellationNoticeText(stage?: RaceStage | null, race?: Race | null): string {
  if (!stage) {
    if (isRaceAllWeatherCanceled(race)) {
      return i18n.t('weather.raceCanceledNoResult', { ns: 'raceDetail' })
    }

    return i18n.t('weather.raceHasCancellationMetadata', { ns: 'raceDetail' })
  }

  const reason = getStageWeatherCancellationReasonLabel(stage)

  if (race?.is_stage_race) {
    return i18n.t('weather.stageCanceledDetails', {
      ns: 'raceDetail',
      stage: stage.stage_number,
      reason,
    })
  }

  return i18n.t('weather.oneDayCanceledDetails', {
    ns: 'raceDetail',
    reason,
  })
}

function WeatherCancellationNotice""",
)
replace(
    race_path,
    "  const title = isStageWeatherCanceled(stage)\n    ? 'Stage canceled due to weather'\n    : raceStatus === 'all_stages_weather_cancelled'\n      ? 'Race canceled due to weather'\n      : 'Race partly canceled by weather'",
    "  const title = isStageWeatherCanceled(stage)\n    ? t('weather.noticeStageCanceled')\n    : raceStatus === 'all_stages_weather_cancelled'\n      ? t('weather.noticeRaceCanceled')\n      : t('weather.noticeRacePartlyCanceled')",
)

# Weather card should never expose an internal RPC instruction to players.
regex_replace(
    race_path,
    r"        Weather is not generated for this stage yet\. Add a host country code, then run\n        <span className=\"font-mono\"> generate_race_stage_weather_v1\(stage_id\)</span>\.",
    "        {t('weather.notGenerated')}",
)
replace(
    race_path,
    '            {humanizeCode(condition)}',
    "            {condition === 'sunny_windy'\n              ? t('weather.sunnyWindy')\n              : condition === 'sunny'\n                ? t('weather.sunny')\n                : condition === 'windy'\n                  ? t('weather.windy')\n                  : t(`weather.${condition === 'partly_cloudy' ? 'partlyCloudy' : condition === 'heavy_rain' ? 'heavyRain' : condition}`, { defaultValue: humanizeCode(condition) })}",
)

# Stage terrain value in the profile summary (Hilly -> Brdovito, etc.).
regex_replace(
    race_path,
    r"function getStageProfileLabel\(stage: RaceStage\): string \{\n  return humanizeCode\(stage\.terrain_type\)\n}",
    """function getStageProfileLabel(stage: RaceStage): string {
  const terrainKey = stage.terrain_type === 'individual_time_trial'
    ? 'individualTimeTrial'
    : stage.terrain_type === 'team_time_trial'
      ? 'teamTimeTrial'
      : stage.terrain_type === 'time_trial'
        ? 'timeTrial'
        : stage.terrain_type

  return i18n.t(`stage.${terrainKey}`, {
    ns: 'raceDetail',
    defaultValue: humanizeCode(stage.terrain_type),
  })
}""",
)

# Existing resource keys already cover these stage-point labels.
replace(race_path, '>Points: </span>', ">{i18n.t('stage.pointsLabel', { ns: 'raceDetail' })} </span>")
replace(race_path, '>Time bonuses: </span>', ">{i18n.t('stage.timeBonuses', { ns: 'raceDetail' })} </span>")
replace(race_path, '>GC time bonuses: </span>', ">{i18n.t('stage.gcTimeBonuses', { ns: 'raceDetail' })} </span>", required=False)
replace(race_path, 'Points: {formatPointsSchemeLabel(', "{i18n.t('stage.pointsLabel', { ns: 'raceDetail' })} {formatPointsSchemeLabel(", required=False)
replace(race_path, 'GC time bonuses: {formatPointsSchemeLabel(', "{i18n.t('stage.gcTimeBonuses', { ns: 'raceDetail' })} {formatPointsSchemeLabel(", required=False)


# ---------------------------------------------------------------------------
# Static assertions for the screenshot regressions and runtime crash.
# ---------------------------------------------------------------------------
training_source = read(training_path)
assets_source = read(assets_path)
race_source = read(race_path)
infra_source = read(infra_page)

for leak in [
    'No staff selected. The camp can still be booked, but there will be no coach, doctor, mechanic, or director boost.',
    '<div className="font-medium">Riders</div>',
    '<div className="font-medium">Staff</div>',
]:
    if leak in training_source:
        raise SystemExit(f'Training screenshot leak still present: {leak}')

if 't(assetCopy.title)' in assets_source or 't(assetCopy.description)' in assets_source.split('function TeamCarGaragePanel', 1)[0]:
    raise SystemExit('AssetAcquireModal still references out-of-scope assetCopy')

for leak in [
    "'Acquire Team Car'",
    '>Repair</button>',
    '>Sell</button>',
    'Additional permanent Team Car garage capacity.',
    'Unlock permanently · ${Number(slotAccess?.coin_cost ?? 20)} coins',
]:
    if leak in assets_source:
        raise SystemExit(f'Assets screenshot leak still present: {leak}')

for leak in [
    '>Points: </span>',
    '>Time bonuses: </span>',
    '>GC time bonuses: </span>',
    '{humanizeCode(condition)}',
    'Cancellation is decided automatically 24 in-game hours before the stage start, using the generated stage weather.',
]:
    if leak in race_source:
        raise SystemExit(f'Race Detail screenshot leak still present: {leak}')

if 'unlockSummary: nextConfig?.unlock_summary ?? null' in infra_source:
    raise SystemExit('Infrastructure facility unlock summary is still raw database English')

print('Localization follow-up codemod completed successfully.')
