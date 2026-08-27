from pathlib import Path
import json
import re


def load_json(path: str):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def save_json(path: str, value) -> None:
    Path(path).write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )


def replace(path: str, old: str, new: str, required: bool = False) -> int:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if required and count == 0:
        raise SystemExit(f'Missing required replacement in {path}: {old[:140]!r}')
    if count:
        p.write_text(text.replace(old, new), encoding='utf-8')
    print(f'{path}: replaced {count}: {old[:90]!r}')
    return count


def regex_replace(path: str, pattern: str, new: str, required: bool = False) -> int:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    text2, count = re.subn(pattern, new, text, flags=re.MULTILINE)
    if required and count == 0:
        raise SystemExit(f'Missing required regex in {path}: {pattern[:140]!r}')
    if count:
        p.write_text(text2, encoding='utf-8')
    print(f'{path}: regex replaced {count}: {pattern[:90]!r}')
    return count


# ---------------------------------------------------------------------------
# STAFF
# ---------------------------------------------------------------------------
staff_path = 'src/pages/dashboard/Staff.tsx'
staff_en_path = 'src/i18n/locales/en/staff.json'
staff_sr_path = 'src/i18n/locales/sr-Latn/staff.json'

staff_en = load_json(staff_en_path)
staff_sr = load_json(staff_sr_path)

staff_en['impactI18n'] = {
    'assigned': 'Assigned',
    'openSlotAvailable': 'Open slot available',
    'currentBasicCapReached': 'Current basic cap reached',
    'forGroup': 'For this impact group',
    'activeCourses': 'Active Courses',
    'coursesPaused': 'Bonuses are partially paused while staff study',
    'fillVacancies': 'Use Transfers → Staff to fill vacancies',
    'combinedTitle': 'Combined Team Impact',
    'combinedMedical': 'Combined medical support from Team Doctor, Physio and Nutritionist.',
    'combinedCoach': 'Backend-applied coaching effect from {{name}}.',
    'combinedCurrent': 'Current combined impact from active staff in this group.',
    'coachingTitle': 'Coaching Staff Combined Impact',
    'medicalTitle': 'Medical Staff Combined Impact',
    'mechanicTitle': 'Mechanic Staff Impact',
    'directorTitle': 'Sport Director Staff Impact',
    'u23Title': 'U23 Coaching Staff Impact',
    'scoutingTitle': 'Scouting Staff Impact',
}
staff_sr['impactI18n'] = {
    'assigned': 'Dodeljeno',
    'openSlotAvailable': 'Slobodno mesto je dostupno',
    'currentBasicCapReached': 'Dostignut je osnovni limit',
    'forGroup': 'Za ovu grupu uticaja',
    'activeCourses': 'Aktivni kursevi',
    'coursesPaused': 'Bonusi su delimično pauzirani dok se osoblje usavršava',
    'fillVacancies': 'Koristite Transferi → Osoblje da popunite slobodna mesta',
    'combinedTitle': 'Zajednički uticaj tima',
    'combinedMedical': 'Zajednička medicinska podrška doktora tima, fizioterapeuta i nutricioniste.',
    'combinedCoach': 'Trenerski efekat koji sistem primenjuje preko člana osoblja {{name}}.',
    'combinedCurrent': 'Trenutni zajednički uticaj aktivnog osoblja u ovoj grupi.',
    'coachingTitle': 'Zajednički uticaj trenerskog osoblja',
    'medicalTitle': 'Zajednički uticaj medicinskog osoblja',
    'mechanicTitle': 'Uticaj mehaničarskog osoblja',
    'directorTitle': 'Uticaj sportskih direktora',
    'u23Title': 'Uticaj U23 trenerskog osoblja',
    'scoutingTitle': 'Uticaj skauting osoblja',
}

staff_en['scoutingExplainer'] = {
    'title': 'How Scout Quality Works',
    'body': 'Scout attributes create the scout’s true ability. The Scouting Office can cap the final report quality, so a strong scout may still produce basic reports until the office is upgraded.',
    'abilityLevels': 'Scout Ability levels',
    'reportLevels': 'Report Quality levels',
    'levelScale': 'Basic → Solid → Strong → Elite',
    'thresholds': 'Scout Ability thresholds',
    'thresholdValues': 'Basic: below 55 · Solid: 55–69 · Strong: 70–84 · Elite: 85+',
    'upgrade': 'Better Scouting Office unlocks higher report quality. Current level: Lv {{level}}.',
    'upgradeNoLevel': 'Better Scouting Office unlocks higher report quality.',
    'limited': 'Limited by Scouting Office Lv {{level}}.',
    'basicWithScore': 'Basic ({{score}})',
    'solidWithScore': 'Solid ({{score}})',
    'strongWithScore': 'Strong ({{score}})',
    'eliteWithScore': 'Elite ({{score}})',
}
staff_sr['scoutingExplainer'] = {
    'title': 'Kako funkcioniše kvalitet skautinga',
    'body': 'Atributi skauta određuju njegovu stvarnu sposobnost. Nivo Skauting kancelarije može ograničiti konačni kvalitet izveštaja, pa i veoma dobar skaut može praviti samo osnovne izveštaje dok se kancelarija ne unapredi.',
    'abilityLevels': 'Nivoi sposobnosti skauta',
    'reportLevels': 'Nivoi kvaliteta izveštaja',
    'levelScale': 'Osnovno → Solidno → Jako → Elitno',
    'thresholds': 'Pragovi sposobnosti skauta',
    'thresholdValues': 'Osnovno: ispod 55 · Solidno: 55–69 · Jako: 70–84 · Elitno: 85+',
    'upgrade': 'Bolja Skauting kancelarija otključava viši kvalitet izveštaja. Trenutni nivo: Lv {{level}}.',
    'upgradeNoLevel': 'Bolja Skauting kancelarija otključava viši kvalitet izveštaja.',
    'limited': 'Ograničeno nivoom Skauting kancelarije Lv {{level}}.',
    'basicWithScore': 'Osnovno ({{score}})',
    'solidWithScore': 'Solidno ({{score}})',
    'strongWithScore': 'Jako ({{score}})',
    'eliteWithScore': 'Elitno ({{score}})',
}

staff_en['effectText'] = {
    'scoutingAccuracy': '+{{value}}% scouting accuracy',
    'prospectVisibility': '+{{value}}% prospect visibility',
    'combinedScoutingAccuracy': '+{{value}}% combined scouting accuracy',
    'combinedProspectVisibility': '+{{value}}% combined prospect visibility',
    'futureTransferYouth': 'Future: transfer intelligence and youth reports',
    'futureBroaderTransferYouth': 'Future: broader transfer and youth intelligence',
    'scoutingOfficeCap': 'Scouting Office Lv {{level}} caps part of scout and analyst bonuses.',
}
staff_sr['effectText'] = {
    'scoutingAccuracy': '+{{value}}% preciznosti skautinga',
    'prospectVisibility': '+{{value}}% vidljivosti potencijalnih vozača',
    'combinedScoutingAccuracy': '+{{value}}% zajedničke preciznosti skautinga',
    'combinedProspectVisibility': '+{{value}}% zajedničke vidljivosti potencijalnih vozača',
    'futureTransferYouth': 'U budućnosti: informacije o transferima i izveštaji o mladim vozačima',
    'futureBroaderTransferYouth': 'U budućnosti: šire informacije o transferima i mladim vozačima',
    'scoutingOfficeCap': 'Skauting kancelarija Lv {{level}} ograničava deo bonusa skauta i analitičara.',
}

course_rows = [
    ('coach_elite_methodology','Elite Methodology Course','Improves training structure and overall rider progression quality.','Training + Development','Kurs elitne metodologije','Poboljšava strukturu treninga i ukupni kvalitet napretka vozača.','Trening + razvoj'),
    ('coach_recovery_planning','Recovery Planning Seminar','Focus on load balancing, fatigue prevention and micro-cycle planning.','Recovery Planning','Seminar planiranja oporavka','Fokus na balansiranju opterećenja, sprečavanju umora i planiranju mikro-ciklusa.','Planiranje oporavka'),
    ('coach_youth_programme','Youth Development Programme','Specialised course for improving work with young and developing riders.','Youth Development','Program razvoja mladih','Specijalizovan kurs za bolji rad sa mladim vozačima i vozačima u razvoju.','Razvoj mladih'),
    ('trainer_daily_training_methods','Daily Training Methods','Improves day-to-day training delivery, session structure and rider training consistency.','Daily Training + Efficiency','Metode svakodnevnog treninga','Poboljšava svakodnevno sprovođenje treninga, strukturu sesija i doslednost rada sa vozačima.','Dnevni trening + efikasnost'),
    ('trainer_load_management','Load Management Workshop','Focuses on balancing training load, reducing overload risk and supporting better recovery between sessions.','Efficiency + Experience','Radionica upravljanja opterećenjem','Fokusira se na balansiranje opterećenja, smanjenje rizika od preopterećenja i bolji oporavak između sesija.','Efikasnost + iskustvo'),
    ('trainer_potential_growth','Potential Growth Programme','Specialised trainer course for improving long-term rider development and potential growth support.','Potential Growth + Daily Training','Program razvoja potencijala','Specijalizovan kurs za dugoročni razvoj vozača i bolju podršku rastu potencijala.','Razvoj potencijala + dnevni trening'),
    ('doctor_sports_medicine','Sports Medicine Course','Improves diagnosis quality and athlete-specific treatment decisions.','Diagnosis + Recovery','Kurs sportske medicine','Poboljšava kvalitet dijagnoze i odluke o tretmanu prilagođene sportistima.','Dijagnoza + oporavak'),
    ('doctor_prevention_lab','Injury Prevention Lab','Focuses on risk screening and preventive protocols.','Prevention','Laboratorija prevencije povreda','Fokusira se na procenu rizika i preventivne protokole.','Prevencija'),
    ('doctor_rehab_acceleration','Rehab Acceleration Programme','Advanced rehab planning for shorter return timelines.','Recovery Speed','Program ubrzane rehabilitacije','Napredno planiranje rehabilitacije za brži povratak vozača.','Brzina oporavka'),
    ('physio_rehab_methods','Rehabilitation Methods','Improves rehab planning, recovery speed and return-to-fitness support.','Rehabilitation + Recovery Speed','Metode rehabilitacije','Poboljšava planiranje rehabilitacije, brzinu oporavka i povratak pune spremnosti.','Rehabilitacija + brzina oporavka'),
    ('physio_load_recovery','Load Recovery Workshop','Focuses on reducing fatigue impact and improving post-training recovery.','Recovery Speed + Experience','Radionica oporavka od opterećenja','Fokusira se na smanjenje uticaja umora i bolji oporavak posle treninga.','Brzina oporavka + iskustvo'),
    ('physio_injury_return','Return-to-Fitness Programme','Specialised programme for helping riders recover from injuries more efficiently.','Rehabilitation + Experience','Program povratka u punu spremnost','Specijalizovan program za efikasniji oporavak vozača od povreda.','Rehabilitacija + iskustvo'),
    ('nutritionist_race_nutrition','Race Nutrition Planning','Improves race nutrition plans, rider consistency and recovery support.','Nutrition Plan + Consistency','Planiranje ishrane za trku','Poboljšava plan ishrane na trci, stabilnost vozača i podršku oporavku.','Plan ishrane + doslednost'),
    ('nutritionist_recovery_diet','Recovery Diet Workshop','Focuses on nutrition routines that support daily fatigue recovery.','Recovery Support + Nutrition','Radionica ishrane za oporavak','Fokusira se na režime ishrane koji podržavaju svakodnevni oporavak od umora.','Podrška oporavku + ishrana'),
    ('nutritionist_endurance_fueling','Endurance Fueling Programme','Advanced nutrition planning for long-term rider endurance and training quality.','Nutrition + Long-Term Support','Program ishrane za izdržljivost','Napredno planiranje ishrane za dugoročnu izdržljivost vozača i kvalitet treninga.','Ishrana + dugoročna podrška'),
    ('mechanic_tt_setup','Time Trial Setup Course','Advanced aerodynamic fitting and TT position optimisation.','Setup','Kurs podešavanja za hronometar','Napredno aerodinamičko podešavanje i optimizacija TT pozicije.','Podešavanje'),
    ('mechanic_reliability','Reliability Workshop','Improves equipment consistency and race-day reliability.','Reliability','Radionica pouzdanosti','Poboljšava stabilnost opreme i pouzdanost na dan trke.','Pouzdanost'),
    ('mechanic_weather_adaptation','Weather Adaptation Training','Focuses on technical support in wet and mixed conditions.','Conditions Support','Trening prilagođavanja vremenu','Fokusira se na tehničku podršku u mokrim i promenljivim uslovima.','Podrška u uslovima'),
    ('director_tactics','Race Tactics Seminar','Improves tactical calls, pacing plans and race management decisions.','Tactics','Seminar taktike trke','Poboljšava taktičke odluke, planiranje tempa i upravljanje trkom.','Taktika'),
    ('director_leadership','Leadership Intensive','Strengthens motivation, leadership and intra-team communication.','Leadership','Intenzivni kurs liderstva','Jača motivaciju, liderstvo i komunikaciju unutar tima.','Liderstvo'),
    ('director_stage_strategy','Stage Strategy Programme','Specialized tactical planning for stage races and GC support.','Stage Strategy','Program strategije etapa','Specijalizovano taktičko planiranje za etapne trke i podršku generalnom plasmanu.','Strategija etapa'),
    ('u23_youth_development_methods','Youth Development Methods','Improves youth training structure, development planning and long-term rider growth.','Youth Development + Youth Training','Metode razvoja mladih','Poboljšava strukturu treninga mladih, planiranje razvoja i dugoročni napredak vozača.','Razvoj mladih + trening mladih'),
    ('u23_talent_pathway_programme','Talent Pathway Programme','Focuses on identifying development paths and improving potential growth support.','Potential Growth + Experience','Program razvoja talenata','Fokusira se na prepoznavanje razvojnih puteva i bolju podršku rastu potencijala.','Razvoj potencijala + iskustvo'),
    ('u23_race_readiness_course','U23 Race Readiness Course','Prepares young riders for race-day structure, discipline and tactical development.','Youth Training + Leadership','U23 kurs pripreme za trku','Priprema mlade vozače za strukturu dana trke, disciplinu i taktički razvoj.','Trening mladih + liderstvo'),
    ('scout_evaluation','Evaluation Accuracy Course','Improves rider assessment and report quality.','Evaluation','Kurs preciznosti procene','Poboljšava procenu vozača i kvalitet izveštaja.','Procena'),
    ('scout_networking','Scouting Network Camp','Builds connections and improves talent identification coverage.','Network','Kamp razvoja skauting mreže','Gradi kontakte i poboljšava pokrivenost pri pronalaženju talenata.','Mreža'),
    ('scout_data_analysis','Performance Data Analysis','Improves analytical review of riders and race preparation reports.','Accuracy + Analysis','Analiza podataka o učinku','Poboljšava analitički pregled vozača i izveštaja za pripremu trke.','Preciznost + analiza'),
]
staff_en['courseOptions'] = {}
staff_sr['courseOptions'] = {}
for code, title, desc, focus, sr_title, sr_desc, sr_focus in course_rows:
    staff_en['courseOptions'][code] = {'title': title, 'description': desc, 'focus': focus}
    staff_sr['courseOptions'][code] = {'title': sr_title, 'description': sr_desc, 'focus': sr_focus}

save_json(staff_en_path, staff_en)
save_json(staff_sr_path, staff_sr)

staff_helpers = r'''
function translateStaffEffect(effect: string, t: TFunction): string {
  let match = effect.match(/^\+(\d+)% scouting accuracy$/)
  if (match) return t('effectText.scoutingAccuracy', { value: match[1] })

  match = effect.match(/^\+(\d+)% prospect visibility$/)
  if (match) return t('effectText.prospectVisibility', { value: match[1] })

  match = effect.match(/^\+(\d+)% combined scouting accuracy$/)
  if (match) return t('effectText.combinedScoutingAccuracy', { value: match[1] })

  match = effect.match(/^\+(\d+)% combined prospect visibility$/)
  if (match) return t('effectText.combinedProspectVisibility', { value: match[1] })

  if (effect === 'Future: transfer intelligence and youth reports') {
    return t('effectText.futureTransferYouth')
  }
  if (effect === 'Future: broader transfer and youth intelligence') {
    return t('effectText.futureBroaderTransferYouth')
  }

  match = effect.match(/^Scouting Office Lv (\d+) caps part of scout and analyst bonuses\.$/)
  if (match) return t('effectText.scoutingOfficeCap', { level: match[1] })

  return effect
}

function translateScoutExplanationText(value: string, t: TFunction): string {
  const exact: Record<string, string> = {
    'How Scout Quality Works': 'scoutingExplainer.title',
    'Scout attributes create the scout’s true ability. The Scouting Office can cap the final report quality, so a strong scout may still produce basic reports until the office is upgraded.': 'scoutingExplainer.body',
    'Scout Ability levels': 'scoutingExplainer.abilityLevels',
    'Report Quality levels': 'scoutingExplainer.reportLevels',
    'Basic → Solid → Strong → Elite': 'scoutingExplainer.levelScale',
    'Scout Ability thresholds': 'scoutingExplainer.thresholds',
    'Basic: below 55 · Solid: 55–69 · Strong: 70–84 · Elite: 85+': 'scoutingExplainer.thresholdValues',
    'Better Scouting Office unlocks higher report quality.': 'scoutingExplainer.upgradeNoLevel',
  }

  if (exact[value]) return t(exact[value])

  let match = value.match(/^Better Scouting Office unlocks higher report quality\. Current level: Lv (\d+)\.$/)
  if (match) return t('scoutingExplainer.upgrade', { level: match[1] })

  match = value.match(/^Limited by Scouting Office Lv (\d+)\.$/)
  if (match) return t('scoutingExplainer.limited', { level: match[1] })

  match = value.match(/^(Basic|Solid|Strong|Elite) \(([^)]+)\)$/)
  if (match) {
    const keyByTier: Record<string, string> = {
      Basic: 'scoutingExplainer.basicWithScore',
      Solid: 'scoutingExplainer.solidWithScore',
      Strong: 'scoutingExplainer.strongWithScore',
      Elite: 'scoutingExplainer.eliteWithScore',
    }
    return t(keyByTier[match[1]], { score: match[2] })
  }

  return value
}
'''
staff_text = Path(staff_path).read_text(encoding='utf-8')
if 'function translateStaffEffect(' not in staff_text:
    staff_text = staff_text.replace('function SummaryCard({', staff_helpers + '\nfunction SummaryCard({', 1)
    Path(staff_path).write_text(staff_text, encoding='utf-8')

replace(staff_path, '{getImpactPanelTitle(role)}', "{t(role === 'head_coach' || role === 'trainer' ? 'impactI18n.coachingTitle' : role === 'team_doctor' || role === 'physio' || role === 'nutritionist' ? 'impactI18n.medicalTitle' : role === 'mechanic' ? 'impactI18n.mechanicTitle' : role === 'sport_director' ? 'impactI18n.directorTitle' : role === 'u23_head_coach' ? 'impactI18n.u23Title' : 'impactI18n.scoutingTitle')}")
replace(staff_path, 'label="Assigned"', "label={t('impactI18n.assigned')}")
replace(staff_path, "subtext={members.length < roleLimit ? 'Open slot available' : 'Current basic cap reached'}", "subtext={members.length < roleLimit ? t('impactI18n.openSlotAvailable') : t('impactI18n.currentBasicCapReached')}")
replace(staff_path, 'subtext="For this impact group"', "subtext={t('impactI18n.forGroup')}")
replace(staff_path, 'label="Active Courses"', "label={t('impactI18n.activeCourses')}")
replace(staff_path, 'subtext="Bonuses are partially paused while staff study"', "subtext={t('impactI18n.coursesPaused')}")
replace(staff_path, 'subtext="Use Transfers → Staff to fill vacancies"', "subtext={t('impactI18n.fillVacancies')}")
replace(staff_path, 'title="Combined Team Impact"', "title={t('impactI18n.combinedTitle')}")
replace(staff_path, "? 'Combined medical support from Team Doctor, Physio and Nutritionist.'", "? t('impactI18n.combinedMedical')")
replace(staff_path, "? `Backend-applied coaching effect from ${activeHeadCoachEffect.staff_name}.`", "? t('impactI18n.combinedCoach', { name: activeHeadCoachEffect.staff_name })")
replace(staff_path, ": 'Current combined impact from active staff in this group.'", ": t('impactI18n.combinedCurrent')")
replace(staff_path, '                      {effect}', '                      {translateStaffEffect(effect, t)}')
replace(staff_path, '                    {effect}', '                    {translateStaffEffect(effect, t)}')

# Quality panel: the parenthetical tier score also needs localization.
replace(staff_path, '            <div className="mt-1 text-sm font-semibold text-gray-900">{translateQualityText(row.value)}</div>', '            <div className="mt-1 text-sm font-semibold text-gray-900">{translateScoutExplanationText(translateQualityText(row.value), t)}</div>')

# Scout explanation block.
replace(staff_path, '<div className="font-semibold">{data.title}</div>', '<div className="font-semibold">{translateScoutExplanationText(data.title, t)}</div>')
replace(staff_path, '<div className="mt-2 text-blue-800">{data.body}</div>', '<div className="mt-2 text-blue-800">{translateScoutExplanationText(data.body, t)}</div>')
replace(staff_path, '{translateQualityText(box.label)}', '{translateScoutExplanationText(translateQualityText(box.label), t)}')
replace(staff_path, '<div className="mt-1 font-medium">{box.value}</div>', '<div className="mt-1 font-medium">{translateScoutExplanationText(box.value, t)}</div>')
replace(staff_path, '{data.thresholdLabel}', '{translateScoutExplanationText(data.thresholdLabel, t)}')
replace(staff_path, '{data.thresholdValue}', '{translateScoutExplanationText(data.thresholdValue, t)}')
replace(staff_path, '{data.warning}', '{translateScoutExplanationText(data.warning, t)}')

# Course presentation is keyed by stable backend course code; game logic remains unchanged.
replace(
    staff_path,
    '  const courseOptions = buildCourseOptions(staff.role)',
    "  const courseOptions = buildCourseOptions(staff.role).map((course) => ({\n    ...course,\n    title: t(`courseOptions.${course.code}.title`, { defaultValue: course.title }),\n    description: t(`courseOptions.${course.code}.description`, { defaultValue: course.description }),\n    focusLabel: t(`courseOptions.${course.code}.focus`, { defaultValue: course.focusLabel }),\n  }))",
    required=True,
)

# ---------------------------------------------------------------------------
# STATISTICS
# ---------------------------------------------------------------------------
stats_en_path = 'src/i18n/locales/en/statistics.json'
stats_sr_path = 'src/i18n/locales/sr-Latn/statistics.json'
stats_en = load_json(stats_en_path)
stats_sr = load_json(stats_sr_path)

for resource, values in [
    (stats_en, {
        'loading': 'Loading statistics', 'fetching': 'Fetching data...', 'error': 'Statistics error',
        'rider': 'Rider', 'team': 'Team', 'country': 'Country', 'role': 'Role', 'age': 'Age',
        'tier': 'Tier', 'division': 'Division', 'type': 'Type', 'status': 'Status', 'season': 'Season',
        'position': 'Pos', 'internationalPoints': 'International points',
    }),
    (stats_sr, {
        'loading': 'Učitavanje statistike', 'fetching': 'Učitavanje podataka...', 'error': 'Greška statistike',
        'rider': 'Vozač', 'team': 'Tim', 'country': 'Zemlja', 'role': 'Uloga', 'age': 'Godine',
        'tier': 'Nivo', 'division': 'Divizija', 'type': 'Tip', 'status': 'Status', 'season': 'Sezona',
        'position': 'Poz.', 'internationalPoints': 'Međunarodni bodovi',
    }),
]:
    resource.setdefault('page', {})
    resource['page']['loading'] = values['loading']
    resource['page']['fetching'] = values['fetching']
    resource['page']['error'] = values['error']
    resource.setdefault('common', {})
    for key in ['rider','team','country','role','age','tier','division','type','status','season','position','internationalPoints']:
        resource['common'][key] = values[key]

stats_en.setdefault('roles', {}).update({'leader': 'Leader', 'breakaway': 'Breakaway', 'tt': 'TT'})
stats_sr.setdefault('roles', {}).update({
    'allRounder': 'Univerzalac',
    'domestique': 'Pomoćni vozač',
    'leader': 'Lider',
    'breakaway': 'Begunac',
    'tt': 'Hronometraš',
})
stats_en.setdefault('metrics', {})['sortedBy'] = 'Sorted by: {{metric}}.'
stats_sr.setdefault('metrics', {})['sortedBy'] = 'Sortirano prema: {{metric}}.'

save_json(stats_en_path, stats_en)
save_json(stats_sr_path, stats_sr)

rider_stats_path = 'src/features/squad/components/RiderStatisticsSection.tsx'
replace(
    rider_stats_path,
    "      case 'puncheur':\n        return t('roles.puncheur')",
    "      case 'puncheur':\n        return t('roles.puncheur')\n      case 'leader':\n        return t('roles.leader')\n      case 'breakaway':\n        return t('roles.breakaway')\n      case 'tt':\n      case 'timetrial':\n        return t('roles.tt')",
)
replace(rider_stats_path, '<SectionCard title="Loading statistics">', "<SectionCard title={t('page.loading')}>")
replace(rider_stats_path, '>Fetching data...</div>', ">{t('page.fetching')}</div>")
replace(rider_stats_path, '<SectionCard title="Statistics error">', "<SectionCard title={t('page.error')}>")
replace(rider_stats_path, 'subtitle={`Sorted by ${formatRiderMetricLabel(riderMetric).toLowerCase()} points.`}', "subtitle={t('metrics.sortedBy', { metric: formatRiderMetricLabel(riderMetric) })}")
for english, key in [
    ('Rider','common.rider'), ('Country','common.country'), ('Role','common.role'),
    ('Team','common.team'), ('Age','common.age'),
    ('International points','metrics.internationalPoints'),
    ('Stage finish points','metrics.stageFinishPoints'), ('GC / one-day points','metrics.gcOneDayPoints'),
]:
    replace(rider_stats_path, f'>{english}</th>', f">{{t('{key}')}}</th>")

team_stats_path = 'src/features/squad/components/TeamStatisticsSection.tsx'
replace(team_stats_path, '<SectionCard title="Loading statistics">', "<SectionCard title={t('page.loading')}>")
replace(team_stats_path, '>Fetching data...</div>', ">{t('page.fetching')}</div>")
replace(team_stats_path, '<SectionCard title="Statistics error">', "<SectionCard title={t('page.error')}>")
for english, key in [
    ('Team','common.team'), ('Country','common.country'), ('Tier','common.tier'),
    ('Division','common.division'), ('Type','common.type'), ('Status','common.status'),
    ('Season','common.season'), ('Pos','common.position'), ('International points','common.internationalPoints'),
]:
    replace(team_stats_path, f'>{english}</th>', f">{{t('{key}')}}</th>")

# ---------------------------------------------------------------------------
# RACE DETAIL — consumer-facing panels visible in normal race UI.
# ---------------------------------------------------------------------------
race_path = 'src/pages/dashboard/RaceDetailPage.tsx'
race_en_path = 'src/i18n/locales/en/raceDetail.json'
race_sr_path = 'src/i18n/locales/sr-Latn/raceDetail.json'
race_en = load_json(race_en_path)
race_sr = load_json(race_sr_path)

race_en.setdefault('weather', {}).update({
    'average': 'Average', 'minMax': 'Min / max',
    'notGenerated': 'Weather is not generated for this stage yet.',
})
race_sr.setdefault('weather', {}).update({
    'average': 'Prosek', 'minMax': 'Min / maks',
    'notGenerated': 'Vremenska prognoza za ovu etapu još nije generisana.',
})
race_en.setdefault('leaders', {}).update({'title': 'Leaders / Winners', 'updating': 'Updating…'})
race_sr.setdefault('leaders', {}).update({'title': 'Lideri / Pobednici', 'updating': 'Ažuriranje…'})
race_en.setdefault('rewards', {}).update({
    'shadowTitle': 'Shadow rewards are not persisted',
    'shadowDescription': 'Preview-only rewards are not saved. Official prize-money and international-ranking awards remain production-only.',
})
race_sr.setdefault('rewards', {}).update({
    'shadowTitle': 'Probne nagrade se ne čuvaju',
    'shadowDescription': 'Nagrade iz pregleda se ne čuvaju. Zvanične novčane nagrade i međunarodni bodovi ostaju deo produkcionog obračuna.',
})

save_json(race_en_path, race_en)
save_json(race_sr_path, race_sr)

replace(race_path, '>Average</div>', ">{t('weather.average')}</div>")
replace(race_path, '>Min / max</div>', ">{t('weather.minMax')}</div>")
replace(race_path, '>Wind</div>', ">{t('weather.wind')}</div>")
replace(race_path, '>Rain</div>', ">{t('weather.rain')}</div>")

# Add a translation hook to RaceLeadersCard only.
regex_replace(
    race_path,
    r"(function RaceLeadersCard\(\{[\s\S]*?\}: \{[\s\S]*?classificationResultsStageId\?: string \| null\n\}\) \{)\n(  const \[snapshot, setSnapshot\])",
    r"\1\n  const { t } = useTranslation('raceDetail')\n\2",
)
replace(race_path, "{ key: 'general', label: 'General leader' }", "{ key: 'general', label: t('leaders.general') }")
replace(race_path, "{ key: 'sprinter', label: 'Best sprinter' }", "{ key: 'sprinter', label: t('leaders.sprinter') }")
replace(race_path, "{ key: 'mountain', label: 'Best climber' }", "{ key: 'mountain', label: t('leaders.climber') }")
replace(race_path, "{ key: 'young', label: 'Best young rider' }", "{ key: 'young', label: t('leaders.young') }")
replace(race_path, "{ key: 'team', label: 'Best team' }", "{ key: 'team', label: t('leaders.team') }")
replace(race_path, '          Leaders / Winners', "          {t('leaders.title')}")
replace(race_path, '>Updating…</div>', ">{t('leaders.updating')}</div>")
replace(race_path, '>Application strength</div>', ">{t('application.applicationStrength')}</div>")
replace(race_path, '>Shadow rewards are not persisted</div>', ">{t('rewards.shadowTitle')}</div>")
regex_replace(
    race_path,
    r'Stage results, sprint/KOM points, finish bonuses, and stage classifications below use the in-memory universal result\. Official prize-money and international-ranking award rules remain production-only and are not invented by this read-only preview\.',
    "{t('rewards.shadowDescription')}",
)

for english, key in [
    ('Country','results.country'), ('Time','results.time'), ('Gap','results.gap'),
    ('Status','results.status'), ('Pts','results.pts'), ('Bonus','results.bonus'),
]:
    replace(race_path, f'>{english}</th>', f">{{t('{key}')}}</th>")
replace(race_path, "{view === 'team' ? 'Team' : 'Rider'}", "{view === 'team' ? t('results.team') : t('results.rider')}")
replace(race_path, "{isPointsView ? 'Points' : 'Time'}", "{isPointsView ? t('results.pointsColumn') : t('results.time')}")

replace(race_path, '<option>No stage points available</option>', "<option>{t('replay.noStagePoints')}</option>")
replace(race_path, '          This stage has no sprint, KOM, or finish point definitions.', "          {t('replay.noStageDefinitions')}")
replace(race_path, '          This point has not been reached yet.', "          {t('replay.pointNotReached')}")
replace(race_path, '          This point was reached without an awarded result.', "          {t('replay.pointNoAward')}")
replace(race_path, '          Current stage totals', "          {t('replay.currentStageTotals')}")
replace(race_path, '            No sprint, KOM, or bonus awards have been revealed yet.', "            {t('replay.noAwards')}")
replace(race_path, '>Sprint</th>', ">{t('report.sprint')}</th>")
replace(race_path, '>KOM</th>', ">{t('report.kom')}</th>")
replace(race_path, '>Total</th>', ">{t('replay.total')}</th>")

replace(race_path, '>Loading stage profile…</div>', ">{t('stage.loadingProfile')}</div>")
replace(race_path, '>Distance</div>', ">{t('stage.distance')}</div>")
replace(race_path, '>Terrain</div>', ">{t('stage.terrain')}</div>")
replace(race_path, '>Profile</div>', ">{t('stage.profileLabel')}</div>")
replace(race_path, '>Elevation</div>', ">{t('stage.elevation')}</div>")
replace(race_path, '>Stage points</h3>', ">{t('stage.points')}</h3>")
replace(race_path, '                    No stage points configured for this stage.', "                    {t('stage.noPoints')}")
replace(race_path, "profile.stage_title ?? `Stage ${profile.stage_number}`", "profile.stage_title ?? t('stage.stageNumber', { stage: profile.stage_number })")
replace(race_path, "profile.route_label ?? 'Route TBD'", "profile.route_label ?? t('stage.routeTbd')")
replace(race_path, '                  Full stage standing', "                  {t('results.fullStageStanding')}")
replace(race_path, "aria-label={fullStandingModal === 'race' ? 'Full race standing' : 'Full stage standing'}", "aria-label={fullStandingModal === 'race' ? t('results.fullRaceStanding') : t('results.fullStageStanding')}")
replace(race_path, "{fullStandingModal === 'race' ? 'Full race standing' : 'Full stage standing'}", "{fullStandingModal === 'race' ? t('results.fullRaceStanding') : t('results.fullStageStanding')}")

print('Pass A localization changes prepared.')
