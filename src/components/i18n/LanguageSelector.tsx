import React from 'react'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  changeApplicationLanguage,
  getApplicationLanguage,
} from '@/i18n'
import {
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/i18n/languages'

type LanguageSelectorProps = {
  compact?: boolean
  className?: string
  labelClassName?: string
  selectClassName?: string
}

export default function LanguageSelector({
  compact = false,
  className = '',
  labelClassName = '',
  selectClassName = '',
}: LanguageSelectorProps): JSX.Element {
  const { t, i18n } = useTranslation('common')

  const currentLanguage: SupportedLanguage = SUPPORTED_LANGUAGES.some(
    language => language.code === i18n.language,
  )
    ? (i18n.language as SupportedLanguage)
    : getApplicationLanguage()

  const handleChange = async (
    event: React.ChangeEvent<HTMLSelectElement>,
  ): Promise<void> => {
    await changeApplicationLanguage(event.target.value as SupportedLanguage)
  }

  return (
    <label
      className={`inline-flex min-w-0 items-center gap-2 ${className}`.trim()}
      title={t('language.description')}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />

      {!compact && (
        <span className={`text-sm font-medium ${labelClassName}`.trim()}>
          {t('language.label')}
        </span>
      )}

      <select
        value={currentLanguage}
        onChange={event => void handleChange(event)}
        aria-label={t('language.applicationLanguage')}
        className={`min-w-0 rounded-md border px-2 py-1.5 text-sm outline-none transition focus:ring-2 focus:ring-blue-500 ${selectClassName}`.trim()}
      >
        {SUPPORTED_LANGUAGES.map(language => (
          <option key={language.code} value={language.code}>
            {language.flag} {compact ? language.shortLabel : language.label}
          </option>
        ))}
      </select>
    </label>
  )
}
