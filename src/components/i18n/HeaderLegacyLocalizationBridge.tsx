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
  ['Inbox', 'inbox'],
  ['My Profile', 'myProfile'],
  ['Customize Team', 'customizeTeam'],
  ['Forum', 'forum'],
  ['Preferences', 'preferences'],
  ['Help', 'help'],
  ['Contact Us', 'contactUs'],
  ['Pro Packages', 'proPackages'],
  ['Invite Friends', 'inviteFriends'],
  ['Logout', 'logout'],
  ['Team Name:', 'header.teamName'],
  ['Naming rights', 'header.namingRights'],
  ['Account', 'header.account'],
  ['Premium', 'header.premium'],
  ['Free', 'header.free'],
  ['Coin', 'header.coin'],
  ['Coins', 'header.coins'],
  ['Menu', 'header.menu'],
  ['Team:', 'header.team'],
  ['Original club:', 'header.originalClub'],
  ['Club country', 'header.clubCountry'],
  ['Manager', 'header.manager'],
])

const nodeKey = new WeakMap<Node, string>()
const rankingState = new WeakMap<
  Node,
  { positionOrdinal: string; positionNumber: string; competition: string }
>()
const membershipState = new WeakMap<Element, 'premium' | 'free'>()

export default function HeaderLegacyLocalizationBridge(): null {
  const { t, i18n } = useTranslation('navigation')
  const [hashPath, setHashPath] = useState(getCurrentHashPath)

  const isDashboard = useMemo(
    () => hashPath === '/dashboard' || hashPath.startsWith('/dashboard/'),
    [hashPath],
  )

  useEffect(() => {
    const handleRouteChange = (): void => setHashPath(getCurrentHashPath())
    window.addEventListener('hashchange', handleRouteChange)
    return () => window.removeEventListener('hashchange', handleRouteChange)
  }, [])

  useEffect(() => {
    if (!isDashboard) return

    let applying = false

    const translateTextNodes = (header: Element): void => {
      const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()

      while (node) {
        const textNode = node as Text
        const existingKey = nodeKey.get(textNode)
        const normalized = normalizeText(textNode.nodeValue ?? '')
        const sourceKey = existingKey ?? staticTextKeys.get(normalized)

        if (sourceKey) {
          nodeKey.set(textNode, sourceKey)
          const translated = t(sourceKey)

          if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
            textNode.nodeValue = translated
          }
        } else {
          let ranking = rankingState.get(textNode)

          if (!ranking) {
            const match = normalized.match(/^(\d+(?:st|nd|rd|th)) in (.+) Ranking$/)
            if (match) {
              ranking = {
                positionOrdinal: match[1],
                positionNumber: match[1].replace(/\D/g, ''),
                competition: match[2],
              }
              rankingState.set(textNode, ranking)
            }
          }

          if (ranking) {
            const translated = t('header.ranking', ranking)
            if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
              textNode.nodeValue = translated
            }
          }
        }

        node = walker.nextNode()
      }
    }

    const translateAttributes = (header: Element): void => {
      const toggleButton = Array.from(header.querySelectorAll('button')).find(
        button => normalizeText(button.textContent ?? '') === '☰',
      )
      if (toggleButton) {
        toggleButton.setAttribute('aria-label', t('header.toggleSidebar'))
      }

      const notificationButton = header.querySelector(
        '[data-tutorial-target="header-notifications"]',
      )
      if (notificationButton) {
        notificationButton.setAttribute('aria-label', t('header.notifications'))
      }

      const menuButton = header.querySelector('[data-tutorial-target="header-menu"]')
      if (menuButton) {
        menuButton.setAttribute('aria-label', t('header.openProfileMenu'))
      }

      const profileMenu = header.querySelector('[role="menu"]')
      if (profileMenu) {
        profileMenu.setAttribute('aria-label', t('header.profileMenu'))
      }

      const membershipButton = header.querySelector(
        '[data-tutorial-target="header-membership"]',
      )

      if (membershipButton) {
        let state = membershipState.get(membershipButton)
        const aria = membershipButton.getAttribute('aria-label') ?? ''
        const text = normalizeText(membershipButton.textContent ?? '')

        // The membership button initially renders a loading/default state and can
        // later resolve to Premium. Always trust the resolved visible state when
        // it is available instead of permanently caching the initial fallback.
        if (text === 'Premium' || text === t('header.premium')) {
          state = 'premium'
        } else if (text === 'Free' || text === t('header.free')) {
          state = 'free'
        } else if (!state) {
          if (/premium/i.test(aria) && !/free/i.test(aria)) {
            state = 'premium'
          } else if (/free/i.test(aria)) {
            state = 'free'
          }
        }

        if (state) membershipState.set(membershipButton, state)

        if (state === 'premium') {
          membershipButton.setAttribute('aria-label', t('header.premiumAccountMember'))
          membershipButton.setAttribute('title', t('header.premiumAccount'))
        } else if (state === 'free') {
          membershipButton.setAttribute('aria-label', t('header.freeAccountMember'))
          membershipButton.setAttribute('title', t('header.freeAccount'))
        }
      }
    }

    const applyTranslations = (): void => {
      if (applying) return
      applying = true

      try {
        const header = document.querySelector('header')
        if (!header || header.closest('#public-homepage')) return

        translateTextNodes(header)
        translateAttributes(header)
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
  }, [i18n, isDashboard, t])

  return null
}