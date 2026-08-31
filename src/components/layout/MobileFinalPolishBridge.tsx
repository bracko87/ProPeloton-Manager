import { useEffect } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

function textOf(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function clearMarks(): void {
  document.querySelectorAll<HTMLElement>('[data-ppm-final-sponsor-modal="true"]').forEach(el => el.removeAttribute('data-ppm-final-sponsor-modal'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-sponsor-offer-card="true"]').forEach(el => el.removeAttribute('data-ppm-final-sponsor-offer-card'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-sponsor-sign-button="true"]').forEach(el => el.removeAttribute('data-ppm-final-sponsor-sign-button'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-sponsor-offer-image="true"]').forEach(el => el.removeAttribute('data-ppm-final-sponsor-offer-image'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-sponsor-logo-host="true"]').forEach(el => el.removeAttribute('data-ppm-final-sponsor-logo-host'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-sponsor-metric="true"]').forEach(el => el.removeAttribute('data-ppm-final-sponsor-metric'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-sponsor-metrics="true"]').forEach(el => el.removeAttribute('data-ppm-final-sponsor-metrics'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-statistics-five-col="true"]').forEach(el => el.removeAttribute('data-ppm-final-statistics-five-col'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-staff-info-host="true"]').forEach(el => el.removeAttribute('data-ppm-final-staff-info-host'))
  document.querySelectorAll<HTMLElement>('[data-ppm-final-staff-info-button="true"]').forEach(el => el.removeAttribute('data-ppm-final-staff-info-button'))
}

function isSponsorDialog(dialog: HTMLElement): boolean {
  const text = textOf(dialog)
  if (!text) return false

  const sponsorWord =
    text.includes('sponsor') ||
    text.includes('sponzor') ||
    text.includes('patrocin')

  if (!sponsorWord) return false

  return Array.from(dialog.querySelectorAll('button')).some(button => {
    const label = textOf(button)
    return (
      label.includes('sign offer') ||
      label.includes('sign') ||
      label.includes('angebot') ||
      label.includes('potpi') ||
      label.includes('firmar')
    )
  })
}

function looksLikeOfferAction(button: HTMLButtonElement): boolean {
  const label = textOf(button)
  return (
    label.includes('sign offer') ||
    label === 'sign' ||
    label.includes('angebot') ||
    label.includes('potpi') ||
    label.includes('firmar')
  )
}

const METRIC_LABELS = [
  'total value',
  'cash paid now',
  'equipment fund',
  'guaranteed',
  'bonus pool',
  'contract coverage',
  'deal type',
]

function findOfferCard(button: HTMLButtonElement, dialog: HTMLElement): HTMLElement | null {
  let current = button.parentElement

  while (current && current !== dialog) {
    const text = textOf(current)
    const metricHits = METRIC_LABELS.filter(label => text.includes(label)).length
    if (current.querySelector('img') && metricHits >= 2) return current
    current = current.parentElement
  }

  return button.parentElement
}

function markSponsorDialogs(): void {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], .fixed.inset-0 > div'),
  )

  dialogs.forEach(dialog => {
    if (!isSponsorDialog(dialog)) return

    dialog.setAttribute('data-ppm-final-sponsor-modal', 'true')

    const offerButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).filter(looksLikeOfferAction)

    offerButtons.forEach(button => {
      button.setAttribute('data-ppm-final-sponsor-sign-button', 'true')

      const card = findOfferCard(button, dialog)
      if (!card) return
      card.setAttribute('data-ppm-final-sponsor-offer-card', 'true')

      const image = card.querySelector<HTMLImageElement>('img')
      if (image) {
        image.setAttribute('data-ppm-final-sponsor-offer-image', 'true')
        image.parentElement?.setAttribute('data-ppm-final-sponsor-logo-host', 'true')
      }

      const metricElements = Array.from(card.querySelectorAll<HTMLElement>('div')).filter(element => {
        const text = textOf(element)
        if (!text || text.length > 180) return false
        return METRIC_LABELS.some(label => text.startsWith(label))
      })

      metricElements.forEach(element => element.setAttribute('data-ppm-final-sponsor-metric', 'true'))

      const parents = new Set(metricElements.map(element => element.parentElement).filter(Boolean) as HTMLElement[])
      parents.forEach(parent => {
        const directMetricCount = Array.from(parent.children).filter(child =>
          child instanceof HTMLElement && child.getAttribute('data-ppm-final-sponsor-metric') === 'true'
        ).length
        if (directMetricCount >= 2) parent.setAttribute('data-ppm-final-sponsor-metrics', 'true')
      })
    })
  })
}

function markStatisticsTables(): void {
  const page = document.querySelector<HTMLElement>('main[data-ppm-dashboard-main="true"][data-ppm-dashboard-page="statistics"]')
  if (!page) return

  page.querySelectorAll<HTMLTableElement>('table').forEach(table => {
    const headers = Array.from(table.querySelectorAll('thead th'))
    if (headers.length !== 5) return

    const first = textOf(headers[0])
    const last = textOf(headers[4])
    if (first === '#' && (last.includes('point') || last.includes('punkte') || last.includes('poen'))) {
      table.setAttribute('data-ppm-final-statistics-five-col', 'true')
    }
  })
}

function markStaffInfoButton(): void {
  const page = document.querySelector<HTMLElement>('main[data-ppm-dashboard-main="true"][data-ppm-dashboard-page="staff"]')
  if (!page) return

  const buttons = Array.from(page.querySelectorAll<HTMLButtonElement>('button')).filter(button => textOf(button) === 'i')

  buttons.forEach(button => {
    let current = button.parentElement
    let host: HTMLElement | null = null

    while (current && current !== page) {
      const heading = current.querySelector('h2, h3, h4')
      if (heading && current.classList.contains('bg-white')) {
        host = current
        break
      }
      current = current.parentElement
    }

    if (!host) return
    host.setAttribute('data-ppm-final-staff-info-host', 'true')
    button.setAttribute('data-ppm-final-staff-info-button', 'true')
  })
}

export default function MobileFinalPolishBridge(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
    let frameId = 0

    const scan = () => {
      frameId = 0
      clearMarks()
      if (!mediaQuery.matches) return
      markSponsorDialogs()
      markStatisticsTables()
      markStaffInfoButton()
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

    window.addEventListener('hashchange', handleHashChange)
    mediaQuery.addEventListener('change', handleMediaChange)

    return () => {
      observer.disconnect()
      if (frameId) window.cancelAnimationFrame(frameId)
      window.removeEventListener('hashchange', handleHashChange)
      mediaQuery.removeEventListener('change', handleMediaChange)
      clearMarks()
    }
  }, [])

  return null
}
