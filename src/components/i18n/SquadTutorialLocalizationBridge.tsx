import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const staticTextKeys = new Map<string, string>()

function register(source: string, key: string): void {
  staticTextKeys.set(normalizeText(source), key)
}

register('Need help with your Squad?', 'squad.welcome.title')
register(
  'We can show you a short introduction to the Squad page, where you manage your riders, developing team, movement windows, and staff.',
  'squad.welcome.body',
)
register('Your Riders', 'squad.riders.title')
register(
  'This is the Squad page — the main place where your team riders are displayed. In the general view, you can see important rider information such as age, country, role, overall level, condition, market value, wages, contract details, and international points. Use this page whenever you want to understand the current strength and structure of your team.',
  'squad.riders.body',
)
register('Rider Views and Profiles', 'squad.details.title')
register(
  'The Squad page gives you different ways to look at your riders. You can check financial information, skills, form, development, health, and availability. Skills can improve over time, so this page helps you follow how each rider is developing. By clicking the View button, you can open the full rider profile with more detailed information. Some advanced rider tools, additional dashboards, or convenience features may require a Premium account or coin purchase.',
  'squad.details.body',
)
register('Developing Team and Movement Window', 'squad.developing.title')
register(
  'Your Developing Team is your second team. It can be used for young riders who are not yet ready for the first squad but can still race in assigned competitions. The Developing Team must be unlocked first. You can find more about this in Preferences. Riders can only be moved between the First Squad and Developing Team during movement windows. These windows open four times per year, and the Squad page shows when the next movement window is available. Some extra management tools, extended views, or convenience features related to this area may require a Premium account or coin purchase.',
  'squad.developing.body',
)
register('Staff and Next Page', 'squad.staff.title')
register(
  'The Staff button shows the staff members working for your club and the current limits of your staff setup. Staff members have their own skills and can be sent on courses. Staff limits can also be improved by upgrading your infrastructure. After Squad, the next recommended page is Training, where you can set regular training and plan training camps for your riders.',
  'squad.staff.body',
)
register('Continue to Training', 'squad.staff.primary')

const nodeKey = new WeakMap<Node, string>()

export default function SquadTutorialLocalizationBridge(): null {
  const { t, i18n } = useTranslation('tutorials')

  useEffect(() => {
    let applying = false

    const applyTranslations = (): void => {
      if (applying) return
      applying = true

      try {
        document
          .querySelectorAll('[data-tutorial-overlay-panel="true"]')
          .forEach(panel => {
            const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
            let node = walker.nextNode()

            while (node) {
              const textNode = node as Text
              const normalized = normalizeText(textNode.nodeValue ?? '')
              const existingKey = nodeKey.get(textNode)
              const key = existingKey ?? staticTextKeys.get(normalized)

              if (key) {
                nodeKey.set(textNode, key)
                const translated = t(key)
                if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
                  textNode.nodeValue = translated
                }
              }

              node = walker.nextNode()
            }
          })
      } finally {
        applying = false
      }
    }

    applyTranslations()

    const observer = new MutationObserver(applyTranslations)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    const handleLanguageChanged = (): void => applyTranslations()
    i18n.on('languageChanged', handleLanguageChanged)

    return () => {
      observer.disconnect()
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [i18n, t])

  return null
}
