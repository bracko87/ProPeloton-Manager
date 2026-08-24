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

const root = createRoot(document.getElementById('app')!)
root.render(
  <>
    <LanguagePreferenceSync />
    <LanguageSelectorHost />
    <HomeLegacyLocalizationBridge />
    <PreferencesLegacyLocalizationBridge />
    <PreferencesDynamicLocalizationBridge />
    <HeaderLegacyLocalizationBridge />
    <App />
  </>,
)
