import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enAccountPages from './locales/en/accountPages.json'
import enAppShell from './locales/en/appShell.json'
import enAuth from './locales/en/auth.json'
import enCalendar from './locales/en/calendar.json'
import enCalendarPage from './locales/en/calendarPage.json'
import enClub from './locales/en/club.json'
import enCommon from './locales/en/common.json'
import enCreateClub from './locales/en/createClub.json'
import enCustomizeTeam from './locales/en/customizeTeam.json'
import enDevelopingTeam from './locales/en/developingTeam.json'
import enEquipment from './locales/en/equipment.json'
import enFinance from './locales/en/finance.json'
import enHelp from './locales/en/help.json'
import enManual from './locales/en/manual.json'
import enHome from './locales/en/home.json'
import enInfrastructure from './locales/en/infrastructure.json'
import enNavigation from './locales/en/navigation.json'
import enNotifications from './locales/en/notifications.json'
import enOverview from './locales/en/overview.json'
import enPreferences from './locales/en/preferences.json'
import enPreferencesDynamic from './locales/en/preferencesDynamic.json'
import enProPackages from './locales/en/proPackages.json'
import enProfile from './locales/en/profile.json'
import enPublicInfo from './locales/en/publicInfo.json'
import enRaceDetail from './locales/en/raceDetail.json'
import enRacePreparation from './locales/en/racePreparation.json'
import enRiderProfile from './locales/en/riderProfile.json'
import enScouting from './locales/en/scouting.json'
import enSeasonReset from './locales/en/seasonReset.json'
import enSharedRiderModal from './locales/en/sharedRiderModal.json'
import enSquad from './locales/en/squad.json'
import enStaff from './locales/en/staff.json'
import enStatistics from './locales/en/statistics.json'
import enTeamRanking from './locales/en/teamRanking.json'
import enTraining from './locales/en/training.json'
import enTransfers from './locales/en/transfers.json'
import enTutorials from './locales/en/tutorials.json'

import srAccountPages from './locales/sr-Latn/accountPages.json'
import srAppShell from './locales/sr-Latn/appShell.json'
import srAuth from './locales/sr-Latn/auth.json'
import srCalendar from './locales/sr-Latn/calendar.json'
import srCalendarPage from './locales/sr-Latn/calendarPage.json'
import srClub from './locales/sr-Latn/club.json'
import srCommon from './locales/sr-Latn/common.json'
import srCreateClub from './locales/sr-Latn/createClub.json'
import srCustomizeTeam from './locales/sr-Latn/customizeTeam.json'
import srDevelopingTeam from './locales/sr-Latn/developingTeam.json'
import srEquipment from './locales/sr-Latn/equipment.json'
import srFinance from './locales/sr-Latn/finance.json'
import srHelp from './locales/sr-Latn/help.json'
import srManual from './locales/sr-Latn/manual.json'
import srHome from './locales/sr-Latn/home.json'
import srInfrastructure from './locales/sr-Latn/infrastructure.json'
import srNavigation from './locales/sr-Latn/navigation.json'
import srNotifications from './locales/sr-Latn/notifications.json'
import srOverview from './locales/sr-Latn/overview.json'
import srPreferences from './locales/sr-Latn/preferences.json'
import srPreferencesDynamic from './locales/sr-Latn/preferencesDynamic.json'
import srProPackages from './locales/sr-Latn/proPackages.json'
import srProfile from './locales/sr-Latn/profile.json'
import srPublicInfo from './locales/sr-Latn/publicInfo.json'
import srRaceDetail from './locales/sr-Latn/raceDetail.json'
import srRacePreparation from './locales/sr-Latn/racePreparation.json'
import srRiderProfile from './locales/sr-Latn/riderProfile.json'
import srScouting from './locales/sr-Latn/scouting.json'
import srSeasonReset from './locales/sr-Latn/seasonReset.json'
import srSharedRiderModal from './locales/sr-Latn/sharedRiderModal.json'
import srSquad from './locales/sr-Latn/squad.json'
import srStaff from './locales/sr-Latn/staff.json'
import srStatistics from './locales/sr-Latn/statistics.json'
import srTeamRanking from './locales/sr-Latn/teamRanking.json'
import srTraining from './locales/sr-Latn/training.json'
import srTransfers from './locales/sr-Latn/transfers.json'
import srTutorials from './locales/sr-Latn/tutorials.json'

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
    accountPages: enAccountPages,
    appShell: enAppShell,
    auth: enAuth,
    calendar: enCalendar,
    calendarPage: enCalendarPage,
    club: enClub,
    common: enCommon,
    createClub: enCreateClub,
    customizeTeam: enCustomizeTeam,
    developingTeam: enDevelopingTeam,
    equipment: enEquipment,
    finance: enFinance,
    help: enHelp,
    manual: enManual,
    home: enHome,
    infrastructure: enInfrastructure,
    navigation: enNavigation,
    notifications: enNotifications,
    overview: enOverview,
    preferences: enPreferences,
    preferencesDynamic: enPreferencesDynamic,
    proPackages: enProPackages,
    profile: enProfile,
    publicInfo: enPublicInfo,
    raceDetail: enRaceDetail,
    racePreparation: enRacePreparation,
    riderProfile: enRiderProfile,
    scouting: enScouting,
    seasonReset: enSeasonReset,
    sharedRiderModal: enSharedRiderModal,
    squad: enSquad,
    staff: enStaff,
    statistics: enStatistics,
    teamRanking: enTeamRanking,
    training: enTraining,
    transfers: enTransfers,
    tutorials: enTutorials,
  },
  'sr-Latn': {
    accountPages: srAccountPages,
    appShell: srAppShell,
    auth: srAuth,
    calendar: srCalendar,
    calendarPage: srCalendarPage,
    club: srClub,
    common: srCommon,
    createClub: srCreateClub,
    customizeTeam: srCustomizeTeam,
    developingTeam: srDevelopingTeam,
    equipment: srEquipment,
    finance: srFinance,
    help: srHelp,
    manual: srManual,
    home: srHome,
    infrastructure: srInfrastructure,
    navigation: srNavigation,
    notifications: srNotifications,
    overview: srOverview,
    preferences: srPreferences,
    preferencesDynamic: srPreferencesDynamic,
    proPackages: srProPackages,
    profile: srProfile,
    publicInfo: srPublicInfo,
    raceDetail: srRaceDetail,
    racePreparation: srRacePreparation,
    riderProfile: srRiderProfile,
    scouting: srScouting,
    seasonReset: srSeasonReset,
    sharedRiderModal: srSharedRiderModal,
    squad: srSquad,
    staff: srStaff,
    statistics: srStatistics,
    teamRanking: srTeamRanking,
    training: srTraining,
    transfers: srTransfers,
    tutorials: srTutorials,
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
      'accountPages',
      'appShell',
      'auth',
      'calendar',
      'calendarPage',
      'club',
      'common',
      'createClub',
      'customizeTeam',
      'developingTeam',
      'equipment',
      'finance',
      'help',
      'manual',
      'home',
      'infrastructure',
      'navigation',
      'notifications',
      'overview',
      'preferences',
      'preferencesDynamic',
      'proPackages',
      'profile',
      'publicInfo',
      'raceDetail',
      'racePreparation',
      'riderProfile',
      'scouting',
      'seasonReset',
      'sharedRiderModal',
      'squad',
      'staff',
      'statistics',
      'teamRanking',
      'training',
      'transfers',
      'tutorials',
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
