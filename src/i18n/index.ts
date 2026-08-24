import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from './locales/en/common.json'
import enNavigation from './locales/en/navigation.json'
import enHome from './locales/en/home.json'
import enAuth from './locales/en/auth.json'
import enProfile from './locales/en/profile.json'
import enCalendar from './locales/en/calendar.json'
import enPreferences from './locales/en/preferences.json'
import enPreferencesDynamic from './locales/en/preferencesDynamic.json'

import srCommon from './locales/sr-Latn/common.json'
import srNavigation from './locales/sr-Latn/navigation.json'
import srHome from './locales/sr-Latn/home.json'
import srAuth from './locales/sr-Latn/auth.json'
import srProfile from './locales/sr-Latn/profile.json'
import srCalendar from './locales/sr-Latn/calendar.json'
import srPreferences from './locales/sr-Latn/preferences.json'
import srPreferencesDynamic from './locales/sr-Latn/preferencesDynamic.json'

import {
  DEFAULT_LANGUAGE,
  getLanguageDefinition,
  getStoredLanguage,
  isSupportedLanguage,
  persistLanguage,
  type SupportedLanguage,
} from './languages'

const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    home: enHome,
    auth: enAuth,
    profile: enProfile,
    calendar: enCalendar,
    preferences: enPreferences,
    preferencesDynamic: enPreferencesDynamic,
  },
  'sr-Latn': {
    common: srCommon,
    navigation: srNavigation,
    home: srHome,
    auth: srAuth,
    profile: srProfile,
    calendar: srCalendar,
    preferences: srPreferences,
    preferencesDynamic: srPreferencesDynamic,
  },
} as const

const initialLanguage = getStoredLanguage()

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ['en', 'sr-Latn'],
    defaultNS: 'common',
    ns: [
      'common',
      'navigation',
      'home',
      'auth',
      'profile',
      'calendar',
      'preferences',
      'preferencesDynamic',
    ],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  })

function applyDocumentLanguage(language: SupportedLanguage): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = getLanguageDefinition(language).htmlLang
}

applyDocumentLanguage(initialLanguage)

i18n.on('languageChanged', nextLanguage => {
  const language: SupportedLanguage = isSupportedLanguage(nextLanguage)
    ? nextLanguage
    : DEFAULT_LANGUAGE

  persistLanguage(language)
  applyDocumentLanguage(language)
})

export async function changeApplicationLanguage(language: SupportedLanguage): Promise<void> {
  if (!isSupportedLanguage(language)) return
  await i18n.changeLanguage(language)
}

export function getApplicationLanguage(): SupportedLanguage {
  return isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE
}

export default i18n