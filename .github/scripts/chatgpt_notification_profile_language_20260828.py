from pathlib import Path
import json
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding='utf-8')


def replace(path: str, old: str, new: str, *, required: bool = True, count: int = 0) -> int:
    text = read(path)
    hits = text.count(old)
    if required and hits == 0:
        raise SystemExit(f'Missing replacement in {path}: {old[:180]!r}')
    if hits:
        if count:
            text = text.replace(old, new, count)
        else:
            text = text.replace(old, new)
        write(path, text)
        print(f'{path}: replaced {hits} occurrence(s): {old[:100]!r}')
    return hits


def regex_replace(path: str, pattern: str, replacement: str, *, required: bool = True, count: int = 0) -> int:
    text = read(path)
    next_text, hits = re.subn(pattern, lambda _m: replacement, text, count=count, flags=re.MULTILINE)
    if required and hits == 0:
        raise SystemExit(f'Missing regex in {path}: {pattern[:180]!r}')
    if hits:
        write(path, next_text)
        print(f'{path}: regex replaced {hits}: {pattern[:100]!r}')
    return hits


def load_json(path: str):
    return json.loads(read(path))


def save_json(path: str, value) -> None:
    write(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


# ---------------------------------------------------------------------------
# Central notification localization layer.
# Known rich notifications get natural Serbian copy; all other template types
# get a localized type/topic + generic Serbian message instead of leaking raw
# English backend/template prose. Structured names, dates and numeric values
# stay untouched unless they are known UI/status/role labels.
# ---------------------------------------------------------------------------
localization_path = 'src/features/notifications/notificationLocalization.ts'
write(localization_path, r'''import i18n from '@/i18n'
import type { NotificationItem } from './notificationHelpers'

function isSerbian(): boolean {
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en'
  return String(language).toLowerCase().startsWith('sr')
}

export function isSerbianNotificationLocale(): boolean {
  return isSerbian()
}

function nt(key: string, options?: Record<string, unknown>): string {
  return String(i18n.t(key, { ns: 'notifications', ...(options ?? {}) }))
}

function payloadOf(item: NotificationItem): Record<string, unknown> {
  const payload = item.payload_json
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {}
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

function extractNameFromTitle(title: string | null | undefined): string | null {
  const value = String(title ?? '').trim()
  const colon = value.indexOf(':')
  if (colon < 0) return null
  const candidate = value.slice(colon + 1).trim()
  return candidate || null
}

function getPrimaryEntity(item: NotificationItem): string | null {
  const payload = payloadOf(item)
  return readString(payload, [
    'rider_full_name',
    'rider_name',
    'staff_full_name',
    'staff_name',
    'employee_name',
    'company_name',
    'sponsor_name',
    'race_name',
    'stage_name',
    'facility_name',
    'asset_name',
    'club_name',
    'team_name',
    'name',
  ])
}

function normalizePhrase(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function localizeRole(value: string | null): string | null {
  if (!value || !isSerbian()) return value
  const normalized = normalizePhrase(value)
  const keyByRole: Record<string, string> = {
    'scout analyst': 'roles.scoutAnalyst',
    'scout': 'roles.scout',
    'head coach': 'roles.headCoach',
    'sport director': 'roles.sportsDirector',
    'sports director': 'roles.sportsDirector',
    'team doctor': 'roles.teamDoctor',
    'chief mechanic': 'roles.chiefMechanic',
    'mechanic': 'roles.mechanic',
    'staff advisor': 'roles.staffAdvisor',
  }
  const key = keyByRole[normalized]
  return key ? nt(key) : value
}

const CATEGORY_KEY_BY_NORMALIZED: Record<string, string> = {
  game: 'categories.game',
  admin: 'categories.admin',
  system: 'categories.system',
  staffadvisory: 'categories.staffAdvisory',
  race: 'categories.race',
  races: 'categories.races',
  finance: 'categories.finance',
  transfers: 'categories.transfers',
  training: 'categories.training',
  equipment: 'categories.equipment',
  infrastructure: 'categories.infrastructure',
  sponsors: 'categories.sponsors',
  staff: 'categories.staff',
  squad: 'categories.squad',
  health: 'categories.health',
  scouting: 'categories.scouting',
  raceinvitations: 'categories.raceInvitations',
  raceapplicationresults: 'categories.raceApplicationResults',
  racepreparation: 'categories.racePreparation',
  stageplanreminders: 'categories.stagePlanReminders',
  raceweather: 'categories.raceWeather',
  raceresults: 'categories.raceResults',
  teamupdates: 'categories.teamUpdates',
  staffcontracts: 'categories.staffContracts',
  staffcourses: 'categories.staffCourses',
  transferupdates: 'categories.transferUpdates',
  trainingcamps: 'categories.trainingCamps',
  scoutingreports: 'categories.scoutingReports',
  retirementupdates: 'categories.retirementUpdates',
  financealerts: 'categories.financeAlerts',
  walletrewards: 'categories.walletRewards',
  competitionrewards: 'categories.competitionRewards',
  taxupdates: 'categories.taxUpdates',
  racesupplies: 'categories.raceSupplies',
  equipmentupdates: 'categories.equipmentUpdates',
  infrastructureupdates: 'categories.infrastructureUpdates',
  systemmessages: 'categories.systemMessages',
  other: 'categories.other',
}

function localizeCategory(value: string | null | undefined): string | null {
  if (!value) return null
  if (!isSerbian()) return value
  const normalized = value.replace(/[_-]+/g, '').replace(/\s+/g, '').toLowerCase()
  const key = CATEGORY_KEY_BY_NORMALIZED[normalized]
  return key ? nt(key) : null
}

function localizeTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode) return null
  if (!isSerbian()) return typeCode

  const tokens = String(typeCode)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)

  if (tokens.length === 0) return null

  const translated: string[] = []
  for (const token of tokens) {
    const key = `templateWords.${token}`
    const value = nt(key, { defaultValue: '' })
    if (!value || value === key) return null
    translated.push(value)
  }

  return translated.join(' ')
}

function getTopic(item: NotificationItem): string {
  return (
    localizeTypeCode(item.type_code) ||
    localizeCategory(item.preference_group) ||
    localizeCategory(item.source) ||
    nt('categories.other')
  )
}

function looksEnglish(value: string | null | undefined): boolean {
  const text = String(value ?? '').toLowerCase()
  if (!text) return false
  return /\b(the|your|you|has|have|is|are|was|were|will|can|could|should|joined|available|review|open|staff|rider|sponsor|race|stage|contract|offer|team|club|week|season|completed|required|selected|selection|transfer|warning|reward|results|report|new|for|from|with|without|this|that|as|to|of|and)\b/.test(text)
}

export function localizeNotificationItem(item: NotificationItem): NotificationItem {
  if (!isSerbian()) return item

  const payload = payloadOf(item)
  const typeCode = String(item.type_code ?? '').toUpperCase()
  const entity = getPrimaryEntity(item)

  if (typeCode === 'STAFF_HIRED') {
    const staffName =
      readString(payload, ['staff_name', 'staff_full_name', 'employee_name', 'name']) ||
      extractNameFromTitle(item.title) ||
      nt('templateLocalization.staffHired.staffFallback')
    const rawRole = readString(payload, [
      'role_label',
      'staff_role',
      'role',
      'role_type',
      'specialization',
    ])
    const role = localizeRole(rawRole) || nt('roles.staffAdvisor')

    return {
      ...item,
      title: nt('templateLocalization.staffHired.title', { name: staffName }),
      message: nt('templateLocalization.staffHired.message', { name: staffName, role }),
    }
  }

  if (typeCode === 'SPONSOR_SELECTION_REQUIRED') {
    const season = readNumber(payload, ['season_number', 'season'])
    return {
      ...item,
      title: nt('templateLocalization.sponsorSelectionRequired.title'),
      message: season !== null
        ? nt('templateLocalization.sponsorSelectionRequired.messageSeason', { season })
        : nt('templateLocalization.sponsorSelectionRequired.message'),
    }
  }

  // Preserve already-localized/non-English admin or backend copy. Otherwise do
  // not leak English template prose: show a localized, type-aware fallback.
  const topic = getTopic(item)
  const localizedTitle = item.title && !looksEnglish(item.title)
    ? item.title
    : nt('templateLocalization.genericTitle', { topic })
  const localizedMessage = item.message && !looksEnglish(item.message)
    ? item.message
    : entity
      ? nt('templateLocalization.genericEntityMessage', { topic, entity })
      : nt('templateLocalization.genericMessage', { topic })

  return {
    ...item,
    title: localizedTitle,
    message: localizedMessage,
  }
}

export function localizeNotificationNarrative(
  text: string | null | undefined,
  item?: NotificationItem
): string | null {
  if (!text) return null
  if (!isSerbian()) return text

  const value = text.trim()
  const payload = item ? payloadOf(item) : {}
  const typeCode = String(item?.type_code ?? '').toUpperCase()

  if (typeCode === 'STAFF_HIRED') {
    const staffName =
      readString(payload, ['staff_name', 'staff_full_name', 'employee_name', 'name']) ||
      (item ? extractNameFromTitle(item.title) : null) ||
      nt('templateLocalization.staffHired.staffFallback')
    const rawRole = readString(payload, [
      'role_label',
      'staff_role',
      'role',
      'role_type',
      'specialization',
    ])
    const role = localizeRole(rawRole) || nt('roles.staffAdvisor')

    if (/review this staff member/i.test(value)) {
      return nt('templateLocalization.staffHired.extra')
    }

    if (/joined your club/i.test(value)) {
      return nt('templateLocalization.staffHired.message', { name: staffName, role })
    }
  }

  if (typeCode === 'SPONSOR_SELECTION_REQUIRED') {
    const season = readNumber(payload, ['season_number', 'season'])
    return season !== null
      ? nt('templateLocalization.sponsorSelectionRequired.messageSeason', { season })
      : nt('templateLocalization.sponsorSelectionRequired.message')
  }

  if (!looksEnglish(value)) return value
  return nt('templateLocalization.moreDetails')
}

const DETAIL_LABEL_KEYS: Record<string, string> = {
  'staff member': 'templateLabels.staffMember',
  'role': 'templateLabels.role',
  'weekly wage': 'templateLabels.weeklyWage',
  'weekly salary': 'templateLabels.weeklySalary',
  'contract duration': 'templateLabels.contractDuration',
  'contract': 'templateLabels.contract',
  'duration': 'templateLabels.duration',
  'rider': 'common.rider',
  'country': 'common.country',
  'status': 'common.status',
  'date': 'common.date',
  'start': 'common.start',
  'stage': 'common.stage',
  'facility': 'templateLabels.facility',
  'new level': 'templateLabels.newLevel',
  'completed on': 'templateLabels.completedOn',
  'from club': 'templateLabels.fromClub',
  'to club': 'templateLabels.toClub',
  'offer value': 'templateLabels.offerValue',
  'expires': 'templateLabels.expires',
  'club': 'templateLabels.club',
  'signed for': 'templateLabels.signedFor',
  'new club': 'templateLabels.newClub',
  'previous club': 'templateLabels.previousClub',
  'transfer fee': 'templateLabels.transferFee',
  'signing bonus': 'templateLabels.signingBonus',
  'agent fee': 'templateLabels.agentFee',
  'sponsor': 'templateLabels.sponsor',
  'sponsor type': 'templateLabels.sponsorType',
  'guaranteed amount': 'templateLabels.guaranteedAmount',
  'bonus pool': 'templateLabels.bonusPool',
  'available offers': 'templateLabels.availableOffers',
  'contract length': 'templateLabels.contractLength',
  'race': 'templateLabels.race',
  'position': 'templateLabels.position',
  'reward': 'templateLabels.reward',
  'amount': 'templateLabels.amount',
  'reason': 'common.reason',
  'priority': 'common.priority',
  'equipment': 'mechanic.equipment',
  'category': 'mechanic.category',
  'condition': 'mechanic.condition',
  'last used': 'mechanic.lastUsed',
  'supply': 'mechanic.supply',
  'available': 'mechanic.available',
  'threshold': 'mechanic.threshold',
  'course': 'templateLabels.course',
  'new rating': 'templateLabels.newRating',
  'training camp': 'templateLabels.trainingCamp',
  'start date': 'templateLabels.startDate',
  'end date': 'templateLabels.endDate',
}

export function localizeNotificationDetailLabel(label: string): string {
  if (!isSerbian()) return label
  const key = DETAIL_LABEL_KEYS[normalizePhrase(label)]
  return key ? nt(key) : nt('common.detail')
}

export function localizeNotificationValue(value: string): string {
  if (!isSerbian()) return value
  const normalized = normalizePhrase(value)

  const role = localizeRole(value)
  if (role !== value) return role || value

  const valueKeyByNormalized: Record<string, string> = {
    available: 'templateValues.available',
    accepted: 'templateValues.accepted',
    declined: 'templateValues.declined',
    pending: 'templateValues.pending',
    completed: 'templateValues.completed',
    active: 'templateValues.active',
    inactive: 'templateValues.inactive',
    ready: 'templateValues.ready',
    open: 'templateValues.open',
    closed: 'templateValues.closed',
    yes: 'common.yes',
    no: 'common.no',
  }

  const key = valueKeyByNormalized[normalized]
  if (key) return nt(key)

  if (/\/week\b/i.test(value)) {
    return value.replace(/\/week\b/gi, `/${nt('templateLocalization.perWeek')}`)
  }

  return value
}

const ACTION_KEY_BY_LABEL: Record<string, string> = {
  'open': 'details.open',
  'mark as read': 'details.markRead',
  'open rider': 'details.openRider',
  'open squad': 'details.openSquad',
  'open staff': 'details.openStaff',
  'team page': 'details.teamPage',
  'open staff profile': 'details.openStaffProfile',
  'open staff page': 'details.openStaffPage',
  'races': 'details.races',
  'race': 'details.race',
  'race preparation': 'details.racePreparation',
  'open transfers': 'details.openTransfers',
  'open negotiation': 'details.openNegotiation',
  'review transfer': 'details.reviewTransfer',
  'check offer': 'details.checkOffer',
  'open free agents': 'details.openFreeAgents',
  'pro packages': 'details.proPackages',
  'open sponsors': 'details.openSponsors',
  'race supplies': 'details.raceSupplies',
  'open stage': 'details.openStage',
  'open race': 'details.openRace',
  'open equipment': 'details.openEquipment',
  'open infrastructure': 'details.openInfrastructure',
  'open finance': 'details.openFinance',
  'open scouting': 'details.openScouting',
  'review sponsor offers': 'details.reviewSponsorOffers',
  'sponsors': 'details.sponsors',
  'team': 'details.team',
  'view results': 'details.viewResults',
}

export function localizeNotificationActionLabel(label: string): string {
  if (!isSerbian()) return label
  const normalized = normalizePhrase(label)
  const key = ACTION_KEY_BY_LABEL[normalized]
  if (key) return nt(key)
  if (normalized.startsWith('open ')) return nt('details.open')
  if (normalized.startsWith('review ') || normalized.startsWith('check ')) {
    return nt('details.review')
  }
  return nt('details.open')
}

export function localizeNotificationExtraText(
  text: string | null | undefined,
  item?: NotificationItem
): string | null {
  if (!text) return null
  if (!isSerbian()) return text
  const localized = localizeNotificationNarrative(text, item)
  if (localized === nt('templateLocalization.moreDetails')) return null
  return localized
}
''')


# ---------------------------------------------------------------------------
# Patch notificationTemplates.tsx so all template output passes through the
# central localization layer. English remains unchanged.
# ---------------------------------------------------------------------------
templates_path = 'src/features/notifications/notificationTemplates.tsx'
replace(
    templates_path,
    "import type { NotificationItem } from './notificationHelpers'",
    "import type { NotificationItem } from './notificationHelpers'\nimport {\n  localizeNotificationActionLabel,\n  localizeNotificationDetailLabel,\n  localizeNotificationExtraText,\n  localizeNotificationItem,\n  localizeNotificationNarrative,\n  localizeNotificationValue,\n} from './notificationLocalization'",
)

regex_replace(
    templates_path,
    r"export function applyNotificationTemplate\(item: NotificationItem\): NotificationItem \{[\s\S]*?\n\}\n\n/\*\*\n \* applyNotificationTemplates",
    """export function applyNotificationTemplate(item: NotificationItem): NotificationItem {
  const template = getNotificationTemplate(item.type_code)
  if (!template) return localizeNotificationItem(item)

  const enriched = template.enrich ? template.enrich(item) : item
  const normalized: NotificationItem = {
    ...enriched,
    title: enriched.title || template.defaultTitle || enriched.title,
    message: enriched.message || template.defaultMessage || enriched.message,
  }

  return localizeNotificationItem(normalized)
}

/**
 * applyNotificationTemplates""",
    count=1,
)

regex_replace(
    templates_path,
    r"export function getNotificationIntroText\(item: NotificationItem\): string \| null \{[\s\S]*?\n\}",
    """export function getNotificationIntroText(item: NotificationItem): string | null {
  const template = getNotificationTemplate(item.type_code)
  const raw = template?.getIntroText?.(item) || buildIntroFromMessage(item)
  return localizeNotificationNarrative(raw, item)
}""",
    count=1,
)

regex_replace(
    templates_path,
    r"export function getNotificationDetailRows\(\n  item: NotificationItem\n\): NotificationDetailRow\[\] \{[\s\S]*?\n\}",
    """export function getNotificationDetailRows(
  item: NotificationItem
): NotificationDetailRow[] {
  const template = getNotificationTemplate(item.type_code)
  const rows = template?.getDetailRows?.(item) || []
  return rows.map(row => ({
    label: localizeNotificationDetailLabel(row.label),
    value: localizeNotificationValue(row.value),
  }))
}""",
    count=1,
)

regex_replace(
    templates_path,
    r"export function getNotificationExtraText\(item: NotificationItem\): string \| null \{[\s\S]*?\n\}",
    """export function getNotificationExtraText(item: NotificationItem): string | null {
  const template = getNotificationTemplate(item.type_code)
  return localizeNotificationExtraText(template?.getExtraText?.(item) || null, item)
}""",
    count=1,
)

# Insert action localization before the final filter result is returned.
old_actions_header = """export function getNotificationActions(
  item: NotificationItem
): NotificationActionTemplate[] {
  const template = getNotificationTemplate(item.type_code)
  const actions = template?.actions || [GENERIC_OPEN_ACTION, MARK_READ_ACTION]

  return actions.filter((action) => {"""
new_actions_header = """export function getNotificationActions(
  item: NotificationItem
): NotificationActionTemplate[] {
  const template = getNotificationTemplate(item.type_code)
  const actions = (template?.actions || [GENERIC_OPEN_ACTION, MARK_READ_ACTION]).map(action => ({
    ...action,
    label: localizeNotificationActionLabel(action.label),
  }))

  return actions.filter((action) => {"""
replace(templates_path, old_actions_header, new_actions_header)


# ---------------------------------------------------------------------------
# Notification page: source label, relative time, pagination interpolation and
# known action labels from advisor/backend payloads.
# ---------------------------------------------------------------------------
page_path = 'src/pages/dashboard/NotificationsPage.tsx'
replace(
    page_path,
    "        'Mark as read': 'details.markRead',\n",
    """        'Mark as read': 'details.markRead',
        'Open staff': 'details.openStaff',
        'Team page': 'details.teamPage',
        'Open staff profile': 'details.openStaffProfile',
        'Open staff page': 'details.openStaffPage',
        'Open transfers': 'details.openTransfers',
        'Open negotiation': 'details.openNegotiation',
        'Review transfer': 'details.reviewTransfer',
        'Check offer': 'details.checkOffer',
        'Open free agents': 'details.openFreeAgents',
        'Pro Packages': 'details.proPackages',
        'Open sponsors': 'details.openSponsors',
        'Race supplies': 'details.raceSupplies',
        'Open stage': 'details.openStage',
        'Open race': 'details.openRace',
        'Open equipment': 'details.openEquipment',
        'Open infrastructure': 'details.openInfrastructure',
        'Open finance': 'details.openFinance',
        'Open scouting': 'details.openScouting',
        'Review sponsor offers': 'details.reviewSponsorOffers',
        Sponsors: 'details.sponsors',
        Team: 'details.team',
        'View results': 'details.viewResults',
""",
    count=1,
)
replace(
    page_path,
    'formatNotificationTime(item.notification_created_at)',
    "formatNotificationTime(item.notification_created_at, { t, locale: i18n.resolvedLanguage ?? i18n.language })",
    required=True,
)
replace(
    page_path,
    '<span className="capitalize">{item.source}</span>',
    "<span>{item.source === 'game' ? t('categories.game') : item.source === 'admin' ? t('categories.admin') : item.source === 'system' ? t('categories.system') : item.source}</span>",
    required=True,
)
replace(
    page_path,
    "{t('summary.page', { page: safeActivePage, totalPages })}",
    "{t('summary.page', { page: safeActivePage, total: totalPages })}",
    required=True,
)

# Add all preference-group categories so labels such as Teamupdates and
# Financealerts never fall back to raw English/camel-case values.
old_category_block = """    scouting: 'categories.scouting',
    other: 'categories.other',"""
new_category_block = """    scouting: 'categories.scouting',
    raceinvitations: 'categories.raceInvitations',
    raceapplicationresults: 'categories.raceApplicationResults',
    racepreparation: 'categories.racePreparation',
    stageplanreminders: 'categories.stagePlanReminders',
    raceweather: 'categories.raceWeather',
    raceresults: 'categories.raceResults',
    teamupdates: 'categories.teamUpdates',
    staffcontracts: 'categories.staffContracts',
    staffcourses: 'categories.staffCourses',
    transferupdates: 'categories.transferUpdates',
    trainingcamps: 'categories.trainingCamps',
    scoutingreports: 'categories.scoutingReports',
    retirementupdates: 'categories.retirementUpdates',
    financealerts: 'categories.financeAlerts',
    walletrewards: 'categories.walletRewards',
    competitionrewards: 'categories.competitionRewards',
    taxupdates: 'categories.taxUpdates',
    racesupplies: 'categories.raceSupplies',
    equipmentupdates: 'categories.equipmentUpdates',
    infrastructureupdates: 'categories.infrastructureUpdates',
    systemmessages: 'categories.systemMessages',
    other: 'categories.other',"""
replace(page_path, old_category_block, new_category_block, count=1)


# ---------------------------------------------------------------------------
# Legacy notification helper: localize its action labels and suppress old
# hardcoded-English expanded JSX when Serbian is selected. The modern template
# renderer remains the detailed Serbian view.
# ---------------------------------------------------------------------------
helpers_path = 'src/features/notifications/notificationHelpers.tsx'
replace(
    helpers_path,
    "import type { TFunction } from 'i18next'",
    "import type { TFunction } from 'i18next'\nimport {\n  isSerbianNotificationLocale,\n  localizeNotificationActionLabel,\n} from './notificationLocalization'",
)

helpers_text = read(helpers_path)
start = helpers_text.find('export function getNotificationActionLabel(item: NotificationItem): string {')
end_marker = '\n}\n\n/**\n * getResolvedNotificationActionUrl'
end = helpers_text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Could not locate getNotificationActionLabel function')
block = helpers_text[start:end + 2]
block = block.replace('export function getNotificationActionLabel', 'function getNotificationActionLabelRaw', 1)
wrapper = block + "\n\nexport function getNotificationActionLabel(item: NotificationItem): string {\n  return localizeNotificationActionLabel(getNotificationActionLabelRaw(item))\n}"
helpers_text = helpers_text[:start] + wrapper + helpers_text[end + 2:]
write(helpers_path, helpers_text)

replace(
    helpers_path,
    "export function renderExpandedNotificationText(\n  item: NotificationItem\n): JSX.Element | null {\n  const payload = item.payload_json ?? {}",
    "export function renderExpandedNotificationText(\n  item: NotificationItem\n): JSX.Element | null {\n  if (isSerbianNotificationLocale()) return null\n\n  const payload = item.payload_json ?? {}",
)


# ---------------------------------------------------------------------------
# My Profile: account-persisted game language selector.
# preferred_language already exists in the live profiles table/migration.
# ---------------------------------------------------------------------------
profile_path = 'src/pages/MyProfile.tsx'
replace(
    profile_path,
    "import { supabase } from '../lib/supabase'",
    """import { supabase } from '../lib/supabase'
import { changeApplicationLanguage, getApplicationLanguage } from '../i18n'
import {
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  type SupportedLanguage,
} from '../i18n/languages'""",
)
replace(
    profile_path,
    "  country: string | null\n  birthday_month: number | null",
    "  country: string | null\n  preferred_language: string | null\n  birthday_month: number | null",
)
replace(
    profile_path,
    "  const [sendingPasswordReset, setSendingPasswordReset] = useState(false)",
    "  const [sendingPasswordReset, setSendingPasswordReset] = useState(false)\n  const [savingLanguage, setSavingLanguage] = useState(false)",
)
replace(
    profile_path,
    "  const locale = i18n.resolvedLanguage ?? i18n.language\n",
    """  const locale = i18n.resolvedLanguage ?? i18n.language
  const currentLanguage: SupportedLanguage = isSupportedLanguage(locale)
    ? locale
    : getApplicationLanguage()
""",
)
# Add preferred_language to both profile SELECT lists.
replace(
    profile_path,
    "          country,\n          birthday_month,",
    "          country,\n          preferred_language,\n          birthday_month,",
    required=True,
)
replace(
    profile_path,
    "        country: form.country.trim() || null,\n      }",
    "        country: form.country.trim() || null,\n        preferred_language: profile?.preferred_language && isSupportedLanguage(profile.preferred_language)\n          ? profile.preferred_language\n          : currentLanguage,\n      }",
    count=1,
)

language_handler = r'''
  async function handleLanguageChange(language: SupportedLanguage) {
    if (!user?.id || savingLanguage || language === currentLanguage) return

    setSavingLanguage(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_language: language })
        .eq('id', user.id)

      if (error) throw error

      await changeApplicationLanguage(language)
      setProfile(prev => prev ? { ...prev, preferred_language: language } : prev)

      const languageDefinition = SUPPORTED_LANGUAGES.find(option => option.code === language)
      setSuccessMessage(
        i18n.t('profile.languageSaved', {
          ns: 'accountPages',
          language: languageDefinition?.label ?? language,
        }),
      )
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Profile language update error:', err)
      setErrorMessage(t('profile.languageSaveFailed'))
    } finally {
      setSavingLanguage(false)
    }
  }

'''
replace(
    profile_path,
    "  async function handleSendPasswordReset(e: React.FormEvent) {",
    language_handler + "  async function handleSendPasswordReset(e: React.FormEvent) {",
    count=1,
)

language_box = r'''
        <div className="mt-6 border border-gray-200 rounded p-4">
          <h3 className="text-base font-semibold">{t('profile.languageTitle')}</h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('profile.languageDescription')}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            {SUPPORTED_LANGUAGES.map(language => {
              const active = currentLanguage === language.code

              return (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => void handleLanguageChange(language.code)}
                  disabled={savingLanguage || active}
                  aria-pressed={active}
                  className={[
                    'inline-flex min-w-[150px] items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition',
                    active
                      ? 'border-yellow-400 bg-yellow-50 text-gray-950 ring-1 ring-yellow-300'
                      : 'border-gray-300 bg-white text-gray-800 hover:border-yellow-300 hover:bg-yellow-50',
                    savingLanguage ? 'cursor-wait opacity-70' : '',
                  ].join(' ')}
                >
                  <span className="text-xl" aria-hidden="true">{language.flag}</span>
                  <span>{language.label}</span>
                  {active ? (
                    <span className="ml-auto text-xs font-medium text-green-700">
                      {t('profile.languageActive')}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            {savingLanguage ? t('profile.languageSaving') : t('profile.languageAccountHelp')}
          </div>
        </div>

'''
replace(
    profile_path,
    "        <form onSubmit={handleSendPasswordReset} className=\"mt-6 space-y-6\">",
    language_box + "        <form onSubmit={handleSendPasswordReset} className=\"mt-6 space-y-6\">",
    count=1,
)


# ---------------------------------------------------------------------------
# AuthProvider: when an authenticated user is established, load their saved
# preferred language from profiles. This makes language account-specific across
# devices/logins while localStorage remains the public/signed-out fallback.
# ---------------------------------------------------------------------------
auth_path = 'src/context/AuthProvider.tsx'
replace(
    auth_path,
    "import { supabase } from '../lib/supabase'",
    """import { supabase } from '../lib/supabase'
import { changeApplicationLanguage, getApplicationLanguage } from '../i18n'
import { isSupportedLanguage } from '../i18n/languages'""",
)
replace(
    auth_path,
    "  const [loading, setLoading] = useState<boolean>(true)\n",
    """  const [loading, setLoading] = useState<boolean>(true)

  async function applyPreferredLanguage(userId: string | null | undefined) {
    if (!userId) return

    const { data, error } = await supabase
      .from('profiles')
      .select('preferred_language')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      // Language preference is non-blocking for authentication.
      // eslint-disable-next-line no-console
      console.warn('Could not load preferred language:', error.message)
      return
    }

    const preferredLanguage = data?.preferred_language
    if (
      isSupportedLanguage(preferredLanguage) &&
      preferredLanguage !== getApplicationLanguage()
    ) {
      await changeApplicationLanguage(preferredLanguage)
    }
  }
""",
    count=1,
)
replace(
    auth_path,
    "    setUser(data.user ?? null)\n  }",
    "    setUser(data.user ?? null)\n    await applyPreferredLanguage(data.user?.id)\n  }",
    count=1,
)
replace(
    auth_path,
    "      setUser(data.user ?? null)\n      setLoading(false)",
    "      setUser(data.user ?? null)\n      await applyPreferredLanguage(data.user?.id)\n      if (!mounted) return\n      setLoading(false)",
    count=1,
)
replace(
    auth_path,
    "      setUser(session?.user ?? null)\n    })",
    "      setUser(session?.user ?? null)\n      void applyPreferredLanguage(session?.user?.id)\n    })",
    count=1,
)


# ---------------------------------------------------------------------------
# i18n resources: profile language box + complete notification categories,
# action labels and central localization vocabulary.
# ---------------------------------------------------------------------------
account_en_path = 'src/i18n/locales/en/accountPages.json'
account_sr_path = 'src/i18n/locales/sr-Latn/accountPages.json'
account_en = load_json(account_en_path)
account_sr = load_json(account_sr_path)
account_en['profile'].update({
    'languageTitle': 'Game language',
    'languageDescription': 'Choose the language used by the game interface and notifications for this account.',
    'languageActive': 'Active',
    'languageSaving': 'Saving language...',
    'languageAccountHelp': 'This preference is saved to your account and will be used on your other devices and future sign-ins.',
    'languageSaved': 'Game language changed to {{language}}.',
    'languageSaveFailed': 'The game language could not be saved. Please try again.',
})
account_sr['profile'].update({
    'languageTitle': 'Jezik igre',
    'languageDescription': 'Izaberite jezik interfejsa igre i obaveštenja za ovaj nalog.',
    'languageActive': 'Aktivan',
    'languageSaving': 'Čuvanje jezika...',
    'languageAccountHelp': 'Ovo podešavanje se čuva na vašem nalogu i koristiće se na drugim uređajima i pri budućim prijavama.',
    'languageSaved': 'Jezik igre je promenjen na {{language}}.',
    'languageSaveFailed': 'Jezik igre nije mogao da se sačuva. Pokušajte ponovo.',
})
save_json(account_en_path, account_en)
save_json(account_sr_path, account_sr)

notifications_en_path = 'src/i18n/locales/en/notifications.json'
notifications_sr_path = 'src/i18n/locales/sr-Latn/notifications.json'
notifications_en = load_json(notifications_en_path)
notifications_sr = load_json(notifications_sr_path)

category_pairs = {
    'raceInvitations': ('Race invitations', 'Pozivi za trke'),
    'raceApplicationResults': ('Race application results', 'Rezultati prijava za trke'),
    'racePreparation': ('Race preparation', 'Priprema trke'),
    'stagePlanReminders': ('Stage plan reminders', 'Podsetnici za plan etape'),
    'raceWeather': ('Race weather', 'Vreme na trci'),
    'raceResults': ('Race results', 'Rezultati trke'),
    'teamUpdates': ('Team updates', 'Ažuriranja tima'),
    'staffContracts': ('Staff contracts', 'Ugovori osoblja'),
    'staffCourses': ('Staff courses', 'Kursevi osoblja'),
    'transferUpdates': ('Transfer updates', 'Ažuriranja transfera'),
    'trainingCamps': ('Training camps', 'Trening kampovi'),
    'scoutingReports': ('Scouting reports', 'Skautski izveštaji'),
    'retirementUpdates': ('Retirement updates', 'Ažuriranja o penzionisanju'),
    'financeAlerts': ('Finance alerts', 'Finansijska upozorenja'),
    'walletRewards': ('Coins & rewards', 'Novčići i nagrade'),
    'competitionRewards': ('Competition rewards', 'Nagrade takmičenja'),
    'taxUpdates': ('Tax updates', 'Poreska ažuriranja'),
    'raceSupplies': ('Race supplies', 'Zalihe za trku'),
    'equipmentUpdates': ('Equipment updates', 'Ažuriranja opreme'),
    'infrastructureUpdates': ('Infrastructure updates', 'Ažuriranja infrastrukture'),
    'systemMessages': ('System messages', 'Sistemske poruke'),
}
for key, (en_value, sr_value) in category_pairs.items():
    notifications_en['categories'][key] = en_value
    notifications_sr['categories'][key] = sr_value

notifications_en['details'].update({
    'openStaff': 'Open staff',
    'teamPage': 'Team page',
    'openStaffProfile': 'Open staff profile',
    'openStaffPage': 'Open staff page',
    'openTransfers': 'Open transfers',
    'openNegotiation': 'Open negotiation',
    'reviewTransfer': 'Review transfer',
    'checkOffer': 'Check offer',
    'openFreeAgents': 'Open free agents',
    'proPackages': 'Pro Packages',
    'openSponsors': 'Open sponsors',
    'raceSupplies': 'Race supplies',
    'openStage': 'Open stage',
    'openRace': 'Open race',
    'openEquipment': 'Open equipment',
    'openInfrastructure': 'Open infrastructure',
    'openFinance': 'Open finance',
    'openScouting': 'Open scouting',
    'reviewSponsorOffers': 'Review sponsor offers',
    'sponsors': 'Sponsors',
    'team': 'Team',
    'viewResults': 'View results',
    'review': 'Review',
})
notifications_sr['details'].update({
    'openStaff': 'Otvori osoblje',
    'teamPage': 'Stranica tima',
    'openStaffProfile': 'Otvori profil člana osoblja',
    'openStaffPage': 'Otvori stranicu osoblja',
    'openTransfers': 'Otvori transfere',
    'openNegotiation': 'Otvori pregovore',
    'reviewTransfer': 'Pregledaj transfer',
    'checkOffer': 'Pregledaj ponudu',
    'openFreeAgents': 'Otvori slobodne vozače',
    'proPackages': 'Pro paketi',
    'openSponsors': 'Otvori sponzore',
    'raceSupplies': 'Zalihe za trku',
    'openStage': 'Otvori etapu',
    'openRace': 'Otvori trku',
    'openEquipment': 'Otvori opremu',
    'openInfrastructure': 'Otvori infrastrukturu',
    'openFinance': 'Otvori finansije',
    'openScouting': 'Otvori skauting',
    'reviewSponsorOffers': 'Pregledaj ponude sponzora',
    'sponsors': 'Sponzori',
    'team': 'Tim',
    'viewResults': 'Pogledaj rezultate',
    'review': 'Pregledaj',
})

notifications_en['roles'].update({
    'scoutAnalyst': 'Scout Analyst',
    'mechanic': 'Mechanic',
})
notifications_sr['roles'].update({
    'scoutAnalyst': 'Skaut analitičar',
    'mechanic': 'Mehaničar',
})

extra_labels = {
    'staffMember': ('Staff member', 'Član osoblja'),
    'role': ('Role', 'Uloga'),
    'weeklyWage': ('Weekly wage', 'Nedeljna plata'),
    'contractDuration': ('Contract duration', 'Trajanje ugovora'),
    'sponsor': ('Sponsor', 'Sponzor'),
    'sponsorType': ('Sponsor type', 'Tip sponzora'),
    'guaranteedAmount': ('Guaranteed amount', 'Garantovani iznos'),
    'bonusPool': ('Bonus pool', 'Fond bonusa'),
    'availableOffers': ('Available offers', 'Dostupne ponude'),
    'contractLength': ('Contract length', 'Trajanje ugovora'),
    'race': ('Race', 'Trka'),
    'position': ('Position', 'Pozicija'),
    'reward': ('Reward', 'Nagrada'),
    'amount': ('Amount', 'Iznos'),
    'course': ('Course', 'Kurs'),
    'newRating': ('New rating', 'Nova ocena'),
    'trainingCamp': ('Training camp', 'Trening kamp'),
    'startDate': ('Start date', 'Datum početka'),
    'endDate': ('End date', 'Datum završetka'),
}
for key, (en_value, sr_value) in extra_labels.items():
    notifications_en['templateLabels'][key] = en_value
    notifications_sr['templateLabels'][key] = sr_value

notifications_en['templateLocalization'] = {
    'genericTitle': 'Notification: {{topic}}',
    'genericMessage': 'A new {{topic}} notification is available for your club.',
    'genericEntityMessage': '{{entity}}: a new {{topic}} notification is available.',
    'moreDetails': 'Open the notification details for more information.',
    'perWeek': 'week',
    'staffHired': {
        'title': 'Staff hired: {{name}}',
        'message': '{{name}} has joined your club as {{role}}.',
        'extra': 'You can review this staff member from your staff or team management area.',
        'staffFallback': 'Staff member',
    },
    'sponsorSelectionRequired': {
        'title': 'Sponsor selection required',
        'message': 'Sponsor offers are ready for review.',
        'messageSeason': 'Sponsor offers for Season {{season}} are ready for review.',
    },
}
notifications_sr['templateLocalization'] = {
    'genericTitle': 'Obaveštenje: {{topic}}',
    'genericMessage': 'Novo obaveštenje „{{topic}}“ je dostupno za vaš klub.',
    'genericEntityMessage': '{{entity}}: dostupno je novo obaveštenje „{{topic}}“.',
    'moreDetails': 'Otvorite detalje obaveštenja za više informacija.',
    'perWeek': 'nedeljno',
    'staffHired': {
        'title': 'Angažovan član osoblja: {{name}}',
        'message': '{{name}} se pridružio vašem klubu kao {{role}}.',
        'extra': 'Ovog člana osoblja možete pregledati na stranici Osoblje ili u upravljanju timom.',
        'staffFallback': 'Član osoblja',
    },
    'sponsorSelectionRequired': {
        'title': 'Potreban izbor sponzora',
        'message': 'Ponude sponzora su spremne za pregled.',
        'messageSeason': 'Ponude sponzora za sezonu {{season}} spremne su za pregled.',
    },
}

notifications_en['templateValues'] = {
    'available': 'Available',
    'accepted': 'Accepted',
    'declined': 'Declined',
    'pending': 'Pending',
    'completed': 'Completed',
    'active': 'Active',
    'inactive': 'Inactive',
    'ready': 'Ready',
    'open': 'Open',
    'closed': 'Closed',
}
notifications_sr['templateValues'] = {
    'available': 'Dostupno',
    'accepted': 'Prihvaćeno',
    'declined': 'Odbijeno',
    'pending': 'Na čekanju',
    'completed': 'Završeno',
    'active': 'Aktivno',
    'inactive': 'Neaktivno',
    'ready': 'Spremno',
    'open': 'Otvoreno',
    'closed': 'Zatvoreno',
}

word_translations = {
    'ADVISOR': ('Advisor', 'Savetnik'),
    'ADMIN': ('Admin', 'Administracija'),
    'MESSAGE': ('Message', 'Poruka'),
    'RIDER': ('Rider', 'Vozač'),
    'STAFF': ('Staff', 'Osoblje'),
    'CONTRACT': ('Contract', 'Ugovor'),
    'CONTRACTS': ('Contracts', 'Ugovori'),
    'EXPIRING': ('Expiring', 'Ističe'),
    'EXPIRED': ('Expired', 'Istekao'),
    'HIRED': ('Hired', 'Angažovan'),
    'FIRED': ('Fired', 'Otpušten'),
    'COURSE': ('Course', 'Kurs'),
    'COMPLETED': ('Completed', 'Završen'),
    'SPONSOR': ('Sponsor', 'Sponzor'),
    'SELECTION': ('Selection', 'Izbor'),
    'REQUIRED': ('Required', 'Potreban'),
    'DEAL': ('Deal', 'Ugovor'),
    'SIGNED': ('Signed', 'Potpisan'),
    'OBJECTIVE': ('Objective', 'Cilj'),
    'ACHIEVED': ('Achieved', 'Ostvaren'),
    'FAILED': ('Failed', 'Neuspešan'),
    'OFFER': ('Offer', 'Ponuda'),
    'OFFERS': ('Offers', 'Ponude'),
    'TRANSFER': ('Transfer', 'Transfer'),
    'RECEIVED': ('Received', 'Primljena'),
    'ACCEPTED': ('Accepted', 'Prihvaćena'),
    'REJECTED': ('Rejected', 'Odbijena'),
    'NEGOTIATION': ('Negotiation', 'Pregovori'),
    'OPENED': ('Opened', 'Otvoreno'),
    'FREE': ('Free', 'Slobodan'),
    'AGENT': ('Agent', 'Vozač bez ugovora'),
    'RELEASED': ('Released', 'Otpušten'),
    'RETIREMENT': ('Retirement', 'Penzionisanje'),
    'ANNOUNCED': ('Announced', 'Najavljeno'),
    'SEASON': ('Season', 'Sezona'),
    'RETIREMENTS': ('Retirements', 'Penzionisanja'),
    'CONFIRMED': ('Confirmed', 'Potvrđena'),
    'RACE': ('Race', 'Trka'),
    'RACES': ('Races', 'Trke'),
    'APPLICATION': ('Application', 'Prijava'),
    'PLAN': ('Plan', 'Plan'),
    'PLANS': ('Plans', 'Planovi'),
    'STAGE': ('Stage', 'Etapa'),
    'STARTLIST': ('Startlist', 'Startna lista'),
    'MISSING': ('Missing', 'Nedostaje'),
    'LOCK': ('Lock', 'Zaključavanje'),
    'LOCKED': ('Locked', 'Zaključano'),
    'WEATHER': ('Weather', 'Vreme'),
    'CANCELLED': ('Cancelled', 'Otkazano'),
    'CANCELED': ('Canceled', 'Otkazano'),
    'RESULTS': ('Results', 'Rezultati'),
    'SUMMARY': ('Summary', 'Pregled'),
    'SUPPLIES': ('Supplies', 'Zalihe'),
    'LOW': ('Low', 'Niske'),
    'STOCK': ('Stock', 'Zalihe'),
    'TRAINING': ('Training', 'Trening'),
    'CAMP': ('Camp', 'Kamp'),
    'SCOUT': ('Scout', 'Skaut'),
    'REPORT': ('Report', 'Izveštaj'),
    'EQUIPMENT': ('Equipment', 'Oprema'),
    'INFRASTRUCTURE': ('Infrastructure', 'Infrastruktura'),
    'REPAIR': ('Repair', 'Popravka'),
    'DELIVERY': ('Delivery', 'Isporuka'),
    'DELIVERED': ('Delivered', 'Isporučeno'),
    'UPGRADE': ('Upgrade', 'Nadogradnja'),
    'FINANCE': ('Finance', 'Finansije'),
    'COINS': ('Coins', 'Novčići'),
    'COIN': ('Coin', 'Novčić'),
    'WARNING': ('Warning', 'Upozorenje'),
    'WALLET': ('Wallet', 'Novčanik'),
    'REWARD': ('Reward', 'Nagrada'),
    'GRANTED': ('Granted', 'Dodeljena'),
    'COMPETITION': ('Competition', 'Takmičenje'),
    'BIRTHDAY': ('Birthday', 'Rođendan'),
    'GIFT': ('Gift', 'Poklon'),
    'PURCHASE': ('Purchase', 'Kupovina'),
    'REFERRAL': ('Referral', 'Preporuka'),
    'TAX': ('Tax', 'Porez'),
    'AUDIT': ('Audit', 'Provera'),
    'PAYROLL': ('Payroll', 'Plate'),
    'INSOLVENCY': ('Insolvency', 'Nesolventnost'),
    'MAIN': ('Main', 'Glavni'),
    'TEAM': ('Team', 'Tim'),
    'UPDATE': ('Update', 'Ažuriranje'),
    'UPDATES': ('Updates', 'Ažuriranja'),
    'NEW': ('New', 'Novo'),
    'STARTED': ('Started', 'Počelo'),
    'ENDED': ('Ended', 'Završeno'),
    'FINALIZED': ('Finalized', 'Finalizovano'),
    'FINALISED': ('Finalised', 'Finalizovano'),
    'ATTENTION': ('Attention', 'Pažnja'),
    'READY': ('Ready', 'Spremno'),
    'NEEDS': ('Needs', 'Zahteva'),
    'OPEN': ('Open', 'Otvoreno'),
    'REMINDER': ('Reminder', 'Podsetnik'),
    'MISSED': ('Missed', 'Propušteno'),
    'PENALTY': ('Penalty', 'Kazna'),
    'HEALTH': ('Health', 'Zdravlje'),
    'INJURY': ('Injury', 'Povreda'),
    'SICKNESS': ('Sickness', 'Bolest'),
    'MORALE': ('Morale', 'Moral'),
    'HAPPY': ('Happy', 'Zadovoljan'),
    'UNHAPPY': ('Unhappy', 'Nezadovoljan'),
    'REQUESTS': ('Requests', 'Traži'),
    'WANTS': ('Wants', 'Želi'),
    'MORE': ('More', 'Više'),
    'PROGRAMME': ('Programme', 'Program'),
    'PREPARATION': ('Preparation', 'Priprema'),
    'DAILY': ('Daily', 'Dnevni'),
    'BONUS': ('Bonus', 'Bonus'),
    'POINTS': ('Points', 'Bodovi'),
    'CLASSIFICATION': ('Classification', 'Klasifikacija'),
    'INVITATION': ('Invitation', 'Poziv'),
    'INVITED': ('Invited', 'Pozvan'),
}
notifications_en['templateWords'] = {key: pair[0] for key, pair in word_translations.items()}
notifications_sr['templateWords'] = {key: pair[1] for key, pair in word_translations.items()}

save_json(notifications_en_path, notifications_en)
save_json(notifications_sr_path, notifications_sr)


# ---------------------------------------------------------------------------
# Verification guards before build.
# ---------------------------------------------------------------------------
profile_text = read(profile_path)
if "preferred_language" not in profile_text or "Jezik igre" in profile_text:
    # The TSX should use i18n keys, not hardcoded Serbian.
    if "preferred_language" not in profile_text:
        raise SystemExit('Profile language persistence patch is missing')
    if "Jezik igre" in profile_text:
        raise SystemExit('Hardcoded Serbian leaked into MyProfile.tsx')

template_text = read(templates_path)
for required_symbol in [
    'localizeNotificationItem',
    'localizeNotificationNarrative',
    'localizeNotificationDetailLabel',
    'localizeNotificationActionLabel',
]:
    if required_symbol not in template_text:
        raise SystemExit(f'Missing notification localization hook: {required_symbol}')

print('Notification + account language localization pass applied successfully.')
