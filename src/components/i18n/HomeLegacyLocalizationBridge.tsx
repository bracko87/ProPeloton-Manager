import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Temporary migration helper for the large legacy Home.tsx page.
 *
 * New/reusable homepage components must use useTranslation() directly.
 * This bridge only covers existing hardcoded text in Home.tsx and other legacy
 * homepage-only UI while those files are migrated section-by-section. It
 * deliberately matches a fixed allow-list so user-generated review text, race
 * names, team names and other dynamic game content are never translated.
 */

const textKeyBySource = new Map<string, string>([
  ['Sign In', 'header.signIn'],
  ['Start Playing', 'header.startPlaying'],
  ['Beta version', 'beta.badge'],
  ['ProPeloton Manager is currently in beta testing.', 'beta.title'],
  [
    'The game is still being tested and improved. If you would like to become a test player and help us test ProPeloton Manager, please contact us first in our Discord server. We will provide the next steps there.',
    'beta.body',
  ],
  ['Close', 'beta.close'],
  ['Contact us on Discord', 'beta.discord'],
  ['Continue to website', 'beta.continue'],
  ['Preparing your manager account...', 'status.preparingAccount'],
  ['Loading game time...', 'status.loadingGameTime'],
  ['Game time unavailable', 'status.gameTimeUnavailable'],
  ['Quick Stats', 'stats.title'],
  ['Live snapshot of the ProPeloton world.', 'stats.subtitle'],
  ['Registered Users', 'stats.registeredUsers'],
  ['Total Teams', 'stats.totalTeams'],
  ['Total Races & Tours', 'stats.totalRacesTours'],
  ['Total Stages', 'stats.totalStages'],
  ['Core Features', 'features.title'],
  ['Everything you need to manage a world-class cycling club.', 'features.subtitle'],
  ['Deep Squad Management', 'features.squadTitle'],
  [
    'Train, rotate and develop riders with realistic form, fatigue and talent progression.',
    'features.squadDescription',
  ],
  ['Tactical Races', 'features.racesTitle'],
  [
    'Choose attack points, manage breakaways and execute stage-winning tactics.',
    'features.racesDescription',
  ],
  ['Market & Transfers', 'features.marketTitle'],
  [
    'Scout, bid and negotiate contracts in a dynamic transfer market.',
    'features.marketDescription',
  ],
  ['Game guide', 'guide.eyebrow'],
  ['Learn what ProPeloton Manager offers before you join.', 'guide.headline'],
  [
    'ProPeloton Manager is built around long-term cycling management. The public pages explain the game, but the homepage also gives visitors a direct overview of the main systems: team building, rider development, race preparation, tactics, finances, support and season rankings.',
    'guide.intro',
  ],
  ['What is ProPeloton Manager?', 'guide.whatTitle'],
  [
    'ProPeloton Manager is an online cycling management game where you create and develop a cycling club. Instead of controlling a rider directly, you manage the team behind the race: riders, training, race plans, staff, equipment, finances, sponsors, transfers and long-term ranking progress.',
    'guide.whatText',
  ],
  ['How do you play?', 'guide.howTitle'],
  [
    'Managers build a squad, study the race calendar, apply for suitable races, prepare race plans, choose riders, assign roles, manage supplies and follow results. Good decisions depend on rider skills, fatigue, morale, race profile, weather, budget and season goals.',
    'guide.howText',
  ],
  ['Why does preparation matter?', 'guide.preparationTitle'],
  [
    'A strong rider is not enough by itself. Race preparation connects riders, staff, vehicles, equipment, supplies and tactics. Planning ahead helps your team arrive ready for sprints, climbs, time trials, stage races and difficult weather conditions.',
    'guide.preparationText',
  ],
  ['In-game Screenshots', 'screenshots.title'],
  [
    'A look inside team management, race preparation, tactics and the cycling world of ProPeloton Manager.',
    'screenshots.subtitle',
  ],
  ['Player Reviews', 'reviews.title'],
  [
    'Share your experience with ProPeloton Manager and help new players understand the game.',
    'reviews.subtitle',
  ],
  ['Close Review Form', 'reviews.closeForm'],
  ['Add Review', 'reviews.addReview'],
  ['Name', 'reviews.name'],
  ['Email', 'reviews.email'],
  ['Rating', 'reviews.rating'],
  ['Review', 'reviews.review'],
  ['5 stars', 'reviews.fiveStars'],
  ['4 stars', 'reviews.fourStars'],
  ['3 stars', 'reviews.threeStars'],
  ['2 stars', 'reviews.twoStars'],
  ['1 star', 'reviews.oneStar'],
  [
    'Reviews are checked before they appear publicly. Please do not include passwords, payment card details, or private account information.',
    'reviews.privacyNote',
  ],
  ['Submitting...', 'reviews.submitting'],
  ['Submit Review', 'reviews.submit'],
  ['Loading reviews...', 'reviews.loading'],
  ['Add the first review', 'reviews.addFirst'],
  ['Reviews are temporarily unavailable.', 'reviews.unavailable'],
  ['Recently', 'reviews.recently'],
  ['Please enter your name.', 'reviews.nameRequired'],
  ['Please enter at least 2 characters.', 'reviews.nameMin'],
  ['Please enter your email.', 'reviews.emailRequired'],
  ['Please enter a valid email address.', 'reviews.emailInvalid'],
  ['Please choose a rating from 1 to 5.', 'reviews.ratingInvalid'],
  ['Please write your review.', 'reviews.messageRequired'],
  ['Please write at least 20 characters.', 'reviews.messageMin'],
  ['Please keep your review under 1200 characters.', 'reviews.messageMax'],
  ['Could not submit review.', 'reviews.submitFailed'],
  [
    'Thank you. Your review was submitted and will appear after approval.',
    'reviews.submitSuccess',
  ],
  [
    'A premium online cycling manager by Next Quest Studio. Build a team, manage riders, prepare races, follow rankings, and develop your club across a living cycling season.',
    'footer.description',
  ],
  ['© ProPeloton Manager. All rights reserved by Next Quest Studio.', 'footer.copyright'],
  ['Game', 'footer.game'],
  ['About', 'footer.about'],
  ['How to Play', 'footer.howToPlay'],
  ['Game Guide', 'footer.gameGuide'],
  ['Contact', 'footer.contact'],
  ['Legal', 'footer.legal'],
  ['Privacy Policy', 'footer.privacyPolicy'],
  ['Terms', 'footer.terms'],
  ['Support', 'footer.support'],
  ['Connect', 'footer.connect'],
  [
    'Questions, support requests, and feedback can be sent through the Contact page or by email.',
    'footer.connectText',
  ],
  [
    'Live homepage data is temporarily unavailable.',
    'status.homepageDataUnavailable',
  ],
  [
    'Live homepage data returned an unexpected format.',
    'status.homepageDataUnexpected',
  ],
  [
    'You are signed in, but we could not load your club status. Please refresh or try again.',
    'status.clubStatusError',
  ],
  [
    'New club creation is temporarily disabled while ProPeloton Manager is still in development. Existing managers can continue to sign in.',
    'status.clubCreationDisabled',
  ],
])

const attributeKeys: Array<{
  selector: string
  attribute: 'title' | 'aria-label' | 'placeholder'
  key: string
}> = [
  {
    selector: '[title="Temporarily unavailable while the game is in development"]',
    attribute: 'title',
    key: 'header.registrationUnavailable',
  },
  {
    selector: '[aria-label="Close beta notice"]',
    attribute: 'aria-label',
    key: 'beta.closeLabel',
  },
  {
    selector: '[aria-label="Previous screenshots"]',
    attribute: 'aria-label',
    key: 'screenshots.previous',
  },
  {
    selector: '[aria-label="Next screenshots"]',
    attribute: 'aria-label',
    key: 'screenshots.next',
  },
  {
    selector: '[aria-label="Close screenshot"]',
    attribute: 'aria-label',
    key: 'screenshots.close',
  },
  {
    selector: '[aria-label="Previous review"]',
    attribute: 'aria-label',
    key: 'reviews.previous',
  },
  {
    selector: '[aria-label="Next review"]',
    attribute: 'aria-label',
    key: 'reviews.next',
  },
  {
    selector: '[placeholder="Your name"]',
    attribute: 'placeholder',
    key: 'reviews.yourName',
  },
  {
    selector: '[placeholder="you@example.com"]',
    attribute: 'placeholder',
    key: 'reviews.emailPlaceholder',
  },
  {
    selector: '[placeholder="Tell other players what you think about ProPeloton Manager..."]',
    attribute: 'placeholder',
    key: 'reviews.reviewPlaceholder',
  },
  {
    selector: '[aria-label="Game information"]',
    attribute: 'aria-label',
    key: 'footer.gameAria',
  },
  {
    selector: '[aria-label="Legal information"]',
    attribute: 'aria-label',
    key: 'footer.legalAria',
  },
]

const nodeKey = new WeakMap<Node, string>()
const dynamicReviewPosition = new WeakMap<Node, { current: string; total: string }>()
const attributeKey = new WeakMap<Element, Map<string, string>>()
const screenshotPage = new WeakMap<Element, string>()

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export default function HomeLegacyLocalizationBridge(): JSX.Element | null {
  const { t, i18n } = useTranslation('home')

  useEffect(() => {
    const root = document.getElementById('public-homepage')
    if (!root) return

    let applying = false

    const translateTextNodes = (): void => {
      if (applying) return
      applying = true

      try {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        let node = walker.nextNode()

        while (node) {
          const textNode = node as Text
          const existingKey = nodeKey.get(textNode)
          const normalized = normalizeText(textNode.nodeValue ?? '')
          const sourceKey = existingKey ?? textKeyBySource.get(normalized)

          if (sourceKey) {
            nodeKey.set(textNode, sourceKey)
            const translated = t(sourceKey)
            if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
              textNode.nodeValue = translated
            }
          } else {
            let reviewPosition = dynamicReviewPosition.get(textNode)

            if (!reviewPosition) {
              const reviewMatch = normalized.match(/^Review\s+(\d+)\s+of\s+(\d+)$/)
              if (reviewMatch) {
                reviewPosition = {
                  current: reviewMatch[1],
                  total: reviewMatch[2],
                }
                dynamicReviewPosition.set(textNode, reviewPosition)
              }
            }

            if (reviewPosition) {
              const translated = t('reviews.reviewPosition', reviewPosition)
              if (normalizeText(textNode.nodeValue ?? '') !== normalizeText(translated)) {
                textNode.nodeValue = translated
              }
            }
          }

          node = walker.nextNode()
        }

        for (const config of attributeKeys) {
          root.querySelectorAll(config.selector).forEach(element => {
            let keys = attributeKey.get(element)
            if (!keys) {
              keys = new Map<string, string>()
              attributeKey.set(element, keys)
            }

            if (!keys.has(config.attribute)) {
              keys.set(config.attribute, config.key)
            }

            const translated = t(config.key)
            if (element.getAttribute(config.attribute) !== translated) {
              element.setAttribute(config.attribute, translated)
            }
          })
        }

        // Re-apply tagged attributes after a language switch even if the translated
        // value no longer matches the original English selector.
        root.querySelectorAll('*').forEach(element => {
          const keys = attributeKey.get(element)
          if (!keys) return
          keys.forEach((key, attribute) => {
            const translated = t(key)
            if (element.getAttribute(attribute) !== translated) {
              element.setAttribute(attribute, translated)
            }
          })
        })

        // Screenshot page controls use dynamically generated aria-labels. Tag the
        // page number once so the label can switch in both directions afterwards.
        root.querySelectorAll('button[aria-label]').forEach(element => {
          let page = screenshotPage.get(element)
          if (!page) {
            const label = element.getAttribute('aria-label') ?? ''
            const match = label.match(/^Open screenshot page\s+(\d+)$/)
            if (match) {
              page = match[1]
              screenshotPage.set(element, page)
            }
          }

          if (page) {
            const translated = t('screenshots.openPage', { page })
            if (element.getAttribute('aria-label') !== translated) {
              element.setAttribute('aria-label', translated)
            }
          }
        })
      } finally {
        applying = false
      }
    }

    translateTextNodes()

    const observer = new MutationObserver(() => translateTextNodes())
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    const onLanguageChanged = (): void => translateTextNodes()
    i18n.on('languageChanged', onLanguageChanged)

    return () => {
      observer.disconnect()
      i18n.off('languageChanged', onLanguageChanged)
    }
  }, [i18n, t])

  return null
}