export const DEFAULT_LANGUAGE = 'en' as const
export const LANGUAGE_STORAGE_KEY = 'ppm_language'

export const SUPPORTED_LANGUAGES = [
  {
    code: 'en',
    label: 'English',
    shortLabel: 'EN',
    flag: '🇬🇧',
    countryCode: 'GB',
    htmlLang: 'en',
    locale: 'en-GB',
  },
  {
    code: 'sr-Latn',
    label: 'Srpski',
    shortLabel: 'SR',
    flag: '🇷🇸',
    countryCode: 'RS',
    htmlLang: 'sr-Latn',
    locale: 'sr-Latn-RS',
  },
  {
    code: 'de',
    label: 'Deutsch',
    shortLabel: 'DE',
    flag: '🇩🇪',
    countryCode: 'DE',
    htmlLang: 'de',
    locale: 'de-DE',
  },
  {
    code: 'hr',
    label: 'Hrvatski',
    shortLabel: 'HR',
    flag: '🇭🇷',
    countryCode: 'HR',
    htmlLang: 'hr',
    locale: 'hr-HR',
  },
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code']

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some(language => language.code === value)
}

export function getStoredLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE
  }

  const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return isSupportedLanguage(storedLanguage) ? storedLanguage : DEFAULT_LANGUAGE
}

export function persistLanguage(language: SupportedLanguage): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
}

export function getLanguageDefinition(language: SupportedLanguage) {
  return SUPPORTED_LANGUAGES.find(item => item.code === language) ?? SUPPORTED_LANGUAGES[0]
}