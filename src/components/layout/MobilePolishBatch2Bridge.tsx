import { useEffect } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'
const PROFILE_SELECTOR = '[data-tutorial-target="race-profile"]'
const EXPANDED_ATTR = 'data-ppm-mobile-race-profile-expanded'
const PROFILE_HOST_ATTR = 'data-ppm-mobile-race-profile-host'
const SPONSOR_MODAL_ATTR = 'data-ppm-mobile-sponsor-offer-modal'

function isDashboardRacePage(): boolean {
  return Boolean(
    document.querySelector(
      'main[data-ppm-dashboard-main="true"][data-ppm-dashboard-page="races"]',
    ),
  )
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function looksLikeSponsorOfferModal(element: HTMLElement): boolean {
  const text = normalizeText(element.textContent)
  if (!text) return false

  const titleMatch =
    text.includes('main sponsor offers') ||
    text.includes('main sponsor offer') ||
    text.includes('hauptsponsor') ||
    text.includes('glavni sponzor') ||
    text.includes('glavnog sponzora')

  if (!titleMatch) return false

  const hasOfferAction = Array.from(element.querySelectorAll('button')).some(button => {
    const label = normalizeText(button.textContent)
    return (
      label.includes('sign offer') ||
      label.includes('angebot') ||
      label.includes('potpi') ||
      label.includes('sign')
    )
  })

  const hasOfferData =
    text.includes('guaranteed') ||
    text.includes('bonus pool') ||
    text.includes('contract coverage') ||
    text.includes('deal type') ||
    text.includes('garant') ||
    text.includes('bonus')

  return hasOfferAction || hasOfferData
}

function markSponsorOfferModals(): void {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [aria-modal="true"], .fixed.inset-0 > div',
    ),
  )

  candidates.forEach(element => {
    if (looksLikeSponsorOfferModal(element)) {
      element.setAttribute(SPONSOR_MODAL_ATTR, 'true')
    }
  })
}

function clearSponsorOfferMarks(): void {
  document
    .querySelectorAll<HTMLElement>(`[${SPONSOR_MODAL_ATTR}="true"]`)
    .forEach(element => element.removeAttribute(SPONSOR_MODAL_ATTR))
}

function collapseAllProfiles(): void {
  document
    .querySelectorAll<HTMLElement>(`[${EXPANDED_ATTR}="true"]`)
    .forEach(element => element.setAttribute(EXPANDED_ATTR, 'false'))
  delete document.body.dataset.ppmMobileRaceProfileOpen
}

function addProfileButton(profile: HTMLElement): void {
  if (profile.querySelector(':scope > .ppm-mobile-race-profile-expand')) return

  profile.setAttribute(PROFILE_HOST_ATTR, 'true')
  if (!profile.hasAttribute(EXPANDED_ATTR)) {
    profile.setAttribute(EXPANDED_ATTR, 'false')
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ppm-mobile-race-profile-expand'
  button.setAttribute('aria-label', 'Expand race profile')
  button.textContent = 'Expand'

  const syncLabel = () => {
    const expanded = profile.getAttribute(EXPANDED_ATTR) === 'true'
    button.textContent = expanded ? 'Close' : 'Expand'
    button.setAttribute('aria-label', expanded ? 'Close race profile' : 'Expand race profile')
    button.setAttribute('aria-expanded', String(expanded))
  }

  button.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()

    const nextExpanded = profile.getAttribute(EXPANDED_ATTR) !== 'true'
    collapseAllProfiles()
    profile.setAttribute(EXPANDED_ATTR, String(nextExpanded))

    if (nextExpanded) {
      document.body.dataset.ppmMobileRaceProfileOpen = 'true'
    }

    syncLabel()
  })

  syncLabel()
  profile.appendChild(button)
}

function enhanceRaceProfiles(): void {
  if (!isDashboardRacePage()) return

  document.querySelectorAll<HTMLElement>(PROFILE_SELECTOR).forEach(addProfileButton)
}

function clearRaceProfileEnhancements(): void {
  collapseAllProfiles()

  document
    .querySelectorAll<HTMLElement>(`[${PROFILE_HOST_ATTR}="true"]`)
    .forEach(profile => {
      profile.querySelector(':scope > .ppm-mobile-race-profile-expand')?.remove()
      profile.removeAttribute(PROFILE_HOST_ATTR)
      profile.removeAttribute(EXPANDED_ATTR)
    })
}

export default function MobilePolishBatch2Bridge(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
    let frameId = 0

    const scan = () => {
      frameId = 0

      if (!mediaQuery.matches) {
        clearRaceProfileEnhancements()
        clearSponsorOfferMarks()
        return
      }

      enhanceRaceProfiles()
      markSponsorOfferModals()
    }

    const scheduleScan = () => {
      if (frameId) return
      frameId = window.requestAnimationFrame(scan)
    }

    scheduleScan()

    const observer = new MutationObserver(scheduleScan)
    observer.observe(document.body, { childList: true, subtree: true })

    const handleHashChange = () => {
      clearRaceProfileEnhancements()
      clearSponsorOfferMarks()
      scheduleScan()
    }

    const handleMediaChange = () => {
      if (!mediaQuery.matches) {
        clearRaceProfileEnhancements()
        clearSponsorOfferMarks()
      }
      scheduleScan()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      collapseAllProfiles()
      scheduleScan()
    }

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('keydown', handleKeyDown)
    mediaQuery.addEventListener('change', handleMediaChange)

    return () => {
      observer.disconnect()
      if (frameId) window.cancelAnimationFrame(frameId)
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('keydown', handleKeyDown)
      mediaQuery.removeEventListener('change', handleMediaChange)
      clearRaceProfileEnhancements()
      clearSponsorOfferMarks()
    }
  }, [])

  return null
}
