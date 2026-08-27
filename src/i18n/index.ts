import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enCommon from './locales/en/common.json'
import enAppShell from './locales/en/appShell.json'
import enNavigation from './locales/en/navigation.json'
import enHome from './locales/en/home.json'
import enAuth from './locales/en/auth.json'
import enProfile from './locales/en/profile.json'
import enCalendar from './locales/en/calendar.json'
import enCalendarPage from './locales/en/calendarPage.json'
import enRacePreparation from './locales/en/racePreparation.json'
import enRaceDetail from './locales/en/raceDetail.json'
import enNotifications from './locales/en/notifications.json'
import enPreferences from './locales/en/preferences.json'
import enPreferencesDynamic from './locales/en/preferencesDynamic.json'
import enOverview from './locales/en/overview.json'
import enTutorials from './locales/en/tutorials.json'
import enSquad from './locales/en/squad.json'

import srCommon from './locales/sr-Latn/common.json'
import srAppShell from './locales/sr-Latn/appShell.json'
import srNavigation from './locales/sr-Latn/navigation.json'
import srHome from './locales/sr-Latn/home.json'
import srAuth from './locales/sr-Latn/auth.json'
import srProfile from './locales/sr-Latn/profile.json'
import srCalendar from './locales/sr-Latn/calendar.json'
import srCalendarPage from './locales/sr-Latn/calendarPage.json'
import srRacePreparation from './locales/sr-Latn/racePreparation.json'
import srRaceDetail from './locales/sr-Latn/raceDetail.json'
import srNotifications from './locales/sr-Latn/notifications.json'
import srPreferences from './locales/sr-Latn/preferences.json'
import srPreferencesDynamic from './locales/sr-Latn/preferencesDynamic.json'
import srOverview from './locales/sr-Latn/overview.json'
import srTutorials from './locales/sr-Latn/tutorials.json'
import srSquad from './locales/sr-Latn/squad.json'

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
    appShell: enAppShell,
    navigation: enNavigation,
    home: enHome,
    auth: enAuth,
    profile: enProfile,
    calendar: enCalendar,
    calendarPage: enCalendarPage,
    racePreparation: enRacePreparation,
    raceDetail: enRaceDetail,
    notifications: enNotifications,
    preferences: enPreferences,
    preferencesDynamic: enPreferencesDynamic,
    overview: enOverview,
    tutorials: enTutorials,
    squad: enSquad,
  },
  'sr-Latn': {
    common: srCommon,
    appShell: srAppShell,
    navigation: srNavigation,
    home: srHome,
    auth: srAuth,
    profile: srProfile,
    calendar: srCalendar,
    calendarPage: srCalendarPage,
    racePreparation: srRacePreparation,
    raceDetail: srRaceDetail,
    notifications: srNotifications,
    preferences: srPreferences,
    preferencesDynamic: srPreferencesDynamic,
    overview: srOverview,
    tutorials: srTutorials,
    squad: srSquad,
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
      'appShell',
      'navigation',
      'home',
      'auth',
      'profile',
      'calendar',
      'calendarPage',
      'racePreparation',
      'raceDetail',
      'notifications',
      'preferences',
      'preferencesDynamic',
      'overview',
      'tutorials',
      'squad',
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
