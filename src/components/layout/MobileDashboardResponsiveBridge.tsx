import React, { useEffect, useState } from 'react'

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

function getClientPath(): string {
  if (typeof window === 'undefined') return ''

  const hash = window.location.hash
  if (hash.startsWith('#/')) {
    return hash.slice(1)
  }

  return window.location.pathname
}

function getDashboardPath(): string {
  return getClientPath().split('?')[0]?.split('#')[0] ?? ''
}

function isDashboardPath(): boolean {
  return getDashboardPath().startsWith('/dashboard')
}

function getDashboardPageKey(): string {
  const path = getDashboardPath()
  if (!path.startsWith('/dashboard')) return ''

  const relativePath = path.slice('/dashboard'.length).replace(/^\/+|\/+$/g, '')
  if (!relativePath) return 'dashboard'

  return relativePath
    .split('/')[0]
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase()
}

function tagDashboardElements(): void {
  if (!isDashboardPath()) return

  const header = Array.from(document.querySelectorAll<HTMLElement>('header')).find(element =>
    element.classList.contains('bg-yellow-400'),
  )

  if (!header) return

  const contentColumn = header.parentElement as HTMLElement | null
  const shell = contentColumn?.parentElement as HTMLElement | null

  if (!contentColumn || !shell) return

  const sidebar = Array.from(shell.children).find(
    element => element.tagName === 'ASIDE',
  ) as HTMLElement | undefined

  const main = Array.from(contentColumn.children).find(
    element => element.tagName === 'MAIN',
  ) as HTMLElement | undefined

  shell.dataset.ppmDashboardShell = 'true'
  header.dataset.ppmDashboardHeader = 'true'

  if (sidebar) {
    sidebar.dataset.ppmMobileSidebar = 'true'
  }

  if (main) {
    main.dataset.ppmDashboardMain = 'true'

    const pageKey = getDashboardPageKey()
    if (pageKey) {
      main.dataset.ppmDashboardPage = pageKey
    } else {
      delete main.dataset.ppmDashboardPage
    }
  }
}

export default function MobileDashboardResponsiveBridge(): JSX.Element | null {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const mobileMediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)

    const retag = () => {
      tagDashboardElements()

      if (!isDashboardPath()) {
        setIsMobileNavigationOpen(false)
      }
    }

    const handleHashChange = () => {
      setIsMobileNavigationOpen(false)
      window.requestAnimationFrame(retag)
    }

    retag()

    const observer = new MutationObserver(retag)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    const handleDocumentClick = (event: MouseEvent) => {
      if (!mobileMediaQuery.matches || !isDashboardPath()) return

      const target = event.target
      if (!(target instanceof Element)) return

      const header = document.querySelector<HTMLElement>('[data-ppm-dashboard-header="true"]')
      const sidebar = document.querySelector<HTMLElement>('[data-ppm-mobile-sidebar="true"]')
      const toggleButton = header?.querySelector<HTMLButtonElement>('button')
      const clickedButton = target.closest('button')

      if (toggleButton && clickedButton === toggleButton) {
        event.preventDefault()
        event.stopPropagation()
        setIsMobileNavigationOpen(previous => !previous)
        return
      }

      if (sidebar && target.closest('[data-ppm-mobile-sidebar="true"] a')) {
        setIsMobileNavigationOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavigationOpen(false)
      }
    }

    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setIsMobileNavigationOpen(false)
      }
    }

    document.addEventListener('click', handleDocumentClick, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('hashchange', handleHashChange)
    mobileMediaQuery.addEventListener('change', handleViewportChange)

    return () => {
      observer.disconnect()
      document.removeEventListener('click', handleDocumentClick, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('hashchange', handleHashChange)
      mobileMediaQuery.removeEventListener('change', handleViewportChange)
      delete document.body.dataset.ppmMobileNavOpen
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return

    const shouldOpen =
      isMobileNavigationOpen &&
      isDashboardPath() &&
      window.matchMedia(MOBILE_MEDIA_QUERY).matches

    if (shouldOpen) {
      document.body.dataset.ppmMobileNavOpen = 'true'
    } else {
      delete document.body.dataset.ppmMobileNavOpen
    }
  }, [isMobileNavigationOpen])

  if (!isMobileNavigationOpen) return null

  return (
    <button
      type="button"
      className="ppm-mobile-nav-backdrop"
      aria-label="Close navigation"
      onClick={() => setIsMobileNavigationOpen(false)}
    />
  )
}
