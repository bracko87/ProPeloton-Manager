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

import esAccountPages from './locales/es/accountPages.json'
import esAppShell from './locales/es/appShell.json'
import esAuth from './locales/es/auth.json'
import esCalendar from './locales/es/calendar.json'
import esCalendarPage from './locales/es/calendarPage.json'
import esClub from './locales/es/club.json'
import esCommon from './locales/es/common.json'
import esCreateClub from './locales/es/createClub.json'
import esCustomizeTeam from './locales/es/customizeTeam.json'
import esDevelopingTeam from './locales/es/developingTeam.json'
import esEquipment from './locales/es/equipment.json'
import esFinance from './locales/es/finance.json'
import esHelp from './locales/es/help.json'
import esManual from './locales/es/manual.json'
import esHome from './locales/es/home.json'
import esInfrastructure from './locales/es/infrastructure.json'
import esNavigation from './locales/es/navigation.json'
import esNotifications from './locales/es/notifications.json'
import esOverview from './locales/es/overview.json'
import esPreferences from './locales/es/preferences.json'
import esPreferencesDynamic from './locales/es/preferencesDynamic.json'
import esProPackages from './locales/es/proPackages.json'
import esProfile from './locales/es/profile.json'
import esPublicInfo from './locales/es/publicInfo.json'
import esRaceDetail from './locales/es/raceDetail.json'
import esRacePreparation from './locales/es/racePreparation.json'
import esRiderProfile from './locales/es/riderProfile.json'
import esScouting from './locales/es/scouting.json'
import esSeasonReset from './locales/es/seasonReset.json'
import esSharedRiderModal from './locales/es/sharedRiderModal.json'
import esSquad from './locales/es/squad.json'
import esStaff from './locales/es/staff.json'
import esStatistics from './locales/es/statistics.json'
import esTeamRanking from './locales/es/teamRanking.json'
import esTraining from './locales/es/training.json'
import esTransfers from './locales/es/transfers.json'
import esTutorials from './locales/es/tutorials.json'

import itAccountPages from './locales/it/accountPages.json'
import itAuth from './locales/it/auth.json'
import itCommon from './locales/it/common.json'
import itCreateClub from './locales/it/createClub.json'
import itHome from './locales/it/home.json'
import itNavigation from './locales/it/navigation.json'
import itProfile from './locales/it/profile.json'

import itAppShell from './locales/it/appShell.json'
import itCalendar from './locales/it/calendar.json'
import itCalendarPage from './locales/it/calendarPage.json'
import itClub from './locales/it/club.json'
import itCustomizeTeam from './locales/it/customizeTeam.json'
import itDevelopingTeam from './locales/it/developingTeam.json'
import itEquipment from './locales/it/equipment.json'
import itFinance from './locales/it/finance.json'
import itHelp from './locales/it/help.json'
import itManual from './locales/it/manual.json'
import itInfrastructure from './locales/it/infrastructure.json'
import itNotifications from './locales/it/notifications.json'
import itOverview from './locales/it/overview.json'
import itPreferences from './locales/it/preferences.json'
import itPreferencesDynamic from './locales/it/preferencesDynamic.json'
import itProPackages from './locales/it/proPackages.json'
import itPublicInfo from './locales/it/publicInfo.json'
import itRaceDetail from './locales/it/raceDetail.json'
import itRacePreparation from './locales/it/racePreparation.json'
import itRiderProfile from './locales/it/riderProfile.json'
import itScouting from './locales/it/scouting.json'
import itSeasonReset from './locales/it/seasonReset.json'
import itSharedRiderModal from './locales/it/sharedRiderModal.json'
import itSquad from './locales/it/squad.json'
import itStaff from './locales/it/staff.json'
import itStatistics from './locales/it/statistics.json'
import itTeamRanking from './locales/it/teamRanking.json'
import itTraining from './locales/it/training.json'
import itTransfers from './locales/it/transfers.json'
import itTutorials from './locales/it/tutorials.json'

import frAccountPages from './locales/fr/accountPages.json'
import frAppShell from './locales/fr/appShell.json'
import frAuth from './locales/fr/auth.json'
import frCalendar from './locales/fr/calendar.json'
import frCalendarPage from './locales/fr/calendarPage.json'
import frClub from './locales/fr/club.json'
import frCommon from './locales/fr/common.json'
import frCreateClub from './locales/fr/createClub.json'
import frCustomizeTeam from './locales/fr/customizeTeam.json'
import frDevelopingTeam from './locales/fr/developingTeam.json'
import frEquipment from './locales/fr/equipment.json'
import frFinance from './locales/fr/finance.json'
import frHelp from './locales/fr/help.json'
import frManual from './locales/fr/manual.json'
import frHome from './locales/fr/home.json'
import frInfrastructure from './locales/fr/infrastructure.json'
import frNavigation from './locales/fr/navigation.json'
import frNotifications from './locales/fr/notifications.json'
import frOverview from './locales/fr/overview.json'
import frPreferences from './locales/fr/preferences.json'
import frPreferencesDynamic from './locales/fr/preferencesDynamic.json'
import frProPackages from './locales/fr/proPackages.json'
import frProfile from './locales/fr/profile.json'
import frPublicInfo from './locales/fr/publicInfo.json'
import frRaceDetail from './locales/fr/raceDetail.json'
import frRacePreparation from './locales/fr/racePreparation.json'
import frRiderProfile from './locales/fr/riderProfile.json'
import frScouting from './locales/fr/scouting.json'
import frSeasonReset from './locales/fr/seasonReset.json'
import frSharedRiderModal from './locales/fr/sharedRiderModal.json'
import frSquad from './locales/fr/squad.json'
import frStaff from './locales/fr/staff.json'
import frStatistics from './locales/fr/statistics.json'
import frTeamRanking from './locales/fr/teamRanking.json'
import frTraining from './locales/fr/training.json'
import frTransfers from './locales/fr/transfers.json'
import frTutorials from './locales/fr/tutorials.json'

import ruAccountPages from './locales/ru/accountPages.json'
import ruAppShell from './locales/ru/appShell.json'
import ruAuth from './locales/ru/auth.json'
import ruCalendar from './locales/ru/calendar.json'
import ruCalendarPage from './locales/ru/calendarPage.json'
import ruClub from './locales/ru/club.json'
import ruCommon from './locales/ru/common.json'
import ruCreateClub from './locales/ru/createClub.json'
import ruCustomizeTeam from './locales/ru/customizeTeam.json'
import ruDevelopingTeam from './locales/ru/developingTeam.json'
import ruEquipment from './locales/ru/equipment.json'
import ruFinance from './locales/ru/finance.json'
import ruHelp from './locales/ru/help.json'
import ruManual from './locales/ru/manual.json'
import ruHome from './locales/ru/home.json'
import ruInfrastructure from './locales/ru/infrastructure.json'
import ruNavigation from './locales/ru/navigation.json'
import ruNotifications from './locales/ru/notifications.json'
import ruOverview from './locales/ru/overview.json'
import ruPreferences from './locales/ru/preferences.json'
import ruPreferencesDynamic from './locales/ru/preferencesDynamic.json'
import ruProPackages from './locales/ru/proPackages.json'
import ruProfile from './locales/ru/profile.json'
import ruPublicInfo from './locales/ru/publicInfo.json'
import ruRaceDetail from './locales/ru/raceDetail.json'
import ruRacePreparation from './locales/ru/racePreparation.json'
import ruRiderProfile from './locales/ru/riderProfile.json'
import ruScouting from './locales/ru/scouting.json'
import ruSeasonReset from './locales/ru/seasonReset.json'
import ruSharedRiderModal from './locales/ru/sharedRiderModal.json'
import ruSquad from './locales/ru/squad.json'
import ruStaff from './locales/ru/staff.json'
import ruStatistics from './locales/ru/statistics.json'
import ruTeamRanking from './locales/ru/teamRanking.json'
import ruTraining from './locales/ru/training.json'
import ruTransfers from './locales/ru/transfers.json'
import ruTutorials from './locales/ru/tutorials.json'

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
  es: {
    accountPages: esAccountPages,
    appShell: esAppShell,
    auth: esAuth,
    calendar: esCalendar,
    calendarPage: esCalendarPage,
    club: esClub,
    common: esCommon,
    createClub: esCreateClub,
    customizeTeam: esCustomizeTeam,
    developingTeam: esDevelopingTeam,
    equipment: esEquipment,
    finance: esFinance,
    help: esHelp,
    manual: esManual,
    home: esHome,
    infrastructure: esInfrastructure,
    navigation: esNavigation,
    notifications: esNotifications,
    overview: esOverview,
    preferences: esPreferences,
    preferencesDynamic: esPreferencesDynamic,
    proPackages: esProPackages,
    profile: esProfile,
    publicInfo: esPublicInfo,
    raceDetail: esRaceDetail,
    racePreparation: esRacePreparation,
    riderProfile: esRiderProfile,
    scouting: esScouting,
    seasonReset: esSeasonReset,
    sharedRiderModal: esSharedRiderModal,
    squad: esSquad,
    staff: esStaff,
    statistics: esStatistics,
    teamRanking: esTeamRanking,
    training: esTraining,
    transfers: esTransfers,
    tutorials: esTutorials,
  },
  it: {
    accountPages: itAccountPages,
    appShell: itAppShell,
    auth: itAuth,
    calendar: itCalendar,
    calendarPage: itCalendarPage,
    club: itClub,
    common: itCommon,
    createClub: itCreateClub,
    customizeTeam: itCustomizeTeam,
    developingTeam: itDevelopingTeam,
    equipment: itEquipment,
    finance: itFinance,
    help: itHelp,
    manual: itManual,
    home: itHome,
    infrastructure: itInfrastructure,
    navigation: itNavigation,
    notifications: itNotifications,
    overview: itOverview,
    preferences: itPreferences,
    preferencesDynamic: itPreferencesDynamic,
    proPackages: itProPackages,
    profile: itProfile,
    publicInfo: itPublicInfo,
    raceDetail: itRaceDetail,
    racePreparation: itRacePreparation,
    riderProfile: itRiderProfile,
    scouting: itScouting,
    seasonReset: itSeasonReset,
    sharedRiderModal: itSharedRiderModal,
    squad: itSquad,
    staff: itStaff,
    statistics: itStatistics,
    teamRanking: itTeamRanking,
    training: itTraining,
    transfers: itTransfers,
    tutorials: itTutorials,
  },
  fr: {
    accountPages: frAccountPages,
    appShell: frAppShell,
    auth: frAuth,
    calendar: frCalendar,
    calendarPage: frCalendarPage,
    club: frClub,
    common: frCommon,
    createClub: frCreateClub,
    customizeTeam: frCustomizeTeam,
    developingTeam: frDevelopingTeam,
    equipment: frEquipment,
    finance: frFinance,
    help: frHelp,
    manual: frManual,
    home: frHome,
    infrastructure: frInfrastructure,
    navigation: frNavigation,
    notifications: frNotifications,
    overview: frOverview,
    preferences: frPreferences,
    preferencesDynamic: frPreferencesDynamic,
    proPackages: frProPackages,
    profile: frProfile,
    publicInfo: frPublicInfo,
    raceDetail: frRaceDetail,
    racePreparation: frRacePreparation,
    riderProfile: frRiderProfile,
    scouting: frScouting,
    seasonReset: frSeasonReset,
    sharedRiderModal: frSharedRiderModal,
    squad: frSquad,
    staff: frStaff,
    statistics: frStatistics,
    teamRanking: frTeamRanking,
    training: frTraining,
    transfers: frTransfers,
    tutorials: frTutorials,
  },
  ru: {
    accountPages: ruAccountPages,
    appShell: ruAppShell,
    auth: ruAuth,
    calendar: ruCalendar,
    calendarPage: ruCalendarPage,
    club: ruClub,
    common: ruCommon,
    createClub: ruCreateClub,
    customizeTeam: ruCustomizeTeam,
    developingTeam: ruDevelopingTeam,
    equipment: ruEquipment,
    finance: ruFinance,
    help: ruHelp,
    manual: ruManual,
    home: ruHome,
    infrastructure: ruInfrastructure,
    navigation: ruNavigation,
    notifications: ruNotifications,
    overview: ruOverview,
    preferences: ruPreferences,
    preferencesDynamic: ruPreferencesDynamic,
    proPackages: ruProPackages,
    profile: ruProfile,
    publicInfo: ruPublicInfo,
    raceDetail: ruRaceDetail,
    racePreparation: ruRacePreparation,
    riderProfile: ruRiderProfile,
    scouting: ruScouting,
    seasonReset: ruSeasonReset,
    sharedRiderModal: ruSharedRiderModal,
    squad: ruSquad,
    staff: ruStaff,
    statistics: ruStatistics,
    teamRanking: ruTeamRanking,
    training: ruTraining,
    transfers: ruTransfers,
    tutorials: ruTutorials,
  },
} as const

const initialLanguage = getStoredLanguage()

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ['en', 'sr-Latn', 'de', 'hr', 'es', 'it', 'fr', 'ru'],
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
