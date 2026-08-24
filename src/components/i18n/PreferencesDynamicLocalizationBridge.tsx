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

type DynamicTranslation = {
  key: string
  params?: Record<string, string>
}

const dynamicState = new WeakMap<Node, DynamicTranslation>()

function findPreferencesPageRoot(): Element | null {
  const heading = Array.from(document.querySelectorAll('h2')).find(element => {
    const text = normalizeText(element.textContent ?? '')
    return text === 'Preferences' || text === 'Podešavanja'
  })

  if (!heading) return null
  return heading.parentElement?.parentElement?.parentElement ?? heading.parentElement
}

function detectDynamicTranslation(value: string): DynamicTranslation | null {
  let match = value.match(/^(\d+) coins per renewal$/)
  if (match) return { key: 'coins.perRenewal', params: { cost: match[1] } }

  match = value.match(/^(\d+) coins to activate$/)
  if (match) return { key: 'coins.toActivate', params: { cost: match[1] } }

  match = value.match(/^Reactivation price: (\d+) coins$/)
  if (match) return { key: 'coins.reactivationPrice', params: { cost: match[1] } }

  match = value.match(/^Next renewal: (\d+) coins$/)
  if (match) return { key: 'coins.nextRenewal', params: { cost: match[1] } }

  match = value.match(/^First activation: (\d+) coins$/)
  if (match) return { key: 'coins.firstActivation', params: { cost: match[1] } }

  match = value.match(/^Reactivate for Season (\d+) — (\d+) Coins$/)
  if (match) {
    return {
      key: 'activation.reactivateForSeason',
      params: { season: match[1], cost: match[2] },
    }
  }

  match = value.match(/^Activate Developing Team — (\d+) Coins$/)
  if (match) return { key: 'activation.activate', params: { cost: match[1] } }

  match = value.match(/^Movement window open now: (.+)$/)
  if (match) return { key: 'movement.open', params: { label: match[1] } }

  match = value.match(/^Movement window closed\. Next window: (.+)$/)
  if (match) return { key: 'movement.closed', params: { label: match[1] } }

  if (value === 'Movement window unavailable.') {
    return { key: 'movement.unavailable' }
  }

  match = value.match(
    /^Developing Team activated for Season (\d+)\. Automatic renewal is (on|off)\.$/,
  )
  if (match) {
    return {
      key: 'activation.activatedForSeason',
      params: {
        season: match[1],
        renewalKey: match[2],
      },
    }
  }

  if (value === 'Developing Team activated successfully.') {
    return { key: 'activation.activatedSuccessfully' }
  }

  if (value === 'Developing Team automatic renewal enabled.') {
    return { key: 'activation.renewalEnabled' }
  }

  if (value === 'Developing Team automatic renewal disabled.') {
    return { key: 'activation.renewalDisabled' }
  }

  if (value === 'Failed to load Developing Team status.') {
    return { key: 'errors.loadStatus' }
  }

  if (value === 'Failed to activate Developing Team.') {
    return { key: 'errors.activate' }
  }

  if (value === 'Failed to update automatic renewal.') {
    return { key: 'errors.renewal' }
  }

  return null
}

export default function PreferencesDynamicLocalizationBridge(): null {
  const { t, i18n } = useTranslation('preferencesDynamic')
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
        const normalized = normalizeText(textNode.nodeValue ?? '')
        const state = dynamicState.get(textNode) ?? detectDynamicTranslation(normalized)

        if (state) {
          dynamicState.set(textNode, state)

          const params = { ...(state.params ?? {}) }
          if (params.renewalKey) {
            params.renewal = t(`activation.${params.renewalKey}`)
            delete params.renewalKey
          }

          const translated = t(state.key, params)
          if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
            textNode.nodeValue = translated
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

        const activationModal = document.querySelector(
          '[aria-labelledby="developing-team-activation-modal-title"]',
        )
        if (activationModal) translateRoot(activationModal)
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
