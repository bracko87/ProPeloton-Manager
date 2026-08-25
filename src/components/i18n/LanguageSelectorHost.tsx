import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import LanguageSelector from './LanguageSelector'

function getCurrentHashPath(): string {
  if (typeof window === 'undefined') return '/'
  const raw = window.location.hash.replace(/^#/, '')
  return raw || '/'
}

function findPreferencesAnchor(): Element | null {
  const headings = Array.from(document.querySelectorAll('h2'))
  const heading = headings.find(element => {
    const text = element.textContent?.trim()
    return text === 'Preferences' || text === 'Podešavanja'
  })

  return heading?.parentElement ?? null
}

export default function LanguageSelectorHost(): JSX.Element | null {
  const { t } = useTranslation('profile')
  const [hashPath, setHashPath] = useState(getCurrentHashPath)
  const [homeNavTarget, setHomeNavTarget] = useState<Element | null>(null)
  const [preferencesTarget, setPreferencesTarget] = useState<Element | null>(null)

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

  useEffect(() => {
    if (!isPreferences) {
      setPreferencesTarget(null)
      return
    }

    const findTarget = (): void => {
      setPreferencesTarget(findPreferencesAnchor())
    }

    findTarget()

    const observer = new MutationObserver(findTarget)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [isPreferences])

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

  if (isPreferences && preferencesTarget) {
    return createPortal(
      <section
        className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        aria-label={t('preferences.languageSectionTitle')}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">
              {t('preferences.languageSectionTitle')}
            </h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {t('preferences.languageSectionDescription')}
            </p>
          </div>

          <LanguageSelector
            className="shrink-0 text-gray-700"
            labelClassName="sr-only"
            selectClassName="min-w-[160px] border-gray-300 bg-white text-gray-900"
          />
        </div>
      </section>,
      preferencesTarget,
    )
  }

  return null
}