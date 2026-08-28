import i18n from '@/i18n'
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
