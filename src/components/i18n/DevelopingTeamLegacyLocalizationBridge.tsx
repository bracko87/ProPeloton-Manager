import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import i18n from '../../i18n'
import enDevelopingTeam from '../../i18n/locales/en/developingTeam.json'
import srDevelopingTeam from '../../i18n/locales/sr-Latn/developingTeam.json'

if (!i18n.hasResourceBundle('en', 'developingTeam')) {
  i18n.addResourceBundle('en', 'developingTeam', enDevelopingTeam, true, true)
}

if (!i18n.hasResourceBundle('sr-Latn', 'developingTeam')) {
  i18n.addResourceBundle('sr-Latn', 'developingTeam', srDevelopingTeam, true, true)
}

function getCurrentHashPath(): string {
  if (typeof window === 'undefined') return '/'
  const raw = window.location.hash.replace(/^#/, '')
  return raw || '/'
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const staticTextKeys = new Map<string, string>([
  ['Squad', 'developingTeam:page.title'],
  ['Manage your Developing Team roster and movement windows.', 'developingTeam:page.subtitle'],
  ['Loading Developing Team…', 'developingTeam:page.loading'],
  ['Loading Developing Team...', 'developingTeam:page.loading'],
  ['Could not load Developing Team', 'developingTeam:page.loadFailed'],
  ['Current Competition', 'developingTeam:page.currentCompetition'],
  ['Loading competition…', 'developingTeam:page.loadingCompetition'],
  ['Loading competition...', 'developingTeam:page.loadingCompetition'],
  ['Competition unavailable', 'developingTeam:page.competitionUnavailable'],
  ['No riders found for the Developing Team yet.', 'developingTeam:page.noRiders'],

  ['First Squad', 'squad:nav.firstSquad'],
  ['Developing Team', 'squad:nav.developingTeam'],
  ['Staff', 'squad:nav.staff'],
  ['Unlock Developing Team in Preferences first.', 'squad:nav.unlockDeveloping'],

  ['General View', 'squad:roster.generalView'],
  ['Financial View', 'squad:roster.financialView'],
  ['Skills View', 'squad:roster.skillsView'],
  ['Form & Development', 'squad:roster.formDevelopment'],
  ['Checking Premium access…', 'squad:roster.checkingPremium'],
  ['Checking Premium access...', 'squad:roster.checkingPremium'],
  ['Advanced squad views require Premium.', 'squad:roster.advancedPremium'],
  ['View Premium', 'squad:roster.viewPremium'],
  ['Only for Premium users', 'squad:roster.onlyPremium'],
  ['Premium only', 'squad:roster.premiumOnly'],
  ['View', 'squad:roster.view'],

  ['Name', 'squad:columns.name'],
  ['Country', 'squad:columns.country'],
  ['Role', 'squad:columns.role'],
  ['Activity', 'squad:columns.activity'],
  ['Age', 'squad:columns.age'],
  ['Overall', 'squad:columns.overall'],
  ['Status', 'squad:columns.status'],
  ['Move', 'squad:columns.move'],
  ['Value', 'squad:columns.value'],
  ['Wage', 'squad:columns.wage'],
  ['Contract Expires', 'squad:columns.contractExpires'],
  ['Potential', 'squad:columns.potential'],
  ['Morale', 'squad:columns.morale'],
  ['Fatigue', 'squad:columns.fatigue'],
  ['Health', 'squad:columns.health'],
  ['Rider', 'squad:columns.rider'],
  ['Case', 'squad:columns.case'],
  ['Stage', 'squad:columns.stage'],
  ['Severity', 'squad:columns.severity'],
  ['Expected Recovery', 'squad:columns.expectedRecovery'],
  ['Result', 'squad:columns.result'],
  ['Int. pts', 'squad:columns.internationalPoints'],
  ['Sharpness', 'squad:columns.sharpness'],

  ['Fit', 'squad:status.fit'],
  ['Injured', 'squad:status.injured'],
  ['Sick', 'squad:status.sick'],
  ['Not fully fit', 'squad:status.notFullyFit'],
  ['Fresh', 'squad:status.fresh'],
  ['Normal', 'squad:status.normal'],
  ['Tired', 'squad:status.tired'],
  ['Very Tired', 'squad:status.veryTired'],
  ['Exhausted', 'squad:status.exhausted'],
  ['Bad', 'squad:status.bad'],
  ['Low', 'squad:status.low'],
  ['Okay', 'squad:status.okay'],
  ['Good', 'squad:status.good'],
  ['Great', 'squad:status.great'],
  ['Limited', 'squad:status.limited'],
  ['Average', 'squad:status.average'],
  ['Promising', 'squad:status.promising'],
  ['High', 'squad:status.high'],
  ['Elite', 'squad:status.elite'],

  ['Race', 'squad:activity.race'],
  ['Training camp', 'squad:activity.trainingCamp'],
  ['Free', 'squad:activity.free'],

  ['First Squad is unavailable.', 'developingTeam:movement.firstSquadUnavailable'],
  ['Movement window is closed.', 'developingTeam:movement.windowClosed'],
  ['Rider moved to the First Squad.', 'developingTeam:movement.movedToFirstSquad'],
  ['Could not move rider to the First Squad.', 'developingTeam:movement.couldNotMove'],
  ['Action required now', 'developingTeam:movement.actionRequiredNow'],
  ['Must move next window', 'developingTeam:movement.mustMoveNextWindow'],
  ['Move to First Squad', 'developingTeam:movement.moveToFirstSquad'],

  ['Premium', 'squad:premium.label'],
  ['Unlock with Premium', 'squad:premium.unlock'],

  ['Health Report', 'squad:healthReport.title'],
  ['Current injured, sick, and recovering developing team riders', 'developingTeam:healthReport.subtitle'],
  ['No active health concerns in the squad right now.', 'squad:healthReport.none'],
  ['Developing Team Health Report', 'developingTeam:healthReport.lockedTitle'],
  [
    'See squad-wide injury, illness and recovery information for your development riders in one consolidated report.',
    'developingTeam:healthReport.lockedDescription',
  ],

  ['Season Wins', 'squad:season.wins'],
  ['Season Podiums', 'squad:season.podiums'],
  ['Top 10 Results', 'squad:season.top10'],
  ['Best GC', 'squad:season.bestGc'],
  ['Season performance summary', 'squad:season.performanceTitle'],
  [
    'Unlock season wins, podiums, Top 10 results and best general-classification performance.',
    'squad:season.performanceDescription',
  ],
  ['Team Results This Season', 'squad:season.teamResults'],
  ['Developing Team Results This Season', 'developingTeam:season.resultsLockedTitle'],
  [
    'View monthly development-team performance trends across the current season.',
    'developingTeam:season.resultsLockedDescription',
  ],
  ['Podiums & Placings', 'squad:season.podiumsPlacings'],
  ['Developing Team Podiums & Placings', 'developingTeam:season.podiumsLockedTitle'],
  [
    'Analyse wins, podiums and finishing-position distribution for your development squad.',
    'developingTeam:season.podiumsLockedDescription',
  ],
  ['Race Type Snapshot', 'squad:season.raceType'],
  ['Developing Team Race Type Snapshot', 'developingTeam:season.raceTypeLockedTitle'],
  [
    'Compare development-team results across classics, mountain days, stage finishes and time trials.',
    'developingTeam:season.raceTypeLockedDescription',
  ],
  ['One-day classics', 'squad:season.oneDayClassics'],
  ['Stage finishes', 'squad:season.stageFinishes'],
  ['Mountain days', 'squad:season.mountainDays'],
  ['Time trials', 'squad:season.timeTrials'],
  ['Wins', 'squad:season.winsChart'],
  ['2nd', 'squad:season.second'],
  ['3rd', 'squad:season.third'],
  ['Top10', 'squad:season.top10Chart'],
  ['Top20', 'squad:season.top20Chart'],
  ['Jan', 'squad:months.Jan'],
  ['Feb', 'squad:months.Feb'],
  ['Mar', 'squad:months.Mar'],
  ['Apr', 'squad:months.Apr'],
  ['May', 'squad:months.May'],
  ['Jun', 'squad:months.Jun'],
  ['Jul', 'squad:months.Jul'],
  ['Aug', 'squad:months.Aug'],
  ['Sep', 'squad:months.Sep'],
  ['Oct', 'squad:months.Oct'],
  ['Nov', 'squad:months.Nov'],
  ['Dec', 'squad:months.Dec'],

  ['Last Team Race', 'squad:races.lastTeamRace'],
  ['Next Team Race', 'squad:races.nextTeamRace'],
  ['No race found yet', 'squad:races.noRace'],
  ['No finished full-race classification found for this squad yet.', 'squad:races.noFinished'],
  ['No next not-started submitted race plan found for this squad yet.', 'squad:races.noNext'],
])

type DynamicDescriptor =
  | { kind: 'ridersLabel' }
  | { kind: 'windowOpen'; window: string }
  | { kind: 'windowClosedNext'; window: string; period: boolean }
  | { kind: 'firstSquadFull'; count: string; max: string }
  | { kind: 'stages'; count: string }
  | { kind: 'stage'; number: string }
  | { kind: 'statusTitle'; sourceLabel: string }

const nodeKey = new WeakMap<Node, string>()
const dynamicNode = new WeakMap<Node, DynamicDescriptor>()
const attributeState = new WeakMap<Element, Map<string, string | DynamicDescriptor>>()

function detectDynamic(value: string): DynamicDescriptor | null {
  if (value === 'Riders:') return { kind: 'ridersLabel' }

  let match = /^Movement window open now:\s*(.+)$/.exec(value)
  if (match) return { kind: 'windowOpen', window: match[1] }

  match = /^Movement window is closed\. Next window:\s*(.+)\.$/.exec(value)
  if (match) return { kind: 'windowClosedNext', window: match[1], period: true }

  match = /^Movement window closed\. Next window:\s*(.+)$/.exec(value)
  if (match) return { kind: 'windowClosedNext', window: match[1], period: false }

  match = /^First Squad is full \((\d+)\/(\d+)\)\.$/.exec(value)
  if (match) return { kind: 'firstSquadFull', count: match[1], max: match[2] }

  match = /^(\d+) stages$/.exec(value)
  if (match) return { kind: 'stages', count: match[1] }

  match = /^Stage\s+(\d+)$/.exec(value)
  if (match) return { kind: 'stage', number: match[1] }

  match = /^Status:\s*(.+)$/.exec(value)
  if (match) return { kind: 'statusTitle', sourceLabel: match[1] }

  return null
}

function translateStatusLabel(
  sourceLabel: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const key = staticTextKeys.get(normalizeText(sourceLabel))
  return key ? t(key) : sourceLabel
}

function getDynamicTranslation(
  descriptor: DynamicDescriptor,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (descriptor.kind) {
    case 'ridersLabel':
      return `${t('developingTeam:page.riders')}:`
    case 'windowOpen':
      return t('developingTeam:movement.windowOpen', { window: descriptor.window })
    case 'windowClosedNext':
      return t(
        descriptor.period
          ? 'developingTeam:movement.windowClosedNext'
          : 'developingTeam:movement.windowClosedNextNoPeriod',
        { window: descriptor.window },
      )
    case 'firstSquadFull':
      return t('developingTeam:movement.firstSquadFull', {
        count: descriptor.count,
        max: descriptor.max,
      })
    case 'stages':
      return t('squad:races.stages', { count: descriptor.count })
    case 'stage':
      return t('squad:activity.stage', { number: descriptor.number })
    case 'statusTitle':
      return `${t('squad:columns.status')}: ${translateStatusLabel(descriptor.sourceLabel, t)}`
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
    const dynamic = existingDynamic ?? detectDynamic(normalized)

    if (key) {
      nodeKey.set(textNode, key)
      const translated = t(key)
      if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
        textNode.nodeValue = translated
      }
    } else if (dynamic) {
      dynamicNode.set(textNode, dynamic)
      const translated = getDynamicTranslation(dynamic, t)
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
        const staticKey = staticTextKeys.get(current)
        const dynamic = detectDynamic(current)
        descriptor = staticKey ?? dynamic ?? undefined

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

export default function DevelopingTeamLegacyLocalizationBridge(): null {
  const { t, i18n: reactI18n } = useTranslation(['developingTeam', 'squad'])
  const [hashPath, setHashPath] = useState(getCurrentHashPath)

  const isDevelopingTeam = useMemo(
    () =>
      hashPath === '/dashboard/developing-team' ||
      hashPath.startsWith('/dashboard/developing-team?'),
    [hashPath],
  )

  useEffect(() => {
    const handleRouteChange = (): void => setHashPath(getCurrentHashPath())
    window.addEventListener('hashchange', handleRouteChange)
    return () => window.removeEventListener('hashchange', handleRouteChange)
  }, [])

  useEffect(() => {
    if (!isDevelopingTeam) return

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
    reactI18n.on('languageChanged', handleLanguageChanged)

    return () => {
      observer.disconnect()
      reactI18n.off('languageChanged', handleLanguageChanged)
    }
  }, [isDevelopingTeam, reactI18n, t])

  return null
}