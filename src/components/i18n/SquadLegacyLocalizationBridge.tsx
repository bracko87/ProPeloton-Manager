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
  ['First Squad', 'nav.firstSquad'],
  ['Developing Team', 'nav.developingTeam'],
  ['Staff', 'nav.staff'],
  ['Developing Team is currently unavailable.', 'nav.developingUnavailable'],
  ['Unlock Developing Team in Preferences first.', 'nav.unlockDeveloping'],

  ['Riders:', 'roster.riders'],
  ['Riders', 'roster.riders'],
  ['Loading squad…', 'roster.loading'],
  ['Loading squad...', 'roster.loading'],
  ['Could not load squad', 'roster.loadFailed'],
  ['No riders found for this club yet.', 'roster.noRiders'],
  ['View', 'roster.view'],
  ['General View', 'roster.generalView'],
  ['Financial View', 'roster.financialView'],
  ['Skills View', 'roster.skillsView'],
  ['Form & Development', 'roster.formDevelopment'],
  ['Checking Premium access…', 'roster.checkingPremium'],
  ['Checking Premium access...', 'roster.checkingPremium'],
  ['Advanced squad views require Premium.', 'roster.advancedPremium'],
  ['View Premium', 'roster.viewPremium'],
  ['Only for Premium users', 'roster.onlyPremium'],
  ['Premium only', 'roster.premiumOnly'],

  ['Name', 'columns.name'],
  ['Country', 'columns.country'],
  ['Role', 'columns.role'],
  ['Activity', 'columns.activity'],
  ['Age', 'columns.age'],
  ['Overall', 'columns.overall'],
  ['Status', 'columns.status'],
  ['Move', 'columns.move'],
  ['Value', 'columns.value'],
  ['Wage', 'columns.wage'],
  ['Contract Expires', 'columns.contractExpires'],
  ['Potential', 'columns.potential'],
  ['Morale', 'columns.morale'],
  ['Fatigue', 'columns.fatigue'],
  ['Health', 'columns.health'],
  ['Rider', 'columns.rider'],
  ['Case', 'columns.case'],
  ['Stage', 'columns.stage'],
  ['Severity', 'columns.severity'],
  ['Expected Recovery', 'columns.expectedRecovery'],
  ['Result', 'columns.result'],
  ['Int. pts', 'columns.internationalPoints'],
  ['Sharpness', 'columns.sharpness'],

  ['Fit', 'status.fit'],
  ['Injured', 'status.injured'],
  ['Sick', 'status.sick'],
  ['Not fully fit', 'status.notFullyFit'],
  ['Fresh', 'status.fresh'],
  ['Normal', 'status.normal'],
  ['Tired', 'status.tired'],
  ['Very Tired', 'status.veryTired'],
  ['Exhausted', 'status.exhausted'],
  ['Bad', 'status.bad'],
  ['Low', 'status.low'],
  ['Okay', 'status.okay'],
  ['Good', 'status.good'],
  ['Great', 'status.great'],
  ['Limited', 'status.limited'],
  ['Average', 'status.average'],
  ['Promising', 'status.promising'],
  ['High', 'status.high'],
  ['Elite', 'status.elite'],

  ['Race', 'activity.race'],
  ['Training camp', 'activity.trainingCamp'],
  ['Free', 'activity.free'],

  ['Movement window is closed.', 'movement.windowClosed'],
  ['Current window', 'movement.currentWindow'],
  ['Unknown', 'movement.unknown'],
  ['Rider moved to the Developing Team.', 'movement.movedToDeveloping'],
  ['Could not move rider to the Developing Team.', 'movement.couldNotMove'],
  ['Only riders aged 23 or younger can join the Developing Team.', 'movement.ageLimit'],
  ['Move to Developing Team', 'movement.moveToDeveloping'],

  ['Premium', 'premium.label'],
  ['Unlock with Premium', 'premium.unlock'],

  ['Health Report', 'healthReport.title'],
  ['Current injured, sick, and recovering first squad riders', 'healthReport.subtitle'],
  ['No active health concerns in the squad right now.', 'healthReport.none'],
  ['Squad Health Report', 'healthReport.lockedTitle'],
  [
    'See squad-wide injury, illness and recovery information in one consolidated report.',
    'healthReport.lockedDescription',
  ],

  ['Season Wins', 'season.wins'],
  ['Season Podiums', 'season.podiums'],
  ['Top 10 Results', 'season.top10'],
  ['Best GC', 'season.bestGc'],
  ['Season performance summary', 'season.performanceTitle'],
  [
    'Unlock season wins, podiums, Top 10 results and best general-classification performance.',
    'season.performanceDescription',
  ],
  ['Team Results This Season', 'season.teamResults'],
  ['View monthly team-performance trends across the current season.', 'season.teamResultsDescription'],
  ['Podiums & Placings', 'season.podiumsPlacings'],
  ['Analyse wins, podiums and finishing-position distribution.', 'season.podiumsPlacingsDescription'],
  ['Race Type Snapshot', 'season.raceType'],
  [
    'Compare your results across classics, mountain days, stage finishes and time trials.',
    'season.raceTypeDescription',
  ],
  ['One-day classics', 'season.oneDayClassics'],
  ['Stage finishes', 'season.stageFinishes'],
  ['Mountain days', 'season.mountainDays'],
  ['Time trials', 'season.timeTrials'],
  ['Wins', 'season.winsChart'],
  ['2nd', 'season.second'],
  ['3rd', 'season.third'],
  ['Top10', 'season.top10Chart'],
  ['Top20', 'season.top20Chart'],

  ['Last Team Race', 'races.lastTeamRace'],
  ['Next Team Race', 'races.nextTeamRace'],
  ['No race found yet', 'races.noRace'],
  ['No finished full-race classification found for this squad yet.', 'races.noFinished'],
  ['No next not-started submitted race plan found for this squad yet.', 'races.noNext'],

  ['Rider is on the transfer list', 'transfer.listed'],

  ['Jan', 'months.Jan'],
  ['Feb', 'months.Feb'],
  ['Mar', 'months.Mar'],
  ['Apr', 'months.Apr'],
  ['May', 'months.May'],
  ['Jun', 'months.Jun'],
  ['Jul', 'months.Jul'],
  ['Aug', 'months.Aug'],
  ['Sep', 'months.Sep'],
  ['Oct', 'months.Oct'],
  ['Nov', 'months.Nov'],
  ['Dec', 'months.Dec'],
])

type DynamicDescriptor =
  | { kind: 'squadFull'; max: string }
  | { kind: 'movementClosedNext'; window: string; period: boolean }
  | { kind: 'movementOpen'; window: string }
  | { kind: 'stages'; count: string }
  | { kind: 'stage'; number: string }
  | { kind: 'until'; date: string }
  | { kind: 'statusTitle'; label: string }

const nodeKey = new WeakMap<Node, string>()
const dynamicNode = new WeakMap<Node, DynamicDescriptor>()
const attributeState = new WeakMap<Element, Map<string, string | DynamicDescriptor>>()

function detectDynamic(value: string): DynamicDescriptor | null {
  let match = /^Squad is full \((\d+) riders\)\. Transfers, signings and promotions must respect the squad cap\.$/.exec(value)
  if (match) return { kind: 'squadFull', max: match[1] }

  match = /^Movement window is closed\. Next window: (.+)\.$/.exec(value)
  if (match) return { kind: 'movementClosedNext', window: match[1], period: true }

  match = /^Movement window closed\. Next window: (.+)$/.exec(value)
  if (match) return { kind: 'movementClosedNext', window: match[1], period: false }

  match = /^Movement window open now: (.+)$/.exec(value)
  if (match) return { kind: 'movementOpen', window: match[1] }

  match = /^(\d+) stages$/.exec(value)
  if (match) return { kind: 'stages', count: match[1] }

  match = /^Stage (\d+)$/.exec(value)
  if (match) return { kind: 'stage', number: match[1] }

  match = /^Until (.+)$/.exec(value)
  if (match) return { kind: 'until', date: match[1] }

  match = /^Status: (.+)$/.exec(value)
  if (match) return { kind: 'statusTitle', label: match[1] }

  return null
}

function statusKeyForLabel(label: string): string | null {
  return staticTextKeys.get(label) ?? null
}

function getDynamicTranslation(
  descriptor: DynamicDescriptor,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (descriptor.kind) {
    case 'squadFull':
      return t('roster.squadFull', { max: descriptor.max })
    case 'movementClosedNext':
      return t(
        descriptor.period ? 'movement.windowClosedNext' : 'movement.windowClosedNextNoPeriod',
        { window: descriptor.window },
      )
    case 'movementOpen':
      return t('movement.windowOpen', { window: descriptor.window })
    case 'stages':
      return t('races.stages', { count: descriptor.count })
    case 'stage':
      return t('activity.stage', { number: descriptor.number })
    case 'until':
      return t('activity.until', { date: descriptor.date })
    case 'statusTitle': {
      const key = statusKeyForLabel(descriptor.label)
      const translatedLabel = key ? t(key) : descriptor.label
      return `${t('columns.status')}: ${translatedLabel}`
    }
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
    const key = existingKey ?? staticTextKeys.get(normalized)
    const descriptor = existingDynamic ?? detectDynamic(normalized)

    if (key) {
      nodeKey.set(textNode, key)
      const translated = t(key)
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
    let stored = attributeState.get(element)

    for (const attribute of ['title', 'aria-label'] as const) {
      const current = normalizeText(element.getAttribute(attribute) ?? '')
      if (!current) continue

      let descriptor = stored?.get(attribute)
      if (!descriptor) {
        const key = staticTextKeys.get(current)
        descriptor = key ?? detectDynamic(current) ?? undefined

        if (descriptor) {
          if (!stored) {
            stored = new Map<string, string | DynamicDescriptor>()
            attributeState.set(element, stored)
          }
          stored.set(attribute, descriptor)
        }
      }

      if (!descriptor) continue

      const translated =
        typeof descriptor === 'string'
          ? t(descriptor)
          : getDynamicTranslation(descriptor, t)

      if (element.getAttribute(attribute) !== translated) {
        element.setAttribute(attribute, translated)
      }
    }
  })
}

export default function SquadLegacyLocalizationBridge(): null {
  const { t, i18n } = useTranslation('squad')
  const [hashPath, setHashPath] = useState(getCurrentHashPath)

  const isSquad = useMemo(
    () => hashPath === '/dashboard/squad' || hashPath.startsWith('/dashboard/squad?'),
    [hashPath],
  )

  useEffect(() => {
    const handleRouteChange = (): void => setHashPath(getCurrentHashPath())
    window.addEventListener('hashchange', handleRouteChange)
    return () => window.removeEventListener('hashchange', handleRouteChange)
  }, [])

  useEffect(() => {
    if (!isSquad) return

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
  }, [i18n, isSquad, t])

  return null
}
