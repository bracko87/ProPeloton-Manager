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

import deAccountPages from './locales/de/accountPages.json'
import deAppShell from './locales/de/appShell.json'
import deAuth from './locales/de/auth.json'
import deCalendar from './locales/de/calendar.json'
import deCalendarPage from './locales/de/calendarPage.json'
import deClub from './locales/de/club.json'
import deCommon from './locales/de/common.json'
import deCreateClub from './locales/de/createClub.json'
import deCustomizeTeam from './locales/de/customizeTeam.json'
import deDevelopingTeam from './locales/de/developingTeam.json'
import deEquipment from './locales/de/equipment.json'
import deFinance from './locales/de/finance.json'
import deHelp from './locales/de/help.json'
import deManual from './locales/de/manual.json'
import deHome from './locales/de/home.json'
import deInfrastructure from './locales/de/infrastructure.json'
import deNavigation from './locales/de/navigation.json'
import deNotifications from './locales/de/notifications.json'
import deOverview from './locales/de/overview.json'
import dePreferences from './locales/de/preferences.json'
import dePreferencesDynamic from './locales/de/preferencesDynamic.json'
import deProPackages from './locales/de/proPackages.json'
import deProfile from './locales/de/profile.json'
import dePublicInfo from './locales/de/publicInfo.json'
import deRaceDetail from './locales/de/raceDetail.json'
import deRacePreparation from './locales/de/racePreparation.json'
import deRiderProfile from './locales/de/riderProfile.json'
import deScouting from './locales/de/scouting.json'
import deSeasonReset from './locales/de/seasonReset.json'
import deSharedRiderModal from './locales/de/sharedRiderModal.json'
import deSquad from './locales/de/squad.json'
import deStaff from './locales/de/staff.json'
import deStatistics from './locales/de/statistics.json'
import deTeamRanking from './locales/de/teamRanking.json'
import deTraining from './locales/de/training.json'
import deTransfers from './locales/de/transfers.json'
import deTutorials from './locales/de/tutorials.json'

import hrAccountPages from './locales/hr/accountPages.json'
import hrAppShell from './locales/hr/appShell.json'
import hrAuth from './locales/hr/auth.json'
import hrCalendar from './locales/hr/calendar.json'
import hrCalendarPage from './locales/hr/calendarPage.json'
import hrClub from './locales/hr/club.json'
import hrCommon from './locales/hr/common.json'
import hrCreateClub from './locales/hr/createClub.json'
import hrCustomizeTeam from './locales/hr/customizeTeam.json'
import hrDevelopingTeam from './locales/hr/developingTeam.json'
import hrEquipment from './locales/hr/equipment.json'
import hrFinance from './locales/hr/finance.json'
import hrHelp from './locales/hr/help.json'
import hrManual from './locales/hr/manual.json'
import hrHome from './locales/hr/home.json'
import hrInfrastructure from './locales/hr/infrastructure.json'
import hrNavigation from './locales/hr/navigation.json'
import hrNotifications from './locales/hr/notifications.json'
import hrOverview from './locales/hr/overview.json'
import hrPreferences from './locales/hr/preferences.json'
import hrPreferencesDynamic from './locales/hr/preferencesDynamic.json'
import hrProPackages from './locales/hr/proPackages.json'
import hrProfile from './locales/hr/profile.json'
import hrPublicInfo from './locales/hr/publicInfo.json'
import hrRaceDetail from './locales/hr/raceDetail.json'
import hrRacePreparation from './locales/hr/racePreparation.json'
import hrRiderProfile from './locales/hr/riderProfile.json'
import hrScouting from './locales/hr/scouting.json'
import hrSeasonReset from './locales/hr/seasonReset.json'
import hrSharedRiderModal from './locales/hr/sharedRiderModal.json'
import hrSquad from './locales/hr/squad.json'
import hrStaff from './locales/hr/staff.json'
import hrStatistics from './locales/hr/statistics.json'
import hrTeamRanking from './locales/hr/teamRanking.json'
import hrTraining from './locales/hr/training.json'
import hrTransfers from './locales/hr/transfers.json'
import hrTutorials from './locales/hr/tutorials.json'

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
  de: {
    accountPages: deAccountPages,
    appShell: deAppShell,
    auth: deAuth,
    calendar: deCalendar,
    calendarPage: deCalendarPage,
    club: deClub,
    common: deCommon,
    createClub: deCreateClub,
    customizeTeam: deCustomizeTeam,
    developingTeam: deDevelopingTeam,
    equipment: deEquipment,
    finance: deFinance,
    help: deHelp,
    manual: deManual,
    home: deHome,
    infrastructure: deInfrastructure,
    navigation: deNavigation,
    notifications: deNotifications,
    overview: deOverview,
    preferences: dePreferences,
    preferencesDynamic: dePreferencesDynamic,
    proPackages: deProPackages,
    profile: deProfile,
    publicInfo: dePublicInfo,
    raceDetail: deRaceDetail,
    racePreparation: deRacePreparation,
    riderProfile: deRiderProfile,
    scouting: deScouting,
    seasonReset: deSeasonReset,
    sharedRiderModal: deSharedRiderModal,
    squad: deSquad,
    staff: deStaff,
    statistics: deStatistics,
    teamRanking: deTeamRanking,
    training: deTraining,
    transfers: deTransfers,
    tutorials: deTutorials,
  },
  hr: {
    accountPages: hrAccountPages,
    appShell: hrAppShell,
    auth: hrAuth,
    calendar: hrCalendar,
    calendarPage: hrCalendarPage,
    club: hrClub,
    common: hrCommon,
    createClub: hrCreateClub,
    customizeTeam: hrCustomizeTeam,
    developingTeam: hrDevelopingTeam,
    equipment: hrEquipment,
    finance: hrFinance,
    help: hrHelp,
    manual: hrManual,
    home: hrHome,
    infrastructure: hrInfrastructure,
    navigation: hrNavigation,
    notifications: hrNotifications,
    overview: hrOverview,
    preferences: hrPreferences,
    preferencesDynamic: hrPreferencesDynamic,
    proPackages: hrProPackages,
    profile: hrProfile,
    publicInfo: hrPublicInfo,
    raceDetail: hrRaceDetail,
    racePreparation: hrRacePreparation,
    riderProfile: hrRiderProfile,
    scouting: hrScouting,
    seasonReset: hrSeasonReset,
    sharedRiderModal: hrSharedRiderModal,
    squad: hrSquad,
    staff: hrStaff,
    statistics: hrStatistics,
    teamRanking: hrTeamRanking,
    training: hrTraining,
    transfers: hrTransfers,
    tutorials: hrTutorials,
  },
} as const

const initialLanguage = getStoredLanguage()

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ['en', 'sr-Latn', 'de', 'hr'],
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
