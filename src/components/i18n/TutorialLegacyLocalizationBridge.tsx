import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

const staticTextKeys = new Map<string, string>()

function register(source: string, key: string): void {
  staticTextKeys.set(normalizeText(source), key)
}

register('Start tutorial', 'common.startTutorial')
register('No thanks', 'common.noThanks')
register('Next', 'common.next')
register('Finish for now', 'common.finishForNow')

register('Welcome to ProPeloton Manager', 'overview.welcome.title')
register(
  'Welcome to the game. This tutorial can help you understand the main pages and the most important systems step by step. You can start the tutorial now, or skip it and use the game manual later.',
  'overview.welcome.body',
)
register(
  'Welcome to ProPeloton Manager. You are now the manager of your own cycling team. Your job is to build the club, take care of your riders, prepare races, manage money, improve the team, and guide your club through the season.',
  'overview.welcomeGame.body',
)
register('What Kind of Game Is This?', 'overview.gameType.title')
register(
  'This is a cycling management game. You are not controlling the bike directly during the race. Instead, you make the important manager decisions before and during the season: which riders to keep, how to train them, which races to enter, what equipment to use, which staff to hire, and how to spend your money.',
  'overview.gameType.body',
)
register('Play Simple or Go Deep', 'overview.simpleOrDeep.title')
register(
  'You do not need to understand everything immediately. At the beginning, you can play in a simple way: follow alerts, check your squad, enter races, prepare your team, and watch results. Later, if you want more depth, you can use advanced systems like rider fatigue, morale, race sharpness, sponsor objectives, equipment bonuses, training camps, scouting, transfer negotiations, taxes, infrastructure, and promotion or relegation.',
  'overview.simpleOrDeep.body',
)
register('What This Tutorial Will Do', 'overview.purpose.title')
register(
  'This tutorial will guide you through the main pages of the game one by one. You will learn what each page is for, which buttons are important, and what you should check as a new manager. The tutorial will not explain every small detail at once. For deeper explanations, you can always use the full game manual later.',
  'overview.purpose.body',
)
register('Let’s Start With the Overview Page', 'overview.startOverview.title')
register(
  'We will start with the Overview page. This is your main manager dashboard. It gives you the fastest picture of your team: current alerts, news, finances, races, sponsor messages, rider condition, and season progress. After this introduction, I will explain the Overview page step by step.',
  'overview.startOverview.body',
)
register('Start Overview tutorial', 'overview.startOverview.primary')
register('Your Manager Dashboard', 'overview.dashboard.title')
register(
  'This is your Overview page — the main dashboard for your team. Think of this page as your daily control room. When you log in, this is usually the first place you should check. Here you can quickly see the most important information about your club, including team status, current alerts, finances, races, rider condition, and season progress.',
  'overview.dashboard.body',
)
register('Staff Briefing Centre', 'overview.staffBriefing.title')
register(
  'This panel shows your support staff and assistant roles. Here you can see important team helpers such as the Head Coach, Sports Director, Team Doctor, Chief Mechanic, and other assistant roles when available. These assistants help you manage important parts of your club more efficiently, such as race planning, rider health, preparation, and equipment support. Some assistant functions, staff tools, or automation-related features may require a Premium account or coin purchase to use fully.',
  'overview.staffBriefing.body',
)
register('News Board', 'overview.newsBoard.title')
register(
  'The News Board shows important team and world news. Some news is about your own team, such as sponsor offers, birthdays, or team updates. Other news can be about the wider race world, such as race results or important cycling events. Clicking a news row can reveal more information when extra details are available.',
  'overview.newsBoard.body',
)
register('Next Team Race', 'overview.nextRace.title')
register(
  'The Next Team Race panel helps you see what is coming soon for your team. This is important because accepted races often still need preparation. You may need to select riders, staff, assets, equipment, supplies, and stage tactics before the deadlines. If this panel shows an upcoming race, you should check Race Preparation early.',
  'overview.nextRace.body',
)
register('Last Team Race', 'overview.lastRace.title')
register(
  'The Last Team Race panel shows your most recent finished race when available. Use this to quickly review how your team performed. Results can help you decide if riders need rest, if tactics worked well, or if your squad needs changes before the next event.',
  'overview.lastRace.body',
)
register('Main Sponsor', 'overview.sponsor.title')
register(
  'The Main Sponsor panel shows your primary sponsor information when you have an active main sponsor. Sponsors are important because they can provide money, bonuses, objectives, and sometimes branding effects. Some sponsor contracts are simple, while naming-rights sponsors can temporarily change your team name during the season.',
  'overview.sponsor.body',
)
register('Team Health and Season Progress', 'overview.progress.title')
register(
  'The rest of the Overview page helps you follow your team’s condition and progress. Here you can monitor rider condition, finance health, sponsor activity, race activity, active operations, season snapshot data, and general season progress. Some advanced dashboard sections, summaries, or additional data views may require a Premium account or coin purchase to unlock. If a panel is locked, you can still play normally, but Premium or coins can make the game easier and give you a deeper view of your club. As your club grows, this page becomes more useful because it helps you connect short-term actions, like preparing the next race, with long-term goals such as building a stronger squad and improving your ranking.',
  'overview.progress.body',
)
register('Continue to Squad', 'overview.progress.primary')

register('Need help with the Menu?', 'menu.welcome.title')
register(
  'We can show you where to find the main menu, notifications, and coins in the top-right corner.',
  'menu.welcome.body',
)
register('Main Menu', 'menu.main.title')
register(
  'This is the main Menu button in the top-right corner. Inside the menu, you can find Inbox for internal messages, profile settings, themes and customization settings, forum or Discord links, game preferences, help with the in-game manual and frequently asked questions, Contact Us, Pro Packages, and Invite Friends referral progress. Use this menu whenever you need account settings, help, support, preferences, or extra game options.',
  'menu.main.body',
)
register('Notifications', 'menu.notifications.title')
register(
  'This bell icon opens your in-game notifications. Notifications tell you about important events such as race deadlines, preparation reminders, sponsor updates, finances, transfers, and other game actions that need your attention. You can manage which notifications you want to receive from the Preferences option inside the Menu.',
  'menu.notifications.body',
)
register('Coins', 'menu.coins.title')
register(
  'This shows your current coin balance. Coins are used for selected game features, unlocks, and convenience options inside ProPeloton Manager. You can check your balance here at any time and purchase more through Menu → Pro Packages. Running low on coins does not suspend your account. You can continue playing, but some optional features or premium-style actions may not be available until you add more coins.',
  'menu.coins.body',
)
register('Premium Account', 'menu.premium.title')
register(
  'This is your Premium access area. A Premium account can make the game easier and more comfortable by giving access to extra features, more advanced views, and useful convenience tools. Premium can also help you unlock more of the game’s full management experience. By purchasing Premium or Pro Packages, you also directly support our team and help us continue developing ProPeloton Manager faster and better.',
  'menu.premium.body',
)
register('Tutorial Completed', 'menu.finished.title')
register(
  'You have successfully finished the basic ProPeloton Manager tutorial. If you have questions later, you can always check the in-game manual, read the frequently asked questions, contact us, or join our Discord community. Good luck with your team!',
  'menu.finished.body',
)
register('Finish tutorial', 'menu.finished.primary')

const nodeKey = new WeakMap<Node, string>()
const attributeKey = new WeakMap<Element, Map<string, string>>()

export default function TutorialLegacyLocalizationBridge(): null {
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

            panel.querySelectorAll('[aria-label]').forEach(element => {
              let keys = attributeKey.get(element)
              if (!keys) {
                keys = new Map<string, string>()
                attributeKey.set(element, keys)
              }

              let key = keys.get('aria-label')
              const current = normalizeText(element.getAttribute('aria-label') ?? '')

              if (!key && current === 'Close tutorial') {
                key = 'common.closeTutorial'
                keys.set('aria-label', key)
              }

              if (key) {
                element.setAttribute('aria-label', t(key))
              }
            })
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
