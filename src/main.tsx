import { createRoot } from 'react-dom/client'
import './shadcn.css'
import './mobile-responsive.css'
import './mobile-responsive-audit.css'
import './home-mobile.css'
import './mobile-dashboard-sections.css'
import './mobile-polish-batch2.css'
import './mobile-final-polish.css'
import './mobile-last-fixes.css'
import './mobile-race-preparation-refit.css'
import i18n from './i18n'
import App from './App'
import MobileDashboardResponsiveBridge from './components/layout/MobileDashboardResponsiveBridge'
import MobileDashboardSectionPreferences from './components/layout/MobileDashboardSectionPreferences'
import MobilePolishBatch2Bridge from './components/layout/MobilePolishBatch2Bridge'
import MobileFinalPolishBridge from './components/layout/MobileFinalPolishBridge'
import MobileLastFixesBridge from './components/layout/MobileLastFixesBridge'
import LanguagePreferenceSync from './components/i18n/LanguagePreferenceSync'
import LanguageSelectorHost from './components/i18n/LanguageSelectorHost'
import AppShellLegacyLocalizationBridge from './components/i18n/AppShellLegacyLocalizationBridge'
import HomeLegacyLocalizationBridge from './components/i18n/HomeLegacyLocalizationBridge'
import PreferencesLegacyLocalizationBridge from './components/i18n/PreferencesLegacyLocalizationBridge'
import PreferencesDynamicLocalizationBridge from './components/i18n/PreferencesDynamicLocalizationBridge'
import HeaderLegacyLocalizationBridge from './components/i18n/HeaderLegacyLocalizationBridge'
import OverviewLegacyLocalizationBridge from './components/i18n/OverviewLegacyLocalizationBridge'
import TutorialLegacyLocalizationBridge from './components/i18n/TutorialLegacyLocalizationBridge'
import SquadLegacyLocalizationBridge from './components/i18n/SquadLegacyLocalizationBridge'
import SquadTutorialLocalizationBridge from './components/i18n/SquadTutorialLocalizationBridge'
import DevelopingTeamLegacyLocalizationBridge from './components/i18n/DevelopingTeamLegacyLocalizationBridge'
import StaffLegacyLocalizationBridge from './components/i18n/StaffLegacyLocalizationBridge'
import TrainingLegacyLocalizationBridge from './components/i18n/TrainingLegacyLocalizationBridge'
import EquipmentLegacyLocalizationBridge from './components/i18n/EquipmentLegacyLocalizationBridge'
import InfrastructureLegacyLocalizationBridge from './components/i18n/InfrastructureLegacyLocalizationBridge'
import CalendarLegacyLocalizationBridge from './components/i18n/CalendarLegacyLocalizationBridge'
import RaceDetailLegacyLocalizationBridge from './components/i18n/RaceDetailLegacyLocalizationBridge'
import RaceDetailResourceLocalizationBridge from './components/i18n/RaceDetailResourceLocalizationBridge'
import RacePreparationLegacyLocalizationBridge from './components/i18n/RacePreparationLegacyLocalizationBridge'
import TeamRankingLegacyLocalizationBridge from './components/i18n/TeamRankingLegacyLocalizationBridge'
import StatisticsLegacyLocalizationBridge from './components/i18n/StatisticsLegacyLocalizationBridge'
import TransfersLegacyLocalizationBridge from './components/i18n/TransfersLegacyLocalizationBridge'
import FinanceLegacyLocalizationBridge from './components/i18n/FinanceLegacyLocalizationBridge'
import NotificationsLegacyLocalizationBridge from './components/i18n/NotificationsLegacyLocalizationBridge'
import ScoutingLegacyLocalizationBridge from './components/i18n/ScoutingLegacyLocalizationBridge'
import ClubLegacyLocalizationBridge from './components/i18n/ClubLegacyLocalizationBridge'
import RiderProfileLegacyLocalizationBridge from './components/i18n/RiderProfileLegacyLocalizationBridge'
import AuthAccountLegacyLocalizationBridge from './components/i18n/AuthAccountLegacyLocalizationBridge'
import CreateClubLegacyLocalizationBridge from './components/i18n/CreateClubLegacyLocalizationBridge'
import AccountPagesLegacyLocalizationBridge from './components/i18n/AccountPagesLegacyLocalizationBridge'
import PublicInfoLegacyLocalizationBridge from './components/i18n/PublicInfoLegacyLocalizationBridge'
import HelpLegacyLocalizationBridge from './components/i18n/HelpLegacyLocalizationBridge'
import SeasonResetLegacyLocalizationBridge from './components/i18n/SeasonResetLegacyLocalizationBridge'
import CustomizeTeamLegacyLocalizationBridge from './components/i18n/CustomizeTeamLegacyLocalizationBridge'
import ProPackagesLegacyLocalizationBridge from './components/i18n/ProPackagesLegacyLocalizationBridge'
import ManualLegacyLocalizationBridge from './components/i18n/ManualLegacyLocalizationBridge'

// Compatibility fallback for legacy/top-level helpers that read `locale`
// without receiving it as a component prop. Keep it dynamic so switching
// the application language updates formatting without reloading the page.
Object.defineProperty(globalThis, 'locale', {
  configurable: true,
  get: () => i18n.resolvedLanguage || i18n.language || document.documentElement.lang || 'en',
})

const root = createRoot(document.getElementById('app')!)

root.render(
  <>
    <MobileDashboardResponsiveBridge />
    <MobileDashboardSectionPreferences />
    <MobilePolishBatch2Bridge />
    <MobileFinalPolishBridge />
    <MobileLastFixesBridge />
    <LanguagePreferenceSync />
    <LanguageSelectorHost />
    <AppShellLegacyLocalizationBridge />
    <HomeLegacyLocalizationBridge />
    <PreferencesLegacyLocalizationBridge />
    <PreferencesDynamicLocalizationBridge />
    <HeaderLegacyLocalizationBridge />
    <OverviewLegacyLocalizationBridge />
    <TutorialLegacyLocalizationBridge />
    <SquadLegacyLocalizationBridge />
    <SquadTutorialLocalizationBridge />
    <DevelopingTeamLegacyLocalizationBridge />
    <StaffLegacyLocalizationBridge />
    <TrainingLegacyLocalizationBridge />
    <EquipmentLegacyLocalizationBridge />
    <InfrastructureLegacyLocalizationBridge />
    <CalendarLegacyLocalizationBridge />
    <RaceDetailLegacyLocalizationBridge />
    <RaceDetailResourceLocalizationBridge />
    <RacePreparationLegacyLocalizationBridge />
    <TeamRankingLegacyLocalizationBridge />
    <StatisticsLegacyLocalizationBridge />
    <TransfersLegacyLocalizationBridge />
    <FinanceLegacyLocalizationBridge />
    <NotificationsLegacyLocalizationBridge />
    <ScoutingLegacyLocalizationBridge />
    <ClubLegacyLocalizationBridge />
    <RiderProfileLegacyLocalizationBridge />
    <AuthAccountLegacyLocalizationBridge />
    <CreateClubLegacyLocalizationBridge />
    <AccountPagesLegacyLocalizationBridge />
    <PublicInfoLegacyLocalizationBridge />
    <HelpLegacyLocalizationBridge />
    <SeasonResetLegacyLocalizationBridge />
    <CustomizeTeamLegacyLocalizationBridge />
    <ProPackagesLegacyLocalizationBridge />
    <ManualLegacyLocalizationBridge />
    <App />
  </>,
)
