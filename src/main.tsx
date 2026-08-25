import { createRoot } from 'react-dom/client'
import './shadcn.css'
import './i18n'
import App from './App'
import LanguagePreferenceSync from './components/i18n/LanguagePreferenceSync'
import LanguageSelectorHost from './components/i18n/LanguageSelectorHost'
import HomeLegacyLocalizationBridge from './components/i18n/HomeLegacyLocalizationBridge'
import PreferencesLegacyLocalizationBridge from './components/i18n/PreferencesLegacyLocalizationBridge'
import PreferencesDynamicLocalizationBridge from './components/i18n/PreferencesDynamicLocalizationBridge'
import HeaderLegacyLocalizationBridge from './components/i18n/HeaderLegacyLocalizationBridge'
import OverviewLegacyLocalizationBridge from './components/i18n/OverviewLegacyLocalizationBridge'
import TutorialLegacyLocalizationBridge from './components/i18n/TutorialLegacyLocalizationBridge'
import SquadLegacyLocalizationBridge from './components/i18n/SquadLegacyLocalizationBridge'
import SquadTutorialLocalizationBridge from './components/i18n/SquadTutorialLocalizationBridge'

const root = createRoot(document.getElementById('app')!)
root.render(
  <>
    <LanguagePreferenceSync />
    <LanguageSelectorHost />
    <HomeLegacyLocalizationBridge />
    <PreferencesLegacyLocalizationBridge />
    <PreferencesDynamicLocalizationBridge />
    <HeaderLegacyLocalizationBridge />
    <OverviewLegacyLocalizationBridge />
    <TutorialLegacyLocalizationBridge />
    <SquadLegacyLocalizationBridge />
    <SquadTutorialLocalizationBridge />
    <App />
  </>,
)
