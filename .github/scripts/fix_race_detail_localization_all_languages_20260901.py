#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / 'src/pages/dashboard/RaceDetailPage.tsx'
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']

TRANSLATIONS = {
    'en': {
        'summary.raceDate': 'Race date',
        'summary.raceDates': 'Race dates',
        'status.missedStartlist': 'Missed Startlist',
        'application.alreadySubmittedWaitingReview': 'Your application is already submitted and waiting for review.',
        'application.submittedSuccess': 'Application submitted and waiting for review.',
        'application.cancelledSuccess': 'Application cancelled.',
        'application.applyFailed': 'Race application failed.',
        'application.cancelFailed': 'Cancel application failed.',
        'application.previewLoadFailed': 'Could not load application preview.',
        'application.chanceVeryLow': 'Very low chance',
        'application.chanceLow': 'Low chance',
        'application.chanceMedium': 'Medium chance',
        'application.chanceHigh': 'High chance',
        'application.chanceVeryHigh': 'Very high chance',
        'application.competitionLow': 'Low competition',
        'application.competitionMedium': 'Medium competition',
        'application.competitionHigh': 'High competition',
        'stage.start': 'Start',
        'stage.finish': 'Finish',
        'stage.intermediateSprint': 'Intermediate sprint',
        'stage.bonusSprint': 'Bonus sprint',
        'stage.profileSprinter': 'Sprinter',
        'stage.profilePuncheur': 'Puncheur',
        'stage.profileClimber': 'Climber',
        'stage.profileAllRounder': 'All-rounder',
        'stage.profileTimeTrialist': 'Time trialist',
        'stage.localizedProfileSummary': 'A {{distance}} km {{terrain}} stage with {{elevation}} m of climbing, suited to {{profile}} riders.',
    },
    'sr-Latn': {
        'summary.raceDate': 'Datum trke',
        'summary.raceDates': 'Datumi trke',
        'status.missedStartlist': 'Propušten Startlist',
        'application.alreadySubmittedWaitingReview': 'Vaša prijava je već poslata i čeka pregled.',
        'application.submittedSuccess': 'Prijava je poslata i čeka pregled.',
        'application.cancelledSuccess': 'Prijava je otkazana.',
        'application.applyFailed': 'Prijava za trku nije uspela.',
        'application.cancelFailed': 'Otkazivanje prijave nije uspelo.',
        'application.previewLoadFailed': 'Pregled prijave nije mogao biti učitan.',
        'application.chanceVeryLow': 'Veoma mala šansa',
        'application.chanceLow': 'Mala šansa',
        'application.chanceMedium': 'Srednja šansa',
        'application.chanceHigh': 'Velika šansa',
        'application.chanceVeryHigh': 'Veoma velika šansa',
        'application.competitionLow': 'Mala konkurencija',
        'application.competitionMedium': 'Srednja konkurencija',
        'application.competitionHigh': 'Velika konkurencija',
        'stage.start': 'Start',
        'stage.finish': 'Cilj',
        'stage.intermediateSprint': 'Prolazni sprint',
        'stage.bonusSprint': 'Bonus sprint',
        'stage.profileSprinter': 'Sprinter',
        'stage.profilePuncheur': 'Puncheur',
        'stage.profileClimber': 'Brdaš',
        'stage.profileAllRounder': 'Svestrani vozač',
        'stage.profileTimeTrialist': 'Hronometraš',
        'stage.localizedProfileSummary': 'Etapa duga {{distance}} km, {{terrain}}, sa {{elevation}} m uspona, pogodna za profil: {{profile}}.',
    },
    'de': {
        'summary.raceDate': 'Renndatum',
        'summary.raceDates': 'Renndaten',
        'status.missedStartlist': 'Startlist verpasst',
        'application.alreadySubmittedWaitingReview': 'Ihre Anmeldung wurde bereits eingereicht und wartet auf Prüfung.',
        'application.submittedSuccess': 'Anmeldung eingereicht und zur Prüfung vorgemerkt.',
        'application.cancelledSuccess': 'Anmeldung zurückgezogen.',
        'application.applyFailed': 'Rennanmeldung fehlgeschlagen.',
        'application.cancelFailed': 'Anmeldung konnte nicht zurückgezogen werden.',
        'application.previewLoadFailed': 'Anmeldevorschau konnte nicht geladen werden.',
        'application.chanceVeryLow': 'Sehr geringe Chance',
        'application.chanceLow': 'Geringe Chance',
        'application.chanceMedium': 'Mittlere Chance',
        'application.chanceHigh': 'Hohe Chance',
        'application.chanceVeryHigh': 'Sehr hohe Chance',
        'application.competitionLow': 'Geringer Konkurrenzdruck',
        'application.competitionMedium': 'Mittlerer Konkurrenzdruck',
        'application.competitionHigh': 'Hoher Konkurrenzdruck',
        'stage.start': 'Start',
        'stage.finish': 'Ziel',
        'stage.intermediateSprint': 'Zwischensprint',
        'stage.bonusSprint': 'Bonussprint',
        'stage.profileSprinter': 'Sprinter',
        'stage.profilePuncheur': 'Puncheur',
        'stage.profileClimber': 'Kletterer',
        'stage.profileAllRounder': 'Allrounder',
        'stage.profileTimeTrialist': 'Zeitfahrer',
        'stage.localizedProfileSummary': 'Eine {{distance}} km lange {{terrain}} Etappe mit {{elevation}} Höhenmetern, passend für den Fahrertyp {{profile}}.',
    },
    'hr': {
        'summary.raceDate': 'Datum utrke',
        'summary.raceDates': 'Datumi utrke',
        'status.missedStartlist': 'Propušten Startlist',
        'application.alreadySubmittedWaitingReview': 'Vaša prijava je već poslana i čeka pregled.',
        'application.submittedSuccess': 'Prijava je poslana i čeka pregled.',
        'application.cancelledSuccess': 'Prijava je otkazana.',
        'application.applyFailed': 'Prijava za utrku nije uspjela.',
        'application.cancelFailed': 'Otkazivanje prijave nije uspjelo.',
        'application.previewLoadFailed': 'Pregled prijave nije se mogao učitati.',
        'application.chanceVeryLow': 'Vrlo mala šansa',
        'application.chanceLow': 'Mala šansa',
        'application.chanceMedium': 'Srednja šansa',
        'application.chanceHigh': 'Velika šansa',
        'application.chanceVeryHigh': 'Vrlo velika šansa',
        'application.competitionLow': 'Mala konkurencija',
        'application.competitionMedium': 'Srednja konkurencija',
        'application.competitionHigh': 'Velika konkurencija',
        'stage.start': 'Start',
        'stage.finish': 'Cilj',
        'stage.intermediateSprint': 'Prolazni sprint',
        'stage.bonusSprint': 'Bonus sprint',
        'stage.profileSprinter': 'Sprinter',
        'stage.profilePuncheur': 'Puncheur',
        'stage.profileClimber': 'Brdaš',
        'stage.profileAllRounder': 'Svestrani vozač',
        'stage.profileTimeTrialist': 'Kronometraš',
        'stage.localizedProfileSummary': 'Etapa duga {{distance}} km, {{terrain}}, s {{elevation}} m uspona, pogodna za profil {{profile}}.',
    },
    'es': {
        'summary.raceDate': 'Fecha de la carrera',
        'summary.raceDates': 'Fechas de la carrera',
        'status.missedStartlist': 'Startlist no presentada',
        'application.alreadySubmittedWaitingReview': 'Tu solicitud ya se ha enviado y está pendiente de revisión.',
        'application.submittedSuccess': 'Solicitud enviada y pendiente de revisión.',
        'application.cancelledSuccess': 'Solicitud cancelada.',
        'application.applyFailed': 'No se pudo enviar la solicitud para la carrera.',
        'application.cancelFailed': 'No se pudo cancelar la solicitud.',
        'application.previewLoadFailed': 'No se pudo cargar la vista previa de la solicitud.',
        'application.chanceVeryLow': 'Probabilidad muy baja',
        'application.chanceLow': 'Probabilidad baja',
        'application.chanceMedium': 'Probabilidad media',
        'application.chanceHigh': 'Probabilidad alta',
        'application.chanceVeryHigh': 'Probabilidad muy alta',
        'application.competitionLow': 'Competencia baja',
        'application.competitionMedium': 'Competencia media',
        'application.competitionHigh': 'Competencia alta',
        'stage.start': 'Salida',
        'stage.finish': 'Meta',
        'stage.intermediateSprint': 'Sprint intermedio',
        'stage.bonusSprint': 'Sprint bonificado',
        'stage.profileSprinter': 'Velocista',
        'stage.profilePuncheur': 'Puncheur',
        'stage.profileClimber': 'Escalador',
        'stage.profileAllRounder': 'Todoterreno',
        'stage.profileTimeTrialist': 'Contrarrelojista',
        'stage.localizedProfileSummary': 'Etapa de {{distance}} km, de terreno {{terrain}}, con {{elevation}} m de desnivel positivo, adecuada para {{profile}}.',
    },
    'it': {
        'summary.raceDate': 'Data della gara',
        'summary.raceDates': 'Date della gara',
        'status.missedStartlist': 'Startlist non presentata',
        'application.alreadySubmittedWaitingReview': 'La tua domanda è già stata inviata ed è in attesa di revisione.',
        'application.submittedSuccess': 'Domanda inviata e in attesa di revisione.',
        'application.cancelledSuccess': 'Domanda annullata.',
        'application.applyFailed': 'Invio della domanda di gara non riuscito.',
        'application.cancelFailed': 'Impossibile annullare la domanda.',
        'application.previewLoadFailed': 'Impossibile caricare l’anteprima della domanda.',
        'application.chanceVeryLow': 'Probabilità molto bassa',
        'application.chanceLow': 'Probabilità bassa',
        'application.chanceMedium': 'Probabilità media',
        'application.chanceHigh': 'Probabilità alta',
        'application.chanceVeryHigh': 'Probabilità molto alta',
        'application.competitionLow': 'Concorrenza bassa',
        'application.competitionMedium': 'Concorrenza media',
        'application.competitionHigh': 'Concorrenza alta',
        'stage.start': 'Partenza',
        'stage.finish': 'Arrivo',
        'stage.intermediateSprint': 'Sprint intermedio',
        'stage.bonusSprint': 'Sprint bonus',
        'stage.profileSprinter': 'Velocista',
        'stage.profilePuncheur': 'Puncheur',
        'stage.profileClimber': 'Scalatore',
        'stage.profileAllRounder': 'Ciclista completo',
        'stage.profileTimeTrialist': 'Cronoman',
        'stage.localizedProfileSummary': 'Tappa di {{distance}} km, con terreno {{terrain}} e {{elevation}} m di dislivello positivo, adatta al profilo {{profile}}.',
    },
    'fr': {
        'summary.raceDate': 'Date de la course',
        'summary.raceDates': 'Dates de la course',
        'status.missedStartlist': 'Startlist non remise',
        'application.alreadySubmittedWaitingReview': 'Votre candidature a déjà été envoyée et attend d’être examinée.',
        'application.submittedSuccess': 'Candidature envoyée et en attente d’examen.',
        'application.cancelledSuccess': 'Candidature annulée.',
        'application.applyFailed': 'Échec de la candidature à la course.',
        'application.cancelFailed': 'Impossible d’annuler la candidature.',
        'application.previewLoadFailed': 'Impossible de charger l’aperçu de la candidature.',
        'application.chanceVeryLow': 'Très faible chance',
        'application.chanceLow': 'Faible chance',
        'application.chanceMedium': 'Chance moyenne',
        'application.chanceHigh': 'Forte chance',
        'application.chanceVeryHigh': 'Très forte chance',
        'application.competitionLow': 'Faible concurrence',
        'application.competitionMedium': 'Concurrence moyenne',
        'application.competitionHigh': 'Forte concurrence',
        'stage.start': 'Départ',
        'stage.finish': 'Arrivée',
        'stage.intermediateSprint': 'Sprint intermédiaire',
        'stage.bonusSprint': 'Sprint bonus',
        'stage.profileSprinter': 'Sprinteur',
        'stage.profilePuncheur': 'Puncheur',
        'stage.profileClimber': 'Grimpeur',
        'stage.profileAllRounder': 'Polyvalent',
        'stage.profileTimeTrialist': 'Rouleur',
        'stage.localizedProfileSummary': 'Une étape de {{distance}} km au terrain {{terrain}}, avec {{elevation}} m de dénivelé positif, adaptée au profil {{profile}}.',
    },
    'ru': {
        'summary.raceDate': 'Дата гонки',
        'summary.raceDates': 'Даты гонки',
        'status.missedStartlist': 'Startlist не подан',
        'application.alreadySubmittedWaitingReview': 'Ваша заявка уже отправлена и ожидает рассмотрения.',
        'application.submittedSuccess': 'Заявка отправлена и ожидает рассмотрения.',
        'application.cancelledSuccess': 'Заявка отменена.',
        'application.applyFailed': 'Не удалось подать заявку на гонку.',
        'application.cancelFailed': 'Не удалось отменить заявку.',
        'application.previewLoadFailed': 'Не удалось загрузить предварительный просмотр заявки.',
        'application.chanceVeryLow': 'Очень низкая вероятность',
        'application.chanceLow': 'Низкая вероятность',
        'application.chanceMedium': 'Средняя вероятность',
        'application.chanceHigh': 'Высокая вероятность',
        'application.chanceVeryHigh': 'Очень высокая вероятность',
        'application.competitionLow': 'Низкая конкуренция',
        'application.competitionMedium': 'Средняя конкуренция',
        'application.competitionHigh': 'Высокая конкуренция',
        'stage.start': 'Старт',
        'stage.finish': 'Финиш',
        'stage.intermediateSprint': 'Промежуточный спринт',
        'stage.bonusSprint': 'Бонусный спринт',
        'stage.profileSprinter': 'Спринтер',
        'stage.profilePuncheur': 'Панчёр',
        'stage.profileClimber': 'Горняк',
        'stage.profileAllRounder': 'Универсал',
        'stage.profileTimeTrialist': 'Раздельщик',
        'stage.localizedProfileSummary': 'Этап длиной {{distance}} км, рельеф: {{terrain}}, набор высоты {{elevation}} м; лучше всего подходит гонщикам типа «{{profile}}».',
    },
}

VISIBLE_POLISH = {
    'fr': {
        'stage.hilly': 'Vallonné', 'stage.cobbled': 'Pavés', 'stage.flat': 'Plat',
        'stage.mountain': 'Montagne', 'stage.finishSprint': '🏁 Sprint final',
    },
    'it': {
        'stage.hilly': 'Collinare', 'stage.cobbled': 'Pavé', 'stage.flat': 'Pianeggiante',
        'stage.mountain': 'Montagna', 'stage.finishSprint': '🏁 Sprint finale',
    },
    'ru': {
        'stage.hilly': 'Холмистый', 'stage.cobbled': 'Брусчатка', 'stage.flat': 'Равнинный',
        'stage.mountain': 'Горный', 'stage.finishSprint': '🏁 Финишный спринт',
    },
    'es': {'stage.finishSprint': '🏁 Sprint final'},
}


def set_path(data: dict, dotted: str, value: str) -> None:
    node = data
    parts = dotted.split('.')
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = value


def replace_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing expected RaceDetail pattern: {label}')
    return text.replace(old, new)


text = COMPONENT.read_text(encoding='utf-8')

old_locale = """function getRaceDetailLocale(): string {
  return String(i18n.resolvedLanguage || i18n.language || 'en').toLowerCase().startsWith('sr')
    ? 'sr-Latn-RS'
    : 'en-GB'
}"""
new_locale = """function getRaceDetailLocale(): string {
  const language = String(i18n.resolvedLanguage || i18n.language || 'en').toLowerCase()
  if (language.startsWith('sr')) return 'sr-Latn-RS'
  if (language.startsWith('de')) return 'de-DE'
  if (language.startsWith('hr')) return 'hr-HR'
  if (language.startsWith('es')) return 'es-ES'
  if (language.startsWith('it')) return 'it-IT'
  if (language.startsWith('fr')) return 'fr-FR'
  if (language.startsWith('ru')) return 'ru-RU'
  return 'en-GB'
}"""
text = replace_required(text, old_locale, new_locale, 'locale mapping')

helper_anchor = "function humanizeCode(value?: string | null): string {"
helpers = r"""function raceDetailLanguageCode(): string {
  return String(i18n.resolvedLanguage || i18n.language || 'en').toLowerCase()
}

function isRaceDetailEnglish(): boolean {
  const language = raceDetailLanguageCode()
  return language === 'en' || language.startsWith('en-')
}

function trRaceDetail(key: string, options?: Record<string, unknown>): string {
  return String(i18n.t(`raceDetail:${key}`, options))
}

function getLocalizedTerrainLabel(value?: string | null): string {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const keys: Record<string, string> = {
    flat: 'stage.flat',
    hilly: 'stage.hilly',
    mountain: 'stage.mountain',
    cobbled: 'stage.cobbled',
    individual_time_trial: 'stage.individualTimeTrial',
    team_time_trial: 'stage.teamTimeTrial',
    time_trial: 'stage.timeTrial',
    prologue: 'stage.prologue',
  }
  const key = keys[normalized]
  if (key) return trRaceDetail(key)
  return value ? humanizeCode(value) : '—'
}

function getLocalizedRiderProfileLabel(value?: string | null): string {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const keys: Record<string, string> = {
    sprinter: 'stage.profileSprinter',
    puncheur: 'stage.profilePuncheur',
    puncher: 'stage.profilePuncheur',
    climber: 'stage.profileClimber',
    all_rounder: 'stage.profileAllRounder',
    allrounder: 'stage.profileAllRounder',
    time_trialist: 'stage.profileTimeTrialist',
    time_trial: 'stage.profileTimeTrialist',
    tt: 'stage.profileTimeTrialist',
  }
  const key = keys[normalized]
  if (key) return trRaceDetail(key)
  return value ? humanizeCode(value) : '—'
}

function getLocalizedApplicationChanceLabel(raw?: string | null, fallbackKey = 'application.estimatedChance'): string {
  if (!raw?.trim()) return trRaceDetail(fallbackKey)
  if (isRaceDetailEnglish()) return raw.trim()
  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (normalized.includes('very low')) return trRaceDetail('application.chanceVeryLow')
  if (normalized.includes('very high')) return trRaceDetail('application.chanceVeryHigh')
  if (normalized.includes('medium') || normalized.includes('moderate')) return trRaceDetail('application.chanceMedium')
  if (normalized.includes('low')) return trRaceDetail('application.chanceLow')
  if (normalized.includes('high')) return trRaceDetail('application.chanceHigh')
  return trRaceDetail(fallbackKey)
}

function getLocalizedCompetitionPressure(raw?: string | null): string {
  if (!raw?.trim()) return trRaceDetail('application.competitionPressure')
  if (isRaceDetailEnglish()) return raw.trim()
  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ').trim()
  if (normalized.includes('low')) return trRaceDetail('application.competitionLow')
  if (normalized.includes('medium') || normalized.includes('moderate')) return trRaceDetail('application.competitionMedium')
  if (normalized.includes('high')) return trRaceDetail('application.competitionHigh')
  return trRaceDetail('application.competitionPressure')
}

function getLocalizedApplicationChanceSummary(raw?: string | null): string {
  if (isRaceDetailEnglish() && raw?.trim()) return raw.trim()
  return trRaceDetail('application.estimateExplanation')
}

function getLocalizedRouteMarkerLabel(label?: string | null, type?: string | null): string {
  const raw = String(label ?? '').trim()
  const normalizedType = String(type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const normalizedLabel = raw.toLowerCase().replace(/[\s_-]+/g, ' ').trim()
  if (normalizedType === 'start' || normalizedLabel === 'start') return trRaceDetail('stage.start')
  if (normalizedType === 'finish' || normalizedLabel === 'finish') return trRaceDetail('stage.finish')
  if (normalizedLabel === 'finish sprint') return trRaceDetail('stage.finishSprint').replace(/^🏁\s*/, '')
  const sprint = normalizedLabel.match(/^(?:intermediate )?sprint\s*(\d+)$/)
  if (sprint) return trRaceDetail('stage.sprintNumber', { number: sprint[1] })
  return raw || (type ? humanizeCode(type) : '—')
}

function getLocalizedStageSummary(profile: {
  stage_summary?: string | null
  distance_km?: number | null
  elevation_gain_m?: number | null
  terrain_type?: string | null
  profile_type?: string | null
}): string | null {
  if (isRaceDetailEnglish()) return profile.stage_summary?.trim() || null
  const distanceValue = Number(profile.distance_km)
  const elevationValue = Number(profile.elevation_gain_m)
  const distance = Number.isFinite(distanceValue)
    ? (Number.isInteger(distanceValue) ? String(distanceValue) : distanceValue.toFixed(1))
    : '—'
  const elevation = Number.isFinite(elevationValue) ? String(Math.round(elevationValue)) : '—'
  return trRaceDetail('stage.localizedProfileSummary', {
    distance,
    elevation,
    terrain: getLocalizedTerrainLabel(profile.terrain_type),
    profile: getLocalizedRiderProfileLabel(profile.profile_type),
  })
}

"""
if helpers not in text:
    text = replace_required(text, helper_anchor, helpers + helper_anchor, 'localization helper anchor')

# Race/application status labels used by helper functions.
status_returns = {
    "return 'Applications not open'": "return trRaceDetail('status.applicationsNotOpen')",
    "return 'Open for Applications'": "return trRaceDetail('status.openApplications')",
    "return 'Applications closed'": "return trRaceDetail('status.applicationsClosed')",
    "return 'Application submitted'": "return trRaceDetail('status.applicationSubmitted')",
    "return 'Accepted'": "return trRaceDetail('status.accepted')",
    "return 'Declined'": "return trRaceDetail('status.declined')",
    "return 'Withdrawn'": "return trRaceDetail('status.withdrawn')",
    "return 'Missed startlist'": "return trRaceDetail('status.missedStartlist')",
    "return 'Race active'": "return trRaceDetail('status.raceActive')",
    "return 'Race finished'": "return trRaceDetail('status.raceFinished')",
    "return 'Race canceled'": "return trRaceDetail('status.raceCanceled')",
}
for old, new in status_returns.items():
    if old in text:
        text = text.replace(old, new)

text = replace_required(text, "{isExpanded ? 'Hide' : 'Show'}", "{isExpanded ? t('participants.hide') : t('participants.show')}", 'show/hide button')

text = text.replace("if (!race) return 'Race dates: —'", "if (!race) return `${trRaceDetail('summary.raceDates')}: —`")
text = text.replace("if (!startParts || !endParts) return 'Race dates: —'", "if (!startParts || !endParts) return `${trRaceDetail('summary.raceDates')}: —`")
text = replace_required(
    text,
    "return sameDay ? `Race date: ${startLabel}` : `Race dates: ${startLabel} → ${endLabel}`",
    "return sameDay\n    ? `${trRaceDetail('summary.raceDate')}: ${startLabel}`\n    : `${trRaceDetail('summary.raceDates')}: ${startLabel} → ${endLabel}`",
    'race date heading',
)

text = replace_required(text, "{profile.terrain_type ? humanizeCode(profile.terrain_type) : '—'}", "{profile.terrain_type ? getLocalizedTerrainLabel(profile.terrain_type) : '—'}", 'terrain label')
text = replace_required(text, "{profile.profile_type ? humanizeCode(profile.profile_type) : '—'}", "{profile.profile_type ? getLocalizedRiderProfileLabel(profile.profile_type) : '—'}", 'rider profile label')

old_summary = """{profile.stage_summary ? (
                <p className=\"mt-3 text-sm leading-6 text-slate-600\">
                  {profile.stage_summary}
                </p>
              ) : null}"""
new_summary = """{getLocalizedStageSummary(profile) ? (
                <p className=\"mt-3 text-sm leading-6 text-slate-600\">
                  {getLocalizedStageSummary(profile)}
                </p>
              ) : null}"""
text = replace_required(text, old_summary, new_summary, 'stage summary')

text = replace_required(text, "{quote.chance_label ?? t('application.applicationEstimate')}", "{getLocalizedApplicationChanceLabel(quote.chance_label, 'application.applicationEstimate')}", 'pending chance label')
text = replace_required(text, "{applicationQuote.chance_label ?? t('application.estimatedChance')}", "{getLocalizedApplicationChanceLabel(applicationQuote.chance_label)}", 'modal chance label')
text = replace_required(text, "{applicationQuote.competition_pressure_label ?? t('application.competitionPressure')}", "{getLocalizedCompetitionPressure(applicationQuote.competition_pressure_label)}", 'competition pressure')
text = replace_required(text, "{applicationQuote.chance_summary ??\n                      t('application.estimateExplanation')}", "{getLocalizedApplicationChanceSummary(applicationQuote.chance_summary)}", 'modal chance summary')
text = replace_required(text, "<p className=\"mt-4 text-xs leading-5 text-slate-500\">{quote.chance_summary}</p>", "<p className=\"mt-4 text-xs leading-5 text-slate-500\">{getLocalizedApplicationChanceSummary(quote.chance_summary)}</p>", 'pending chance summary')

text = replace_required(text, "return quote.message ?? t('application.cannotApply')", "return isRaceDetailEnglish() ? (quote.message ?? t('application.cannotApply')) : t('application.cannotApply')", 'quote backend message')
text = replace_required(text, "setApplicationActionMessage(result.message ?? 'Application submitted.')", "setApplicationActionMessage(isRaceDetailEnglish() ? (result.message ?? 'Application submitted.') : t('application.submittedSuccess'))", 'apply action message')
text = replace_required(text, "setApplicationActionMessage(result.message ?? 'Application cancelled.')", "setApplicationActionMessage(isRaceDetailEnglish() ? (result.message ?? 'Application cancelled.') : t('application.cancelledSuccess'))", 'cancel action message')
text = replace_required(text, "setApplicationActionError(result.error ?? result.message ?? 'Race application failed.')", "setApplicationActionError(isRaceDetailEnglish() ? (result.error ?? result.message ?? 'Race application failed.') : t('application.applyFailed'))", 'apply failure message')
text = replace_required(text, "setApplicationActionError(result.error ?? result.message ?? 'Cancel application failed.')", "setApplicationActionError(isRaceDetailEnglish() ? (result.error ?? result.message ?? 'Cancel application failed.') : t('application.cancelFailed'))", 'cancel failure message')
text = replace_required(text, "result.error ?? result.message ?? 'Could not load application preview.'", "isRaceDetailEnglish() ? (result.error ?? result.message ?? 'Could not load application preview.') : t('application.previewLoadFailed')", 'preview failure message')

# Generic stage/route labels that were still hardcoded or came from English DB marker names.
text = text.replace("{ type: 'start', km: 0, label: 'Start' }", "{ type: 'start', km: 0, label: trRaceDetail('stage.start') }")
text = text.replace("{ type: 'finish', km: safeDistanceKm, label: 'Finish' }", "{ type: 'finish', km: safeDistanceKm, label: trRaceDetail('stage.finish') }")
text = text.replace("{ type: 'start', km: 0, label: 'Start', category: null }", "{ type: 'start', km: 0, label: trRaceDetail('stage.start'), category: null }")
text = text.replace("label: 'Finish',\n        category: null,", "label: trRaceDetail('stage.finish'),\n        category: null,")
text = replace_required(text, "<div className=\"font-semibold text-slate-950\">🏁 Finish sprint</div>", "<div className=\"font-semibold text-slate-950\">{trRaceDetail('stage.finishSprint')}</div>", 'finish sprint card')
text = text.replace("if (pointType === 'INTERMEDIATE_SPRINT') return 'Intermediate sprint'", "if (pointType === 'INTERMEDIATE_SPRINT') return trRaceDetail('stage.intermediateSprint')")
text = text.replace("if (pointType === 'BONUS_SPRINT') return 'Bonus sprint'", "if (pointType === 'BONUS_SPRINT') return trRaceDetail('stage.bonusSprint')")
text = text.replace("if (pointType === 'FINISH') return 'Finish sprint'", "if (pointType === 'FINISH') return trRaceDetail('stage.finishSprint').replace(/^🏁\\s*/, '')")

# Normalize DB route marker labels while preserving named climbs, places and race-specific labels.
old_marker = """label:
      typeof marker.label === 'string' && marker.label.trim()
        ? marker.label
        : typeof marker.type === 'string'
          ? humanizeCode(marker.type)
          : 'Marker',"""
new_marker = """label:
      typeof marker.label === 'string' && marker.label.trim()
        ? getLocalizedRouteMarkerLabel(marker.label, typeof marker.type === 'string' ? marker.type : null)
        : typeof marker.type === 'string'
          ? getLocalizedRouteMarkerLabel(null, marker.type)
          : 'Marker',"""
text = replace_required(text, old_marker, new_marker, 'route marker normalization')

# One memoized marker list uses raw stage-point names; localize only generic names.
text = text.replace("label: point.name ?? humanizeCode(point.point_type),", "label: getLocalizedRouteMarkerLabel(point.name, point.point_type),")

COMPONENT.write_text(text, encoding='utf-8')

for locale in LOCALES:
    path = ROOT / 'src/i18n/locales' / locale / 'raceDetail.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    for dotted, value in TRANSLATIONS[locale].items():
        set_path(data, dotted, value)
    for dotted, value in VISIBLE_POLISH.get(locale, {}).items():
        set_path(data, dotted, value)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Race Detail localization fixes applied for all 8 languages.')
