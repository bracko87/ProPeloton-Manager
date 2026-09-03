import i18n from '@/i18n'
import type { NotificationItem } from './notificationHelpers'

function shouldLocalizeNotifications(): boolean {
  const language = String(i18n.resolvedLanguage ?? i18n.language ?? 'en').toLowerCase()
  return language !== 'en' && !language.startsWith('en-')
}

// Kept for backwards compatibility with notificationHelpers. The helper uses
// this as a switch for whether hardcoded English expanded copy should render.
export function isSerbianNotificationLocale(): boolean {
  return shouldLocalizeNotifications()
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
    'riderName',
    'staff_full_name',
    'staff_name',
    'staffName',
    'employee_name',
    'company_name',
    'companyName',
    'sponsor_name',
    'sponsorName',
    'race_name',
    'raceName',
    'stage_name',
    'stageName',
    'facility_name',
    'facilityName',
    'asset_name',
    'assetName',
    'club_name',
    'clubName',
    'team_name',
    'teamName',
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

type SeasonStartedContext = {
  season: number | null
  earlyEndDay: number
  lateStartDay: number
  earlyApplicationCloseDays: number
  earlyTeamListDays: number
  earlyStartlistHours: number
  lateJanuaryApplicationCloseDays: number
  lateJanuaryStartlistDays: number
  standardApplicationOpenDays: number
  standardApplicationCloseDays: number
  standardStartlistDays: number
}

function getSeasonStartedContext(item: NotificationItem): SeasonStartedContext {
  const payload = payloadOf(item)
  const earlyEndDay = readNumber(payload, ['early_january_end_day']) ?? 15

  return {
    season: readNumber(payload, ['season_number', 'season', 'target_season', 'new_season_number', 'current_season']),
    earlyEndDay,
    lateStartDay: earlyEndDay + 1,
    earlyApplicationCloseDays:
      readNumber(payload, ['early_january_applications_close_days_before']) ?? 1,
    earlyTeamListDays:
      readNumber(payload, ['early_january_team_list_days_before']) ?? 1,
    earlyStartlistHours:
      readNumber(payload, ['early_january_startlist_hours_before_stage1']) ?? 3,
    lateJanuaryApplicationCloseDays:
      readNumber(payload, ['january_late_applications_close_days_before']) ?? 7,
    lateJanuaryStartlistDays:
      readNumber(payload, ['january_late_startlist_days_before']) ?? 3,
    standardApplicationOpenDays:
      readNumber(payload, ['standard_applications_open_days_before']) ?? 60,
    standardApplicationCloseDays:
      readNumber(payload, ['standard_applications_close_days_before']) ?? 30,
    standardStartlistDays:
      readNumber(payload, ['standard_startlist_days_before']) ?? 3,
  }
}

function seasonStartedUnit(
  unit: 'gameDay' | 'gameHour' | 'day',
  count: number
): string {
  return nt(`seasonStarted.units.${unit}`, { count })
}

function getSeasonStartedTranslationParams(item: NotificationItem): Record<string, unknown> {
  const context = getSeasonStartedContext(item)
  return {
    ...context,
    earlyApplicationCloseUnit: seasonStartedUnit('gameDay', context.earlyApplicationCloseDays),
    earlyTeamListUnit: seasonStartedUnit('gameDay', context.earlyTeamListDays),
    earlyStartlistHourUnit: seasonStartedUnit('gameHour', context.earlyStartlistHours),
    lateJanuaryApplicationCloseUnit: seasonStartedUnit('day', context.lateJanuaryApplicationCloseDays),
    lateJanuaryStartlistUnit: seasonStartedUnit('day', context.lateJanuaryStartlistDays),
    standardApplicationOpenUnit: seasonStartedUnit('day', context.standardApplicationOpenDays),
    standardApplicationCloseUnit: seasonStartedUnit('day', context.standardApplicationCloseDays),
    standardStartlistUnit: seasonStartedUnit('day', context.standardStartlistDays),
  }
}

type EnglishResourceHit = { namespace: string; keyPath: string }
let englishResourceIndex: Map<string, EnglishResourceHit[]> | null = null

function activeLanguageCode(): string {
  return String(i18n.resolvedLanguage ?? i18n.language ?? 'en')
}

function readResourceString(bundle: unknown, keyPath: string): string | null {
  if (!bundle || typeof bundle !== 'object') return null
  let current: unknown = bundle
  for (const segment of keyPath.split('.')) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null
}

function indexEnglishBundle(
  target: Map<string, EnglishResourceHit[]>,
  namespace: string,
  value: unknown,
  keyPath = ''
): void {
  if (typeof value === 'string') {
    if (!value.includes('{{') && value.trim()) {
      const normalized = normalizePhrase(value)
      const rows = target.get(normalized) ?? []
      rows.push({ namespace, keyPath })
      target.set(normalized, rows)
    }
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    indexEnglishBundle(target, namespace, child, keyPath ? `${keyPath}.${key}` : key)
  })
}

function getEnglishResourceIndex(): Map<string, EnglishResourceHit[]> {
  if (englishResourceIndex) return englishResourceIndex
  const next = new Map<string, EnglishResourceHit[]>()
  const englishData = i18n.getDataByLanguage('en') as Record<string, unknown> | undefined
  if (englishData) {
    Object.entries(englishData).forEach(([namespace, bundle]) => {
      indexEnglishBundle(next, namespace, bundle)
    })
  }
  englishResourceIndex = next
  return next
}

function localizeExistingGamePhrase(value: string): string | null {
  if (!shouldLocalizeNotifications() || !value.trim()) return null
  const hits = getEnglishResourceIndex().get(normalizePhrase(value)) ?? []
  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  if (!languageData) return null

  for (const hit of hits) {
    const localized = readResourceString(languageData[hit.namespace], hit.keyPath)
    if (localized && !localized.includes('{{')) return localized
  }
  return null
}

function notificationLiteral(section: 'literalDetailLabels' | 'literalActionLabels', raw: string): string | null {
  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  const notifications = languageData?.notifications
  if (!notifications || typeof notifications !== 'object') return null
  const sectionValue = (notifications as Record<string, unknown>)[section]
  if (!sectionValue || typeof sectionValue !== 'object') return null
  const value = (sectionValue as Record<string, unknown>)[raw.trim()]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function notificationTemplateWord(raw: string): string | null {
  const languageData = i18n.getDataByLanguage(activeLanguageCode()) as Record<string, unknown> | undefined
  const notifications = languageData?.notifications
  if (!notifications || typeof notifications !== 'object') return null
  const words = (notifications as Record<string, unknown>).templateWords
  if (!words || typeof words !== 'object') return null
  const value = (words as Record<string, unknown>)[raw.toUpperCase()]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function localizeLabelByReusableTokens(raw: string): string | null {
  let failed = false
  let translatedCount = 0
  const translated = raw.replace(/[A-Za-z][A-Za-z0-9'-]*/g, word => {
    const localized = notificationTemplateWord(word) || localizeExistingGamePhrase(word)
    if (!localized) {
      failed = true
      return word
    }
    translatedCount += 1
    return localized
  })
  return !failed && translatedCount > 0 ? translated : null
}

function localizeRole(value: string | null): string | null {
  if (!value || !shouldLocalizeNotifications()) return value
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
  if (!shouldLocalizeNotifications()) return value
  const normalized = value.replace(/[_-]+/g, '').replace(/\s+/g, '').toLowerCase()
  const key = CATEGORY_KEY_BY_NORMALIZED[normalized]
  return key ? nt(key) : null
}

function localizeSemanticTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode || !shouldLocalizeNotifications()) return null
  const code = String(typeCode).toUpperCase()
  if (code === 'SEASON_STARTED') return nt('seasonStarted.typeLabel')
  const key = `semanticTypeTitles.${code}`
  const value = nt(key, { defaultValue: '' })
  return value && value !== key ? value : null
}

function localizeSemanticEntityTitle(typeCode: string, entity: string | null): string | null {
  if (!entity || !shouldLocalizeNotifications()) return null
  const key = `semanticTypeEntityTitles.${typeCode}`
  const value = nt(key, { entity, defaultValue: '' })
  return value && value !== key ? value : null
}

function localizeSemanticMessage(typeCode: string, entity: string | null): string | null {
  if (!entity || !shouldLocalizeNotifications()) return null
  const key = `semanticTypeMessages.${typeCode}`
  const value = nt(key, { entity, defaultValue: '' })
  return value && value !== key ? value : null
}

function localizeTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode) return null
  if (!shouldLocalizeNotifications()) return typeCode

  const semantic = localizeSemanticTypeCode(typeCode)
  if (semantic) return semantic

  const tokens = String(typeCode)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)

  if (tokens.length === 0) return null

  // In non-English notification titles the leading RACE/RACES token is
  // redundant (for example "Utrka Zalihe Niske"). Keep English untouched,
  // but render the actual notification subject in translated locales.
  const displayTokens =
    tokens.length > 1 && (tokens[0] === 'RACE' || tokens[0] === 'RACES')
      ? tokens.slice(1)
      : tokens

  const exactTypeKeyByCode: Record<string, string> = {
    RACE_SUPPLIES_LOW: 'notificationTypes.suppliesLow',
    RACE_SUPPLIES_LOW_STOCK: 'notificationTypes.suppliesLow',
    RACE_PLAN_OPEN: 'notificationTypes.planOpen',
    RACE_PLAN_OPENED: 'notificationTypes.planOpen',
  }
  const exactKey = exactTypeKeyByCode[String(typeCode).toUpperCase()]
  if (exactKey) {
    const exactValue = nt(exactKey, { defaultValue: '' })
    if (exactValue && exactValue !== exactKey) return exactValue
  }

  const translated: string[] = []
  for (const token of displayTokens) {
    const key = `templateWords.${token}`
    const value = nt(key, { defaultValue: '' })
    if (!value || value === key) return null
    translated.push(value)
  }

  return translated.join(' ')
}

export function localizeNotificationTypeCodeLabel(
  typeCode: string | null | undefined
): string {
  if (!typeCode) return ''
  if (!shouldLocalizeNotifications()) return String(typeCode)
  return localizeTypeCode(typeCode) || nt('categories.other')
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


export function localizeNotificationFeedCopy(
  title: string | null | undefined,
  message: string | null | undefined,
  options?: { genericFallback?: boolean }
): { title: string; message: string } {
  const cleanTitle = String(title ?? '').trim()
  const cleanMessage = String(message ?? '').trim()

  if (!shouldLocalizeNotifications()) {
    return { title: cleanTitle, message: cleanMessage }
  }

  const staffHiredMatch = /^Staff hired:\s*(.+)$/i.exec(cleanTitle)
  if (staffHiredMatch) {
    const name = staffHiredMatch[1].trim()
    const roleMatch = /has joined your club as\s+(.+?)(?:\.|$)/i.exec(cleanMessage)
    const rawRole = roleMatch?.[1]?.trim() || null
    const role = localizeRole(rawRole) || rawRole || nt('roles.staffAdvisor')
    return {
      title: nt('templateLocalization.staffHired.title', { name }),
      message: nt('templateLocalization.staffHired.message', { name, role }),
    }
  }

  const sponsorOffersMatch = /^Sponsor offers ready for season\s+(\d+)$/i.exec(cleanTitle)
  if (sponsorOffersMatch) {
    return {
      title: nt('templateLocalization.feed.sponsorOffersReady.title', { season: sponsorOffersMatch[1] }),
      message: nt('templateLocalization.feed.sponsorOffersReady.message'),
    }
  }

  const sponsorSignedMatch = /^(.+?)\s+signed as\s+(main|secondary|technical)\s+sponsor$/i.exec(cleanTitle)
  if (sponsorSignedMatch) {
    const name = sponsorSignedMatch[1].trim()
    const kindCode = sponsorSignedMatch[2].toLowerCase()
    const kind = nt(`templateLocalization.feed.sponsorKinds.${kindCode}`)
    const season = /for season\s+(\d+)/i.exec(cleanMessage)?.[1]
    const guaranteed = /Guaranteed payment:\s*([^\.]+)\.?/i.exec(cleanMessage)?.[1]?.trim()
    const cash = /Cash paid now:\s*([^\.]+)\.?/i.exec(cleanMessage)?.[1]?.trim()
    const fund = /Equipment support fund:\s*([^\.]+)\.?/i.exec(cleanMessage)?.[1]?.trim()

    let localizedMessage = nt('templateLocalization.feed.sponsorSigned.genericMessage', { name, kind })
    if (season && guaranteed) {
      localizedMessage = nt('templateLocalization.feed.sponsorSigned.guaranteedMessage', {
        name, kind, season, amount: guaranteed,
      })
    } else if (season && cash && fund) {
      localizedMessage = nt('templateLocalization.feed.sponsorSigned.technicalMessage', {
        name, kind, season, cash, fund,
      })
    } else if (season) {
      localizedMessage = nt('templateLocalization.feed.sponsorSigned.seasonMessage', { name, kind, season })
    }

    return {
      title: nt('templateLocalization.feed.sponsorSigned.title', { name, kind }),
      message: localizedMessage,
    }
  }

  if (/^Scout Advisory\s*[—-]\s*Recruitment\s*&\s*Scouting Review$/i.test(cleanTitle) || /^Recruitment review:/i.test(cleanMessage)) {
    const stats = /Recruitment review:\s*(\d+) completed scouting reports,\s*(\d+) completed in the last seven real-life days,\s*(\d+) High or Elite potential reports, and\s*(\d+) active scouting assignments\.?/i.exec(cleanMessage)
    return {
      title: nt('templateLocalization.feed.scoutAdvisory.title'),
      message: stats
        ? nt('templateLocalization.feed.scoutAdvisory.message', {
            reports: stats[1], recent: stats[2], highElite: stats[3], active: stats[4],
          })
        : nt('templateLocalization.feed.scoutAdvisory.genericMessage'),
    }
  }

  if (options?.genericFallback !== false && (looksEnglish(cleanTitle) || looksEnglish(cleanMessage))) {
    return {
      title: looksEnglish(cleanTitle) ? nt('templateLocalization.feed.teamUpdateTitle') : cleanTitle,
      message: looksEnglish(cleanMessage) ? nt('templateLocalization.feed.teamUpdateMessage') : cleanMessage,
    }
  }

  return { title: cleanTitle, message: cleanMessage }
}

export function localizeNotificationItem(item: NotificationItem): NotificationItem {
  if (!shouldLocalizeNotifications()) return item

  const payload = payloadOf(item)
  const typeCode = String(item.type_code ?? '').toUpperCase()
  const entity = getPrimaryEntity(item)

  if (typeCode === 'SEASON_STARTED') {
    const context = getSeasonStartedContext(item)
    const params = getSeasonStartedTranslationParams(item)
    return {
      ...item,
      title: context.season !== null
        ? nt('seasonStarted.title', params)
        : nt('seasonStarted.titleGeneric', params),
      message: context.season !== null
        ? nt('seasonStarted.feedMessage', params)
        : nt('seasonStarted.feedMessageGeneric', params),
    }
  }

  const feedCopy = localizeNotificationFeedCopy(item.title, item.message, { genericFallback: false })
  if (feedCopy.title !== String(item.title ?? '').trim() || feedCopy.message !== String(item.message ?? '').trim()) {
    return { ...item, title: feedCopy.title, message: feedCopy.message }
  }

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

  // Unknown/legacy notification types must remain readable. If the type code
  // cannot be localized from our template-word dictionary, keep the persisted
  // backend title/message unchanged instead of inventing a misleading label.
  const localizedType = localizeTypeCode(item.type_code)
  if (typeCode && !localizedType) return item

  // Preserve already-localized/non-English admin or backend copy. Otherwise do
  // not leak English template prose: show a localized, type-aware fallback.
  // Dynamic rider/team/race/sponsor/company names come from payload_json and
  // are interpolated verbatim; only the surrounding UI prose is translated.
  const semanticType = localizeSemanticTypeCode(typeCode)
  const topic = semanticType || localizedType || getTopic(item)
  const semanticEntityTitle = localizeSemanticEntityTitle(typeCode, entity)
  const semanticMessage = localizeSemanticMessage(typeCode, entity)
  const localizedTitle = item.title && !looksEnglish(item.title)
    ? item.title
    : semanticEntityTitle || semanticType || nt('templateLocalization.genericTitle', { topic })
  const localizedMessage = item.message && !looksEnglish(item.message)
    ? item.message
    : semanticMessage || (entity
      ? nt('templateLocalization.genericEntityMessage', { topic, entity })
      : nt('templateLocalization.genericMessage', { topic }))

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
  if (!shouldLocalizeNotifications()) return text

  const value = text.trim()
  const payload = item ? payloadOf(item) : {}
  const typeCode = String(item?.type_code ?? '').toUpperCase()

  if (typeCode === 'SEASON_STARTED' && item) {
    const context = getSeasonStartedContext(item)
    const params = getSeasonStartedTranslationParams(item)

    if (/January is intentionally more compressed/i.test(value)) {
      return nt('seasonStarted.warning', params)
    }

    if (/begins with a compressed January race calendar/i.test(value)) {
      return context.season !== null
        ? nt('seasonStarted.intro', params)
        : nt('seasonStarted.introGeneric', params)
    }

    if (/starts with a compressed January race calendar/i.test(value)) {
      return context.season !== null
        ? nt('seasonStarted.feedMessage', params)
        : nt('seasonStarted.feedMessageGeneric', params)
    }
  }

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
  'critical items': 'mechanic.criticalItems',
  'supply status': 'templateLabels.supplyStatus',
  'bidons / water bottles': 'templateLabels.bidonsWaterBottles',
  'nutrition packs': 'templateLabels.nutritionPacks',
  'energy gels': 'templateLabels.energyGels',
  'race jersey complete': 'templateLabels.raceJerseyComplete',
  'rain jackets': 'templateLabels.rainJackets',
  'required jersey kits': 'templateLabels.requiredJerseyKits',
  'available jersey kits': 'templateLabels.availableJerseyKits',
  'missing jersey kits': 'templateLabels.missingJerseyKits',
  'eligibility check': 'templateLabels.eligibilityCheck',
}

export function localizeNotificationDetailLabel(
  label: string,
  item?: NotificationItem
): string {
  if (!shouldLocalizeNotifications()) return label

  if (String(item?.type_code ?? '').toUpperCase() === 'SEASON_STARTED' && item) {
    const context = getSeasonStartedContext(item)
    const normalizedLabel = label.trim()

    if (/^Season$/i.test(normalizedLabel)) return nt('seasonStarted.labels.season')
    if (/^Applications\s*·\s*Jan\s+1[–-]\d+$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.applicationsEarly', context)
    }
    if (/^Team list\s*·\s*Jan\s+1[–-]\d+$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.teamListEarly', context)
    }
    if (/^Startlist\s*·\s*Jan\s+1[–-]\d+$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.startlistEarly', context)
    }
    if (/^Jan\s+\d+[–-]31$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.lateJanuary', context)
    }
    if (/^From February$/i.test(normalizedLabel)) {
      return nt('seasonStarted.labels.fromFebruary', context)
    }
  }
  const key = DETAIL_LABEL_KEYS[normalizePhrase(label)]
  if (key) return nt(key)

  const literal = notificationLiteral('literalDetailLabels', label)
  if (literal) return literal

  const existing = localizeExistingGamePhrase(label)
  if (existing) return existing

  const tokenized = localizeLabelByReusableTokens(label)
  return tokenized || nt('common.detail')
}

export function localizeNotificationValue(
  value: string,
  item?: NotificationItem
): string {
  if (!shouldLocalizeNotifications()) return value

  if (String(item?.type_code ?? '').toUpperCase() === 'SEASON_STARTED' && item) {
    const cleanValue = value.trim()

    const seasonMatch = /^Season\s+(\d+)$/i.exec(cleanValue)
    if (seasonMatch) {
      return nt('seasonStarted.values.season', { season: seasonMatch[1] })
    }
    if (/^New season$/i.test(cleanValue)) {
      return nt('seasonStarted.values.newSeason')
    }

    let match = /^Open Jan 1\s*·\s*close\s+(\d+)\s+game days? before the race$/i.exec(cleanValue)
    if (match) {
      const days = Number(match[1])
      return nt('seasonStarted.values.applicationsEarly', {
        days,
        dayUnit: seasonStartedUnit('gameDay', days),
      })
    }

    match = /^Announced\s+(\d+)\s+game days? before the race, when applications close$/i.exec(cleanValue)
    if (match) {
      const days = Number(match[1])
      return nt('seasonStarted.values.teamListEarly', {
        days,
        dayUnit: seasonStartedUnit('gameDay', days),
      })
    }

    match = /^Open until\s+(\d+)\s+game hours? before Stage 1$/i.exec(cleanValue)
    if (match) {
      const hours = Number(match[1])
      return nt('seasonStarted.values.startlistEarly', {
        hours,
        hourUnit: seasonStartedUnit('gameHour', hours),
      })
    }

    match = /^Applications close\s+(\d+)\s+days? before\s*·\s*startlist closes\s+(\d+)\s+days? before$/i.exec(cleanValue)
    if (match) {
      const appDays = Number(match[1])
      const startDays = Number(match[2])
      return nt('seasonStarted.values.lateJanuary', {
        appDays,
        appDayUnit: seasonStartedUnit('day', appDays),
        startDays,
        startDayUnit: seasonStartedUnit('day', startDays),
      })
    }

    match = /^Standard schedule:\s*applications open\s+(\d+)\s+days? before, close\s+(\d+)\s+days? before\s*·\s*startlist closes\s+(\d+)\s+days? before$/i.exec(cleanValue)
    if (match) {
      const openDays = Number(match[1])
      const closeDays = Number(match[2])
      const startDays = Number(match[3])
      return nt('seasonStarted.values.standard', {
        openDays,
        openDayUnit: seasonStartedUnit('day', openDays),
        closeDays,
        closeDayUnit: seasonStartedUnit('day', closeDays),
        startDays,
        startDayUnit: seasonStartedUnit('day', startDays),
      })
    }

    // This notification must never fall back to token-by-token translation.
    // Preserve any future dynamic backend value until it receives a semantic rule.
    return cleanValue
  }

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

  const exactValueKeys: Record<string, string> = {
    'restock required': 'templateValues.restockRequired',
    'low stock': 'templateValues.lowStock',
    'in stock': 'templateValues.inStock',
    'out of stock': 'templateValues.outOfStock',
    'in repair': 'templateValues.inRepair',
    sold: 'templateValues.sold',
    expired: 'templateValues.expired',
    repaid: 'templateValues.repaid',
    'final warning': 'templateValues.finalWarning',
  }
  const exactValueKey = exactValueKeys[normalized]
  if (exactValueKey) return nt(exactValueKey)

  const availableMatch = /^(\d+(?:[.,]\d+)?)\s+available$/i.exec(value.trim())
  if (availableMatch) {
    return nt('templateValues.countAvailable', { count: availableMatch[1] })
  }

  const leftMatch = /^(\d+(?:[.,]\d+)?)\s+left$/i.exec(value.trim())
  if (leftMatch) {
    return nt('templateValues.countLeft', { count: leftMatch[1] })
  }

  const thresholdMatch = /^threshold\s+(\d+(?:[.,]\d+)?)$/i.exec(value.trim())
  if (thresholdMatch) {
    return nt('templateValues.thresholdValue', { count: thresholdMatch[1] })
  }

  const unitPatterns: Array<[RegExp, string]> = [
    [/^(\d+(?:[.,]\d+)?)\s+weeks?$/i, 'templateValues.countWeeks'],
    [/^(\d+(?:[.,]\d+)?)\s+days?$/i, 'templateValues.countDays'],
    [/^(\d+(?:[.,]\d+)?)\s+seasons?$/i, 'templateValues.countSeasons'],
  ]
  for (const [pattern, translationKey] of unitPatterns) {
    const match = pattern.exec(value.trim())
    if (match) return nt(translationKey, { count: match[1] })
  }

  // Composite race-supply summaries are generated in English by the template
  // because the underlying values are dynamic. Translate the fixed prose while
  // preserving quantities and thresholds.
  let translatedValue = value
  const supplyNameKeys: Array<[RegExp, string]> = [
    [/Bidons\s*\/\s*Water Bottles/gi, 'templateLabels.bidonsWaterBottles'],
    [/Nutrition Packs/gi, 'templateLabels.nutritionPacks'],
    [/Energy Gels/gi, 'templateLabels.energyGels'],
    [/Race Jersey Complete/gi, 'templateLabels.raceJerseyComplete'],
    [/Rain Jackets/gi, 'templateLabels.rainJackets'],
  ]
  for (const [pattern, translationKey] of supplyNameKeys) {
    translatedValue = translatedValue.replace(pattern, nt(translationKey))
  }
  translatedValue = translatedValue
    .replace(/(\d+(?:[.,]\d+)?)\s+available\b/gi, (_all, count) => nt('templateValues.countAvailable', { count }))
    .replace(/(\d+(?:[.,]\d+)?)\s+left\b/gi, (_all, count) => nt('templateValues.countLeft', { count }))
    .replace(/threshold\s+(\d+(?:[.,]\d+)?)/gi, (_all, count) => nt('templateValues.thresholdValue', { count }))

  if (translatedValue !== value) return translatedValue

  const existingGamePhrase = localizeExistingGamePhrase(value)
  if (existingGamePhrase) return existingGamePhrase

  // Short metadata values frequently reuse the same vocabulary as labels.
  // Translate them token-by-token only when every English token has a known
  // localized equivalent; otherwise preserve dynamic names/identifiers.
  if (value.length <= 120) {
    const tokenized = localizeLabelByReusableTokens(value)
    if (tokenized) return tokenized
  }

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
  'season calendar': 'seasonStarted.actions.calendar',
  'season overview': 'seasonStarted.actions.overview',
}

export function localizeNotificationActionLabel(label: string): string {
  if (!shouldLocalizeNotifications()) return label
  const normalized = normalizePhrase(label)
  const key = ACTION_KEY_BY_LABEL[normalized]
  if (key) return nt(key)

  const literal = notificationLiteral('literalActionLabels', label)
  if (literal) return literal

  const existing = localizeExistingGamePhrase(label)
  if (existing) return existing

  const tokenized = localizeLabelByReusableTokens(label)
  if (tokenized) return tokenized

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
  if (!shouldLocalizeNotifications()) return text
  const localized = localizeNotificationNarrative(text, item)
  if (localized === nt('templateLocalization.moreDetails')) return null
  return localized
}
