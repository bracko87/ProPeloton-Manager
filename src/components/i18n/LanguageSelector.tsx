import React, { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  changeApplicationLanguage,
  getApplicationLanguage,
} from '@/i18n'
import {
  getLanguageDefinition,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/i18n/languages'

type LanguageSelectorProps = {
  compact?: boolean
  className?: string
  labelClassName?: string
  selectClassName?: string
}

const LANGUAGE_FLAG_CODES: Record<SupportedLanguage, string> = {
  en: 'gb',
  'sr-Latn': 'rs',
}

function getLanguageFlagUrl(language: SupportedLanguage): string {
  return `https://flagcdn.com/w40/${LANGUAGE_FLAG_CODES[language]}.png`
}

export default function LanguageSelector({
  compact = false,
  className = '',
  labelClassName = '',
  selectClassName = '',
}: LanguageSelectorProps): JSX.Element {
  const { t, i18n } = useTranslation('common')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const currentLanguage: SupportedLanguage = SUPPORTED_LANGUAGES.some(
    language => language.code === i18n.language,
  )
    ? (i18n.language as SupportedLanguage)
    : getApplicationLanguage()

  const currentDefinition = getLanguageDefinition(currentLanguage)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleChange = async (language: SupportedLanguage): Promise<void> => {
    setIsOpen(false)
    await changeApplicationLanguage(language)
  }

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex min-w-0 items-center gap-2 ${className}`.trim()}
      title={t('language.description')}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />

      {!compact && (
        <span className={`text-sm font-medium ${labelClassName}`.trim()}>
          {t('language.label')}
        </span>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('language.applicationLanguage')}
        className={`inline-flex min-w-[122px] items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm outline-none transition focus:ring-2 focus:ring-blue-500 ${selectClassName}`.trim()}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <img
            src={getLanguageFlagUrl(currentLanguage)}
            alt=""
            className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
            aria-hidden="true"
          />
          <span className="truncate">{currentDefinition.label}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t('language.applicationLanguage')}
          className="absolute right-0 top-full z-[100] mt-2 min-w-[170px] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl"
        >
          {SUPPORTED_LANGUAGES.map(language => {
            const selected = language.code === currentLanguage

            return (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => void handleChange(language.code)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-900 hover:bg-slate-100"
              >
                <img
                  src={getLanguageFlagUrl(language.code)}
                  alt=""
                  className="h-4 w-6 shrink-0 rounded-[2px] object-cover"
                  aria-hidden="true"
                />
                <span className="flex-1">{language.label}</span>
                {selected ? (
                  <Check className="h-4 w-4 text-blue-600" aria-hidden="true" />
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
