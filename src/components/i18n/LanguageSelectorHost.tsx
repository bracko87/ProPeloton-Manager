import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import LanguageSelector from './LanguageSelector'

function getCurrentHashPath(): string {
  if (typeof window === 'undefined') return '/'
  const raw = window.location.hash.replace(/^#/, '')
  return raw || '/'
}

export default function LanguageSelectorHost(): JSX.Element | null {
  const [hashPath, setHashPath] = useState(getCurrentHashPath)
  const [homeNavTarget, setHomeNavTarget] = useState<Element | null>(null)

  useEffect(() => {
    const handleRouteChange = (): void => {
      setHashPath(getCurrentHashPath())
    }

    window.addEventListener('hashchange', handleRouteChange)
    return () => window.removeEventListener('hashchange', handleRouteChange)
  }, [])

  const isHomepage = useMemo(
    () => hashPath === '/' || hashPath === '',
    [hashPath],
  )

  const isPreferences = useMemo(
    () => hashPath === '/dashboard/preferences' || hashPath.startsWith('/dashboard/preferences?'),
    [hashPath],
  )

  useEffect(() => {
    if (!isHomepage) {
      setHomeNavTarget(null)
      return
    }

    const findTarget = (): void => {
      const target = document.querySelector('#public-homepage header nav')
      setHomeNavTarget(target)
    }

    findTarget()

    const observer = new MutationObserver(findTarget)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [isHomepage])

  if (isHomepage && homeNavTarget) {
    return createPortal(
      <LanguageSelector
        compact
        className="text-white/80"
        selectClassName="border-white/20 bg-[#081224] text-white hover:border-white/35"
      />,
      homeNavTarget,
    )
  }

  if (isPreferences) {
    return (
      <div className="fixed right-4 top-20 z-40 rounded-lg border border-gray-200 bg-white p-3 shadow-lg sm:right-6">
        <LanguageSelector
          className="text-gray-700"
          labelClassName="text-gray-700"
          selectClassName="border-gray-300 bg-white text-gray-900"
        />
      </div>
    )
  }

  return null
}
