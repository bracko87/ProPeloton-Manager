import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

import i18n from '../../i18n'
import enCore from '../../i18n/locales/en/manualCore.json'
import srCore from '../../i18n/locales/sr-Latn/manualCore.json'
import enDeepA from '../../i18n/locales/en/manualDeepA.json'
import srDeepA from '../../i18n/locales/sr-Latn/manualDeepA.json'
import enDeepB1 from '../../i18n/locales/en/manualDeepB1.json'
import srDeepB1 from '../../i18n/locales/sr-Latn/manualDeepB1.json'
import enDeepB2 from '../../i18n/locales/en/manualDeepB2.json'
import srDeepB2 from '../../i18n/locales/sr-Latn/manualDeepB2.json'
import enFaq from '../../i18n/locales/en/manualFaq.json'
import srFaq from '../../i18n/locales/sr-Latn/manualFaq.json'
import enDynamic from '../../i18n/locales/en/manualDynamic.json'
import srDynamic from '../../i18n/locales/sr-Latn/manualDynamic.json'

const MANUAL_NAMESPACE = 'manual'

const enManualResource = {
  core: enCore,
  deepA: enDeepA,
  deepB1: enDeepB1,
  deepB2: enDeepB2,
  faq: enFaq,
  dynamic: enDynamic,
}

const srManualResource = {
  core: srCore,
  deepA: srDeepA,
  deepB1: srDeepB1,
  deepB2: srDeepB2,
  faq: srFaq,
  dynamic: srDynamic,
}

if (!i18n.hasResourceBundle('en', MANUAL_NAMESPACE)) {
  i18n.addResourceBundle('en', MANUAL_NAMESPACE, enManualResource, true, true)
}

if (!i18n.hasResourceBundle('sr-Latn', MANUAL_NAMESPACE)) {
  i18n.addResourceBundle('sr-Latn', MANUAL_NAMESPACE, srManualResource, true, true)
}

type ManualGroup = 'core' | 'deepA' | 'deepB1' | 'deepB2' | 'faq'
type ManualCategoryKey =
  | 'gettingStarted'
  | 'coinsAccount'
  | 'clubIdentity'
  | 'dashboard'
  | 'riders'
  | 'training'
  | 'equipment'
  | 'infrastructure'
  | 'calendarRaces'
  | 'racePreparation'
  | 'rankingsStatistics'
  | 'transfers'
  | 'transfersScouting'
  | 'finance'
  | 'supportAccount'
  | 'faq'

type ManualResourceSection = {
  title?: string
  subtitle?: string
  overview?: string
  facts?: string[]
  details?: string[]
  tips?: string[]
  links?: string[]
}

type SectionConfig = {
  id: string
  group: ManualGroup
  key: string
  category: ManualCategoryKey
}

type ManualSection = {
  id: string
  categoryKey: ManualCategoryKey
  category: string
  title: string
  subtitle: string
  overview: string
  facts: string[]
  details: string[]
  tips: string[]
  links: string[]
  englishDetails: string[]
}

const SECTION_CONFIGS: SectionConfig[] = [
  { id: 'quick-start', group: 'core', key: 'quickStart', category: 'gettingStarted' },
  { id: 'game-time', group: 'core', key: 'gameTime', category: 'gettingStarted' },
  { id: 'coins', group: 'core', key: 'coins', category: 'coinsAccount' },
  { id: 'club-identity', group: 'core', key: 'clubIdentity', category: 'clubIdentity' },
  { id: 'overview', group: 'core', key: 'overview', category: 'dashboard' },
  { id: 'notifications-inbox', group: 'core', key: 'notificationsInbox', category: 'dashboard' },
  { id: 'squad-riders', group: 'core', key: 'squadRiders', category: 'riders' },
  { id: 'rider-profile-skills', group: 'core', key: 'riderProfileSkills', category: 'riders' },
  { id: 'developing-team', group: 'core', key: 'developingTeam', category: 'riders' },
  { id: 'staff', group: 'core', key: 'staff', category: 'riders' },
  { id: 'training', group: 'core', key: 'training', category: 'training' },
  { id: 'equipment', group: 'core', key: 'equipment', category: 'equipment' },
  { id: 'race-supplies', group: 'core', key: 'raceSupplies', category: 'equipment' },
  { id: 'infrastructure', group: 'core', key: 'infrastructure', category: 'infrastructure' },
  { id: 'calendar-race-detail', group: 'core', key: 'calendarRaceDetail', category: 'calendarRaces' },
  { id: 'race-preparation', group: 'core', key: 'racePreparation', category: 'racePreparation' },
  { id: 'team-ranking', group: 'core', key: 'teamRanking', category: 'rankingsStatistics' },
  { id: 'statistics-team-profile', group: 'core', key: 'statisticsTeamProfile', category: 'rankingsStatistics' },
  { id: 'transfers-scouting', group: 'core', key: 'transfersScouting', category: 'transfers' },
  { id: 'finance', group: 'core', key: 'finance', category: 'finance' },
  { id: 'sponsors-policies', group: 'core', key: 'sponsorsPolicies', category: 'finance' },
  { id: 'emergency-liquidation', group: 'core', key: 'emergencyLiquidation', category: 'finance' },
  { id: 'support-account', group: 'core', key: 'supportAccount', category: 'supportAccount' },

  { id: 'public-home-beta', group: 'deepA', key: 'publicHomeBeta', category: 'gettingStarted' },
  { id: 'sidebar-footer-layout', group: 'deepA', key: 'sidebarFooterLayout', category: 'gettingStarted' },
  { id: 'profile-settings', group: 'deepA', key: 'profileSettings', category: 'coinsAccount' },
  { id: 'preferences-notifications', group: 'deepA', key: 'preferencesNotifications', category: 'coinsAccount' },
  { id: 'invite-friends', group: 'deepA', key: 'inviteFriends', category: 'coinsAccount' },
  { id: 'pro-packages-deep', group: 'deepA', key: 'proPackagesDeep', category: 'coinsAccount' },
  { id: 'contact-forum-support', group: 'deepA', key: 'contactForumSupport', category: 'supportAccount' },
  { id: 'club-creation-route', group: 'deepA', key: 'clubCreationRoute', category: 'clubIdentity' },
  { id: 'customize-team-deep', group: 'deepA', key: 'customizeTeamDeep', category: 'clubIdentity' },
  { id: 'branding-locks', group: 'deepA', key: 'brandingLocks', category: 'clubIdentity' },
  { id: 'team-profile-deep', group: 'deepA', key: 'teamProfileDeep', category: 'clubIdentity' },
  { id: 'overview-deep', group: 'deepA', key: 'overviewDeep', category: 'dashboard' },
  { id: 'overview-race-world', group: 'deepA', key: 'overviewRaceWorld', category: 'dashboard' },
  { id: 'notification-center-deep', group: 'deepA', key: 'notificationCenterDeep', category: 'dashboard' },
  { id: 'notification-examples', group: 'deepA', key: 'notificationExamples', category: 'dashboard' },
  { id: 'inbox-deep', group: 'deepA', key: 'inboxDeep', category: 'dashboard' },
  { id: 'top-menu', group: 'deepA', key: 'topMenu', category: 'dashboard' },
  { id: 'first-squad-deep', group: 'deepA', key: 'firstSquadDeep', category: 'riders' },
  { id: 'rider-skills-deep', group: 'deepA', key: 'riderSkillsDeep', category: 'riders' },
  { id: 'rider-profile-deep', group: 'deepA', key: 'riderProfileDeep', category: 'riders' },
  { id: 'fitness-health-deep', group: 'deepA', key: 'fitnessHealthDeep', category: 'riders' },
  { id: 'race-sharpness-deep', group: 'deepA', key: 'raceSharpnessDeep', category: 'riders' },
  { id: 'contracts-renewals-release', group: 'deepA', key: 'contractsRenewalsRelease', category: 'riders' },
  { id: 'developing-team-deep', group: 'deepA', key: 'developingTeamDeep', category: 'riders' },
  { id: 'staff-roles-deep', group: 'deepA', key: 'staffRolesDeep', category: 'riders' },
  { id: 'staff-capacity-deep', group: 'deepA', key: 'staffCapacityDeep', category: 'riders' },
  { id: 'staff-courses-deep', group: 'deepA', key: 'staffCoursesDeep', category: 'riders' },
  { id: 'regular-training-deep', group: 'deepA', key: 'regularTrainingDeep', category: 'training' },
  { id: 'training-camps-deep', group: 'deepA', key: 'trainingCampsDeep', category: 'training' },
  { id: 'current-camp-deep', group: 'deepA', key: 'currentCampDeep', category: 'training' },

  { id: 'equipment-category-deep', group: 'deepB1', key: 'equipmentCategoryDeep', category: 'equipment' },
  { id: 'equipment-caps-deep', group: 'deepB1', key: 'equipmentCapsDeep', category: 'equipment' },
  { id: 'equipment-inventory-deep', group: 'deepB1', key: 'equipmentInventoryDeep', category: 'equipment' },
  { id: 'race-supplies-deep', group: 'deepB1', key: 'raceSuppliesDeep', category: 'equipment' },
  { id: 'technical-sponsor-deep', group: 'deepB1', key: 'technicalSponsorDeep', category: 'equipment' },
  { id: 'facilities-overview-deep', group: 'deepB1', key: 'facilitiesOverviewDeep', category: 'infrastructure' },
  { id: 'facility-jobs-deep', group: 'deepB1', key: 'facilityJobsDeep', category: 'infrastructure' },
  { id: 'assets-deep', group: 'deepB1', key: 'assetsDeep', category: 'infrastructure' },
  { id: 'season-calendar-deep', group: 'deepB1', key: 'seasonCalendarDeep', category: 'calendarRaces' },
  { id: 'race-calendar-deep', group: 'deepB1', key: 'raceCalendarDeep', category: 'calendarRaces' },
  { id: 'race-detail-deep', group: 'deepB1', key: 'raceDetailDeep', category: 'calendarRaces' },
  { id: 'stage-terrain-points', group: 'deepB1', key: 'stageTerrainPoints', category: 'calendarRaces' },
  { id: 'replay-results-deep', group: 'deepB1', key: 'replayResultsDeep', category: 'calendarRaces' },
  { id: 'race-plan-deep', group: 'deepB1', key: 'racePlanDeep', category: 'racePreparation' },
  { id: 'stage-plan-deep', group: 'deepB1', key: 'stagePlanDeep', category: 'racePreparation' },
  { id: 'stage-roles-deep', group: 'deepB1', key: 'stageRolesDeep', category: 'racePreparation' },
  { id: 'stage-readiness-deep', group: 'deepB1', key: 'stageReadinessDeep', category: 'racePreparation' },
  { id: 'sport-director-deep', group: 'deepB1', key: 'sportDirectorDeep', category: 'racePreparation' },

  { id: 'ranking-tiers-deep', group: 'deepB2', key: 'rankingTiersDeep', category: 'rankingsStatistics' },
  { id: 'promotion-relegation-deep', group: 'deepB2', key: 'promotionRelegationDeep', category: 'rankingsStatistics' },
  { id: 'statistics-deep', group: 'deepB2', key: 'statisticsDeep', category: 'rankingsStatistics' },
  { id: 'transfer-list-deep', group: 'deepB2', key: 'transferListDeep', category: 'transfersScouting' },
  { id: 'free-agents-deep', group: 'deepB2', key: 'freeAgentsDeep', category: 'transfersScouting' },
  { id: 'transfer-negotiation-deep', group: 'deepB2', key: 'transferNegotiationDeep', category: 'transfersScouting' },
  { id: 'scouting-deep', group: 'deepB2', key: 'scoutingDeep', category: 'transfersScouting' },
  { id: 'staff-market-deep', group: 'deepB2', key: 'staffMarketDeep', category: 'transfersScouting' },
  { id: 'finance-health-deep', group: 'deepB2', key: 'financeHealthDeep', category: 'finance' },
  { id: 'transactions-deep', group: 'deepB2', key: 'transactionsDeep', category: 'finance' },
  { id: 'tax-deep', group: 'deepB2', key: 'taxDeep', category: 'finance' },
  { id: 'sponsors-deep', group: 'deepB2', key: 'sponsorsDeep', category: 'finance' },
  { id: 'sponsor-objectives-deep', group: 'deepB2', key: 'sponsorObjectivesDeep', category: 'finance' },
  { id: 'team-policies-deep', group: 'deepB2', key: 'teamPoliciesDeep', category: 'finance' },
  { id: 'liquidation-deep', group: 'deepB2', key: 'liquidationDeep', category: 'finance' },

  { id: 'faq-application-blocked', group: 'faq', key: 'applicationBlocked', category: 'faq' },
  { id: 'faq-accepted-not-ready', group: 'faq', key: 'acceptedNotReady', category: 'faq' },
  { id: 'faq-rider-underperformed', group: 'faq', key: 'riderUnderperformed', category: 'faq' },
  { id: 'faq-money', group: 'faq', key: 'money', category: 'faq' },
  { id: 'faq-equipment', group: 'faq', key: 'equipment', category: 'faq' },
  { id: 'faq-staff-hiring', group: 'faq', key: 'staffHiring', category: 'faq' },
]

const CATEGORY_ORDER: ManualCategoryKey[] = [
  'gettingStarted',
  'coinsAccount',
  'clubIdentity',
  'dashboard',
  'riders',
  'training',
  'equipment',
  'infrastructure',
  'calendarRaces',
  'racePreparation',
  'rankingsStatistics',
  'transfers',
  'transfersScouting',
  'finance',
  'supportAccount',
  'faq',
]

const SECTION_LINK_TARGETS: Record<string, string[]> = {
  'quick-start': ['/dashboard/overview', '/dashboard/squad', '/dashboard/finance'],
  coins: ['/dashboard/pro-packages', '/dashboard/invite-friends'],
  'club-identity': ['/dashboard/customize-team'],
  overview: ['/dashboard/overview'],
  'notifications-inbox': ['/dashboard/notifications', '/dashboard/inbox', '/dashboard/preferences'],
  'squad-riders': ['/dashboard/squad'],
  'developing-team': ['/dashboard/preferences', '/dashboard/squad'],
  staff: ['/dashboard/transfers?tab=staff', '/dashboard/infrastructure'],
  training: ['/dashboard/training'],
  equipment: ['/dashboard/equipment'],
  'race-supplies': ['/dashboard/equipment?tab=race-supplies'],
  infrastructure: ['/dashboard/infrastructure'],
  'calendar-race-detail': ['/dashboard/calendar'],
  'race-preparation': ['/dashboard/race-preparation'],
  'team-ranking': ['/dashboard/team-ranking'],
  'statistics-team-profile': ['/dashboard/statistics', '/dashboard/team-ranking'],
  'transfers-scouting': ['/dashboard/transfers', '/dashboard/scouting'],
  finance: ['/dashboard/finance'],
  'sponsors-policies': ['/dashboard/finance?tab=sponsors', '/dashboard/finance?tab=teamPoliciesOperations'],
  'support-account': ['/dashboard/my-profile', '/dashboard/preferences', '/dashboard/contact-us', '/dashboard/forum'],
  'profile-settings': ['/dashboard/my-profile'],
  'preferences-notifications': ['/dashboard/preferences'],
  'invite-friends': ['/dashboard/invite-friends'],
  'pro-packages-deep': ['/dashboard/pro-packages'],
  'contact-forum-support': ['/dashboard/contact-us', '/dashboard/forum'],
  'customize-team-deep': ['/dashboard/customize-team'],
  'overview-deep': ['/dashboard/overview'],
  'notification-center-deep': ['/dashboard/notifications'],
  'inbox-deep': ['/dashboard/inbox'],
  'first-squad-deep': ['/dashboard/squad'],
  'developing-team-deep': ['/dashboard/preferences'],
}

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().trim()
}

function safeSection(value: unknown): ManualResourceSection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const section = value as ManualResourceSection
  if (!section.title || !section.subtitle || !section.overview) return null
  return section
}

function pairsToFactText(facts: string[]): string {
  if (facts.length === 0) return ''
  const result: string[] = []
  for (let index = 0; index < facts.length; index += 2) {
    const label = facts[index]
    const value = facts[index + 1]
    if (label && value) result.push(`${label}: ${value}`)
  }
  return result.join('; ')
}

function expandedKeyForEnglishDetail(detail: string): string {
  const d = normalize(detail)
  if (d.includes('sold') || d.includes('discarded')) return 'soldDiscarded'
  if (d.includes('ready') && d.includes('worn')) return 'readyWorn'
  if (d.includes('assigned')) return 'assigned'
  if (d.includes('repair quote') || d.includes('quote')) return 'quote'
  if (d.includes('condition')) return 'condition'
  if (d.includes('bidons') || d.includes('gels') || d.includes('nutrition')) return 'consumables'
  if (d.includes('jersey') || d.includes('rain jackets') || d.includes('rain jacket')) return 'durable'
  if (d.includes('sponsor') || d.includes('objectives')) return 'sponsor'
  if (d.includes('tax')) return 'tax'
  if (d.includes('deadline') || d.includes('window')) return 'deadline'
  if (d.includes('training') || d.includes('fatigue')) return 'training'
  if (d.includes('scout') || d.includes('scouting')) return 'scouting'
  if (d.includes('cash') || d.includes('cost') || d.includes('salary') || d.includes('balance')) return 'cost'
  if (d.includes('role') || d.includes('skills') || d.includes('overall')) return 'roles'
  if (d.includes('replay') || d.includes('results') || d.includes('classification')) return 'replay'
  return 'default'
}

function categoryDynamicKey(category: ManualCategoryKey): string {
  switch (category) {
    case 'gettingStarted': return 'gettingStarted'
    case 'coinsAccount': return 'coinsAccount'
    case 'clubIdentity': return 'clubIdentity'
    case 'dashboard': return 'dashboard'
    case 'riders': return 'riders'
    case 'training': return 'training'
    case 'equipment': return 'equipment'
    case 'infrastructure': return 'infrastructure'
    case 'calendarRaces': return 'calendarRaces'
    case 'rankingsStatistics': return 'rankingsStatistics'
    case 'transfers':
    case 'transfersScouting': return 'transfers'
    case 'finance': return 'finance'
    case 'supportAccount': return 'supportAccount'
    case 'faq': return 'faq'
    default: return 'default'
  }
}

function mistakeDynamicKey(category: ManualCategoryKey): string {
  if (category === 'equipment') return 'equipment'
  if (category === 'finance') return 'finance'
  if (category === 'calendarRaces' || category === 'racePreparation') return 'calendarRaces'
  if (category === 'transfers' || category === 'transfersScouting') return 'transfers'
  if (category === 'training') return 'training'
  if (category === 'infrastructure') return 'infrastructure'
  return 'default'
}

export default function ManualPage(): JSX.Element {
  const { t, i18n: activeI18n } = useTranslation(MANUAL_NAMESPACE)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ManualCategoryKey | 'all'>('all')
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(() => new Set())

  const sections = useMemo<ManualSection[]>(() => {
    const englishT = i18n.getFixedT('en', MANUAL_NAMESPACE)

    return SECTION_CONFIGS.flatMap(config => {
      const translated = safeSection(
        t(`${config.group}.sections.${config.key}`, { returnObjects: true }),
      )
      const english = safeSection(
        englishT(`${config.group}.sections.${config.key}`, { returnObjects: true }),
      )

      if (!translated || !english) return []

      return [{
        id: config.id,
        categoryKey: config.category,
        category: t(`core.categories.${config.category}`),
        title: translated.title ?? '',
        subtitle: translated.subtitle ?? '',
        overview: translated.overview ?? '',
        facts: Array.isArray(translated.facts) ? translated.facts : [],
        details: Array.isArray(translated.details) ? translated.details : [],
        tips: Array.isArray(translated.tips) ? translated.tips : [],
        links: Array.isArray(translated.links) ? translated.links : [],
        englishDetails: Array.isArray(english.details) ? english.details : [],
      }]
    })
  }, [activeI18n.resolvedLanguage, t])

  const availableCategories = useMemo(() => {
    const used = new Set(sections.map(section => section.categoryKey))
    return CATEGORY_ORDER.filter(key => used.has(key))
  }, [sections])

  const filteredSections = useMemo(() => {
    const q = normalize(query)

    return sections.filter(section => {
      if (category !== 'all' && section.categoryKey !== category) return false
      if (!q) return true

      const searchable = [
        section.category,
        section.title,
        section.subtitle,
        section.overview,
        ...section.facts,
        ...section.details,
        ...section.tips,
        ...section.links,
      ].map(normalize).join(' ')

      return searchable.includes(q)
    })
  }, [category, query, sections])

  const visibleCountLabel = filteredSections.length === 1
    ? t('core.ui.section')
    : t('core.ui.sections', { count: filteredSections.length })

  function toggleSection(sectionId: string): void {
    setOpenSectionIds(current => {
      const next = new Set(current)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  function openVisibleSections(): void {
    setOpenSectionIds(current => {
      const next = new Set(current)
      filteredSections.forEach(section => next.add(section.id))
      return next
    })
  }

  function closeAllSections(): void {
    setOpenSectionIds(new Set())
  }

  function handlePrint(): void {
    setOpenSectionIds(current => {
      const next = new Set(current)
      filteredSections.forEach(section => next.add(section.id))
      return next
    })

    window.setTimeout(() => window.print(), 150)
  }

  function guideParagraphs(section: ManualSection): string[] {
    const facts = pairsToFactText(section.facts) || t('dynamic.noFacts')
    const categoryKey = categoryDynamicKey(section.categoryKey)
    const mistakeKey = mistakeDynamicKey(section.categoryKey)

    return [
      t(`dynamic.category.${categoryKey}`, { title: section.title }),
      t('dynamic.decision', { title: section.title, facts }),
      t(`dynamic.mistake.${mistakeKey}`, { title: section.title }),
    ]
  }

  function expandedExplanation(section: ManualSection, detailIndex: number): string {
    const englishDetail = section.englishDetails[detailIndex] ?? ''
    const key = expandedKeyForEnglishDetail(englishDetail)
    return t(`dynamic.expanded.${key}`, { title: section.title })
  }

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 p-6 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-yellow-300">{t('core.ui.manual')}</p>
        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{t('core.ui.title')}</h1>
        <p className="mt-3 max-w-5xl text-sm leading-relaxed text-slate-100 md:text-base">
          {t('core.ui.intro')}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200">
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            {t('core.ui.sections', { count: sections.length })}
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            {t('core.ui.categories', { count: availableCategories.length })}
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            {t('core.ui.closedDefault')}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link to="/dashboard/help" className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white">
            {t('core.ui.backHelp')}
          </Link>
          <button type="button" onClick={handlePrint} className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white">
            {t('core.ui.print')}
          </button>
          <a href="https://discord.gg/9W6rSSjm" target="_blank" rel="noreferrer" className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white">
            {t('core.ui.discord')}
          </a>
        </div>
      </section>

      <section className="rounded-xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('core.ui.startHere')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{t('core.ui.startHereBody')}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr_auto] lg:items-end">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t('core.ui.search')}</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('core.ui.searchPlaceholder')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{t('core.ui.category')}</span>
            <select
              value={category}
              onChange={event => setCategory(event.target.value as ManualCategoryKey | 'all')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
            >
              <option value="all">{t('core.ui.allCategories')}</option>
              {availableCategories.map(categoryKey => (
                <option key={categoryKey} value={categoryKey}>
                  {t(`core.categories.${categoryKey}`)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openVisibleSections} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400">
              {t('core.ui.openVisible')}
            </button>
            <button type="button" onClick={closeAllSections} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-yellow-400">
              {t('core.ui.closeAll')}
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-slate-500">
          {t('core.ui.showing', { count: visibleCountLabel })}
        </div>
      </section>

      <section className="space-y-3">
        {filteredSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('core.ui.noneTitle')}</h2>
            <p className="mt-2 text-sm text-slate-500">{t('core.ui.noneBody')}</p>
          </div>
        ) : (
          filteredSections.map(section => {
            const isOpen = openSectionIds.has(section.id)
            const linkTargets = SECTION_LINK_TARGETS[section.id] ?? []

            return (
              <article key={section.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-yellow-400"
                  aria-expanded={isOpen}
                >
                  <span className="min-w-0">
                    <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-800">
                      {section.category}
                    </span>
                    <span className="mt-2 block text-base font-semibold text-slate-900">{section.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-slate-600">{section.subtitle}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    {isOpen ? t('core.ui.close') : t('core.ui.open')}
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-slate-100 px-5 py-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="text-sm font-semibold text-slate-900">{t('core.ui.summary')}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">{section.overview}</p>
                    </div>

                    {section.facts.length > 0 ? (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: Math.ceil(section.facts.length / 2) }).map((_, factIndex) => {
                          const label = section.facts[factIndex * 2]
                          const value = section.facts[factIndex * 2 + 1]
                          if (!label || !value) return null
                          return (
                            <div key={`${section.id}:${factIndex}`} className="rounded-xl border border-slate-200 bg-white p-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                              <div className="mt-2 text-sm font-medium leading-relaxed text-slate-900">{value}</div>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}

                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
                      <h3 className="text-sm font-semibold text-slate-900">{t('core.ui.detailExplanation')}</h3>
                      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                        {guideParagraphs(section).map((paragraph, index) => (
                          <p key={`${section.id}:guide:${index}`}>{paragraph}</p>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 space-y-4 text-sm leading-7 text-slate-700">
                      {section.details.map((paragraph, index) => (
                        <div key={`${section.id}:detail:${index}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {t('core.ui.rule', { number: index + 1 })}
                          </div>
                          <p className="mt-2 font-semibold text-slate-900">{paragraph}</p>
                          <p className="mt-2 text-slate-700">{expandedExplanation(section, index)}</p>
                        </div>
                      ))}
                    </div>

                    {section.tips.length > 0 ? (
                      <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
                        <h3 className="text-sm font-semibold text-slate-900">{t('core.ui.practicalTips')}</h3>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
                          {section.tips.map((tip, index) => <li key={`${section.id}:tip:${index}`}>{tip}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    {section.links.length > 0 && linkTargets.length > 0 ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {section.links.map((label, index) => {
                          const to = linkTargets[index]
                          if (!to) return null
                          return (
                            <Link key={`${section.id}:link:${index}`} to={to} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400">
                              {label}
                            </Link>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )
          })
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
        <h2 className="text-lg font-semibold">{t('core.ui.maintenanceTitle')}</h2>
        <p className="mt-2 max-w-5xl text-sm leading-relaxed text-slate-200">{t('core.ui.maintenanceBody')}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link to="/dashboard/contact-us" className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white">
            {t('core.ui.contact')}
          </Link>
          <a href="https://discord.gg/9W6rSSjm" target="_blank" rel="noreferrer" className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white">
            {t('core.ui.discord')}
          </a>
        </div>
      </section>
    </div>
  )
}
