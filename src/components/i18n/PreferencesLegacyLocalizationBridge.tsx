import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ADVISOR_NOTIFICATION_CATEGORY_DEFINITIONS,
  NOTIFICATION_PREFERENCE_GROUPS,
  NOTIFICATION_PREFERENCE_SECTIONS,
} from '@/lib/notificationPreferences'

function getCurrentHashPath(): string {
  if (typeof window === 'undefined') return '/'
  const raw = window.location.hash.replace(/^#/, '')
  return raw || '/'
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const staticTextKeys = new Map<string, string>([
  ['Preferences', 'page.title'],
  [
    'Real usable settings: in-game notification control and team danger-zone actions.',
    'page.description',
  ],
  ['In-Game Notifications', 'notifications.title'],
  [
    'Core game notifications and paid Staff Advisor notifications are controlled separately.',
    'notifications.description',
  ],
  ['Core Notifications', 'notifications.coreTitle'],
  [
    'Normal game notifications that remain available without a paid Staff Advisor.',
    'notifications.coreDescription',
  ],
  ['Staff Advisor Notifications', 'notifications.advisorTitle'],
  [
    'Paid advisor notifications grouped by topic. Switching a category off mutes every notification type in that topic. Individual notification types can then be unmuted from their notification card without changing this category checkbox.',
    'notifications.advisorDescription',
  ],
  [
    'Could not save the Staff Advisor notification setting. Please try again.',
    'notifications.advisorSaveError',
  ],
  [
    'A Core notification and an Advisor notification may cover the same topic without being the same event. Example: Race Supplies Low remains Core, while Equipment & Workshop Review is paid analysis.',
    'notifications.coreAdvisorNote',
  ],
  ['Developing Team', 'developingTeam.title'],
  [
    'Build and manage a U23 development squad with seasonal coin access.',
    'developingTeam.description',
  ],
  ['Loading Developing Team status...', 'developingTeam.loading'],
  ['Real-life progress', 'developingTeam.realLifeProgress'],
  ['Minimum 30 days required', 'developingTeam.realLifeMinimum'],
  ['In-game progress', 'developingTeam.gameProgress'],
  ['Minimum 60 days required', 'developingTeam.gameMinimum'],
  ['Coins', 'developingTeam.coins'],
  ['Developing Team active', 'developingTeam.active'],
  ['Active', 'developingTeam.activeBadge'],
  ['Current season', 'developingTeam.currentSeason'],
  ['Access ends', 'developingTeam.accessEnds'],
  ['Renewal price', 'developingTeam.renewalPrice'],
  ['Next renewal', 'developingTeam.nextRenewal'],
  ['Automatically renew each season', 'developingTeam.autoRenew'],
  ['Developing Team access expired', 'developingTeam.expired'],
  [
    'Your team, riders, contracts, results and history remain stored. The Developing Team is currently read-only.',
    'developingTeam.expiredDescription',
  ],
  ['Reactivating...', 'developingTeam.reactivating'],
  ['Activating...', 'developingTeam.activating'],
  ['Get coins', 'developingTeam.getCoins'],
  ['Not yet eligible', 'developingTeam.notEligible'],
  [
    'Developing Team becomes available after 30 real-life days or 60 in-game days.',
    'developingTeam.notEligibleDescription',
  ],
  ['Special rules', 'developingTeam.specialRules'],
  ['The team name will be your main club name plus U23.', 'developingTeam.teamNameRule'],
  [
    'This team can apply to races normally while seasonal access is active.',
    'developingTeam.raceRule',
  ],
  [
    'This team cannot be promoted above Continental level.',
    'developingTeam.competitionRule',
  ],
  ['Maximum roster size: 8 riders.', 'developingTeam.rosterRule'],
  ['Only riders aged 23 or younger are eligible.', 'developingTeam.ageRule'],
  [
    'Riders move between squads only during movement windows.',
    'developingTeam.movementRule',
  ],
  ['Danger Zone', 'dangerZone.title'],
  [
    'These are destructive actions and should stay separated from normal preferences.',
    'dangerZone.description',
  ],
  ['High-impact actions', 'dangerZone.badge'],
  ['Restart Team', 'dangerZone.restartTitle'],
  [
    'Restart this club back to a fresh starter state while keeping the same club name, logo, jersey, country, and competition slot.',
    'dangerZone.restartDescription',
  ],
  [
    'Current riders become free agents, season points reset to 0, and the team receives a new starter squad based on its current tier.',
    'dangerZone.restartDetail',
  ],
  ['Shut Down Team', 'dangerZone.shutdownTitle'],
  [
    'Permanently delete this user team AND the authentication account. After successful deletion, you will be redirected to the homepage and may sign up again with the same email.',
    'dangerZone.shutdownDescription',
  ],
  [
    'This should delete only the current user’s team data, not other users or other teams.',
    'dangerZone.shutdownDetail',
  ],
  ['Shutting down...', 'dangerZone.shuttingDown'],
  [
    'The notification system should check these saved preferences before creating or showing each notification type.',
    'dangerZone.systemNote',
  ],
  ['Confirm Team Shutdown', 'dangerZone.confirmTitle'],
  ['This action is permanent and cannot be undone.', 'dangerZone.confirmDescription'],
  ['You are about to permanently delete:', 'dangerZone.aboutToDelete'],
  ['Your current team', 'dangerZone.deleteTeam'],
  [
    'Your team riders, equipment, and team-related game data',
    'dangerZone.deleteGameData',
  ],
  ['Your authentication account for this email', 'dangerZone.deleteAccount'],
  [
    'After successful deletion, you will be signed out and redirected to the homepage. You may then register again with the same email address as a brand-new user.',
    'dangerZone.afterDelete',
  ],
  ['Cancel', 'dangerZone.cancel'],
  ['Permanently Shut Down Team', 'dangerZone.permanentButton'],
  [
    'You must type DELETE exactly to confirm this action.',
    'dangerZone.exactDeleteError',
  ],
  [
    'Your session is missing. Please sign in again and retry.',
    'dangerZone.missingSession',
  ],
  ['Failed to shut down team.', 'dangerZone.shutdownFailed'],
  [
    'Failed to shut down team due to an unexpected error.',
    'dangerZone.shutdownUnexpected',
  ],
])

for (const section of NOTIFICATION_PREFERENCE_SECTIONS) {
  staticTextKeys.set(section.title, `sections.${section.code}.title`)
  staticTextKeys.set(section.description, `sections.${section.code}.description`)
}

for (const [groupCode, definition] of Object.entries(NOTIFICATION_PREFERENCE_GROUPS)) {
  staticTextKeys.set(definition.label, `groups.${groupCode}.label`)
  staticTextKeys.set(definition.description, `groups.${groupCode}.description`)
}

for (const [categoryCode, definition] of Object.entries(
  ADVISOR_NOTIFICATION_CATEGORY_DEFINITIONS,
)) {
  staticTextKeys.set(definition.label, `advisorCategories.${categoryCode}.label`)
  staticTextKeys.set(
    definition.description,
    `advisorCategories.${categoryCode}.description`,
  )

  staticTextKeys.set(
    `${definition.description} Activate the required Staff Advisor to control this notification.`,
    `advisorCategories.${categoryCode}.descriptionWithInactiveSuffix`,
  )
}

const nodeKey = new WeakMap<Node, string>()
const enabledCountState = new WeakMap<Node, { enabled: string; total: string }>()

function findPreferencesPageRoot(): Element | null {
  const heading = Array.from(document.querySelectorAll('h2')).find(element => {
    const text = normalizeText(element.textContent ?? '')
    return text === 'Preferences' || text === 'Podešavanja'
  })

  if (!heading) return null

  return heading.parentElement?.parentElement?.parentElement ?? heading.parentElement
}

export default function PreferencesLegacyLocalizationBridge(): null {
  const { t, i18n } = useTranslation('preferences')
  const [hashPath, setHashPath] = useState(getCurrentHashPath)

  const isPreferences = useMemo(
    () =>
      hashPath === '/dashboard/preferences' ||
      hashPath.startsWith('/dashboard/preferences?'),
    [hashPath],
  )

  useEffect(() => {
    const handleRouteChange = (): void => setHashPath(getCurrentHashPath())
    window.addEventListener('hashchange', handleRouteChange)
    return () => window.removeEventListener('hashchange', handleRouteChange)
  }, [])

  useEffect(() => {
    if (!isPreferences) return

    let applying = false

    const translateRoot = (root: Element): void => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()

      while (node) {
        const textNode = node as Text
        const existingKey = nodeKey.get(textNode)
        const normalized = normalizeText(textNode.nodeValue ?? '')
        const sourceKey = existingKey ?? staticTextKeys.get(normalized)

        if (sourceKey) {
          nodeKey.set(textNode, sourceKey)

          let translated: string
          if (sourceKey.endsWith('.descriptionWithInactiveSuffix')) {
            const baseKey = sourceKey.replace('.descriptionWithInactiveSuffix', '.description')
            translated = `${t(baseKey)} ${t('notifications.advisorInactiveSuffix')}`
          } else {
            translated = t(sourceKey)
          }

          if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
            textNode.nodeValue = translated
          }
        } else {
          let count = enabledCountState.get(textNode)

          if (!count) {
            const match = normalized.match(/^(\d+)\/(\d+) on$/)
            if (match) {
              count = { enabled: match[1], total: match[2] }
              enabledCountState.set(textNode, count)
            }
          }

          if (count) {
            const translated = t('notifications.enabledCount', count)
            if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
              textNode.nodeValue = translated
            }
          }
        }

        node = walker.nextNode()
      }
    }

    const applyTranslations = (): void => {
      if (applying) return
      applying = true

      try {
        const pageRoot = findPreferencesPageRoot()
        if (pageRoot) translateRoot(pageRoot)

        const shutdownModal = document.querySelector(
          '[aria-labelledby="shutdown-team-modal-title"]',
        )
        if (shutdownModal) translateRoot(shutdownModal)

        const shutdownInput = document.getElementById('shutdown-confirm-input')
        if (shutdownInput instanceof HTMLInputElement) {
          shutdownInput.placeholder = t('dangerZone.placeholder')
        }

        const shutdownBackdrop = shutdownModal?.querySelector(
          ':scope > button[type="button"]',
        )
        if (shutdownBackdrop) {
          shutdownBackdrop.setAttribute('aria-label', t('dangerZone.closeAria'))
        }
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
  }, [i18n, isPreferences, t])

  return null
}
