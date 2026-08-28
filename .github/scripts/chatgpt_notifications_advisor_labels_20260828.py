from pathlib import Path
import json

page = Path('src/pages/dashboard/NotificationsPage.tsx')
text = page.read_text(encoding='utf-8')

def rep(old: str, new: str, required: bool = True):
    global text
    if old not in text:
        if required:
            raise SystemExit(f'Missing anchor: {old[:140]!r}')
        return
    text = text.replace(old, new)

# Head Coach structured labels + skill summary.
rep("                            ).trim() || 'Rider'", "                            ).trim() || t('common.rider')")
old_skill = """                              ? `${skillRiderName} ${
                                  Number(skillDelta ?? 0) < 0
                                    ? `${skillLabel} decreased`
                                    : `improved ${skillLabel}`
                                } from ${formatAdvisorValue(skillOldValue)} to ${formatAdvisorValue(skillNewValue)} (${
                                  Number(skillDelta ?? 0) > 0 ? '+' : ''
                                }${formatAdvisorValue(skillDelta)}).`
                              : null"""
new_skill = """                              ? t(
                                  Number(skillDelta ?? 0) < 0
                                    ? 'headCoach.decreased'
                                    : 'headCoach.improved',
                                  {
                                    rider: skillRiderName,
                                    skill: skillLabel,
                                    old: formatAdvisorValue(skillOldValue),
                                    new: formatAdvisorValue(skillNewValue),
                                    delta: `${Number(skillDelta ?? 0) > 0 ? '+' : ''}${formatAdvisorValue(skillDelta)}`,
                                  }
                                )
                              : null"""
rep(old_skill, new_skill)
replacements = {
    "['Rider', skillRiderName]": "[t('common.rider'), skillRiderName]",
    "['Change', Number(skillDelta ?? 0) > 0 ? `+${formatAdvisorValue(skillDelta)}` : formatAdvisorValue(skillDelta)]": "[t('headCoach.change'), Number(skillDelta ?? 0) > 0 ? `+${formatAdvisorValue(skillDelta)}` : formatAdvisorValue(skillDelta)]",
    "['Squad riders', snapshot.squad_riders]": "[t('headCoach.squadRiders'), snapshot.squad_riders]",
    "['Elevated fatigue', snapshot.elevated_fatigue]": "[t('headCoach.elevatedFatigue'), snapshot.elevated_fatigue]",
    "['Not fully fit', snapshot.not_fully_fit]": "[t('headCoach.notFullyFit'), snapshot.not_fully_fit]",
    "['Unavailable', snapshot.unavailable]": "[t('headCoach.unavailable'), snapshot.unavailable]",
    "'Planned sessions · next 3 game days'": "t('headCoach.plannedSessions')",
    "'Manual overrides · next 3 game days'": "t('headCoach.manualOverrides')",
    "['Highest fatigue', snapshot.highest_fatigue]": "[t('headCoach.highestFatigue'), snapshot.highest_fatigue]",
    "['Window start', formatAdvisorGameDateTime(snapshot.window_start)]": "[t('headCoach.windowStart'), formatAdvisorGameDateTime(snapshot.window_start)]",
    "['Window end', formatAdvisorGameDateTime(snapshot.window_end)]": "[t('headCoach.windowEnd'), formatAdvisorGameDateTime(snapshot.window_end)]",
    "label === 'Rider' && isRiderSkillChange": "label === t('common.rider') && isRiderSkillChange",
    "                                          Riders needing attention": "                                          {t('headCoach.ridersAttention')}",
    "                                            <span>Rider</span>\n                                            <span>Fatigue</span>\n                                            <span>Availability</span>\n                                            <span>Reason</span>": "                                            <span>{t('common.rider')}</span>\n                                            <span>{t('headCoach.fatigue')}</span>\n                                            <span>{t('common.availability')}</span>\n                                            <span>{t('common.reason')}</span>",
    "                                          Head Coach recommendations": "                                          {t('headCoach.recommendations')}",
}
for old, new in replacements.items(): rep(old, new)

# Localize report-variant badges through resource keys with safe English fallback.
variant_manual = """{String(advisorPayload.report_variant ?? '')
                                      .replace(/_/g, ' ')
                                      .replace(/\b\w/g, letter => letter.toUpperCase())}"""
variant_i18n = """{t(`reportVariants.${String(advisorPayload.report_variant ?? '')}`, {
                                      defaultValue: String(advisorPayload.report_variant ?? '')
                                        .replace(/_/g, ' ')
                                        .replace(/\b\w/g, letter => letter.toUpperCase()),
                                    })}"""
rep(variant_manual, variant_i18n, required=False)
# formatAdvisorDisplayText(report_variant) occurs mechanic/scout.
rep("{formatAdvisorDisplayText(advisorPayload.report_variant)}", "{t(`reportVariants.${String(advisorPayload.report_variant ?? '')}`, { defaultValue: formatAdvisorDisplayText(advisorPayload.report_variant) })}", required=False)
rep("""{formatAdvisorDisplayText(
                                      advisorPayload.report_variant
                                    )}""", """{t(`reportVariants.${String(advisorPayload.report_variant ?? '')}`, {
                                      defaultValue: formatAdvisorDisplayText(advisorPayload.report_variant),
                                    })}""", required=False)

# Sports Director labels.
sport = {
    "['Race', (sportData as Record<string, unknown>).current_focus_race_name": "[t('details.race'), (sportData as Record<string, unknown>).current_focus_race_name",
    "['Race start', formatAdvisorGameDateTime": "[t('sportDirector.raceStart'), formatAdvisorGameDateTime",
    "['Race end', formatAdvisorGameDateTime": "[t('sportDirector.raceEnd'), formatAdvisorGameDateTime",
    "['Race location', (sportData as Record<string, unknown>).race_location": "[t('sportDirector.raceLocation'), (sportData as Record<string, unknown>).race_location",
    "['Preparation', (sportData as Record<string, unknown>).race_preparation_status": "[t('sportDirector.preparation'), (sportData as Record<string, unknown>).race_preparation_status",
    "['Startlist', (sportData as Record<string, unknown>).startlist_status]": "[t('sportDirector.startlist'), (sportData as Record<string, unknown>).startlist_status]",
    "['Deadline', formatAdvisorGameDateTime": "[t('sportDirector.deadline'), formatAdvisorGameDateTime",
    "['Stage', (sportData as Record<string, unknown>).stage_number]": "[t('common.stage'), (sportData as Record<string, unknown>).stage_number]",
    "['Stage date', formatAdvisorGameDateTime": "[t('sportDirector.stageDate'), formatAdvisorGameDateTime",
    "['Stage start', (sportData as Record<string, unknown>).stage_start_time_label": "[t('sportDirector.stageStart'), (sportData as Record<string, unknown>).stage_start_time_label",
    "['Programme', (sportData as Record<string, unknown>).programme_status]": "[t('sportDirector.programme'), (sportData as Record<string, unknown>).programme_status]",
    "['Future races · 30 days', (sportData as Record<string, unknown>).future_accepted_races_next_30_game_days": "[t('sportDirector.futureRaces'), (sportData as Record<string, unknown>).future_accepted_races_next_30_game_days",
    "['Management priorities', (sportData as Record<string, unknown>).management_priority_count": "[t('sportDirector.managementPriorities'), (sportData as Record<string, unknown>).management_priority_count",
    "['Incomplete stage plans', (sportData as Record<string, unknown>).actionable_problem_stage_plans": "[t('sportDirector.incompleteStagePlans'), (sportData as Record<string, unknown>).actionable_problem_stage_plans",
    "['Programme gap', (sportData as Record<string, unknown>).programme_gap_days]": "[t('sportDirector.programmeGap'), (sportData as Record<string, unknown>).programme_gap_days]",
    "['Next accepted race', (sportData as Record<string, unknown>).next_future_race": "[t('sportDirector.nextAcceptedRace'), (sportData as Record<string, unknown>).next_future_race",
    "['Next race date', formatAdvisorGameDateTime": "[t('sportDirector.nextRaceDate'), formatAdvisorGameDateTime",
    "label === 'Rider' ? renderAdvisorRiderIdentity": "label === t('common.rider') ? renderAdvisorRiderIdentity",
    "                                          Management priorities": "                                          {t('sportDirector.managementPriorities')}",
    "                                            <span>Priority</span>\n                                            <span>Detail</span>\n                                            <span>Rank</span>": "                                            <span>{t('common.priority')}</span>\n                                            <span>{t('common.detail')}</span>\n                                            <span>{t('common.rank')}</span>",
    "                                          Missing or incomplete stage plans": "                                          {t('sportDirector.missingPlans')}",
    "                                            <span>Stage</span>\n                                            <span>Date</span>\n                                            <span>Start</span>\n                                            <span>Urgency</span>\n                                            <span>Status</span>": "                                            <span>{t('common.stage')}</span>\n                                            <span>{t('common.date')}</span>\n                                            <span>{t('common.start')}</span>\n                                            <span>{t('sportDirector.urgency')}</span>\n                                            <span>{t('common.status')}</span>",
    "                                                Stage {formatAdvisorValue(stage.stage_number)}": "                                                {t('common.stageValue', { stage: formatAdvisorValue(stage.stage_number) })}",
    "                                          Sports Director recommendations": "                                          {t('sportDirector.recommendations')}",
}
for old, new in sport.items(): rep(old, new, required=False)

# Team Doctor labels.
doctor = {
    "['Rider', (doctorData as Record<string, unknown>).rider_name]": "[t('common.rider'), (doctorData as Record<string, unknown>).rider_name]",
    "['Body part', (doctorData as Record<string, unknown>).body_part]": "[t('doctor.bodyPart'), (doctorData as Record<string, unknown>).body_part]",
    "['Injured riders', (doctorData as Record<string, unknown>).injured_riders]": "[t('doctor.injuredRiders'), (doctorData as Record<string, unknown>).injured_riders]",
    "['Sick riders', (doctorData as Record<string, unknown>).sick_riders]": "[t('doctor.sickRiders'), (doctorData as Record<string, unknown>).sick_riders]",
    "['Active medical cases', (doctorData as Record<string, unknown>).active_health_cases": "[t('doctor.activeCases'), (doctorData as Record<string, unknown>).active_health_cases",
    "['Base recovery days', (doctorData as Record<string, unknown>).total_selected_base_recovery_days": "[t('doctor.baseRecoveryDays'), (doctorData as Record<string, unknown>).total_selected_base_recovery_days",
    "['Adjusted recovery days', (doctorData as Record<string, unknown>).total_adjusted_recovery_days": "[t('doctor.adjustedRecoveryDays'), (doctorData as Record<string, unknown>).total_adjusted_recovery_days",
    "['Full days saved', (doctorData as Record<string, unknown>).total_recovery_days_saved": "[t('doctor.fullDaysSaved'), (doctorData as Record<string, unknown>).total_recovery_days_saved",
    "['Medical staff reduction', (doctorData as Record<string, unknown>).medical_staff_reduction_pct]": "[t('doctor.staffReduction'), (doctorData as Record<string, unknown>).medical_staff_reduction_pct]",
    "['Medical Center reduction', (doctorData as Record<string, unknown>).infrastructure_reduction_pct]": "[t('doctor.centerReduction'), (doctorData as Record<string, unknown>).infrastructure_reduction_pct]",
    "['Total recovery reduction', (doctorData as Record<string, unknown>).total_reduction_pct": "[t('doctor.totalReduction'), (doctorData as Record<string, unknown>).total_reduction_pct",
    "                                          Medical cases": "                                          {t('doctor.cases')}",
    "                                            <span>Rider</span>\n                                            <span>Medical case</span>\n                                            <span>Severity</span>\n                                            <span>Body part</span>\n                                            <span>Base</span>\n                                            <span>Adjusted</span>\n                                            <span>Staff effect</span>\n                                            <span>Facility effect</span>\n                                            <span>Expected return</span>": "                                            <span>{t('common.rider')}</span>\n                                            <span>{t('doctor.medicalCase')}</span>\n                                            <span>{t('doctor.severity')}</span>\n                                            <span>{t('doctor.bodyPart')}</span>\n                                            <span>{t('doctor.base')}</span>\n                                            <span>{t('doctor.adjusted')}</span>\n                                            <span>{t('doctor.staffEffect')}</span>\n                                            <span>{t('doctor.facilityEffect')}</span>\n                                            <span>{t('doctor.expectedReturn')}</span>",
    "                                          Team Doctor recommendations": "                                          {t('doctor.recommendations')}",
}
for old, new in doctor.items(): rep(old, new, required=False)

# Mechanic labels.
mechanic = {
    "['Ready items', mechanicData.ready_items]": "[t('mechanic.readyItems'), mechanicData.ready_items]",
    "['Needs attention', mechanicData.maintenance_needed": "[t('mechanic.needsAttention'), mechanicData.maintenance_needed",
    "['Critical items', mechanicData.critical_items]": "[t('mechanic.criticalItems'), mechanicData.critical_items]",
    "['Pending maintenance', mechanicData.pending_maintenance_jobs]": "[t('mechanic.pendingMaintenance'), mechanicData.pending_maintenance_jobs]",
    "['Empty supply types', mechanicData.empty_supply_types]": "[t('mechanic.emptySupplies'), mechanicData.empty_supply_types]",
    "['Low supply types', mechanicData.low_supply_types]": "[t('mechanic.lowSupplies'), mechanicData.low_supply_types]",
    ">Equipment needing attention</div>": ">{t('mechanic.attentionTitle')}</div>",
    "<span>Equipment</span><span>Category</span><span>Condition</span><span>Status</span><span>Priority</span><span>Last used</span>": "<span>{t('mechanic.equipment')}</span><span>{t('mechanic.category')}</span><span>{t('mechanic.condition')}</span><span>{t('common.status')}</span><span>{t('common.priority')}</span><span>{t('mechanic.lastUsed')}</span>",
    ">Equipment categories</div>": ">{t('mechanic.equipmentCategories')}</div>",
    "<span>Category</span><span>Owned</span><span>Ready</span><span>Attention</span><span>Avg. condition</span>": "<span>{t('mechanic.category')}</span><span>{t('mechanic.owned')}</span><span>{t('mechanic.ready')}</span><span>{t('mechanic.attention')}</span><span>{t('mechanic.avgCondition')}</span>",
    ">Race supplies</div>": ">{t('mechanic.raceSupplies')}</div>",
    "<span>Supply</span><span>Available</span><span>Threshold</span><span>Status</span><span>Last used</span>": "<span>{t('mechanic.supply')}</span><span>{t('mechanic.available')}</span><span>{t('mechanic.threshold')}</span><span>{t('common.status')}</span><span>{t('mechanic.lastUsed')}</span>",
    ">Chief Mechanic recommendations</div>": ">{t('mechanic.recommendations')}</div>",
}
for old, new in mechanic.items(): rep(old, new, required=False)

# Scout labels.
scout = {
    "['Rider', getAdvisorRiderDisplayName": "[t('common.rider'), getAdvisorRiderDisplayName",
    "['Country', scoutData.rider_country_code": "[t('common.country'), scoutData.rider_country_code",
    "['Potential score', scoutData.potential_exact]": "[t('scout.potentialScore'), scoutData.potential_exact]",
    "['Precision tier', scoutData.precision_tier]": "[t('scout.precisionTier'), scoutData.precision_tier]",
    "['Review status', scoutData.review_status]": "[t('scout.reviewStatus'), scoutData.review_status]",
    "['Completed reports', scoutData.completed_reports]": "[t('scout.completedReports'), scoutData.completed_reports]",
    "['Reports · last 7 real days', scoutData.reports_last_7_real_days]": "[t('scout.reports7Days'), scoutData.reports_last_7_real_days]",
    "['High / Elite prospects', scoutData.high_or_elite_potential_reports]": "[t('scout.highElite'), scoutData.high_or_elite_potential_reports]",
    "['Active assignments', scoutData.active_scouting_tasks]": "[t('scout.activeAssignments'), scoutData.active_scouting_tasks]",
    "label === 'Country' && getAdvisorCountryFlagUrl(value)": "label === t('common.country') && getAdvisorCountryFlagUrl(value)",
    "String(value ?? 'Country')": "String(value ?? t('common.country'))",
    "                                          Reported strengths": "                                          {t('scout.reportedStrengths')}",
    "                                          Scout notes": "                                          {t('scout.notes')}",
    "                                          Recent scouting intelligence": "                                          {t('scout.recentIntelligence')}",
    "                                              <span>Rider</span>\n                                              <span>Country</span>\n                                              <span>Overall</span>\n                                              <span>Potential</span>\n                                              <span>Precision</span>\n                                              <span>Status</span>\n                                              <span>Completed</span>\n                                              <span>Strengths</span>": "                                              <span>{t('common.rider')}</span>\n                                              <span>{t('common.country')}</span>\n                                              <span>{t('scout.overall')}</span>\n                                              <span>{t('scout.potential')}</span>\n                                              <span>{t('scout.precision')}</span>\n                                              <span>{t('common.status')}</span>\n                                              <span>{t('scout.completed')}</span>\n                                              <span>{t('scout.strengths')}</span>",
    "                                          Active scouting assignments": "                                          {t('scout.activeScouting')}",
    "                                              <span>Rider</span>\n                                              <span>Country</span>\n                                              <span>Status</span>\n                                              <span>Precision</span>\n                                              <span>Completes</span>\n                                              <span>Paid</span>": "                                              <span>{t('common.rider')}</span>\n                                              <span>{t('common.country')}</span>\n                                              <span>{t('common.status')}</span>\n                                              <span>{t('scout.precision')}</span>\n                                              <span>{t('scout.completes')}</span>\n                                              <span>{t('scout.paid')}</span>",
    "? `Yes${task.coin_cost ? ` · ${formatAdvisorValue(task.coin_cost)} coins` : ''}`\n                                                    : 'No'": "? `${t('common.yes')}${task.coin_cost ? ` · ${t('common.coins', { count: Number(task.coin_cost) })}` : ''}`\n                                                    : t('common.no')",
    "                                          Scout recommendations": "                                          {t('scout.recommendations')}",
    "                                      Open rider": "                                      {t('details.openRider')}",
}
for old, new in scout.items(): rep(old, new, required=False)

page.write_text(text, encoding='utf-8')

# Add the few missing resource keys + report variant translations.
for lang, path in [('en', 'src/i18n/locales/en/notifications.json'), ('sr', 'src/i18n/locales/sr-Latn/notifications.json')]:
    p = Path(path)
    data = json.loads(p.read_text(encoding='utf-8'))
    if lang == 'en':
        data['headCoach'].update({'ridersAttention': 'Riders needing attention', 'fatigue': 'Fatigue'})
        data['reportVariants'] = {
            'rider_skill_change': 'Rider skill change',
            'weekly_training_readiness': 'Weekly training readiness',
            'training_readiness': 'Training readiness',
            'race_programme_gap': 'Race programme gap',
            'programme_continuity': 'Programme continuity',
            'long_programme_break': 'Long programme break',
            'programme_empty': 'Programme empty',
            'race_preparation_missing': 'Race preparation missing',
            'race_preparation_ready': 'Race preparation ready',
            'startlist_deadline_alert': 'Startlist deadline alert',
            'stage_plans_missing': 'Stage plans missing',
            'stage_plans_incomplete': 'Stage plans incomplete',
            'priority_prospect': 'Priority prospect',
            'medical_treatment': 'Medical treatment',
            'equipment_workshop_review': 'Equipment & workshop review',
            'recruitment_review': 'Recruitment review',
        }
    else:
        data['headCoach'].update({'ridersAttention': 'Vozači kojima je potrebna pažnja', 'fatigue': 'Umor'})
        data['reportVariants'] = {
            'rider_skill_change': 'Promena veštine vozača',
            'weekly_training_readiness': 'Nedeljna spremnost za trening',
            'training_readiness': 'Spremnost za trening',
            'race_programme_gap': 'Praznina u programu trka',
            'programme_continuity': 'Kontinuitet programa',
            'long_programme_break': 'Duga pauza u programu',
            'programme_empty': 'Program je prazan',
            'race_preparation_missing': 'Nedostaje priprema trke',
            'race_preparation_ready': 'Priprema trke je spremna',
            'startlist_deadline_alert': 'Upozorenje za rok startne liste',
            'stage_plans_missing': 'Nedostaju planovi etapa',
            'stage_plans_incomplete': 'Planovi etapa su nepotpuni',
            'priority_prospect': 'Prioritetni talenat',
            'medical_treatment': 'Medicinski tretman',
            'equipment_workshop_review': 'Pregled opreme i radionice',
            'recruitment_review': 'Pregled regrutacije',
        }
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Advisor notification static labels localized.')
