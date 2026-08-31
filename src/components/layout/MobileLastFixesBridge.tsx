import { useEffect } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'
const COLLAPSE_STORAGE_PREFIX = 'ppm-mobile-section-layout-v1:'
const FALLBACK_CLASS = 'ppm-mobile-section-toggle-fallback'
const RACE_PROFILE_ATTR = 'data-ppm-last-race-profile'
const RACE_HERO_ATTR = 'data-ppm-last-race-hero'
const EXPANDED_ATTR = 'data-ppm-mobile-race-profile-expanded'

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function getPageKeyFor(element: HTMLElement): string {
  return element.closest<HTMLElement>('main[data-ppm-dashboard-page]')?.dataset.ppmDashboardPage ?? ''
}

function removeCollapsedId(pageKey: string, id: string): void {
  if (!pageKey || !id) return

  try {
    const storageKey = `${COLLAPSE_STORAGE_PREFIX}${pageKey}`
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : []
    const values = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value !== id)
      : []
    window.localStorage.setItem(storageKey, JSON.stringify(values))
  } catch {
    // Local storage must never block restoring a collapsed window.
  }
}

function getCollapsedTitle(host: HTMLElement): string {
  const heading = host.querySelector<HTMLElement>('h1, h2, h3, h4')
  const headingText = normalizeText(heading?.textContent)
  if (headingText) return headingText
  return 'Section'
}

function repairCollapsedSectionControls(): void {
  const hosts = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-ppm-mobile-section-collapsed="true"][data-ppm-mobile-section-id]',
    ),
  )

  hosts.forEach(host => {
    const directToggles = Array.from(host.children).filter(
      child => child instanceof HTMLButtonElement && child.classList.contains('ppm-mobile-section-toggle'),
    ) as HTMLButtonElement[]

    const normalToggle = directToggles.find(button => !button.classList.contains(FALLBACK_CLASS))
    const fallbackToggle = directToggles.find(button => button.classList.contains(FALLBACK_CLASS))

    if (normalToggle) {
      fallbackToggle?.remove()
      return
    }

    if (fallbackToggle) return

    const title = getCollapsedTitle(host)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `ppm-mobile-section-toggle ${FALLBACK_CLASS}`
    button.setAttribute('aria-expanded', 'false')
    button.setAttribute('aria-label', `Expand ${title}`)
    button.title = `Expand ${title}`

    const titleSpan = document.createElement('span')
    titleSpan.className = 'ppm-mobile-section-toggle-title'
    titleSpan.textContent = title

    const iconSpan = document.createElement('span')
    iconSpan.className = 'ppm-mobile-section-toggle-icon'
    iconSpan.setAttribute('aria-hidden', 'true')
    iconSpan.textContent = '+'

    button.append(titleSpan, iconSpan)

    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()

      const sectionId = host.dataset.ppmMobileSectionId ?? ''
      const pageKey = getPageKeyFor(host)
      removeCollapsedId(pageKey, sectionId)

      host.dataset.ppmMobileSectionCollapsed = 'false'
      button.remove()
    })

    host.appendChild(button)
  })
}

function clearFallbackSectionControls(): void {
  document.querySelectorAll(`.${FALLBACK_CLASS}`).forEach(button => button.remove())
}

function findRacePage(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    'main[data-ppm-dashboard-main="true"][data-ppm-dashboard-page="races"]',
  )
}

function markRaceHeroCard(): void {
  const page = findRacePage()
  if (!page) return

  page.querySelectorAll<HTMLElement>(`[${RACE_HERO_ATTR}="true"]`).forEach(element => {
    element.removeAttribute(RACE_HERO_ATTR)
  })

  const headings = Array.from(page.querySelectorAll<HTMLElement>('h1, h2'))
  for (const heading of headings) {
    let current = heading.parentElement
    let depth = 0

    while (current && current !== page && depth < 7) {
      const classText = typeof current.className === 'string' ? current.className : ''
      const text = normalizeText(current.textContent).toLowerCase()
      const looksLikeCard = classText.includes('rounded') && classText.includes('bg-white')
      const looksLikeRaceSummary =
        text.includes('race date') ||
        text.includes('applications open') ||
        text.includes('accepted') ||
        text.includes('prize fund')

      if (looksLikeCard && looksLikeRaceSummary) {
        current.setAttribute(RACE_HERO_ATTR, 'true')
        return
      }

      current = current.parentElement
      depth += 1
    }
  }
}

function setRaceProfileExpanded(host: HTMLElement, expanded: boolean): void {
  document
    .querySelectorAll<HTMLElement>(`[${RACE_PROFILE_ATTR}="true"][${EXPANDED_ATTR}="true"]`)
    .forEach(other => {
      if (other !== host) other.setAttribute(EXPANDED_ATTR, 'false')
    })

  host.setAttribute(EXPANDED_ATTR, String(expanded))
  if (expanded) {
    document.body.dataset.ppmMobileRaceProfileOpen = 'true'
  } else if (!document.querySelector(`[${RACE_PROFILE_ATTR}="true"][${EXPANDED_ATTR}="true"]`)) {
    delete document.body.dataset.ppmMobileRaceProfileOpen
  }

  const button = host.querySelector<HTMLButtonElement>(':scope > .ppm-mobile-race-profile-expand')
  if (button) {
    button.textContent = expanded ? 'Close' : 'Expand'
    button.setAttribute('aria-expanded', String(expanded))
    button.setAttribute('aria-label', expanded ? 'Close race profile' : 'Expand race profile')
  }
}

function enhanceOneRaceProfile(svg: SVGSVGElement): void {
  const host = svg.closest<HTMLElement>('div.overflow-hidden.rounded-2xl')
  if (!host || host.getAttribute(RACE_PROFILE_ATTR) === 'true') return

  host.setAttribute(RACE_PROFILE_ATTR, 'true')
  if (!host.hasAttribute(EXPANDED_ATTR)) host.setAttribute(EXPANDED_ATTR, 'false')

  const toggle = () => {
    setRaceProfileExpanded(host, host.getAttribute(EXPANDED_ATTR) !== 'true')
  }

  svg.style.cursor = 'zoom-in'
  svg.setAttribute('role', svg.getAttribute('role') ?? 'img')
  svg.setAttribute('tabindex', '0')
  svg.setAttribute('aria-label', 'Race profile. Tap to expand.')

  svg.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    toggle()
  })

  svg.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggle()
  })

  if (!host.querySelector(':scope > .ppm-mobile-race-profile-expand')) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ppm-mobile-race-profile-expand'
    button.textContent = 'Expand'
    button.setAttribute('aria-label', 'Expand race profile')
    button.setAttribute('aria-expanded', 'false')
    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      toggle()
    })
    host.appendChild(button)
  }
}

function enhanceRaceProfiles(): void {
  const page = findRacePage()
  if (!page) return

  const profileMasks = Array.from(
    page.querySelectorAll<SVGMaskElement>('svg mask[id^="stage-profile-above-mask-"]'),
  )

  profileMasks.forEach(mask => {
    const svg = mask.closest<SVGSVGElement>('svg')
    if (svg) enhanceOneRaceProfile(svg)
  })
}

function clearRaceEnhancements(): void {
  document.querySelectorAll<HTMLElement>(`[${RACE_HERO_ATTR}="true"]`).forEach(element => {
    element.removeAttribute(RACE_HERO_ATTR)
  })

  document.querySelectorAll<HTMLElement>(`[${RACE_PROFILE_ATTR}="true"]`).forEach(host => {
    host.setAttribute(EXPANDED_ATTR, 'false')
    host.removeAttribute(RACE_PROFILE_ATTR)
  })
  delete document.body.dataset.ppmMobileRaceProfileOpen
}

export default function MobileLastFixesBridge(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
    let frameId = 0

    const scan = () => {
      frameId = 0

      if (!mediaQuery.matches) {
        clearFallbackSectionControls()
        clearRaceEnhancements()
        return
      }

      repairCollapsedSectionControls()
      markRaceHeroCard()
      enhanceRaceProfiles()
    }

    const scheduleScan = () => {
      if (frameId) return
      frameId = window.requestAnimationFrame(scan)
    }

    scheduleScan()

    const observer = new MutationObserver(scheduleScan)
    observer.observe(document.body, { childList: true, subtree: true })

    const handleHashChange = () => scheduleScan()
    const handleMediaChange = () => scheduleScan()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      document
        .querySelectorAll<HTMLElement>(`[${RACE_PROFILE_ATTR}="true"][${EXPANDED_ATTR}="true"]`)
        .forEach(host => setRaceProfileExpanded(host, false))
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
      clearFallbackSectionControls()
      clearRaceEnhancements()
    }
  }, [])

  return null
}
