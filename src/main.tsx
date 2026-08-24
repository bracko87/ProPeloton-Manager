import { createRoot } from 'react-dom/client'
import './shadcn.css'
import './i18n'
import App from './App'
import LanguagePreferenceSync from './components/i18n/LanguagePreferenceSync'

const root = createRoot(document.getElementById('app')!)
root.render(
  <>
    <LanguagePreferenceSync />
    <App />
  </>,
)
