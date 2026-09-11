from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('.')
PAGE = ROOT / 'src/pages/dashboard/NotificationsPage.tsx'
LOCALIZATION = ROOT / 'src/features/notifications/notificationLocalization.ts'
LOCALE_ROOT = ROOT / 'src/i18n/locales'
LOCALES = ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru']


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def regex_replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one regex match, found {count}')
    return next_text


page = PAGE.read_text(encoding='utf-8')

page = replace_once(
    page,
    "  localizeNotificationNarrative,\n  localizeNotificationTypeCodeLabel,\n  localizeNotificationValue,\n",
    "  localizeNotificationNarrative,\n  localizeNotificationTypeCodeLabel,\n  localizeNotificationValue,\n  translateNotificationKey,\n",
    'notification localization import',
)

new_availability_and_runtime = r'''function normalizeAdvisorRuntimeValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

const ADVISOR_RUNTIME_VALUE_KEY_BY_NORMALIZED: Record<string, string> = {
  'none scheduled': 'advisorRuntime.values.noneScheduled',
  'not scheduled': 'advisorRuntime.values.notScheduled',
  'today': 'advisorRuntime.values.today',
  'tomorrow': 'advisorRuntime.values.tomorrow',
  'active': 'advisorRuntime.values.active',
  'completed': 'advisorRuntime.values.completed',
  'complete': 'advisorRuntime.values.completed',
  'ready': 'advisorRuntime.values.ready',
  'draft': 'advisorRuntime.values.draft',
  'submitted': 'advisorRuntime.values.submitted',
  'missing': 'advisorRuntime.values.missing',
  'incomplete': 'advisorRuntime.values.incomplete',
  'locked': 'advisorRuntime.values.locked',
  'open': 'advisorRuntime.values.open',
  'in progress': 'advisorRuntime.values.inProgress',
  'finalised': 'advisorRuntime.values.finalised',
  'finalized': 'advisorRuntime.values.finalised',
  'not ready': 'advisorRuntime.values.notReady',
  'needs attention': 'advisorRuntime.values.needsAttention',
  'attention': 'advisorRuntime.values.needsAttention',
  'critical': 'advisorRuntime.values.critical',
  'urgent': 'advisorRuntime.values.urgent',
  'high': 'advisorRuntime.values.high',
  'medium': 'advisorRuntime.values.medium',
  'normal': 'advisorRuntime.values.medium',
  'low': 'advisorRuntime.values.low',
  'mild': 'advisorRuntime.values.mild',
  'moderate': 'advisorRuntime.values.moderate',
  'severe': 'advisorRuntime.values.severe',
  'scheduled': 'advisorRuntime.values.scheduled',
  'pending': 'templateValues.pending',
  'available': 'templateValues.available',
  'unavailable': 'headCoach.unavailable',
  'fit': 'headCoach.fit',
  'not fully fit': 'headCoach.notFullyFit',
  'not fully available': 'headCoach.notFullyAvailable',
  'in repair': 'templateValues.inRepair',
  'low stock': 'templateValues.lowStock',
  'in stock': 'templateValues.inStock',
  'out of stock': 'templateValues.outOfStock',
  'restock required': 'templateValues.restockRequired',
  'knee': 'advisorRuntime.bodyParts.knee',
  'back': 'advisorRuntime.bodyParts.back',
  'shoulder': 'advisorRuntime.bodyParts.shoulder',
  'wrist': 'advisorRuntime.bodyParts.wrist',
  'ankle': 'advisorRuntime.bodyParts.ankle',
  'hip': 'advisorRuntime.bodyParts.hip',
  'leg': 'advisorRuntime.bodyParts.leg',
  'arm': 'advisorRuntime.bodyParts.arm',
  'hand': 'advisorRuntime.bodyParts.hand',
  'foot': 'advisorRuntime.bodyParts.foot',
  'chest': 'advisorRuntime.bodyParts.chest',
  'head': 'advisorRuntime.bodyParts.head',
  'neck': 'advisorRuntime.bodyParts.neck',
}

function localizeAdvisorRuntimeValue(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return text

  const normalized = normalizeAdvisorRuntimeValue(text)
  const key = ADVISOR_RUNTIME_VALUE_KEY_BY_NORMALIZED[normalized]
  if (key) return translateNotificationKey(key)

  const inDays = /^in\s+(\d+)\s+days?$/i.exec(text)
  if (inDays) {
    return translateNotificationKey('advisorRuntime.values.inDays', {
      count: Number(inDays[1]),
    })
  }

  const seasonDate = /^season\s+(\d+)\s*[-–—,:]\s*(.+)$/i.exec(text)
  if (seasonDate) {
    return translateNotificationKey('common.seasonDate', {
      season: Number(seasonDate[1]),
      date: seasonDate[2].trim(),
    })
  }

  // Defensive repair for values that may already have passed through an old
  // word-by-word translator before reaching this component.
  if (/^scheduled[.\s]+none$/i.test(text)) {
    return translateNotificationKey('advisorRuntime.values.noneScheduled')
  }
  if (/^scheduled[.\s]+not$/i.test(text)) {
    return translateNotificationKey('advisorRuntime.values.notScheduled')
  }

  return text
}

function formatAdvisorAvailability(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return '—'

  const localized = localizeAdvisorRuntimeValue(text)
  if (localized !== text) return localized

  const normalized = text.replace(/_/g, ' ')
  return normalized.replace(/\b\w/g, letter => letter.toUpperCase())
}

function looksLikeEnglishAdvisorProse(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return false
  return /\b(the|your|you|is|are|was|were|has|have|will|should|review|stage|stages|plan|plans|race|races|rider|riders|training|equipment|scouting|report|reports|missing|incomplete|current|next|today|tomorrow|available|scheduled|deadline|priority|programme|program|preparation|startlist|medical|workshop|recruitment|attention)\b/.test(text)
}
'''

page = regex_replace_once(
    page,
    r"function formatAdvisorAvailability\(value: unknown\): string \{.*?\n\}\n\n\nfunction localizeAdvisorNotificationRuntimeText",
    new_availability_and_runtime + "\nfunction localizeAdvisorNotificationRuntimeText",
    'advisor runtime value localization',
)

new_display_value = r'''function formatAdvisorDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
  }

  const text = String(value).trim()
  if (!text) return '—'

  const semantic = localizeAdvisorRuntimeValue(text)
  if (semantic !== text) return semantic

  // Keep dates, times, UUIDs, URLs and already-formatted text unchanged.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return text
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return text
  if (/^https?:\/\//i.test(text)) return text

  // Backend enum/code values should never be exposed as raw snake_case. Only
  // normalize the visual form here; semantic translation is handled above.
  const normalized = text.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const looksLikeUiValue =
    text.includes('_') ||
    text.includes('-') ||
    (text === text.toLowerCase() && normalized.split(' ').length <= 5 && normalized.length <= 50)

  if (!looksLikeUiValue) return text

  return normalized
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase())
}'''

page = regex_replace_once(
    page,
    r"function formatAdvisorDisplayValue\(value: unknown\): string \{.*?\n\}",
    new_display_value,
    'formatAdvisorDisplayValue',
)

new_game_date = r'''function formatAdvisorGameDateTime(value: unknown, t?: any): string {
  const text = String(value ?? '').trim()
  if (!text) return '—'

  const semantic = localizeAdvisorRuntimeValue(text)
  if (semantic !== text) return semantic

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?/)
  if (!match) return formatAdvisorDisplayText(value)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return formatAdvisorDisplayText(value)
  }

  const seasonNumber = year >= 2000 ? year - 1999 : year
  const dateLabel = `${day}.${String(month).padStart(2, '0')}.`
  const hour = match[4]
  const minute = match[5]
  const timeLabel = hour && minute ? ` ${hour}:${minute}` : ''
  const localizedDate = `${dateLabel}${timeLabel}`

  // Never fall back to the English word "Season". Some advisor render paths do
  // not have a component-level t() available, so use the global notification
  // namespace helper in that case. This keeps word order native to each locale.
  return t
    ? t('common.seasonDate', { season: seasonNumber, date: localizedDate })
    : translateNotificationKey('common.seasonDate', {
        season: seasonNumber,
        date: localizedDate,
      })
}'''

page = regex_replace_once(
    page,
    r"function formatAdvisorGameDateTime\(value: unknown, t\?: any\): string \{.*?\n\}",
    new_game_date,
    'formatAdvisorGameDateTime',
)

advisor_summary_helpers = r'''
function advisorPayloadData(payload: StaffAdvisoryPayload): Record<string, unknown> {
  return (payload.data ?? payload.snapshot ?? {}) as Record<string, unknown>
}

function advisorString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim()
    }
  }
  return ''
}

function advisorNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

function normalizeAdvisorVariant(payload: StaffAdvisoryPayload): string {
  return String(payload.report_variant ?? payload.report_code ?? '')
    .trim()
    .toLowerCase()
    .replace(/^sd_/, '')
    .replace(/^hc_/, '')
    .replace(/^mechanic_/, '')
    .replace(/^doctor_/, '')
    .replace(/^scout_/, '')
}

function buildLocalizedAdvisorSummary(
  payload: StaffAdvisoryPayload,
  item: NotificationItem,
  t: any
): string {
  const raw = String(payload.summary || item.message || '').trim()
  const role = String(payload.advisor_role ?? '').trim().toLowerCase()
  const variant = normalizeAdvisorVariant(payload)
  const data = advisorPayloadData(payload)

  // Exact runtime translations (especially Head Coach dynamic summaries) get
  // first priority when they can preserve the original detail.
  const exact = localizeNotificationRuntimeText(raw, item, t)
  if (exact && exact !== raw && exact !== translateNotificationKey('templateLocalization.moreDetails')) {
    return exact
  }

  if (role === 'sport_director') {
    const raceName = advisorString(
      data,
      'current_focus_race_name',
      'current_focus_race',
      'active_race_name',
      'race_name',
      'next_race_name'
    ) || translateNotificationKey('advisorRuntime.values.raceFallback')
    const stage = advisorNumber(data, 'stage_number')
    const stageTime = advisorString(data, 'stage_start_time_label', 'start_time_label')
    const stageDateRaw = advisorString(data, 'stage_date')
    const raceTimingRaw = advisorString(data, 'current_focus_race_timing', 'race_urgency', 'urgency')
    const timing = raceTimingRaw
      ? localizeAdvisorRuntimeValue(raceTimingRaw)
      : translateNotificationKey('advisorRuntime.values.notScheduled')
    const stageDate = stageDateRaw
      ? formatAdvisorGameDateTime(stageDateRaw, t)
      : translateNotificationKey('advisorRuntime.values.notScheduled')
    const missing =
      advisorNumber(data, 'actionable_missing_stage_plans', 'missing_stage_plans') ??
      (Array.isArray(payload.missing_stage_analysis?.missing_stages)
        ? payload.missing_stage_analysis!.missing_stages.length
        : 0)
    const incomplete = advisorNumber(
      data,
      'actionable_problem_stage_plans',
      'problem_stage_plans'
    ) ?? 0
    const deadlineRaw = advisorString(
      data,
      'rider_submission_deadline_on',
      'submission_deadline',
      'deadline'
    )
    const deadline = deadlineRaw
      ? formatAdvisorGameDateTime(deadlineRaw, t)
      : translateNotificationKey('advisorRuntime.values.notScheduled')
    const gapDays = advisorNumber(data, 'programme_gap_days') ?? 0
    const nextRaceRaw = advisorString(data, 'next_future_race', 'next_future_race_name')
    const nextRace = nextRaceRaw
      ? localizeAdvisorRuntimeValue(nextRaceRaw)
      : translateNotificationKey('advisorRuntime.values.noneScheduled')

    if (variant.includes('stage_plans_missing')) {
      return translateNotificationKey('advisorRuntime.sportDirector.stagePlansMissing', {
        count: missing,
        raceName,
        stage: stage ?? '—',
        timing,
        time: stageTime || '—',
        date: stageDate,
      })
    }
    if (variant.includes('stage_plans_incomplete')) {
      return translateNotificationKey('advisorRuntime.sportDirector.stagePlansIncomplete', {
        count: incomplete,
        raceName,
      })
    }
    if (variant.includes('startlist_deadline_alert')) {
      return translateNotificationKey('advisorRuntime.sportDirector.startlistDeadline', {
        raceName,
        deadline,
      })
    }
    if (variant.includes('race_preparation_missing')) {
      return translateNotificationKey('advisorRuntime.sportDirector.preparationMissing', {
        raceName,
      })
    }
    if (variant.includes('race_preparation_ready')) {
      return translateNotificationKey('advisorRuntime.sportDirector.preparationReady', {
        raceName,
      })
    }
    if (variant.includes('programme_empty')) {
      return translateNotificationKey('advisorRuntime.sportDirector.programmeEmpty')
    }
    if (variant.includes('race_programme_gap') || variant === 'programme_gap') {
      return translateNotificationKey('advisorRuntime.sportDirector.programmeGap', {
        days: gapDays,
        nextRace,
      })
    }
    if (variant.includes('programme_continuity')) {
      return translateNotificationKey('advisorRuntime.sportDirector.programmeContinuity', {
        nextRace,
      })
    }
    if (variant.includes('long_programme_break')) {
      return translateNotificationKey('advisorRuntime.sportDirector.longProgrammeBreak', {
        days: gapDays,
        nextRace,
      })
    }
    if (variant.includes('race_eligibility_critical')) {
      return translateNotificationKey('advisorRuntime.sportDirector.eligibilityCritical', {
        raceName,
      })
    }
    return translateNotificationKey('advisorRuntime.sportDirector.generic')
  }

  if (role === 'head_coach') {
    if (variant.includes('weekly_training_readiness')) {
      return translateNotificationKey('advisorRuntime.headCoach.weeklyTrainingReadiness')
    }
    if (variant.includes('training_readiness')) {
      return translateNotificationKey('advisorRuntime.headCoach.trainingReadiness')
    }
    if (variant.includes('training_schedule_covered')) {
      return translateNotificationKey('advisorRuntime.headCoach.trainingScheduleCovered')
    }
    if (exact && exact !== raw) return exact
    return looksLikeEnglishAdvisorProse(raw)
      ? translateNotificationKey('advisorRuntime.headCoach.generic')
      : raw
  }

  if (role === 'team_doctor') {
    const activeCases = advisorNumber(
      data,
      'active_health_cases',
      'active_or_recovering_health_cases'
    ) ?? 0
    const injured = advisorNumber(data, 'injured_riders') ?? 0
    const sick = advisorNumber(data, 'sick_riders') ?? 0
    if (variant.includes('medical_treatment')) {
      return translateNotificationKey('advisorRuntime.doctor.medicalTreatment', {
        activeCases,
        injured,
        sick,
      })
    }
    return looksLikeEnglishAdvisorProse(raw)
      ? translateNotificationKey('advisorRuntime.doctor.generic')
      : (exact || raw)
  }

  if (role === 'mechanic' || role === 'chief_mechanic') {
    const total = advisorNumber(data, 'total_items') ?? 0
    const attention = advisorNumber(
      data,
      'maintenance_needed',
      'equipment_needing_attention_count'
    ) ?? 0
    const critical = advisorNumber(data, 'critical_items') ?? 0
    const lowSupplies = advisorNumber(data, 'low_supply_types') ?? 0
    if (variant.includes('race_supply_eligibility_critical') || variant.includes('race_jersey_eligibility')) {
      return translateNotificationKey('advisorRuntime.mechanic.jerseyEligibility')
    }
    if (variant.includes('equipment_workshop_review')) {
      return translateNotificationKey('advisorRuntime.mechanic.workshopReview', {
        total,
        attention,
        critical,
        lowSupplies,
      })
    }
    return looksLikeEnglishAdvisorProse(raw)
      ? translateNotificationKey('advisorRuntime.mechanic.generic')
      : (exact || raw)
  }

  if (role === 'scout_analyst' || role === 'scout') {
    const reports = advisorNumber(data, 'completed_reports') ?? 0
    const recent = advisorNumber(data, 'reports_last_7_real_days') ?? 0
    const highElite = advisorNumber(data, 'high_or_elite_potential_reports') ?? 0
    const active = advisorNumber(data, 'active_scouting_tasks') ?? 0
    const rider = advisorString(data, 'rider_name', 'rider_full_name') || translateNotificationKey('common.rider')
    if (variant.includes('priority_prospect')) {
      return translateNotificationKey('advisorRuntime.scout.priorityProspect', { rider })
    }
    if (variant.includes('recruitment_review')) {
      return translateNotificationKey('advisorRuntime.scout.recruitmentReview', {
        reports,
        recent,
        highElite,
        active,
      })
    }
    return looksLikeEnglishAdvisorProse(raw)
      ? translateNotificationKey('advisorRuntime.scout.generic')
      : (exact || raw)
  }

  return exact || raw
}

function localizeAdvisorRecommendation(
  value: unknown,
  payload: StaffAdvisoryPayload,
  item: NotificationItem,
  t: any
): string {
  const text = String(value ?? '').trim()
  if (!text) return text

  const localized = localizeNotificationRuntimeText(text, item, t)
  if (localized && localized !== text && localized !== translateNotificationKey('templateLocalization.moreDetails')) {
    return localized
  }
  if (!looksLikeEnglishAdvisorProse(text)) return localized || text

  const role = String(payload.advisor_role ?? '').trim().toLowerCase()
  const keyByRole: Record<string, string> = {
    head_coach: 'advisorRuntime.recommendations.headCoach',
    sport_director: 'advisorRuntime.recommendations.sportDirector',
    team_doctor: 'advisorRuntime.recommendations.doctor',
    mechanic: 'advisorRuntime.recommendations.mechanic',
    chief_mechanic: 'advisorRuntime.recommendations.mechanic',
    scout_analyst: 'advisorRuntime.recommendations.scout',
    scout: 'advisorRuntime.recommendations.scout',
  }
  const key = keyByRole[role]
  return key ? translateNotificationKey(key) : translateNotificationKey('templateLocalization.moreDetails')
}
'''

page = replace_once(
    page,
    "\n\nfunction formatAdvisorDisplayValue(value: unknown): string {",
    advisor_summary_helpers + "\n\nfunction formatAdvisorDisplayValue(value: unknown): string {",
    'advisor summary helper insertion',
)

# Use semantic summary construction for every advisor role.
summary_replacements = {
    "skillChangeSummary || localizeAdvisorNotificationRuntimeText(advisorPayload.summary || item.message, t)":
        "skillChangeSummary || buildLocalizedAdvisorSummary(advisorPayload, item, t)",
    "localizeNotificationRuntimeText(advisorPayload.summary || item.message, item, t)":
        "buildLocalizedAdvisorSummary(advisorPayload, item, t)",
    "localizeAdvisorNotificationRuntimeText(advisorPayload.summary || item.message, t)":
        "buildLocalizedAdvisorSummary(advisorPayload, item, t)",
}
for old, new in summary_replacements.items():
    if old not in page:
        raise RuntimeError(f'missing summary renderer: {old}')
    page = page.replace(old, new)

# Use semantic recommendation fallback for every advisor role. There are several
# role-specific lists with the same visible span.
page = page.replace(
    "<span>{localizeNotificationRuntimeText(recommendation, item, t)}</span>",
    "<span>{localizeAdvisorRecommendation(recommendation, advisorPayload, item, t)}</span>",
)

# Cards should no longer re-run a word-by-word translator after semantic values
# have already been composed in the correct locale order.
page = page.replace(
    "localizeNotificationValue(formatAdvisorDisplayValue(value), item)",
    "formatAdvisorDisplayValue(value)",
)
page = page.replace(
    "localizeNotificationValue(formatAdvisorAvailability(stage.urgency), item)",
    "formatAdvisorAvailability(stage.urgency)",
)
page = page.replace(
    "localizeNotificationValue(formatAdvisorAvailability(stage.stage_plan_status), item)",
    "formatAdvisorAvailability(stage.stage_plan_status)",
)

# Localize structured Doctor values instead of showing English enum/body-part
# labels directly.
page = page.replace(
    "{formatAdvisorDisplayValue(healthCase.case_label ?? healthCase.case_code ?? healthCase.case_type)}",
    "{localizeNotificationValue(formatAdvisorDisplayValue(healthCase.case_label ?? healthCase.case_code ?? healthCase.case_type), item)}",
)
page = page.replace(
    "{formatAdvisorAvailability(healthCase.severity)}",
    "{formatAdvisorAvailability(healthCase.severity)}",
)
page = page.replace(
    "{formatAdvisorAvailability(healthCase.body_part)}",
    "{formatAdvisorAvailability(healthCase.body_part)}",
)

# Mechanic/scout structured statuses and labels should use the same semantic
# value path. Game-defined display names are preserved when no translation is
# registered.
for old, new in [
    ("{formatAdvisorDisplayText(equipment.category_label ?? equipment.equipment_category)}", "{localizeNotificationValue(formatAdvisorDisplayValue(equipment.category_label ?? equipment.equipment_category), item)}"),
    ("{formatAdvisorDisplayText(equipment.status_label ?? equipment.status)}", "{formatAdvisorDisplayValue(equipment.status_label ?? equipment.status)}"),
    ("{formatAdvisorDisplayText(equipment.priority)}", "{formatAdvisorDisplayValue(equipment.priority)}"),
    ("{formatAdvisorDisplayText(category.display_name ?? category.equipment_category)}", "{localizeNotificationValue(formatAdvisorDisplayValue(category.display_name ?? category.equipment_category), item)}"),
    ("{formatAdvisorDisplayText(supply.display_name ?? supply.supply_key)}", "{localizeNotificationValue(formatAdvisorDisplayValue(supply.display_name ?? supply.supply_key), item)}"),
    ("{formatAdvisorDisplayText(supply.stock_status_label ?? supply.stock_status)}", "{formatAdvisorDisplayValue(supply.stock_status_label ?? supply.stock_status)}"),
    ("{formatAdvisorDisplayText(report.review_status)}", "{formatAdvisorDisplayValue(report.review_status)}"),
    ("<span>{formatAdvisorDisplayText(task.status)}</span>", "<span>{formatAdvisorDisplayValue(task.status)}</span>"),
]:
    page = page.replace(old, new)

PAGE.write_text(page, encoding='utf-8')

# ---------------------------------------------------------------------------
# Notification localization: composite values must be translated semantically,
# never by preserving English token order.
# ---------------------------------------------------------------------------
loc = LOCALIZATION.read_text(encoding='utf-8')

season_value_insert = r'''  const cleanValue = value.trim()

  // Advisor/runtime composite values must use phrase templates so the target
  // language controls word order. Never translate these token by token.
  const advisorRuntimeValueKeys: Record<string, string> = {
    'none scheduled': 'advisorRuntime.values.noneScheduled',
    'not scheduled': 'advisorRuntime.values.notScheduled',
    'today': 'advisorRuntime.values.today',
    'tomorrow': 'advisorRuntime.values.tomorrow',
    'active': 'advisorRuntime.values.active',
    'completed': 'advisorRuntime.values.completed',
    'ready': 'advisorRuntime.values.ready',
    'draft': 'advisorRuntime.values.draft',
    'submitted': 'advisorRuntime.values.submitted',
    'missing': 'advisorRuntime.values.missing',
    'incomplete': 'advisorRuntime.values.incomplete',
    'locked': 'advisorRuntime.values.locked',
    'open': 'advisorRuntime.values.open',
    'in progress': 'advisorRuntime.values.inProgress',
    'finalised': 'advisorRuntime.values.finalised',
    'finalized': 'advisorRuntime.values.finalised',
    'not ready': 'advisorRuntime.values.notReady',
    'needs attention': 'advisorRuntime.values.needsAttention',
    'critical': 'advisorRuntime.values.critical',
    'urgent': 'advisorRuntime.values.urgent',
    'high': 'advisorRuntime.values.high',
    'medium': 'advisorRuntime.values.medium',
    'low': 'advisorRuntime.values.low',
    'mild': 'advisorRuntime.values.mild',
    'moderate': 'advisorRuntime.values.moderate',
    'severe': 'advisorRuntime.values.severe',
  }
  const advisorRuntimeKey = advisorRuntimeValueKeys[normalizePhrase(cleanValue)]
  if (advisorRuntimeKey) return nt(advisorRuntimeKey)

  let advisorMatch = /^in\s+(\d+)\s+days?$/i.exec(cleanValue)
  if (advisorMatch) {
    return nt('advisorRuntime.values.inDays', { count: Number(advisorMatch[1]) })
  }

  advisorMatch = /^Season\s+(\d+)\s*[-–—,:]\s*(.+)$/i.exec(cleanValue)
  if (advisorMatch) {
    return nt('common.seasonDate', {
      season: Number(advisorMatch[1]),
      date: advisorMatch[2].trim(),
    })
  }
'''

loc = replace_once(
    loc,
    "  if (!shouldLocalizeNotifications()) return value\n\n  if (String(item?.type_code ?? '').toUpperCase() === 'SEASON_STARTED' && item) {\n    const cleanValue = value.trim()\n",
    "  if (!shouldLocalizeNotifications()) return value\n\n" + season_value_insert + "\n  if (String(item?.type_code ?? '').toUpperCase() === 'SEASON_STARTED' && item) {\n",
    'semantic notification value prelude',
)

# Remove the unsafe generic value-level token fallback. It was the direct cause
# of outputs such as "scheduled. None" and rotated Season/date fragments.
loc = replace_once(
    loc,
    "  // Short metadata values frequently reuse the same vocabulary as labels.\n  // Translate them token-by-token only when every English token has a known\n  // localized equivalent; otherwise preserve dynamic names/identifiers.\n  if (value.length <= 120) {\n    const tokenized = localizeLabelByReusableTokens(value)\n    if (tokenized) return tokenized\n  }\n\n",
    "  // Do not token-translate composite runtime values here. Translating words\n  // independently preserves English syntax and can rotate semantic words in\n  // languages with different word order. Exact phrases/templates above are the\n  // authoritative path; unknown dynamic values are preserved verbatim.\n\n",
    'remove unsafe value token fallback',
)

LOCALIZATION.write_text(loc, encoding='utf-8')

# ---------------------------------------------------------------------------
# Locale copy. These overrides intentionally focus on all advisor-visible labels,
# report variants and runtime semantic phrases. Existing good nested Head Coach
# sentence templates remain in place unless explicitly corrected below.
# ---------------------------------------------------------------------------

common_season = {
    'en': 'Season {{season}} — {{date}}',
    'sr-Latn': 'Sezona {{season}} — {{date}}',
    'de': 'Saison {{season}} — {{date}}',
    'hr': 'Sezona {{season}} — {{date}}',
    'es': 'Temporada {{season}} — {{date}}',
    'it': 'Stagione {{season}} — {{date}}',
    'fr': 'Saison {{season}} — {{date}}',
    'ru': 'Сезон {{season}} — {{date}}',
}

roles = {
    'en': {'headCoach':'Head Coach','sportsDirector':'Sports Director','teamDoctor':'Team Doctor','chiefMechanic':'Chief Mechanic','scout':'Scout','scoutAnalyst':'Scout Analyst','mechanic':'Mechanic'},
    'sr-Latn': {'headCoach':'Glavni trener','sportsDirector':'Sportski direktor','teamDoctor':'Lekar tima','chiefMechanic':'Glavni mehaničar','scout':'Skaut','scoutAnalyst':'Skaut analitičar','mechanic':'Mehaničar'},
    'de': {'headCoach':'Cheftrainer','sportsDirector':'Sportdirektor','teamDoctor':'Teamarzt','chiefMechanic':'Chefmechaniker','scout':'Scout','scoutAnalyst':'Scouting-Analyst','mechanic':'Mechaniker'},
    'hr': {'headCoach':'Glavni trener','sportsDirector':'Sportski direktor','teamDoctor':'Liječnik momčadi','chiefMechanic':'Glavni mehaničar','scout':'Skaut','scoutAnalyst':'Skautski analitičar','mechanic':'Mehaničar'},
    'es': {'headCoach':'Entrenador principal','sportsDirector':'Director deportivo','teamDoctor':'Médico del equipo','chiefMechanic':'Jefe de mecánicos','scout':'Ojeador','scoutAnalyst':'Analista de scouting','mechanic':'Mecánico'},
    'it': {'headCoach':'Allenatore capo','sportsDirector':'Direttore sportivo','teamDoctor':'Medico della squadra','chiefMechanic':'Capo meccanico','scout':'Scout','scoutAnalyst':'Analista scouting','mechanic':'Meccanico'},
    'fr': {'headCoach':'Entraîneur principal','sportsDirector':'Directeur sportif','teamDoctor':'Médecin de l’équipe','chiefMechanic':'Chef mécanicien','scout':'Recruteur','scoutAnalyst':'Analyste de recrutement','mechanic':'Mécanicien'},
    'ru': {'headCoach':'Главный тренер','sportsDirector':'Спортивный директор','teamDoctor':'Врач команды','chiefMechanic':'Главный механик','scout':'Скаут','scoutAnalyst':'Скаут-аналитик','mechanic':'Механик'},
}

section_overrides = {
'en': {
 'headCoach': {'recommendations':'Head Coach recommendations','skill':'Skill','previousValue':'Previous value','newValue':'New value','change':'Change','squadRiders':'Squad riders','highFatigue':'High fatigue','elevatedFatigue':'Elevated fatigue','notFullyFit':'Not fully fit','unavailable':'Unavailable','plannedSessions':'Planned sessions · next 3 game days','manualOverrides':'Manual overrides · next 3 game days','highestFatigue':'Highest fatigue','windowStart':'Window start','windowEnd':'Window end','ridersAttention':'Riders needing attention','fatigue':'Fatigue','fit':'Fit','notFullyAvailable':'Not fully available'},
 'sportDirector': {'raceTiming':'Race timing','raceStart':'Race start','raceEnd':'Race end','raceLocation':'Race location','preparation':'Preparation','startlist':'Startlist','deadline':'Deadline','stageDate':'Stage date','stageStart':'Stage start','programme':'Programme','futureRaces':'Future races · 30 days','managementPriorities':'Management priorities','missingStagePlans':'Missing stage plans','incompleteStagePlans':'Incomplete stage plans','programmeGap':'Programme gap','nextAcceptedRace':'Next accepted race','nextRaceDate':'Next race date','missingPlans':'Missing or incomplete stage plans','urgency':'Urgency','recommendations':'Sports Director recommendations'},
 'doctor': {'medicalCase':'Medical case','severity':'Severity','bodyPart':'Body part','injuredRiders':'Injured riders','sickRiders':'Sick riders','activeCases':'Active medical cases','baseRecoveryDays':'Base recovery days','adjustedRecoveryDays':'Adjusted recovery days','fullDaysSaved':'Full days saved','staffReduction':'Medical staff reduction','centerReduction':'Medical Center reduction','totalReduction':'Total recovery reduction','expectedReturn':'Expected return','cases':'Medical cases','base':'Base','adjusted':'Adjusted','staffEffect':'Staff effect','facilityEffect':'Facility effect','recommendations':'Team Doctor recommendations'},
 'mechanic': {'equipmentItems':'Equipment items','readyItems':'Ready items','averageCondition':'Average condition','needsAttention':'Needs attention','criticalItems':'Critical items','pendingMaintenance':'Pending maintenance','emptySupplies':'Empty supply types','lowSupplies':'Low supply types','attentionTitle':'Equipment needing attention','equipment':'Equipment','category':'Category','condition':'Condition','lastUsed':'Last used','equipmentCategories':'Equipment categories','owned':'Owned','ready':'Ready','attention':'Attention','avgCondition':'Average condition','raceSupplies':'Race supplies','supply':'Supply','available':'Available','threshold':'Threshold','recommendations':'Chief Mechanic recommendations'},
 'scout': {'overall':'Overall','potential':'Potential','potentialScore':'Potential score','precision':'Precision','precisionTier':'Precision tier','reviewStatus':'Review status','completedReports':'Completed reports','reports7Days':'Reports · last 7 real days','highElite':'High / Elite prospects','activeAssignments':'Active assignments','reportedStrengths':'Reported strengths','notes':'Scout notes','recentIntelligence':'Recent scouting intelligence','completed':'Completed','strengths':'Strengths','activeScouting':'Active scouting assignments','completes':'Completes','paid':'Paid','recommendations':'Scout recommendations'},
},
'sr-Latn': {
 'headCoach': {'recommendations':'Preporuke glavnog trenera','skill':'Veština','previousValue':'Prethodna vrednost','newValue':'Nova vrednost','change':'Promena','squadRiders':'Vozači ekipe','highFatigue':'Visok umor','elevatedFatigue':'Povišen umor','notFullyFit':'Nije potpuno spreman','unavailable':'Nedostupan','plannedSessions':'Planirani treninzi · naredna 3 dana u igri','manualOverrides':'Ručna podešavanja · naredna 3 dana u igri','highestFatigue':'Najveći umor','windowStart':'Početak perioda','windowEnd':'Kraj perioda','ridersAttention':'Vozači kojima je potrebna pažnja','fatigue':'Umor','fit':'Spreman','notFullyAvailable':'Nije potpuno dostupan'},
 'sportDirector': {'raceTiming':'Termin trke','raceStart':'Početak trke','raceEnd':'Kraj trke','raceLocation':'Lokacija trke','preparation':'Priprema','startlist':'Startna lista','deadline':'Rok','stageDate':'Datum etape','stageStart':'Start etape','programme':'Program trka','futureRaces':'Buduće trke · 30 dana','managementPriorities':'Prioriteti upravljanja','missingStagePlans':'Nedostajući planovi etapa','incompleteStagePlans':'Nepotpuni planovi etapa','programmeGap':'Praznina u programu','nextAcceptedRace':'Sledeća prihvaćena trka','nextRaceDate':'Datum sledeće trke','missingPlans':'Nedostajući ili nepotpuni planovi etapa','urgency':'Hitnost','recommendations':'Preporuke sportskog direktora'},
 'doctor': {'medicalCase':'Medicinski slučaj','severity':'Težina','bodyPart':'Deo tela','injuredRiders':'Povređeni vozači','sickRiders':'Bolesni vozači','activeCases':'Aktivni medicinski slučajevi','baseRecoveryDays':'Osnovni dani oporavka','adjustedRecoveryDays':'Prilagođeni dani oporavka','fullDaysSaved':'Ušteđeni puni dani','staffReduction':'Smanjenje zahvaljujući medicinskom osoblju','centerReduction':'Smanjenje zahvaljujući Medicinskom centru','totalReduction':'Ukupno smanjenje oporavka','expectedReturn':'Očekivani povratak','cases':'Medicinski slučajevi','base':'Osnovno','adjusted':'Prilagođeno','staffEffect':'Efekat osoblja','facilityEffect':'Efekat objekta','recommendations':'Preporuke lekara tima'},
 'mechanic': {'equipmentItems':'Komadi opreme','readyItems':'Spremni komadi','averageCondition':'Prosečno stanje','needsAttention':'Zahteva pažnju','criticalItems':'Kritični komadi','pendingMaintenance':'Održavanje na čekanju','emptySupplies':'Prazne vrste zaliha','lowSupplies':'Vrste zaliha pri kraju','attentionTitle':'Oprema kojoj je potrebna pažnja','equipment':'Oprema','category':'Kategorija','condition':'Stanje','lastUsed':'Poslednji put korišćeno','equipmentCategories':'Kategorije opreme','owned':'U vlasništvu','ready':'Spremno','attention':'Pažnja','avgCondition':'Prosečno stanje','raceSupplies':'Zalihe za trku','supply':'Zaliha','available':'Dostupno','threshold':'Prag','recommendations':'Preporuke glavnog mehaničara'},
 'scout': {'overall':'Ukupna ocena','potential':'Potencijal','potentialScore':'Ocena potencijala','precision':'Preciznost','precisionTier':'Nivo preciznosti','reviewStatus':'Status pregleda','completedReports':'Završeni izveštaji','reports7Days':'Izveštaji · poslednjih 7 stvarnih dana','highElite':'Visoki / elitni potencijali','activeAssignments':'Aktivni zadaci','reportedStrengths':'Prijavljene prednosti','notes':'Beleške skauta','recentIntelligence':'Nedavni skautski podaci','completed':'Završeno','strengths':'Prednosti','activeScouting':'Aktivni skautski zadaci','completes':'Završava se','paid':'Plaćeno','recommendations':'Preporuke skauta'},
},
'hr': {
 'headCoach': {'recommendations':'Preporuke glavnog trenera','skill':'Vještina','previousValue':'Prethodna vrijednost','newValue':'Nova vrijednost','change':'Promjena','squadRiders':'Vozači momčadi','highFatigue':'Visok umor','elevatedFatigue':'Povišen umor','notFullyFit':'Nije potpuno spreman','unavailable':'Nedostupan','plannedSessions':'Planirani treninzi · sljedeća 3 dana u igri','manualOverrides':'Ručne prilagodbe · sljedeća 3 dana u igri','highestFatigue':'Najveći umor','windowStart':'Početak razdoblja','windowEnd':'Kraj razdoblja','ridersAttention':'Vozači kojima je potrebna pažnja','fatigue':'Umor','fit':'Spreman','notFullyAvailable':'Nije potpuno dostupan'},
 'sportDirector': {'raceTiming':'Termin utrke','raceStart':'Početak utrke','raceEnd':'Kraj utrke','raceLocation':'Lokacija utrke','preparation':'Priprema','startlist':'Startna lista','deadline':'Rok','stageDate':'Datum etape','stageStart':'Start etape','programme':'Program utrka','futureRaces':'Buduće utrke · 30 dana','managementPriorities':'Prioriteti upravljanja','missingStagePlans':'Nedostajući planovi etapa','incompleteStagePlans':'Nepotpuni planovi etapa','programmeGap':'Praznina u programu','nextAcceptedRace':'Sljedeća prihvaćena utrka','nextRaceDate':'Datum sljedeće utrke','missingPlans':'Nedostajući ili nepotpuni planovi etapa','urgency':'Hitnost','recommendations':'Preporuke sportskog direktora'},
 'doctor': {'medicalCase':'Medicinski slučaj','severity':'Težina','bodyPart':'Dio tijela','injuredRiders':'Ozlijeđeni vozači','sickRiders':'Bolesni vozači','activeCases':'Aktivni medicinski slučajevi','baseRecoveryDays':'Osnovni dani oporavka','adjustedRecoveryDays':'Prilagođeni dani oporavka','fullDaysSaved':'Ušteđeni dani','staffReduction':'Smanjenje zahvaljujući medicinskom osoblju','centerReduction':'Smanjenje zahvaljujući Medicinskom centru','totalReduction':'Ukupno smanjenje oporavka','expectedReturn':'Očekivani povratak','cases':'Medicinski slučajevi','base':'Osnovno','adjusted':'Prilagođeno','staffEffect':'Učinak osoblja','facilityEffect':'Učinak objekta','recommendations':'Preporuke liječnika momčadi'},
 'mechanic': {'equipmentItems':'Komadi opreme','readyItems':'Spremni komadi','averageCondition':'Prosječno stanje','needsAttention':'Zahtijeva pažnju','criticalItems':'Kritični komadi','pendingMaintenance':'Održavanje na čekanju','emptySupplies':'Prazne vrste zaliha','lowSupplies':'Vrste zaliha pri kraju','attentionTitle':'Oprema kojoj je potrebna pažnja','equipment':'Oprema','category':'Kategorija','condition':'Stanje','lastUsed':'Posljednji put korišteno','equipmentCategories':'Kategorije opreme','owned':'U vlasništvu','ready':'Spremno','attention':'Pažnja','avgCondition':'Prosječno stanje','raceSupplies':'Zalihe za utrku','supply':'Zaliha','available':'Dostupno','threshold':'Prag','recommendations':'Preporuke glavnog mehaničara'},
 'scout': {'overall':'Ukupna ocjena','potential':'Potencijal','potentialScore':'Ocjena potencijala','precision':'Preciznost','precisionTier':'Razina preciznosti','reviewStatus':'Status pregleda','completedReports':'Završeni izvještaji','reports7Days':'Izvještaji · posljednjih 7 stvarnih dana','highElite':'Visoki / elitni potencijali','activeAssignments':'Aktivni zadaci','reportedStrengths':'Prijavljene prednosti','notes':'Bilješke skauta','recentIntelligence':'Nedavni skautski podaci','completed':'Završeno','strengths':'Prednosti','activeScouting':'Aktivni skautski zadaci','completes':'Završava se','paid':'Plaćeno','recommendations':'Preporuke skauta'},
},
'de': {
 'headCoach': {'recommendations':'Empfehlungen des Cheftrainers','skill':'Fähigkeit','previousValue':'Vorheriger Wert','newValue':'Neuer Wert','change':'Änderung','squadRiders':'Fahrer im Kader','highFatigue':'Hohe Ermüdung','elevatedFatigue':'Erhöhte Ermüdung','notFullyFit':'Nicht vollständig fit','unavailable':'Nicht verfügbar','plannedSessions':'Geplante Einheiten · nächste 3 Spieltage','manualOverrides':'Manuelle Anpassungen · nächste 3 Spieltage','highestFatigue':'Höchste Ermüdung','windowStart':'Beginn des Zeitraums','windowEnd':'Ende des Zeitraums','ridersAttention':'Fahrer mit Handlungsbedarf','fatigue':'Ermüdung','fit':'Einsatzbereit','notFullyAvailable':'Nicht vollständig einsatzbereit'},
 'sportDirector': {'raceTiming':'Rennzeitpunkt','raceStart':'Rennstart','raceEnd':'Rennende','raceLocation':'Rennort','preparation':'Vorbereitung','startlist':'Startliste','deadline':'Frist','stageDate':'Etappendatum','stageStart':'Etappenstart','programme':'Rennprogramm','futureRaces':'Kommende Rennen · 30 Tage','managementPriorities':'Management-Prioritäten','missingStagePlans':'Fehlende Etappenpläne','incompleteStagePlans':'Unvollständige Etappenpläne','programmeGap':'Lücke im Rennprogramm','nextAcceptedRace':'Nächstes angenommenes Rennen','nextRaceDate':'Datum des nächsten Rennens','missingPlans':'Fehlende oder unvollständige Etappenpläne','urgency':'Dringlichkeit','recommendations':'Empfehlungen des Sportdirektors'},
 'doctor': {'medicalCase':'Medizinischer Fall','severity':'Schweregrad','bodyPart':'Körperteil','injuredRiders':'Verletzte Fahrer','sickRiders':'Kranke Fahrer','activeCases':'Aktive medizinische Fälle','baseRecoveryDays':'Ursprüngliche Erholungstage','adjustedRecoveryDays':'Angepasste Erholungstage','fullDaysSaved':'Eingesparte volle Tage','staffReduction':'Reduktion durch medizinisches Personal','centerReduction':'Reduktion durch das Medizinzentrum','totalReduction':'Gesamte Erholungsreduktion','expectedReturn':'Voraussichtliche Rückkehr','cases':'Medizinische Fälle','base':'Ursprünglich','adjusted':'Angepasst','staffEffect':'Personaleffekt','facilityEffect':'Einrichtungseffekt','recommendations':'Empfehlungen des Teamarztes'},
 'mechanic': {'equipmentItems':'Ausrüstungsgegenstände','readyItems':'Einsatzbereite Gegenstände','averageCondition':'Durchschnittlicher Zustand','needsAttention':'Handlungsbedarf','criticalItems':'Kritische Gegenstände','pendingMaintenance':'Ausstehende Wartungen','emptySupplies':'Leere Vorratsarten','lowSupplies':'Knapp werdende Vorratsarten','attentionTitle':'Ausrüstung mit Handlungsbedarf','equipment':'Ausrüstung','category':'Kategorie','condition':'Zustand','lastUsed':'Zuletzt verwendet','equipmentCategories':'Ausrüstungskategorien','owned':'Im Besitz','ready':'Einsatzbereit','attention':'Handlungsbedarf','avgCondition':'Ø Zustand','raceSupplies':'Rennvorräte','supply':'Vorrat','available':'Verfügbar','threshold':'Schwellenwert','recommendations':'Empfehlungen des Chefmechanikers'},
 'scout': {'overall':'Gesamtbewertung','potential':'Potenzial','potentialScore':'Potenzialwert','precision':'Genauigkeit','precisionTier':'Genauigkeitsstufe','reviewStatus':'Prüfstatus','completedReports':'Abgeschlossene Berichte','reports7Days':'Berichte · letzte 7 reale Tage','highElite':'Hohe / Elite-Potenziale','activeAssignments':'Aktive Aufträge','reportedStrengths':'Gemeldete Stärken','notes':'Scout-Notizen','recentIntelligence':'Aktuelle Scouting-Erkenntnisse','completed':'Abgeschlossen','strengths':'Stärken','activeScouting':'Aktive Scouting-Aufträge','completes':'Abschluss','paid':'Bezahlt','recommendations':'Empfehlungen des Scouts'},
},
'es': {
 'headCoach': {'recommendations':'Recomendaciones del entrenador principal','skill':'Habilidad','previousValue':'Valor anterior','newValue':'Nuevo valor','change':'Cambio','squadRiders':'Ciclistas de la plantilla','highFatigue':'Fatiga alta','elevatedFatigue':'Fatiga elevada','notFullyFit':'No está completamente en forma','unavailable':'No disponible','plannedSessions':'Sesiones planificadas · próximos 3 días de juego','manualOverrides':'Ajustes manuales · próximos 3 días de juego','highestFatigue':'Fatiga máxima','windowStart':'Inicio del período','windowEnd':'Fin del período','ridersAttention':'Ciclistas que requieren atención','fatigue':'Fatiga','fit':'En forma','notFullyAvailable':'No está completamente disponible'},
 'sportDirector': {'raceTiming':'Momento de la carrera','raceStart':'Inicio de la carrera','raceEnd':'Fin de la carrera','raceLocation':'Lugar de la carrera','preparation':'Preparación','startlist':'Lista de salida','deadline':'Plazo','stageDate':'Fecha de la etapa','stageStart':'Inicio de la etapa','programme':'Programa de carreras','futureRaces':'Próximas carreras · 30 días','managementPriorities':'Prioridades de gestión','missingStagePlans':'Planes de etapa pendientes','incompleteStagePlans':'Planes de etapa incompletos','programmeGap':'Hueco en el programa','nextAcceptedRace':'Siguiente carrera aceptada','nextRaceDate':'Fecha de la siguiente carrera','missingPlans':'Planes de etapa pendientes o incompletos','urgency':'Urgencia','recommendations':'Recomendaciones del director deportivo'},
 'doctor': {'medicalCase':'Caso médico','severity':'Gravedad','bodyPart':'Parte del cuerpo','injuredRiders':'Ciclistas lesionados','sickRiders':'Ciclistas enfermos','activeCases':'Casos médicos activos','baseRecoveryDays':'Días de recuperación iniciales','adjustedRecoveryDays':'Días de recuperación ajustados','fullDaysSaved':'Días completos ahorrados','staffReduction':'Reducción por personal médico','centerReduction':'Reducción por el Centro Médico','totalReduction':'Reducción total de recuperación','expectedReturn':'Regreso previsto','cases':'Casos médicos','base':'Inicial','adjusted':'Ajustado','staffEffect':'Efecto del personal','facilityEffect':'Efecto de la instalación','recommendations':'Recomendaciones del médico del equipo'},
 'mechanic': {'equipmentItems':'Elementos de equipamiento','readyItems':'Elementos listos','averageCondition':'Estado medio','needsAttention':'Requiere atención','criticalItems':'Elementos críticos','pendingMaintenance':'Mantenimiento pendiente','emptySupplies':'Tipos de suministros agotados','lowSupplies':'Tipos de suministros bajos','attentionTitle':'Equipamiento que requiere atención','equipment':'Equipamiento','category':'Categoría','condition':'Estado','lastUsed':'Último uso','equipmentCategories':'Categorías de equipamiento','owned':'En propiedad','ready':'Listo','attention':'Atención','avgCondition':'Estado medio','raceSupplies':'Suministros de carrera','supply':'Suministro','available':'Disponible','threshold':'Umbral','recommendations':'Recomendaciones del jefe de mecánicos'},
 'scout': {'overall':'Valoración general','potential':'Potencial','potentialScore':'Puntuación de potencial','precision':'Precisión','precisionTier':'Nivel de precisión','reviewStatus':'Estado de revisión','completedReports':'Informes completados','reports7Days':'Informes · últimos 7 días reales','highElite':'Prospectos altos / élite','activeAssignments':'Asignaciones activas','reportedStrengths':'Fortalezas detectadas','notes':'Notas del ojeador','recentIntelligence':'Información reciente de scouting','completed':'Completado','strengths':'Fortalezas','activeScouting':'Asignaciones de scouting activas','completes':'Finaliza','paid':'Pagado','recommendations':'Recomendaciones del ojeador'},
},
'it': {
 'headCoach': {'recommendations':'Raccomandazioni dell’allenatore capo','skill':'Abilità','previousValue':'Valore precedente','newValue':'Nuovo valore','change':'Variazione','squadRiders':'Corridori in rosa','highFatigue':'Fatica elevata','elevatedFatigue':'Fatica moderatamente elevata','notFullyFit':'Non completamente in forma','unavailable':'Non disponibile','plannedSessions':'Sessioni pianificate · prossimi 3 giorni di gioco','manualOverrides':'Modifiche manuali · prossimi 3 giorni di gioco','highestFatigue':'Fatica massima','windowStart':'Inizio periodo','windowEnd':'Fine periodo','ridersAttention':'Corridori che richiedono attenzione','fatigue':'Fatica','fit':'In forma','notFullyAvailable':'Non pienamente disponibile'},
 'sportDirector': {'raceTiming':'Tempistica della gara','raceStart':'Inizio gara','raceEnd':'Fine gara','raceLocation':'Luogo della gara','preparation':'Preparazione','startlist':'Lista di partenza','deadline':'Scadenza','stageDate':'Data della tappa','stageStart':'Partenza della tappa','programme':'Programma gare','futureRaces':'Prossime gare · 30 giorni','managementPriorities':'Priorità gestionali','missingStagePlans':'Piani di tappa mancanti','incompleteStagePlans':'Piani di tappa incompleti','programmeGap':'Intervallo nel programma','nextAcceptedRace':'Prossima gara accettata','nextRaceDate':'Data della prossima gara','missingPlans':'Piani di tappa mancanti o incompleti','urgency':'Urgenza','recommendations':'Raccomandazioni del direttore sportivo'},
 'doctor': {'medicalCase':'Caso medico','severity':'Gravità','bodyPart':'Parte del corpo','injuredRiders':'Corridori infortunati','sickRiders':'Corridori malati','activeCases':'Casi medici attivi','baseRecoveryDays':'Giorni di recupero iniziali','adjustedRecoveryDays':'Giorni di recupero modificati','fullDaysSaved':'Giorni interi risparmiati','staffReduction':'Riduzione dovuta allo staff medico','centerReduction':'Riduzione dovuta al Centro Medico','totalReduction':'Riduzione totale del recupero','expectedReturn':'Rientro previsto','cases':'Casi medici','base':'Iniziale','adjusted':'Modificato','staffEffect':'Effetto dello staff','facilityEffect':'Effetto della struttura','recommendations':'Raccomandazioni del medico della squadra'},
 'mechanic': {'equipmentItems':'Elementi di equipaggiamento','readyItems':'Elementi pronti','averageCondition':'Condizione media','needsAttention':'Richiede attenzione','criticalItems':'Elementi critici','pendingMaintenance':'Manutenzioni in attesa','emptySupplies':'Tipi di scorte esauriti','lowSupplies':'Tipi di scorte in esaurimento','attentionTitle':'Equipaggiamento che richiede attenzione','equipment':'Equipaggiamento','category':'Categoria','condition':'Condizione','lastUsed':'Ultimo utilizzo','equipmentCategories':'Categorie di equipaggiamento','owned':'Posseduti','ready':'Pronti','attention':'Attenzione','avgCondition':'Condizione media','raceSupplies':'Scorte per la gara','supply':'Scorta','available':'Disponibile','threshold':'Soglia','recommendations':'Raccomandazioni del capo meccanico'},
 'scout': {'overall':'Valutazione generale','potential':'Potenziale','potentialScore':'Punteggio potenziale','precision':'Precisione','precisionTier':'Livello di precisione','reviewStatus':'Stato della revisione','completedReports':'Rapporti completati','reports7Days':'Rapporti · ultimi 7 giorni reali','highElite':'Prospetti alti / élite','activeAssignments':'Incarichi attivi','reportedStrengths':'Punti di forza rilevati','notes':'Note dello scout','recentIntelligence':'Informazioni scouting recenti','completed':'Completato','strengths':'Punti di forza','activeScouting':'Incarichi di scouting attivi','completes':'Termina','paid':'Pagato','recommendations':'Raccomandazioni dello scout'},
},
'fr': {
 'headCoach': {'recommendations':'Recommandations de l’entraîneur principal','skill':'Compétence','previousValue':'Valeur précédente','newValue':'Nouvelle valeur','change':'Évolution','squadRiders':'Coureurs de l’effectif','highFatigue':'Fatigue élevée','elevatedFatigue':'Fatigue modérément élevée','notFullyFit':'Pas totalement en forme','unavailable':'Indisponible','plannedSessions':'Séances planifiées · 3 prochains jours de jeu','manualOverrides':'Ajustements manuels · 3 prochains jours de jeu','highestFatigue':'Fatigue maximale','windowStart':'Début de la période','windowEnd':'Fin de la période','ridersAttention':'Coureurs nécessitant une attention','fatigue':'Fatigue','fit':'En forme','notFullyAvailable':'Pas totalement disponible'},
 'sportDirector': {'raceTiming':'Échéance de la course','raceStart':'Début de la course','raceEnd':'Fin de la course','raceLocation':'Lieu de la course','preparation':'Préparation','startlist':'Liste de départ','deadline':'Échéance','stageDate':'Date de l’étape','stageStart':'Départ de l’étape','programme':'Programme de courses','futureRaces':'Prochaines courses · 30 jours','managementPriorities':'Priorités de gestion','missingStagePlans':'Plans d’étape manquants','incompleteStagePlans':'Plans d’étape incomplets','programmeGap':'Intervalle dans le programme','nextAcceptedRace':'Prochaine course acceptée','nextRaceDate':'Date de la prochaine course','missingPlans':'Plans d’étape manquants ou incomplets','urgency':'Urgence','recommendations':'Recommandations du directeur sportif'},
 'doctor': {'medicalCase':'Cas médical','severity':'Gravité','bodyPart':'Partie du corps','injuredRiders':'Coureurs blessés','sickRiders':'Coureurs malades','activeCases':'Cas médicaux actifs','baseRecoveryDays':'Jours de récupération initiaux','adjustedRecoveryDays':'Jours de récupération ajustés','fullDaysSaved':'Jours complets gagnés','staffReduction':'Réduction grâce au personnel médical','centerReduction':'Réduction grâce au Centre médical','totalReduction':'Réduction totale de la récupération','expectedReturn':'Retour prévu','cases':'Cas médicaux','base':'Initial','adjusted':'Ajusté','staffEffect':'Effet du personnel','facilityEffect':'Effet de l’infrastructure','recommendations':'Recommandations du médecin de l’équipe'},
 'mechanic': {'equipmentItems':'Éléments d’équipement','readyItems':'Éléments prêts','averageCondition':'État moyen','needsAttention':'Nécessite une attention','criticalItems':'Éléments critiques','pendingMaintenance':'Maintenance en attente','emptySupplies':'Types de stocks épuisés','lowSupplies':'Types de stocks faibles','attentionTitle':'Équipement nécessitant une attention','equipment':'Équipement','category':'Catégorie','condition':'État','lastUsed':'Dernière utilisation','equipmentCategories':'Catégories d’équipement','owned':'Possédés','ready':'Prêts','attention':'Attention','avgCondition':'État moyen','raceSupplies':'Fournitures de course','supply':'Fourniture','available':'Disponible','threshold':'Seuil','recommendations':'Recommandations du chef mécanicien'},
 'scout': {'overall':'Note globale','potential':'Potentiel','potentialScore':'Score de potentiel','precision':'Précision','precisionTier':'Niveau de précision','reviewStatus':'Statut de l’évaluation','completedReports':'Rapports terminés','reports7Days':'Rapports · 7 derniers jours réels','highElite':'Prospects élevés / élite','activeAssignments':'Missions actives','reportedStrengths':'Points forts observés','notes':'Notes du recruteur','recentIntelligence':'Informations de scouting récentes','completed':'Terminé','strengths':'Points forts','activeScouting':'Missions de scouting actives','completes':'Se termine','paid':'Payé','recommendations':'Recommandations du recruteur'},
},
'ru': {
 'headCoach': {'recommendations':'Рекомендации главного тренера','skill':'Навык','previousValue':'Предыдущее значение','newValue':'Новое значение','change':'Изменение','squadRiders':'Гонщики состава','highFatigue':'Высокая усталость','elevatedFatigue':'Повышенная усталость','notFullyFit':'Не полностью готов','unavailable':'Недоступен','plannedSessions':'Запланированные тренировки · следующие 3 игровых дня','manualOverrides':'Ручные изменения · следующие 3 игровых дня','highestFatigue':'Максимальная усталость','windowStart':'Начало периода','windowEnd':'Конец периода','ridersAttention':'Гонщики, требующие внимания','fatigue':'Усталость','fit':'Готов','notFullyAvailable':'Не полностью доступен'},
 'sportDirector': {'raceTiming':'Сроки гонки','raceStart':'Старт гонки','raceEnd':'Финиш гонки','raceLocation':'Место проведения гонки','preparation':'Подготовка','startlist':'Стартовый список','deadline':'Крайний срок','stageDate':'Дата этапа','stageStart':'Старт этапа','programme':'Гоночная программа','futureRaces':'Предстоящие гонки · 30 дней','managementPriorities':'Приоритеты управления','missingStagePlans':'Отсутствующие планы этапов','incompleteStagePlans':'Незавершённые планы этапов','programmeGap':'Пробел в программе','nextAcceptedRace':'Следующая подтверждённая гонка','nextRaceDate':'Дата следующей гонки','missingPlans':'Отсутствующие или незавершённые планы этапов','urgency':'Срочность','recommendations':'Рекомендации спортивного директора'},
 'doctor': {'medicalCase':'Медицинский случай','severity':'Степень тяжести','bodyPart':'Часть тела','injuredRiders':'Травмированные гонщики','sickRiders':'Заболевшие гонщики','activeCases':'Активные медицинские случаи','baseRecoveryDays':'Исходные дни восстановления','adjustedRecoveryDays':'Скорректированные дни восстановления','fullDaysSaved':'Сэкономленные полные дни','staffReduction':'Сокращение благодаря медперсоналу','centerReduction':'Сокращение благодаря Медицинскому центру','totalReduction':'Общее сокращение восстановления','expectedReturn':'Ожидаемое возвращение','cases':'Медицинские случаи','base':'Исходно','adjusted':'Скорректировано','staffEffect':'Эффект персонала','facilityEffect':'Эффект инфраструктуры','recommendations':'Рекомендации врача команды'},
 'mechanic': {'equipmentItems':'Единицы оборудования','readyItems':'Готовые единицы','averageCondition':'Среднее состояние','needsAttention':'Требует внимания','criticalItems':'Критические единицы','pendingMaintenance':'Ожидающее обслуживание','emptySupplies':'Исчерпанные виды запасов','lowSupplies':'Заканчивающиеся виды запасов','attentionTitle':'Оборудование, требующее внимания','equipment':'Оборудование','category':'Категория','condition':'Состояние','lastUsed':'Последнее использование','equipmentCategories':'Категории оборудования','owned':'В наличии','ready':'Готово','attention':'Требует внимания','avgCondition':'Среднее состояние','raceSupplies':'Гоночные запасы','supply':'Запас','available':'Доступно','threshold':'Порог','recommendations':'Рекомендации главного механика'},
 'scout': {'overall':'Общая оценка','potential':'Потенциал','potentialScore':'Оценка потенциала','precision':'Точность','precisionTier':'Уровень точности','reviewStatus':'Статус проверки','completedReports':'Завершённые отчёты','reports7Days':'Отчёты · последние 7 реальных дней','highElite':'Высокий / элитный потенциал','activeAssignments':'Активные задания','reportedStrengths':'Выявленные сильные стороны','notes':'Заметки скаута','recentIntelligence':'Свежие данные скаутинга','completed':'Завершено','strengths':'Сильные стороны','activeScouting':'Активные задания по скаутингу','completes':'Завершение','paid':'Оплачено','recommendations':'Рекомендации скаута'},
},
}

report_variants = {
'en': {'rider_skill_change':'Rider skill change','weekly_training_readiness':'Weekly training readiness','training_readiness':'Training readiness','race_programme_gap':'Race programme gap','programme_continuity':'Programme continuity','long_programme_break':'Long programme break','programme_empty':'Programme empty','race_preparation_missing':'Race preparation missing','race_preparation_ready':'Race preparation ready','startlist_deadline_alert':'Startlist deadline alert','stage_plans_missing':'Stage plans missing','stage_plans_incomplete':'Stage plans incomplete','priority_prospect':'Priority prospect','medical_treatment':'Medical treatment','equipment_workshop_review':'Equipment & workshop review','recruitment_review':'Recruitment review','elevated_fatigue':'Elevated fatigue','fatigue_watch':'Fatigue watch','rider_availability':'Rider availability','training_schedule_gap':'Training schedule gap','high_fatigue':'High fatigue','high_fatigue_alert':'High fatigue alert','race_eligibility_critical':'Critical race eligibility','training_schedule_covered':'Training schedule covered','race_jersey_eligibility':'Race jersey eligibility'},
'sr-Latn': {'rider_skill_change':'Promena veštine vozača','weekly_training_readiness':'Nedeljna spremnost za trening','training_readiness':'Spremnost za trening','race_programme_gap':'Praznina u programu trka','programme_continuity':'Kontinuitet programa','long_programme_break':'Duga pauza u programu','programme_empty':'Program je prazan','race_preparation_missing':'Nedostaje priprema trke','race_preparation_ready':'Priprema trke je spremna','startlist_deadline_alert':'Upozorenje za rok startne liste','stage_plans_missing':'Nedostaju planovi etapa','stage_plans_incomplete':'Planovi etapa su nepotpuni','priority_prospect':'Prioritetni talenat','medical_treatment':'Medicinski tretman','equipment_workshop_review':'Pregled opreme i radionice','recruitment_review':'Pregled skautinga i regrutacije','elevated_fatigue':'Povišen umor','fatigue_watch':'Praćenje umora','rider_availability':'Dostupnost vozača','training_schedule_gap':'Praznina u rasporedu treninga','high_fatigue':'Visok umor','high_fatigue_alert':'Upozorenje na visok umor','race_eligibility_critical':'Kritičan uslov za nastup','training_schedule_covered':'Raspored treninga je pokriven','race_jersey_eligibility':'Uslov za trkačke dresove'},
'hr': {'rider_skill_change':'Promjena vještine vozača','weekly_training_readiness':'Tjedna spremnost za trening','training_readiness':'Spremnost za trening','race_programme_gap':'Praznina u programu utrka','programme_continuity':'Kontinuitet programa','long_programme_break':'Duga pauza u programu','programme_empty':'Program je prazan','race_preparation_missing':'Nedostaje priprema utrke','race_preparation_ready':'Priprema utrke je spremna','startlist_deadline_alert':'Upozorenje za rok startne liste','stage_plans_missing':'Nedostaju planovi etapa','stage_plans_incomplete':'Planovi etapa su nepotpuni','priority_prospect':'Prioritetni talent','medical_treatment':'Medicinski tretman','equipment_workshop_review':'Pregled opreme i radionice','recruitment_review':'Pregled skautinga i regrutacije','elevated_fatigue':'Povišen umor','fatigue_watch':'Praćenje umora','rider_availability':'Dostupnost vozača','training_schedule_gap':'Praznina u rasporedu treninga','high_fatigue':'Visok umor','high_fatigue_alert':'Upozorenje na visok umor','race_eligibility_critical':'Kritičan uvjet za nastup','training_schedule_covered':'Raspored treninga je pokriven','race_jersey_eligibility':'Uvjet za trkaće dresove'},
'de': {'rider_skill_change':'Änderung einer Fahrerfähigkeit','weekly_training_readiness':'Wöchentliche Trainingsbereitschaft','training_readiness':'Trainingsbereitschaft','race_programme_gap':'Lücke im Rennprogramm','programme_continuity':'Kontinuität des Rennprogramms','long_programme_break':'Lange Rennpause','programme_empty':'Rennprogramm leer','race_preparation_missing':'Rennvorbereitung fehlt','race_preparation_ready':'Rennvorbereitung bereit','startlist_deadline_alert':'Warnung zur Startlistenfrist','stage_plans_missing':'Etappenpläne fehlen','stage_plans_incomplete':'Etappenpläne unvollständig','priority_prospect':'Prioritäts-Talent','medical_treatment':'Medizinische Behandlung','equipment_workshop_review':'Ausrüstungs- und Werkstattprüfung','recruitment_review':'Scouting- und Rekrutierungsübersicht','elevated_fatigue':'Erhöhte Ermüdung','fatigue_watch':'Ermüdung beobachten','rider_availability':'Fahrerverfügbarkeit','training_schedule_gap':'Lücke im Trainingsplan','high_fatigue':'Hohe Ermüdung','high_fatigue_alert':'Warnung vor hoher Ermüdung','race_eligibility_critical':'Kritische Startberechtigung','training_schedule_covered':'Trainingsplan abgedeckt','race_jersey_eligibility':'Trikot-Voraussetzung'},
'es': {'rider_skill_change':'Cambio de habilidad del ciclista','weekly_training_readiness':'Preparación semanal para el entrenamiento','training_readiness':'Preparación para el entrenamiento','race_programme_gap':'Hueco en el programa de carreras','programme_continuity':'Continuidad del programa','long_programme_break':'Pausa larga en el programa','programme_empty':'Programa de carreras vacío','race_preparation_missing':'Falta la preparación de la carrera','race_preparation_ready':'Preparación de la carrera lista','startlist_deadline_alert':'Alerta del plazo de la lista de salida','stage_plans_missing':'Faltan planes de etapa','stage_plans_incomplete':'Planes de etapa incompletos','priority_prospect':'Talento prioritario','medical_treatment':'Tratamiento médico','equipment_workshop_review':'Revisión de equipamiento y taller','recruitment_review':'Revisión de scouting y fichajes','elevated_fatigue':'Fatiga elevada','fatigue_watch':'Control de fatiga','rider_availability':'Disponibilidad de ciclistas','training_schedule_gap':'Hueco en el calendario de entrenamiento','high_fatigue':'Fatiga alta','high_fatigue_alert':'Alerta de fatiga alta','race_eligibility_critical':'Elegibilidad crítica para la carrera','training_schedule_covered':'Calendario de entrenamiento cubierto','race_jersey_eligibility':'Requisito de maillots de carrera'},
'it': {'rider_skill_change':'Cambio di abilità del corridore','weekly_training_readiness':'Prontezza settimanale all’allenamento','training_readiness':'Prontezza all’allenamento','race_programme_gap':'Intervallo nel programma gare','programme_continuity':'Continuità del programma','long_programme_break':'Lunga pausa nel programma','programme_empty':'Programma gare vuoto','race_preparation_missing':'Preparazione della gara mancante','race_preparation_ready':'Preparazione della gara pronta','startlist_deadline_alert':'Avviso sulla scadenza della lista di partenza','stage_plans_missing':'Mancano i piani di tappa','stage_plans_incomplete':'Piani di tappa incompleti','priority_prospect':'Talento prioritario','medical_treatment':'Trattamento medico','equipment_workshop_review':'Revisione di equipaggiamento e officina','recruitment_review':'Revisione scouting e reclutamento','elevated_fatigue':'Fatica elevata','fatigue_watch':'Controllo della fatica','rider_availability':'Disponibilità dei corridori','training_schedule_gap':'Vuoto nel programma di allenamento','high_fatigue':'Fatica elevata','high_fatigue_alert':'Allerta per fatica elevata','race_eligibility_critical':'Idoneità critica alla gara','training_schedule_covered':'Programma di allenamento coperto','race_jersey_eligibility':'Requisito delle maglie da gara'},
'fr': {'rider_skill_change':'Évolution d’une compétence du coureur','weekly_training_readiness':'État de préparation hebdomadaire','training_readiness':'État de préparation à l’entraînement','race_programme_gap':'Intervalle dans le programme de courses','programme_continuity':'Continuité du programme','long_programme_break':'Longue pause dans le programme','programme_empty':'Programme de courses vide','race_preparation_missing':'Préparation de la course manquante','race_preparation_ready':'Préparation de la course prête','startlist_deadline_alert':'Alerte sur l’échéance de la liste de départ','stage_plans_missing':'Plans d’étape manquants','stage_plans_incomplete':'Plans d’étape incomplets','priority_prospect':'Talent prioritaire','medical_treatment':'Traitement médical','equipment_workshop_review':'Revue de l’équipement et de l’atelier','recruitment_review':'Revue du scouting et du recrutement','elevated_fatigue':'Fatigue élevée','fatigue_watch':'Surveillance de la fatigue','rider_availability':'Disponibilité des coureurs','training_schedule_gap':'Période sans entraînement planifié','high_fatigue':'Fatigue élevée','high_fatigue_alert':'Alerte de fatigue élevée','race_eligibility_critical':'Éligibilité critique à la course','training_schedule_covered':'Planning d’entraînement couvert','race_jersey_eligibility':'Exigence relative aux maillots de course'},
'ru': {'rider_skill_change':'Изменение навыка гонщика','weekly_training_readiness':'Еженедельная готовность к тренировкам','training_readiness':'Готовность к тренировкам','race_programme_gap':'Пробел в гоночной программе','programme_continuity':'Непрерывность программы','long_programme_break':'Длительный перерыв в программе','programme_empty':'Гоночная программа пуста','race_preparation_missing':'Подготовка к гонке не завершена','race_preparation_ready':'Подготовка к гонке готова','startlist_deadline_alert':'Предупреждение о сроке стартового списка','stage_plans_missing':'Отсутствуют планы этапов','stage_plans_incomplete':'Планы этапов не завершены','priority_prospect':'Приоритетный талант','medical_treatment':'Медицинское лечение','equipment_workshop_review':'Обзор оборудования и мастерской','recruitment_review':'Обзор скаутинга и набора','elevated_fatigue':'Повышенная усталость','fatigue_watch':'Контроль усталости','rider_availability':'Готовность гонщиков','training_schedule_gap':'Пробел в тренировочном расписании','high_fatigue':'Высокая усталость','high_fatigue_alert':'Предупреждение о высокой усталости','race_eligibility_critical':'Критическая готовность к старту','training_schedule_covered':'Тренировочный график заполнен','race_jersey_eligibility':'Требование к гоночной форме'},
}

runtime = {
'en': {
 'values': {'noneScheduled':'None scheduled','notScheduled':'Not scheduled','today':'Today','tomorrow':'Tomorrow','inDays':'In {{count}} days','active':'Active','completed':'Completed','ready':'Ready','draft':'Draft','submitted':'Submitted','missing':'Missing','incomplete':'Incomplete','locked':'Locked','open':'Open','inProgress':'In progress','finalised':'Finalised','notReady':'Not ready','needsAttention':'Needs attention','critical':'Critical','urgent':'Urgent','high':'High','medium':'Medium','low':'Low','mild':'Mild','moderate':'Moderate','severe':'Severe','scheduled':'Scheduled','raceFallback':'the selected race'},
 'bodyParts': {'knee':'Knee','back':'Back','shoulder':'Shoulder','wrist':'Wrist','ankle':'Ankle','hip':'Hip','leg':'Leg','arm':'Arm','hand':'Hand','foot':'Foot','chest':'Chest','head':'Head','neck':'Neck'},
 'headCoach': {'generic':'Your Head Coach has prepared an advisory based on the current squad and training data.','trainingReadiness':'The Head Coach has reviewed current training readiness and squad availability.','weeklyTrainingReadiness':'The Head Coach has completed the weekly review of training readiness and squad availability.','trainingScheduleCovered':'The current training schedule is covered; no unplanned training gap requires action.'},
 'sportDirector': {'generic':'Your Sports Director has reviewed the current race programme and preparation status.','stagePlansMissing':'Missing stage plans for {{raceName}}: {{count}}. Stage {{stage}} is {{timing}} at {{time}} ({{date}}) and should be prepared next.','stagePlansIncomplete':'{{count}} stage plans for {{raceName}} are incomplete and should be reviewed before they lock.','startlistDeadline':'The rider/startlist deadline for {{raceName}} is {{deadline}}. Review the selection before the deadline.','preparationMissing':'Race preparation for {{raceName}} still requires action. Review the preparation package before the deadline.','preparationReady':'Race preparation for {{raceName}} is ready. Review the final setup before the race.','programmeEmpty':'No accepted race is currently scheduled. Review the race calendar and plan the next race block.','programmeGap':'The race programme has a gap of {{days}} days. Next accepted race: {{nextRace}}.','programmeContinuity':'The Sports Director has reviewed programme continuity. Next accepted race: {{nextRace}}.','longProgrammeBreak':'There is a long {{days}}-day break in the race programme. Next accepted race: {{nextRace}}.','eligibilityCritical':'A critical eligibility issue may affect participation in {{raceName}}. Review race preparation immediately.'},
 'doctor': {'generic':'Your Team Doctor has reviewed the current medical and recovery situation.','medicalTreatment':'Medical review: {{activeCases}} active cases, {{injured}} injured riders and {{sick}} sick riders. Review treatment and expected recovery before changing workload.'},
 'mechanic': {'generic':'Your Chief Mechanic has reviewed equipment, maintenance and race-supply readiness.','workshopReview':'Workshop review: {{total}} equipment items, {{attention}} needing attention, {{critical}} critical and {{lowSupplies}} low-stock supply types.','jerseyEligibility':'Race-jersey availability may affect race eligibility. Review race supplies before the next eligibility check.'},
 'scout': {'generic':'Your Scout has reviewed current scouting intelligence and recruitment priorities.','recruitmentReview':'Scouting review: {{reports}} completed reports, {{recent}} in the last seven real days, {{highElite}} high/elite prospects and {{active}} active assignments.','priorityProspect':'{{rider}} has been flagged as a priority prospect. Review the scouting report before deciding the next step.'},
 'recommendations': {'headCoach':'Review the affected riders and adjust training workload where necessary.','sportDirector':'Review the race programme, preparation, startlist and stage-plan status.','doctor':'Review treatment, recovery and rider availability before assigning training or races.','mechanic':'Review equipment condition, maintenance and race supplies before the next race.','scout':'Review the scouting information and decide the next recruitment or scouting action.'},
},
'sr-Latn': {
 'values': {'noneScheduled':'Nema zakazane trke','notScheduled':'Nije zakazano','today':'Danas','tomorrow':'Sutra','inDays':'Za {{count}} dana','active':'Aktivno','completed':'Završeno','ready':'Spremno','draft':'Nacrt','submitted':'Poslato','missing':'Nedostaje','incomplete':'Nepotpuno','locked':'Zaključano','open':'Otvoreno','inProgress':'U toku','finalised':'Završeno','notReady':'Nije spremno','needsAttention':'Zahteva pažnju','critical':'Kritično','urgent':'Hitno','high':'Visoko','medium':'Srednje','low':'Nisko','mild':'Blago','moderate':'Umereno','severe':'Teško','scheduled':'Zakazano','raceFallback':'izabranu trku'},
 'bodyParts': {'knee':'Koleno','back':'Leđa','shoulder':'Rame','wrist':'Ručni zglob','ankle':'Skočni zglob','hip':'Kuk','leg':'Noga','arm':'Ruka','hand':'Šaka','foot':'Stopalo','chest':'Grudi','head':'Glava','neck':'Vrat'},
 'headCoach': {'generic':'Glavni trener je pripremio savet na osnovu trenutnog stanja ekipe i podataka o treningu.','trainingReadiness':'Glavni trener je pregledao trenutnu spremnost za trening i dostupnost vozača.','weeklyTrainingReadiness':'Glavni trener je završio nedeljni pregled spremnosti za trening i dostupnosti vozača.','trainingScheduleCovered':'Trenutni raspored treninga je pokriven; nema neplanirane praznine koja zahteva reakciju.'},
 'sportDirector': {'generic':'Sportski direktor je pregledao trenutni program trka i status pripreme.','stagePlansMissing':'Za {{raceName}} nedostaje {{count}} planova etapa. Sledeće treba pripremiti plan za etapu {{stage}}, koja je {{timing}} u {{time}} ({{date}}).','stagePlansIncomplete':'Za {{raceName}} ima {{count}} nepotpunih planova etapa. Pregledajte ih pre zaključavanja.','startlistDeadline':'Rok za vozače/startnu listu za {{raceName}} je {{deadline}}. Pregledajte izbor pre isteka roka.','preparationMissing':'Priprema trke {{raceName}} još zahteva pažnju. Pregledajte pripremu pre isteka roka.','preparationReady':'Priprema trke {{raceName}} je spremna. Pregledajte završna podešavanja pre trke.','programmeEmpty':'Trenutno nema zakazane prihvaćene trke. Pregledajte kalendar i isplanirajte sledeći blok trka.','programmeGap':'U programu trka postoji praznina od {{days}} dana. Sledeća prihvaćena trka: {{nextRace}}.','programmeContinuity':'Sportski direktor je pregledao kontinuitet programa. Sledeća prihvaćena trka: {{nextRace}}.','longProgrammeBreak':'U programu trka postoji duga pauza od {{days}} dana. Sledeća prihvaćena trka: {{nextRace}}.','eligibilityCritical':'Kritičan uslov za nastup može uticati na učešće u trci {{raceName}}. Odmah pregledajte pripremu trke.'},
 'doctor': {'generic':'Lekar tima je pregledao trenutnu medicinsku situaciju i oporavak vozača.','medicalTreatment':'Medicinski pregled: {{activeCases}} aktivnih slučajeva, {{injured}} povređenih i {{sick}} bolesnih vozača. Pregledajte tretman i očekivani oporavak pre promene opterećenja.'},
 'mechanic': {'generic':'Glavni mehaničar je pregledao opremu, održavanje i spremnost zaliha za trku.','workshopReview':'Pregled radionice: {{total}} komada opreme, {{attention}} zahteva pažnju, {{critical}} je kritično, a {{lowSupplies}} vrsta zaliha je pri kraju.','jerseyEligibility':'Dostupnost trkačkih dresova može uticati na uslov za nastup. Pregledajte zalihe za trku pre sledeće provere.'},
 'scout': {'generic':'Skaut je pregledao najnovije podatke o skautingu i prioritete za regrutaciju.','recruitmentReview':'Pregled skautinga: {{reports}} završenih izveštaja, {{recent}} u poslednjih sedam stvarnih dana, {{highElite}} talenata visokog/elitnog potencijala i {{active}} aktivnih zadataka.','priorityProspect':'{{rider}} je označen kao prioritetni talenat. Pregledajte skautski izveštaj pre odluke o sledećem koraku.'},
 'recommendations': {'headCoach':'Pregledajte pogođene vozače i po potrebi prilagodite opterećenje na treningu.','sportDirector':'Pregledajte program trka, pripremu, startnu listu i status planova etapa.','doctor':'Pregledajte tretman, oporavak i dostupnost vozača pre dodeljivanja treninga ili trka.','mechanic':'Pregledajte stanje opreme, održavanje i zalihe za trku pre sledeće trke.','scout':'Pregledajte skautske podatke i odlučite o sledećoj aktivnosti regrutacije ili skautinga.'},
},
'hr': {
 'values': {'noneScheduled':'Nema zakazane utrke','notScheduled':'Nije zakazano','today':'Danas','tomorrow':'Sutra','inDays':'Za {{count}} dana','active':'Aktivno','completed':'Završeno','ready':'Spremno','draft':'Nacrt','submitted':'Predano','missing':'Nedostaje','incomplete':'Nepotpuno','locked':'Zaključano','open':'Otvoreno','inProgress':'U tijeku','finalised':'Završeno','notReady':'Nije spremno','needsAttention':'Zahtijeva pažnju','critical':'Kritično','urgent':'Hitno','high':'Visoko','medium':'Srednje','low':'Nisko','mild':'Blago','moderate':'Umjereno','severe':'Teško','scheduled':'Zakazano','raceFallback':'odabranu utrku'},
 'bodyParts': {'knee':'Koljeno','back':'Leđa','shoulder':'Rame','wrist':'Ručni zglob','ankle':'Gležanj','hip':'Kuk','leg':'Noga','arm':'Ruka','hand':'Šaka','foot':'Stopalo','chest':'Prsa','head':'Glava','neck':'Vrat'},
 'headCoach': {'generic':'Glavni trener pripremio je savjet na temelju trenutačnog stanja momčadi i podataka o treningu.','trainingReadiness':'Glavni trener pregledao je trenutačnu spremnost za trening i dostupnost vozača.','weeklyTrainingReadiness':'Glavni trener završio je tjedni pregled spremnosti za trening i dostupnosti vozača.','trainingScheduleCovered':'Trenutačni raspored treninga je pokriven; nema neplanirane praznine koja zahtijeva reakciju.'},
 'sportDirector': {'generic':'Sportski direktor pregledao je trenutačni program utrka i status pripreme.','stagePlansMissing':'Za {{raceName}} nedostaje {{count}} planova etapa. Sljedeće treba pripremiti plan za etapu {{stage}}, koja je {{timing}} u {{time}} ({{date}}).','stagePlansIncomplete':'Za {{raceName}} ima {{count}} nepotpunih planova etapa. Pregledajte ih prije zaključavanja.','startlistDeadline':'Rok za vozače/startnu listu za {{raceName}} je {{deadline}}. Pregledajte izbor prije isteka roka.','preparationMissing':'Priprema utrke {{raceName}} još zahtijeva pažnju. Pregledajte pripremu prije isteka roka.','preparationReady':'Priprema utrke {{raceName}} je spremna. Pregledajte završne postavke prije utrke.','programmeEmpty':'Trenutačno nema zakazane prihvaćene utrke. Pregledajte kalendar i isplanirajte sljedeći blok utrka.','programmeGap':'U programu utrka postoji praznina od {{days}} dana. Sljedeća prihvaćena utrka: {{nextRace}}.','programmeContinuity':'Sportski direktor pregledao je kontinuitet programa. Sljedeća prihvaćena utrka: {{nextRace}}.','longProgrammeBreak':'U programu utrka postoji duga pauza od {{days}} dana. Sljedeća prihvaćena utrka: {{nextRace}}.','eligibilityCritical':'Kritičan uvjet za nastup može utjecati na sudjelovanje u utrci {{raceName}}. Odmah pregledajte pripremu utrke.'},
 'doctor': {'generic':'Liječnik momčadi pregledao je trenutačnu medicinsku situaciju i oporavak vozača.','medicalTreatment':'Medicinski pregled: {{activeCases}} aktivnih slučajeva, {{injured}} ozlijeđenih i {{sick}} bolesnih vozača. Pregledajte tretman i očekivani oporavak prije promjene opterećenja.'},
 'mechanic': {'generic':'Glavni mehaničar pregledao je opremu, održavanje i spremnost zaliha za utrku.','workshopReview':'Pregled radionice: {{total}} komada opreme, {{attention}} zahtijeva pažnju, {{critical}} je kritično, a {{lowSupplies}} vrsta zaliha je pri kraju.','jerseyEligibility':'Dostupnost trkaćih dresova može utjecati na uvjet za nastup. Pregledajte zalihe za utrku prije sljedeće provjere.'},
 'scout': {'generic':'Skaut je pregledao najnovije podatke o skautingu i prioritete za regrutaciju.','recruitmentReview':'Pregled skautinga: {{reports}} završenih izvještaja, {{recent}} u posljednjih sedam stvarnih dana, {{highElite}} talenata visokog/elitnog potencijala i {{active}} aktivnih zadataka.','priorityProspect':'{{rider}} je označen kao prioritetni talent. Pregledajte skautski izvještaj prije odluke o sljedećem koraku.'},
 'recommendations': {'headCoach':'Pregledajte pogođene vozače i po potrebi prilagodite opterećenje na treningu.','sportDirector':'Pregledajte program utrka, pripremu, startnu listu i status planova etapa.','doctor':'Pregledajte tretman, oporavak i dostupnost vozača prije dodjele treninga ili utrka.','mechanic':'Pregledajte stanje opreme, održavanje i zalihe za utrku prije sljedeće utrke.','scout':'Pregledajte skautske podatke i odlučite o sljedećoj aktivnosti regrutacije ili skautinga.'},
},
'de': {
 'values': {'noneScheduled':'Kein Rennen geplant','notScheduled':'Nicht geplant','today':'Heute','tomorrow':'Morgen','inDays':'In {{count}} Tagen','active':'Aktiv','completed':'Abgeschlossen','ready':'Bereit','draft':'Entwurf','submitted':'Eingereicht','missing':'Fehlt','incomplete':'Unvollständig','locked':'Gesperrt','open':'Offen','inProgress':'In Bearbeitung','finalised':'Abgeschlossen','notReady':'Nicht bereit','needsAttention':'Handlungsbedarf','critical':'Kritisch','urgent':'Dringend','high':'Hoch','medium':'Mittel','low':'Niedrig','mild':'Leicht','moderate':'Mittelgradig','severe':'Schwer','scheduled':'Geplant','raceFallback':'das ausgewählte Rennen'},
 'bodyParts': {'knee':'Knie','back':'Rücken','shoulder':'Schulter','wrist':'Handgelenk','ankle':'Sprunggelenk','hip':'Hüfte','leg':'Bein','arm':'Arm','hand':'Hand','foot':'Fuß','chest':'Brust','head':'Kopf','neck':'Nacken'},
 'headCoach': {'generic':'Der Cheftrainer hat auf Grundlage der aktuellen Kader- und Trainingsdaten einen Hinweis erstellt.','trainingReadiness':'Der Cheftrainer hat die aktuelle Trainingsbereitschaft und Fahrerverfügbarkeit geprüft.','weeklyTrainingReadiness':'Der Cheftrainer hat die wöchentliche Prüfung von Trainingsbereitschaft und Fahrerverfügbarkeit abgeschlossen.','trainingScheduleCovered':'Der aktuelle Trainingsplan ist abgedeckt; es gibt keine ungeplante Lücke mit Handlungsbedarf.'},
 'sportDirector': {'generic':'Der Sportdirektor hat das aktuelle Rennprogramm und den Vorbereitungsstand geprüft.','stagePlansMissing':'Für {{raceName}} fehlen {{count}} Etappenpläne. Als Nächstes sollte der Plan für Etappe {{stage}} vorbereitet werden. Termin: {{timing}}, {{time}} ({{date}}).','stagePlansIncomplete':'Für {{raceName}} sind {{count}} Etappenpläne unvollständig. Prüfe sie vor der Sperrung.','startlistDeadline':'Die Frist für Fahrer/Startliste bei {{raceName}} ist {{deadline}}. Prüfe die Auswahl vor Ablauf der Frist.','preparationMissing':'Die Rennvorbereitung für {{raceName}} erfordert noch Maßnahmen. Prüfe die Vorbereitung vor Ablauf der Frist.','preparationReady':'Die Rennvorbereitung für {{raceName}} ist bereit. Prüfe die endgültigen Einstellungen vor dem Rennen.','programmeEmpty':'Derzeit ist kein angenommenes Rennen geplant. Prüfe den Rennkalender und plane den nächsten Rennblock.','programmeGap':'Im Rennprogramm besteht eine Lücke von {{days}} Tagen. Nächstes angenommenes Rennen: {{nextRace}}.','programmeContinuity':'Der Sportdirektor hat die Kontinuität des Rennprogramms geprüft. Nächstes angenommenes Rennen: {{nextRace}}.','longProgrammeBreak':'Im Rennprogramm besteht eine lange Pause von {{days}} Tagen. Nächstes angenommenes Rennen: {{nextRace}}.','eligibilityCritical':'Ein kritisches Startberechtigungsproblem kann die Teilnahme an {{raceName}} gefährden. Prüfe die Rennvorbereitung sofort.'},
 'doctor': {'generic':'Der Teamarzt hat die aktuelle medizinische und Erholungssituation geprüft.','medicalTreatment':'Medizinische Übersicht: {{activeCases}} aktive Fälle, {{injured}} verletzte und {{sick}} erkrankte Fahrer. Prüfe Behandlung und erwartete Erholung, bevor du die Belastung änderst.'},
 'mechanic': {'generic':'Der Chefmechaniker hat Ausrüstung, Wartung und Rennvorräte geprüft.','workshopReview':'Werkstattübersicht: {{total}} Ausrüstungsgegenstände, {{attention}} mit Handlungsbedarf, {{critical}} kritisch und {{lowSupplies}} knapp werdende Vorratsarten.','jerseyEligibility':'Die Verfügbarkeit der Renntrikots kann die Startberechtigung beeinflussen. Prüfe die Rennvorräte vor der nächsten Berechtigungsprüfung.'},
 'scout': {'generic':'Der Scout hat die aktuellen Scouting-Erkenntnisse und Rekrutierungsprioritäten geprüft.','recruitmentReview':'Scouting-Übersicht: {{reports}} abgeschlossene Berichte, davon {{recent}} in den letzten sieben realen Tagen, {{highElite}} hohe/Elite-Potenziale und {{active}} aktive Aufträge.','priorityProspect':'{{rider}} wurde als Prioritäts-Talent markiert. Prüfe den Scouting-Bericht, bevor du den nächsten Schritt festlegst.'},
 'recommendations': {'headCoach':'Prüfe die betroffenen Fahrer und passe die Trainingsbelastung bei Bedarf an.','sportDirector':'Prüfe Rennprogramm, Vorbereitung, Startliste und Status der Etappenpläne.','doctor':'Prüfe Behandlung, Erholung und Fahrerverfügbarkeit, bevor du Training oder Rennen zuweist.','mechanic':'Prüfe Ausrüstungszustand, Wartung und Rennvorräte vor dem nächsten Rennen.','scout':'Prüfe die Scouting-Informationen und lege die nächste Rekrutierungs- oder Scouting-Aktion fest.'},
},
'es': {
 'values': {'noneScheduled':'No hay ninguna carrera programada','notScheduled':'No programado','today':'Hoy','tomorrow':'Mañana','inDays':'Dentro de {{count}} días','active':'Activa','completed':'Completado','ready':'Listo','draft':'Borrador','submitted':'Enviado','missing':'Falta','incomplete':'Incompleto','locked':'Bloqueado','open':'Abierto','inProgress':'En curso','finalised':'Finalizado','notReady':'No está listo','needsAttention':'Requiere atención','critical':'Crítico','urgent':'Urgente','high':'Alto','medium':'Medio','low':'Bajo','mild':'Leve','moderate':'Moderado','severe':'Grave','scheduled':'Programado','raceFallback':'la carrera seleccionada'},
 'bodyParts': {'knee':'Rodilla','back':'Espalda','shoulder':'Hombro','wrist':'Muñeca','ankle':'Tobillo','hip':'Cadera','leg':'Pierna','arm':'Brazo','hand':'Mano','foot':'Pie','chest':'Pecho','head':'Cabeza','neck':'Cuello'},
 'headCoach': {'generic':'El entrenador principal ha preparado un aviso basado en la situación actual de la plantilla y los datos de entrenamiento.','trainingReadiness':'El entrenador principal ha revisado la preparación actual para el entrenamiento y la disponibilidad de los ciclistas.','weeklyTrainingReadiness':'El entrenador principal ha completado la revisión semanal de la preparación para el entrenamiento y la disponibilidad de los ciclistas.','trainingScheduleCovered':'El calendario actual de entrenamiento está cubierto; no hay ningún hueco no planificado que requiera intervención.'},
 'sportDirector': {'generic':'El director deportivo ha revisado el programa actual de carreras y el estado de preparación.','stagePlansMissing':'Faltan {{count}} planes de etapa para {{raceName}}. Lo siguiente que debe prepararse es el plan de la etapa {{stage}}, prevista para {{timing}} a las {{time}} ({{date}}).','stagePlansIncomplete':'Hay {{count}} planes de etapa incompletos para {{raceName}}. Revísalos antes de que se bloqueen.','startlistDeadline':'El plazo de ciclistas/lista de salida para {{raceName}} es {{deadline}}. Revisa la selección antes del plazo.','preparationMissing':'La preparación de {{raceName}} todavía requiere atención. Revisa la preparación antes del plazo.','preparationReady':'La preparación de {{raceName}} está lista. Revisa la configuración final antes de la carrera.','programmeEmpty':'Actualmente no hay ninguna carrera aceptada programada. Revisa el calendario y planifica el siguiente bloque de carreras.','programmeGap':'Hay un hueco de {{days}} días en el programa de carreras. Siguiente carrera aceptada: {{nextRace}}.','programmeContinuity':'El director deportivo ha revisado la continuidad del programa. Siguiente carrera aceptada: {{nextRace}}.','longProgrammeBreak':'Hay una pausa larga de {{days}} días en el programa de carreras. Siguiente carrera aceptada: {{nextRace}}.','eligibilityCritical':'Un problema crítico de elegibilidad puede afectar a la participación en {{raceName}}. Revisa de inmediato la preparación de la carrera.'},
 'doctor': {'generic':'El médico del equipo ha revisado la situación médica y de recuperación actual.','medicalTreatment':'Revisión médica: {{activeCases}} casos activos, {{injured}} ciclistas lesionados y {{sick}} enfermos. Revisa el tratamiento y la recuperación prevista antes de cambiar la carga.'},
 'mechanic': {'generic':'El jefe de mecánicos ha revisado el equipamiento, el mantenimiento y los suministros de carrera.','workshopReview':'Revisión del taller: {{total}} elementos de equipamiento, {{attention}} requieren atención, {{critical}} son críticos y {{lowSupplies}} tipos de suministros están bajos.','jerseyEligibility':'La disponibilidad de maillots de carrera puede afectar a la elegibilidad. Revisa los suministros antes de la siguiente comprobación.'},
 'scout': {'generic':'El ojeador ha revisado la información de scouting y las prioridades de fichajes.','recruitmentReview':'Revisión de scouting: {{reports}} informes completados, {{recent}} en los últimos siete días reales, {{highElite}} prospectos de potencial alto/élite y {{active}} asignaciones activas.','priorityProspect':'{{rider}} ha sido marcado como talento prioritario. Revisa el informe de scouting antes de decidir el siguiente paso.'},
 'recommendations': {'headCoach':'Revisa a los ciclistas afectados y ajusta la carga de entrenamiento cuando sea necesario.','sportDirector':'Revisa el programa de carreras, la preparación, la lista de salida y el estado de los planes de etapa.','doctor':'Revisa el tratamiento, la recuperación y la disponibilidad antes de asignar entrenamientos o carreras.','mechanic':'Revisa el estado del equipamiento, el mantenimiento y los suministros antes de la siguiente carrera.','scout':'Revisa la información de scouting y decide la siguiente acción de fichaje o seguimiento.'},
},
'it': {
 'values': {'noneScheduled':'Nessuna gara programmata','notScheduled':'Non programmato','today':'Oggi','tomorrow':'Domani','inDays':'Tra {{count}} giorni','active':'Attivo','completed':'Completato','ready':'Pronto','draft':'Bozza','submitted':'Inviato','missing':'Mancante','incomplete':'Incompleto','locked':'Bloccato','open':'Aperto','inProgress':'In corso','finalised':'Finalizzato','notReady':'Non pronto','needsAttention':'Richiede attenzione','critical':'Critico','urgent':'Urgente','high':'Alto','medium':'Medio','low':'Basso','mild':'Lieve','moderate':'Moderato','severe':'Grave','scheduled':'Programmato','raceFallback':'la gara selezionata'},
 'bodyParts': {'knee':'Ginocchio','back':'Schiena','shoulder':'Spalla','wrist':'Polso','ankle':'Caviglia','hip':'Anca','leg':'Gamba','arm':'Braccio','hand':'Mano','foot':'Piede','chest':'Torace','head':'Testa','neck':'Collo'},
 'headCoach': {'generic':'L’allenatore capo ha preparato un avviso basato sulla situazione attuale della rosa e sui dati di allenamento.','trainingReadiness':'L’allenatore capo ha verificato la prontezza attuale all’allenamento e la disponibilità dei corridori.','weeklyTrainingReadiness':'L’allenatore capo ha completato la revisione settimanale della prontezza all’allenamento e della disponibilità dei corridori.','trainingScheduleCovered':'Il programma di allenamento attuale è coperto; non ci sono vuoti non pianificati che richiedano un intervento.'},
 'sportDirector': {'generic':'Il direttore sportivo ha esaminato il programma gare attuale e lo stato della preparazione.','stagePlansMissing':'Mancano {{count}} piani di tappa per {{raceName}}. Il prossimo da preparare è il piano della tappa {{stage}}, prevista {{timing}} alle {{time}} ({{date}}).','stagePlansIncomplete':'Ci sono {{count}} piani di tappa incompleti per {{raceName}}. Controllali prima del blocco.','startlistDeadline':'La scadenza per corridori/lista di partenza di {{raceName}} è {{deadline}}. Controlla la selezione prima della scadenza.','preparationMissing':'La preparazione di {{raceName}} richiede ancora attenzione. Controllala prima della scadenza.','preparationReady':'La preparazione di {{raceName}} è pronta. Controlla l’assetto finale prima della gara.','programmeEmpty':'Al momento non è programmata alcuna gara accettata. Controlla il calendario e pianifica il prossimo blocco di gare.','programmeGap':'Nel programma gare c’è un intervallo di {{days}} giorni. Prossima gara accettata: {{nextRace}}.','programmeContinuity':'Il direttore sportivo ha verificato la continuità del programma. Prossima gara accettata: {{nextRace}}.','longProgrammeBreak':'Nel programma gare c’è una lunga pausa di {{days}} giorni. Prossima gara accettata: {{nextRace}}.','eligibilityCritical':'Un problema critico di idoneità può compromettere la partecipazione a {{raceName}}. Controlla subito la preparazione della gara.'},
 'doctor': {'generic':'Il medico della squadra ha esaminato la situazione medica e di recupero attuale.','medicalTreatment':'Revisione medica: {{activeCases}} casi attivi, {{injured}} corridori infortunati e {{sick}} malati. Controlla trattamento e recupero previsto prima di modificare il carico.'},
 'mechanic': {'generic':'Il capo meccanico ha controllato equipaggiamento, manutenzione e scorte per la gara.','workshopReview':'Revisione officina: {{total}} elementi di equipaggiamento, {{attention}} richiedono attenzione, {{critical}} sono critici e {{lowSupplies}} tipi di scorte sono bassi.','jerseyEligibility':'La disponibilità delle maglie da gara può influire sull’idoneità. Controlla le scorte prima della prossima verifica.'},
 'scout': {'generic':'Lo scout ha esaminato le informazioni più recenti e le priorità di reclutamento.','recruitmentReview':'Revisione scouting: {{reports}} rapporti completati, {{recent}} negli ultimi sette giorni reali, {{highElite}} prospetti ad alto/élite potenziale e {{active}} incarichi attivi.','priorityProspect':'{{rider}} è stato segnalato come talento prioritario. Controlla il rapporto di scouting prima di decidere il prossimo passo.'},
 'recommendations': {'headCoach':'Controlla i corridori interessati e adatta il carico di allenamento quando necessario.','sportDirector':'Controlla il programma gare, la preparazione, la lista di partenza e lo stato dei piani di tappa.','doctor':'Controlla trattamento, recupero e disponibilità prima di assegnare allenamenti o gare.','mechanic':'Controlla condizioni dell’equipaggiamento, manutenzione e scorte prima della prossima gara.','scout':'Controlla le informazioni di scouting e decidi la prossima azione di reclutamento o scouting.'},
},
'fr': {
 'values': {'noneScheduled':'Aucune course programmée','notScheduled':'Non programmé','today':'Aujourd’hui','tomorrow':'Demain','inDays':'Dans {{count}} jours','active':'Actif','completed':'Terminé','ready':'Prêt','draft':'Brouillon','submitted':'Envoyé','missing':'Manquant','incomplete':'Incomplet','locked':'Verrouillé','open':'Ouvert','inProgress':'En cours','finalised':'Finalisé','notReady':'Pas prêt','needsAttention':'Nécessite une attention','critical':'Critique','urgent':'Urgent','high':'Élevé','medium':'Moyen','low':'Faible','mild':'Léger','moderate':'Modéré','severe':'Sévère','scheduled':'Programmé','raceFallback':'la course sélectionnée'},
 'bodyParts': {'knee':'Genou','back':'Dos','shoulder':'Épaule','wrist':'Poignet','ankle':'Cheville','hip':'Hanche','leg':'Jambe','arm':'Bras','hand':'Main','foot':'Pied','chest':'Thorax','head':'Tête','neck':'Cou'},
 'headCoach': {'generic':'L’entraîneur principal a préparé un avis à partir de l’état actuel de l’effectif et des données d’entraînement.','trainingReadiness':'L’entraîneur principal a vérifié l’état de préparation à l’entraînement et la disponibilité des coureurs.','weeklyTrainingReadiness':'L’entraîneur principal a terminé la revue hebdomadaire de la préparation et de la disponibilité des coureurs.','trainingScheduleCovered':'Le planning d’entraînement actuel est couvert ; aucune période non planifiée ne nécessite d’intervention.'},
 'sportDirector': {'generic':'Le directeur sportif a examiné le programme de courses actuel et l’état de la préparation.','stagePlansMissing':'Il manque {{count}} plans d’étape pour {{raceName}}. Le prochain à préparer est celui de l’étape {{stage}}, prévue {{timing}} à {{time}} ({{date}}).','stagePlansIncomplete':'{{count}} plans d’étape sont incomplets pour {{raceName}}. Vérifiez-les avant leur verrouillage.','startlistDeadline':'L’échéance coureurs/liste de départ pour {{raceName}} est {{deadline}}. Vérifiez la sélection avant l’échéance.','preparationMissing':'La préparation de {{raceName}} nécessite encore une intervention. Vérifiez-la avant l’échéance.','preparationReady':'La préparation de {{raceName}} est prête. Vérifiez les derniers réglages avant la course.','programmeEmpty':'Aucune course acceptée n’est actuellement programmée. Consultez le calendrier et planifiez le prochain bloc de courses.','programmeGap':'Le programme comporte un intervalle de {{days}} jours. Prochaine course acceptée : {{nextRace}}.','programmeContinuity':'Le directeur sportif a vérifié la continuité du programme. Prochaine course acceptée : {{nextRace}}.','longProgrammeBreak':'Le programme comporte une longue pause de {{days}} jours. Prochaine course acceptée : {{nextRace}}.','eligibilityCritical':'Un problème critique d’éligibilité peut compromettre la participation à {{raceName}}. Vérifiez immédiatement la préparation de la course.'},
 'doctor': {'generic':'Le médecin de l’équipe a examiné la situation médicale et de récupération actuelle.','medicalTreatment':'Bilan médical : {{activeCases}} cas actifs, {{injured}} coureurs blessés et {{sick}} malades. Vérifiez le traitement et le retour prévu avant de modifier la charge.'},
 'mechanic': {'generic':'Le chef mécanicien a vérifié l’équipement, la maintenance et les fournitures de course.','workshopReview':'Revue de l’atelier : {{total}} éléments d’équipement, {{attention}} nécessitent une attention, {{critical}} sont critiques et {{lowSupplies}} types de stocks sont faibles.','jerseyEligibility':'La disponibilité des maillots de course peut affecter l’éligibilité. Vérifiez les fournitures avant le prochain contrôle.'},
 'scout': {'generic':'Le recruteur a examiné les informations de scouting et les priorités de recrutement.','recruitmentReview':'Revue du scouting : {{reports}} rapports terminés, {{recent}} au cours des sept derniers jours réels, {{highElite}} prospects à potentiel élevé/élite et {{active}} missions actives.','priorityProspect':'{{rider}} a été signalé comme talent prioritaire. Vérifiez le rapport de scouting avant de décider de la prochaine étape.'},
 'recommendations': {'headCoach':'Vérifiez les coureurs concernés et adaptez la charge d’entraînement si nécessaire.','sportDirector':'Vérifiez le programme de courses, la préparation, la liste de départ et l’état des plans d’étape.','doctor':'Vérifiez le traitement, la récupération et la disponibilité avant d’attribuer entraînements ou courses.','mechanic':'Vérifiez l’état de l’équipement, la maintenance et les fournitures avant la prochaine course.','scout':'Vérifiez les informations de scouting et décidez de la prochaine action de recrutement ou de suivi.'},
},
'ru': {
 'values': {'noneScheduled':'Гонка не запланирована','notScheduled':'Не запланировано','today':'Сегодня','tomorrow':'Завтра','inDays':'Через {{count}} дн.','active':'Активно','completed':'Завершено','ready':'Готово','draft':'Черновик','submitted':'Отправлено','missing':'Отсутствует','incomplete':'Не завершено','locked':'Заблокировано','open':'Открыто','inProgress':'В процессе','finalised':'Завершено','notReady':'Не готово','needsAttention':'Требует внимания','critical':'Критично','urgent':'Срочно','high':'Высокая','medium':'Средняя','low':'Низкая','mild':'Лёгкая','moderate':'Умеренная','severe':'Тяжёлая','scheduled':'Запланировано','raceFallback':'выбранную гонку'},
 'bodyParts': {'knee':'Колено','back':'Спина','shoulder':'Плечо','wrist':'Запястье','ankle':'Голеностоп','hip':'Тазобедренная область','leg':'Нога','arm':'Рука','hand':'Кисть','foot':'Стопа','chest':'Грудь','head':'Голова','neck':'Шея'},
 'headCoach': {'generic':'Главный тренер подготовил рекомендацию на основе текущего состояния состава и данных тренировок.','trainingReadiness':'Главный тренер проверил текущую готовность к тренировкам и доступность гонщиков.','weeklyTrainingReadiness':'Главный тренер завершил еженедельную проверку готовности к тренировкам и доступности гонщиков.','trainingScheduleCovered':'Текущий тренировочный график заполнен; незапланированных пробелов, требующих действий, нет.'},
 'sportDirector': {'generic':'Спортивный директор проверил текущую гоночную программу и состояние подготовки.','stagePlansMissing':'Для {{raceName}} отсутствуют {{count}} планов этапов. Следующим нужно подготовить план этапа {{stage}}: {{timing}}, {{time}} ({{date}}).','stagePlansIncomplete':'Для {{raceName}} не завершены {{count}} планов этапов. Проверьте их до блокировки.','startlistDeadline':'Срок подачи гонщиков/стартового списка на {{raceName}} — {{deadline}}. Проверьте состав до истечения срока.','preparationMissing':'Подготовка к {{raceName}} всё ещё требует действий. Проверьте её до истечения срока.','preparationReady':'Подготовка к {{raceName}} готова. Проверьте финальные настройки перед гонкой.','programmeEmpty':'Сейчас нет запланированной подтверждённой гонки. Проверьте календарь и запланируйте следующий гоночный блок.','programmeGap':'В гоночной программе есть пауза {{days}} дн. Следующая подтверждённая гонка: {{nextRace}}.','programmeContinuity':'Спортивный директор проверил непрерывность программы. Следующая подтверждённая гонка: {{nextRace}}.','longProgrammeBreak':'В гоночной программе длительная пауза {{days}} дн. Следующая подтверждённая гонка: {{nextRace}}.','eligibilityCritical':'Критическая проблема допуска может повлиять на участие в {{raceName}}. Немедленно проверьте подготовку к гонке.'},
 'doctor': {'generic':'Врач команды проверил текущую медицинскую ситуацию и восстановление гонщиков.','medicalTreatment':'Медицинский обзор: {{activeCases}} активных случаев, {{injured}} травмированных и {{sick}} заболевших гонщиков. Проверьте лечение и ожидаемое восстановление до изменения нагрузки.'},
 'mechanic': {'generic':'Главный механик проверил оборудование, обслуживание и готовность гоночных запасов.','workshopReview':'Обзор мастерской: {{total}} единиц оборудования, {{attention}} требуют внимания, {{critical}} критических, {{lowSupplies}} видов запасов заканчиваются.','jerseyEligibility':'Наличие гоночной формы может повлиять на допуск к старту. Проверьте запасы перед следующей проверкой.'},
 'scout': {'generic':'Скаут проверил свежие данные и приоритеты набора.','recruitmentReview':'Обзор скаутинга: {{reports}} завершённых отчётов, {{recent}} за последние семь реальных дней, {{highElite}} гонщиков с высоким/элитным потенциалом и {{active}} активных заданий.','priorityProspect':'{{rider}} отмечен как приоритетный талант. Проверьте скаутский отчёт перед выбором следующего шага.'},
 'recommendations': {'headCoach':'Проверьте состояние затронутых гонщиков и при необходимости скорректируйте тренировочную нагрузку.','sportDirector':'Проверьте гоночную программу, подготовку, стартовый список и состояние планов этапов.','doctor':'Проверьте лечение, восстановление и доступность гонщиков до назначения тренировок или гонок.','mechanic':'Проверьте состояние оборудования, обслуживание и гоночные запасы перед следующей гонкой.','scout':'Проверьте данные скаутинга и выберите следующее действие по набору или наблюдению.'},
},
}

for locale in LOCALES:
    path = LOCALE_ROOT / locale / 'notifications.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    data.setdefault('common', {})['seasonDate'] = common_season[locale]
    data.setdefault('roles', {}).update(roles[locale])
    for section, values in section_overrides[locale].items():
        data.setdefault(section, {}).update(values)
    data.setdefault('reportVariants', {}).update(report_variants[locale])
    data['advisorRuntime'] = runtime[locale]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('Applied comprehensive advisor notification localization fix for:', ', '.join(LOCALES))
