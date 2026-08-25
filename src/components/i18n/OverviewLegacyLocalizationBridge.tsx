import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

function getCurrentHashPath(): string {
  if (typeof window === 'undefined') return '/'
  const raw = window.location.hash.replace(/^#/, '')
  return raw || '/'
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const staticTextKeys = new Map<string, string>([
  ['All clear — no urgent tasks right now.', 'attention.allClear'],
  ['Click to expand', 'attention.clickToExpand'],
  ['Due today', 'attention.dueToday'],
  ['Due tomorrow', 'attention.dueTomorrow'],
  ['Deadline', 'attention.deadline'],
  ['Missing', 'attention.missing'],
  ['Open now', 'attention.openNow'],
  ['Review', 'attention.review'],
  ['Medical', 'attention.medical'],
  ['Urgent', 'attention.urgent'],
  ['Action', 'attention.action'],
  ['Done', 'attention.done'],
  ['Info', 'attention.info'],
  ['Soon', 'attention.soon'],
  ['Stage deadline', 'attention.stageDeadline'],
  ['Stage setup', 'attention.stageSetup'],
  ['Missing setup', 'attention.missingSetup'],
  ['Closed setup', 'attention.closedSetup'],
  ['Race deadline', 'attention.raceDeadline'],
  ['Race entry', 'attention.raceEntry'],
  ['Race planning', 'attention.racePlanning'],
  ['Results review', 'attention.resultsReview'],
  ['Applications', 'attention.applications'],
  ['Contracts', 'attention.contracts'],
  ['Equipment', 'attention.equipment'],
  ['Scouting', 'attention.scouting'],
  ['Finance', 'attention.finance'],

  ['Staff Briefing Centre', 'staffBriefing.title'],
  ['Assign staff as optional advisors for additional analysis and reports.', 'staffBriefing.subtitle'],
  ['What do I get with an advisor?', 'staffBriefing.infoTitle'],
  [
    'Hiring staff and buying Staff Advisory are separate. Your employees continue their normal jobs without Staff Advisory. The 5-coin option adds proactive analysis and role-specific reports for 30 real-life days.',
    'staffBriefing.infoIntro',
  ],
  ['Without Staff Advisory', 'staffBriefing.withoutTitle'],
  [
    'You still receive all normal gameplay notifications and essential warnings: race and stage-plan deadlines, injuries and sickness, rider/staff contract expiry, race-supply shortages, sponsor and finance warnings, scouting-task completion, transfers, and other normal game events. Hired staff also continue performing their normal gameplay jobs.',
    'staffBriefing.withoutText',
  ],
  ['With Staff Advisory — 5 coins / 30 real-life days', 'staffBriefing.withTitle'],
  [
    'The selected employee becomes your advisor for that role. Advisor access adds proactive analytical reports and advisor-only notifications. These reports interpret information you already have; they do not reveal hidden attributes, change race calculations, improve rider stats, or replace Free warnings.',
    'staffBriefing.withText',
  ],
  ['What Staff Advisory never locks', 'staffBriefing.neverLocksTitle'],
  [
    'Essential warnings and normal game results remain available without Staff Advisory. Advisory is additional interpretation and planning support only.',
    'staffBriefing.neverLocksText',
  ],
  ['Inbox', 'staffBriefing.inbox'],
  ['Notifications', 'staffBriefing.notifications'],
  ['Manage staff', 'staffBriefing.manageStaff'],
  ['Advisor', 'staffBriefing.advisor'],
  ['No advisor assigned', 'staffBriefing.noAdvisor'],
  ['No staff available', 'staffBriefing.noStaff'],
  ['Advisory unavailable', 'staffBriefing.advisoryUnavailable'],
  ['Assign advisor', 'staffBriefing.assignAdvisor'],
  ['Advisor rating', 'staffBriefing.advisorRating'],
  ['Advisory active', 'staffBriefing.active'],
  ['Advisory expired', 'staffBriefing.expired'],
  ['Until', 'staffBriefing.until'],
  ['Expired', 'staffBriefing.expiredAt'],
  ['Renew', 'staffBriefing.renew'],
  ['Renew advisor', 'staffBriefing.renewAdvisor'],
  ['Close', 'staffBriefing.close'],
  ['Loading eligible staff…', 'staffBriefing.loadingEligible'],
  ['Loading eligible staff...', 'staffBriefing.loadingEligible'],
  ['Staff member', 'staffBriefing.staffMember'],
  ['No eligible staff members are available for this role.', 'staffBriefing.noEligible'],
  ['Loading quote…', 'staffBriefing.loadingQuote'],
  ['Loading quote...', 'staffBriefing.loadingQuote'],
  ['Price', 'staffBriefing.price'],
  ['Duration', 'staffBriefing.duration'],
  ['New expiry', 'staffBriefing.newExpiry'],
  ['Automatic renewal', 'staffBriefing.automaticRenewal'],
  ['Coin balance', 'staffBriefing.coinBalance'],
  ['No', 'staffBriefing.no'],
  ['Cancel', 'staffBriefing.cancel'],
  ['Activating…', 'staffBriefing.activating'],
  ['Activating...', 'staffBriefing.activating'],
  ['Staff Advisory activation failed.', 'staffBriefing.activationFailed'],
  ['Could not activate Staff Advisory.', 'staffBriefing.couldNotActivate'],
  ['Staff Advisory details are temporarily unavailable.', 'staffBriefing.couldNotLoad'],
  ['Could not load eligible staff.', 'staffBriefing.couldNotLoadStaff'],
  ['Could not load advisory quote.', 'staffBriefing.couldNotLoadQuote'],
  ['1 eligible staff member is available for advisory support.', 'staffBriefing.eligibleOne'],
  ['Advisor notifications: 0', 'staffBriefing.zeroNotifications'],

  ['Head Coach', 'staffBriefing.roles.headCoach'],
  ['Sports Director', 'staffBriefing.roles.sportsDirector'],
  ['Team Doctor', 'staffBriefing.roles.teamDoctor'],
  ['Chief Mechanic', 'staffBriefing.roles.chiefMechanic'],
  ['Scout', 'staffBriefing.roles.scout'],
  ['Training', 'staffBriefing.skills.training'],
  ['Recovery Planning', 'staffBriefing.skills.recoveryPlanning'],
  ['Youth Development', 'staffBriefing.skills.youthDevelopment'],
  ['Tactics', 'staffBriefing.skills.tactics'],
  ['Organization', 'staffBriefing.skills.organization'],
  ['Motivation', 'staffBriefing.skills.motivation'],
  ['Recovery', 'staffBriefing.skills.recovery'],
  ['Diagnosis', 'staffBriefing.skills.diagnosis'],
  ['Prevention', 'staffBriefing.skills.prevention'],
  ['Setup', 'staffBriefing.skills.setup'],
  ['Reliability', 'staffBriefing.skills.reliability'],
  ['Experience', 'staffBriefing.skills.experience'],
  ['Evaluation', 'staffBriefing.skills.evaluation'],
  ['Accuracy', 'staffBriefing.skills.accuracy'],
  ['Network', 'staffBriefing.skills.network'],
  [
    'Weekly training and readiness review: workload trends, repeated fatigue, morale/readiness patterns, development trends, and riders who may need closer management.',
    'staffBriefing.roleInfo.headCoach',
  ],
  [
    'Weekly race-program review: calendar congestion, rider-selection load, preparation risks, overlapping commitments, and areas of the race programme worth reviewing.',
    'staffBriefing.roleInfo.sportsDirector',
  ],
  [
    'Health and recovery analysis, at most once per real-life day: squad availability, repeated injury/sickness patterns, recovery trends, and health situations worth monitoring.',
    'staffBriefing.roleInfo.teamDoctor',
  ],
  [
    'Weekly equipment review: condition and maintenance trends, recurring equipment issues, workload on the workshop, and race-supply usage worth reviewing.',
    'staffBriefing.roleInfo.chiefMechanic',
  ],
  [
    'Weekly recruitment review using already-known scouting information: completed report summary, recruitment gaps, known prospects worth revisiting, and suggestions for where to scout next.',
    'staffBriefing.roleInfo.scout',
  ],

  ['Premium', 'premium.label'],
  ['Unlock with Premium', 'premium.unlock'],

  ['News Board', 'news.boardTitle'],
  ['Latest team and world news. Click a row to expand it.', 'news.boardSubtitle'],
  ['Team', 'news.team'],
  ['World', 'news.world'],
  ['Team news', 'news.teamNews'],
  ['World news', 'news.worldNews'],
  ['No news yet', 'news.noNews'],
  [
    'Team updates, race results, ranking headlines, and world peloton news will appear here.',
    'news.noNewsSubtitle',
  ],
  ['Cycling World News', 'news.cyclingWorldTitle'],
  ['Latest professional cycling headlines from approved external sources.', 'news.cyclingWorldSubtitle'],
  ['Cycling news', 'news.cyclingNews'],
  ['Latest', 'news.latest'],
  [
    'No external cycling headlines are available yet. The card will fill automatically after the news importer and RPC are installed.',
    'news.noExternal',
  ],

  ['Last Team Race', 'races.lastTitle'],
  ['Latest finished full race involving your first team or developing team.', 'races.lastSubtitle'],
  ['Loading latest finished full race...', 'races.loadingLast'],
  ['No finished full race found for the first team or developing team yet.', 'races.noLast'],
  ['Next Team Race', 'races.nextTitle'],
  ['Next submitted race that has not started yet.', 'races.nextSubtitle'],
  ['Loading next submitted race plan...', 'races.loadingNext'],
  ['No upcoming submitted race found for the first team or developing team yet.', 'races.noNext'],
  ['Upcoming Schedule', 'races.upcomingTitle'],
  ['Next five accepted races, race deadlines, and club milestones.', 'races.upcomingSubtitle'],
  ['No upcoming events', 'races.noUpcoming'],
  [
    'There are no accepted races, camps, deadlines, or infrastructure milestones in the current overview window.',
    'races.noUpcomingSubtitle',
  ],
  ['This Day Races', 'races.todayTitle'],
  ['Races happening on the current game day.', 'races.todayCurrent'],
  ['No races on this date', 'races.noToday'],
  ['There are no race events scheduled for the current game day.', 'races.noTodaySubtitle'],
  ['No race found yet', 'races.noRace'],
  ['Today', 'races.today'],

  ['Squad Pulse', 'squad.title'],
  [
    'See squad readiness, fitness, morale, health, availability, and contract pressure in one place.',
    'squad.premiumDescription',
  ],
  ['Readiness, morale, health, and contract pressure.', 'squad.subtitle'],
  ['Fitness and immediate squad status.', 'squad.compactSubtitle'],
  ['Fitness', 'squad.fitness'],
  ['Morale', 'squad.morale'],
  ['Readiness', 'squad.readiness'],
  ['Form', 'squad.form'],
  ['Available', 'squad.available'],
  ['Available Riders', 'squad.availableRiders'],
  ['Injured', 'squad.injured'],
  ['Sick', 'squad.sick'],
  ['Not fully fit', 'squad.notFullyFit'],
  ['Not Fully Fit', 'squad.notFullyFit'],
  ['Contracts', 'squad.contracts'],
  ['Expiring Contracts', 'squad.expiringContracts'],

  ['Main Sponsor', 'sponsor.title'],
  ['Primary sponsor branding and active partnership.', 'sponsor.subtitle'],
  ['No Main Sponsor signed', 'sponsor.none'],
  ['Please visit Sponsor Page.', 'sponsor.visit'],

  ['Finance Health', 'finance.healthTitle'],
  [
    'Unlock cash position, recurring cost pressure, weekly net performance, sponsor income, and forecasted spending insights.',
    'finance.healthPremiumDescription',
  ],
  ['Cash position, recurring cost pressure, and next forecasted spend.', 'finance.healthSubtitle'],
  ['Balance', 'finance.balance'],
  ['Weekly Net', 'finance.weeklyNet'],
  ['Sponsor Income', 'finance.sponsorIncome'],
  ['Recurring Policy Cost', 'finance.recurringPolicyCost'],
  ['Next Trip Forecast', 'finance.nextTripForecast'],
  ['Latest Major Transaction', 'finance.latestMajorTransaction'],
  ['Income & Expenses', 'finance.incomeExpensesTitle'],
  [
    'Unlock weekly, monthly, and season operating charts with a clear income, expense, and net-balance summary.',
    'finance.incomeExpensesPremiumDescription',
  ],
  ['Week', 'finance.week'],
  ['Month', 'finance.month'],
  ['Season', 'finance.season'],
  ['Weekly', 'finance.weekly'],
  ['Monthly', 'finance.monthly'],
  ['Net', 'finance.net'],
  ['Final balance', 'finance.finalBalance'],
  ['Emergency Debt', 'finance.emergencyDebt'],
  [
    'Emergency loans, principal balance, repayment pressure, and liquidation risk.',
    'finance.emergencyDebtSubtitle',
  ],
  ['Rescues used', 'finance.rescuesUsed'],
  ['Outstanding principal', 'finance.outstandingPrincipal'],
  ['Next repayment', 'finance.nextRepayment'],
  ['Liquidation risk', 'finance.liquidationRisk'],
  ['Debt Movement', 'finance.debtMovement'],
  ['No emergency loan movement found.', 'finance.noDebtMovement'],

  ['Active Operations', 'operations.title'],
  [
    'Unlock a live overview of current jobs, running processes, operational statuses, and active club workflows.',
    'operations.premiumDescription',
  ],
  ['Current jobs and running processes.', 'operations.subtitle'],
  ['Nothing happening at the moment.', 'operations.nothing'],

  ['Club Honours', 'honours.title'],
  [
    'Unlock a convenient historical summary of the five greatest results achieved in club history.',
    'honours.premiumDescription',
  ],
  ['The five greatest results achieved in club history.', 'honours.subtitle'],
  ['View all', 'honours.viewAll'],
  ['No historical honours are available yet.', 'honours.none'],
  ['History', 'honours.history'],

  ['Season Snapshot', 'seasonSnapshot.title'],
  [
    'Unlock current-season race volume, international points, wins, podiums, Top 10 results, jerseys, and best general-classification performance.',
    'seasonSnapshot.premiumDescription',
  ],
  ['Current season results, points, podiums, jerseys, and race volume.', 'seasonSnapshot.subtitle'],
  ['Races this season', 'seasonSnapshot.races'],
  ['Stages raced', 'seasonSnapshot.stages'],
  ['International points', 'seasonSnapshot.internationalPoints'],
  ['Wins', 'seasonSnapshot.wins'],
  ['Podiums', 'seasonSnapshot.podiums'],
  ['Top 10 results', 'seasonSnapshot.top10'],
  ['Jerseys', 'seasonSnapshot.jerseys'],
  ['Best GC', 'seasonSnapshot.bestGc'],

  ['Club Snapshot', 'clubSnapshot.title'],
  ['Finance, points, roster, morale, and ranking metrics.', 'clubSnapshot.subtitle'],

  ['Open', 'common.open'],
  ['Failed to load dashboard', 'common.failedToLoad'],
  ['Unknown error', 'common.unknownError'],
])

type DynamicDescriptor =
  | { kind: 'due'; date: string }
  | { kind: 'until'; date: string }
  | { kind: 'stages'; count: string }
  | { kind: 'todayDate'; date: string }
  | { kind: 'eligible'; count: string }
  | { kind: 'hireRole'; role: string }
  | { kind: 'notEnoughCoins'; required: string; balance: string }
  | { kind: 'coins'; count: string }
  | { kind: 'realLifeDays'; count: string }
  | { kind: 'renewCoins'; count: string }
  | { kind: 'assignCoins'; count: string }
  | { kind: 'incomePercent'; percent: string }
  | { kind: 'expensesPercent'; percent: string }
  | { kind: 'operatingBalance'; period: string }
  | { kind: 'season'; number: string }
  | { kind: 'shortDate'; month: string; day: string }

const nodeKey = new WeakMap<Node, string>()
const dynamicNode = new WeakMap<Node, DynamicDescriptor>()
const attributeState = new WeakMap<Element, Map<string, string | DynamicDescriptor>>()

const roleKeyByEnglish = new Map<string, string>([
  ['head coach', 'staffBriefing.roles.headCoach'],
  ['sports director', 'staffBriefing.roles.sportsDirector'],
  ['team doctor', 'staffBriefing.roles.teamDoctor'],
  ['chief mechanic', 'staffBriefing.roles.chiefMechanic'],
  ['scout', 'staffBriefing.roles.scout'],
])

function detectDynamic(value: string): DynamicDescriptor | null {
  let match = /^Due\s+(.+)$/.exec(value)
  if (match) return { kind: 'due', date: match[1] }

  match = /^Until\s+(.+)$/.exec(value)
  if (match) return { kind: 'until', date: match[1] }

  match = /^(\d+)\s+stages$/.exec(value)
  if (match) return { kind: 'stages', count: match[1] }

  match = /^Races happening on\s+(.+)\.$/.exec(value)
  if (match) return { kind: 'todayDate', date: match[1] }

  match = /^(\d+) eligible staff members are available for advisory support\.$/.exec(value)
  if (match) return { kind: 'eligible', count: match[1] }

  match = /^Hire an eligible (.+) on the Staff page before assigning an advisor\.$/i.exec(value)
  if (match) return { kind: 'hireRole', role: match[1] }

  match = /^Not enough coins\. (\d+) coins are required and your current balance is (\d+)\.$/.exec(value)
  if (match) return { kind: 'notEnoughCoins', required: match[1], balance: match[2] }

  match = /^(\d+) coins$/.exec(value)
  if (match) return { kind: 'coins', count: match[1] }

  match = /^(\d+) real-life days$/.exec(value)
  if (match) return { kind: 'realLifeDays', count: match[1] }

  match = /^Renew for (\d+) coins$/.exec(value)
  if (match) return { kind: 'renewCoins', count: match[1] }

  match = /^Assign for (\d+) coins$/.exec(value)
  if (match) return { kind: 'assignCoins', count: match[1] }

  match = /^Income (\d+)%$/.exec(value)
  if (match) return { kind: 'incomePercent', percent: match[1] }

  match = /^Expenses (\d+)%$/.exec(value)
  if (match) return { kind: 'expensesPercent', percent: match[1] }

  match = /^(Weekly|Monthly|Season) operating balance from real in-game finance transactions\.$/.exec(value)
  if (match) return { kind: 'operatingBalance', period: match[1] }

  match = /^Season\s+(\d+)$/.exec(value)
  if (match) return { kind: 'season', number: match[1] }

  match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/.exec(value)
  if (match) return { kind: 'shortDate', month: match[1], day: match[2] }

  return null
}

function getDynamicTranslation(
  descriptor: DynamicDescriptor,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (descriptor.kind) {
    case 'due':
      return t('attention.due', { date: descriptor.date })
    case 'until':
      return t('attention.until', { date: descriptor.date })
    case 'stages':
      return t('races.stages', { count: descriptor.count })
    case 'todayDate':
      return t('races.todayWithDate', { date: descriptor.date })
    case 'eligible':
      return t('staffBriefing.eligibleMany', { count: descriptor.count })
    case 'hireRole': {
      const roleKey = roleKeyByEnglish.get(descriptor.role.toLowerCase())
      const role = roleKey ? t(roleKey).toLowerCase() : descriptor.role
      return t('staffBriefing.hireRole', { role })
    }
    case 'notEnoughCoins':
      return t('staffBriefing.notEnoughCoins', {
        required: descriptor.required,
        balance: descriptor.balance,
      })
    case 'coins':
      return t('staffBriefing.coins', { count: descriptor.count })
    case 'realLifeDays':
      return t('staffBriefing.realLifeDays', { count: descriptor.count })
    case 'renewCoins':
      return t('staffBriefing.renewForCoins', { count: descriptor.count })
    case 'assignCoins':
      return t('staffBriefing.assignForCoins', { count: descriptor.count })
    case 'incomePercent':
      return t('finance.incomePercent', { percent: descriptor.percent })
    case 'expensesPercent':
      return t('finance.expensesPercent', { percent: descriptor.percent })
    case 'operatingBalance': {
      const periodKey =
        descriptor.period === 'Weekly'
          ? 'finance.weekly'
          : descriptor.period === 'Monthly'
            ? 'finance.monthly'
            : 'finance.season'
      return t('finance.operatingBalance', { period: t(periodKey) })
    }
    case 'season':
      return `${t('finance.season')} ${descriptor.number}`
    case 'shortDate':
      return `${t(`months.${descriptor.month}`)} ${descriptor.day}`
  }
}

function translateTextNodes(
  root: Element,
  t: (key: string, options?: Record<string, unknown>) => string,
): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const textNode = node as Text
    const normalized = normalizeText(textNode.nodeValue ?? '')
    const existingKey = nodeKey.get(textNode)
    const existingDynamic = dynamicNode.get(textNode)
    const sourceKey = existingKey ?? staticTextKeys.get(normalized)
    const descriptor = existingDynamic ?? detectDynamic(normalized)

    if (sourceKey) {
      nodeKey.set(textNode, sourceKey)
      const translated = t(sourceKey)
      if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
        textNode.nodeValue = translated
      }
    } else if (descriptor) {
      dynamicNode.set(textNode, descriptor)
      const translated = getDynamicTranslation(descriptor, t)
      if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
        textNode.nodeValue = translated
      }
    }

    node = walker.nextNode()
  }
}

function translateAttributes(
  root: Element,
  t: (key: string, options?: Record<string, unknown>) => string,
): void {
  root.querySelectorAll('*').forEach(element => {
    const attributes = ['aria-label', 'title'] as const
    let stored = attributeState.get(element)

    for (const attribute of attributes) {
      const current = normalizeText(element.getAttribute(attribute) ?? '')
      if (!current) continue

      let descriptor = stored?.get(attribute)

      if (!descriptor) {
        const staticKey =
          current === 'What Staff Advisory provides'
            ? 'staffBriefing.whatProvidesAria'
            : current === 'Staff Advisory information'
              ? 'staffBriefing.infoAria'
              : current === 'Refreshing'
                ? 'staffBriefing.refreshing'
                : current === 'Unknown country'
                  ? 'common.unknownCountry'
                  : current === 'Open the complete club history'
                    ? 'honours.viewAllAria'
                    : null

        if (staticKey) {
          descriptor = staticKey
        } else {
          let match = /^Show advisor notifications from\s+(.+)$/.exec(current)
          if (match) {
            descriptor = { kind: 'hireRole', role: `__notification__${match[1]}` }
          } else {
            match = /^Open\s+(.+)$/.exec(current)
            if (match) {
              descriptor = { kind: 'hireRole', role: `__open__${match[1]}` }
            }
          }
        }

        if (descriptor) {
          if (!stored) {
            stored = new Map<string, string | DynamicDescriptor>()
            attributeState.set(element, stored)
          }
          stored.set(attribute, descriptor)
        }
      }

      if (!descriptor) continue

      let translated: string
      if (typeof descriptor === 'string') {
        translated = t(descriptor)
      } else if (descriptor.kind === 'hireRole' && descriptor.role.startsWith('__notification__')) {
        translated = t('staffBriefing.showNotifications', {
          name: descriptor.role.replace('__notification__', ''),
        })
      } else if (descriptor.kind === 'hireRole' && descriptor.role.startsWith('__open__')) {
        translated = t('attention.openAction', {
          action: descriptor.role.replace('__open__', ''),
        })
      } else {
        translated = getDynamicTranslation(descriptor, t)
      }

      if (element.getAttribute(attribute) !== translated) {
        element.setAttribute(attribute, translated)
      }
    }
  })
}

export default function OverviewLegacyLocalizationBridge(): null {
  const { t, i18n } = useTranslation('overview')
  const [hashPath, setHashPath] = useState(getCurrentHashPath)

  const isOverview = useMemo(
    () =>
      hashPath === '/dashboard' ||
      hashPath === '/dashboard/' ||
      hashPath === '/dashboard/overview' ||
      hashPath.startsWith('/dashboard/overview?'),
    [hashPath],
  )

  useEffect(() => {
    const handleRouteChange = (): void => setHashPath(getCurrentHashPath())
    window.addEventListener('hashchange', handleRouteChange)
    return () => window.removeEventListener('hashchange', handleRouteChange)
  }, [])

  useEffect(() => {
    if (!isOverview) return

    let applying = false

    const applyTranslations = (): void => {
      if (applying) return
      applying = true

      try {
        const root = document.querySelector('main')
        if (!root) return
        translateTextNodes(root, t)
        translateAttributes(root, t)
      } finally {
        applying = false
      }
    }

    applyTranslations()

    const observer = new MutationObserver(applyTranslations)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    const handleLanguageChanged = (): void => applyTranslations()
    i18n.on('languageChanged', handleLanguageChanged)

    return () => {
      observer.disconnect()
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [i18n, isOverview, t])

  return null
}