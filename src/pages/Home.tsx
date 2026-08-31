/**
 * Home.tsx
 * Extended landing page composed from small reusable sections.
 *
 * Purpose:
 * - Act as the public marketing/landing page.
 * - After auth email confirmation, detect authenticated users and route them
 *   to the correct next step based on get_my_club_id().
 * - Show lightweight loading/error banners without changing the main layout.
 * - Load live public homepage data from get_public_homepage_snapshot_v1().
 * - Keep public homepage copy and formatting synchronized with the selected UI locale.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import Hero from '../components/home/Hero'
import HomepageRaceDays, {
  type HomepageRaceDaysData,
} from '../components/home/HomepageRaceDays'
import FeatureCard from '../components/home/FeatureCard'
import ScreenshotGallery from '../components/home/ScreenshotGallery'
import CTA from '../components/home/CTA'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'

type HomeSnapshot = {
  game_time_label: string
  active_managers: number
  total_teams: number
  total_races: number
  total_stages: number
}

type RawHomeSnapshot = {
  game_time_label?: unknown
  active_managers?: unknown
  total_teams?: unknown
  total_races?: unknown
  total_stages?: unknown
}

type GameTimeRow = {
  season_number: number
  month_number: number
  month_name: string
  day_number: number
  hour_24: number
  minute_2: number
  display_text: string
}

type PublicHomepageReview = {
  id: string
  reviewer_name: string
  rating: number
  review_text: string
  approved_at: string | null
  created_at: string
}

type ReviewFormErrors = {
  name?: string
  email?: string
  rating?: string
  message?: string
}

const CONTACT_EMAIL = 'contact@propelotonmanager.com'
const DISCORD_INVITE_URL = 'https://discord.gg/BpgqTXsjAW'

const SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/profile.php?id=61583549010426',
  discord: DISCORD_INVITE_URL,
  email: `mailto:${CONTACT_EMAIL}`,
}

const FOOTER_GAME_LINKS = [
  { labelKey: 'footer.about', href: '/about/' },
  { labelKey: 'footer.howToPlay', href: '/how-to-play/' },
  { labelKey: 'footer.gameGuide', href: '/game-guide/' },
  { labelKey: 'footer.contact', href: '/contact/' },
]

const FOOTER_LEGAL_LINKS = [
  { labelKey: 'footer.privacyPolicy', href: '/privacy-policy/' },
  { labelKey: 'footer.terms', href: '/terms/' },
]

const HOMEPAGE_GUIDE_CARDS = [
  { titleKey: 'guide.whatTitle', textKey: 'guide.whatText' },
  { titleKey: 'guide.howTitle', textKey: 'guide.howText' },
  { titleKey: 'guide.preparationTitle', textKey: 'guide.preparationText' },
]

function toNumber(value: unknown): number {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

function getUiLocale(language?: string): string {
  const normalized = String(language ?? 'en').toLowerCase()

  if (normalized.startsWith('sr')) return 'sr-Latn-RS'
  if (normalized.startsWith('de')) return 'de-DE'
  if (normalized.startsWith('hr')) return 'hr-HR'
  if (normalized.startsWith('es')) return 'es-ES'
  if (normalized.startsWith('it')) return 'it-IT'
  if (normalized.startsWith('fr')) return 'fr-FR'
  if (normalized.startsWith('ru')) return 'ru-RU'
  return 'en-GB'
}

function formatTime(hour24: number, minute2: number): string {
  const hour = String(hour24).padStart(2, '0')
  const minute = String(minute2).padStart(2, '0')
  return `${hour}:${minute}`
}

function formatGameTime(
  row: GameTimeRow,
  locale: string,
  seasonLabel: string,
): string {
  const monthIndex = Number(row.month_number) - 1
  const year = 1999 + Number(row.season_number)
  const dayNumber = Number(row.day_number)
  const date = new Date(Date.UTC(year, monthIndex, dayNumber))
  const timeText = formatTime(row.hour_24, row.minute_2)
  const seasonText = `${seasonLabel} ${row.season_number}`

  if (
    !Number.isFinite(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    !Number.isInteger(dayNumber) ||
    Number.isNaN(date.getTime())
  ) {
    return `${seasonText} · ${row.month_name} ${row.day_number} · ${timeText}`
  }

  const weekdayText = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(date)
  const dateText = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)

  return `${seasonText} · ${weekdayText} · ${dateText} · ${timeText}`
}

function formatNumber(value: unknown, locale: string): string {
  return new Intl.NumberFormat(locale).format(toNumber(value))
}

function normalizeHomeSnapshot(
  data: unknown,
  loadingGameTimeLabel: string,
): HomeSnapshot | null {
  if (!data || typeof data !== 'object') return null

  const row = data as RawHomeSnapshot

  return {
    game_time_label:
      typeof row.game_time_label === 'string' && row.game_time_label.trim().length > 0
        ? row.game_time_label
        : loadingGameTimeLabel,
    active_managers: toNumber(row.active_managers),
    total_teams: toNumber(row.total_teams),
    total_races: toNumber(row.total_races),
    total_stages: toNumber(row.total_stages),
  }
}

function isProbablyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function formatReviewDate(
  value: string | null,
  locale: string,
  recentlyLabel: string,
): string {
  if (!value) return recentlyLabel

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return recentlyLabel

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function normalizeRating(value: unknown): number {
  const parsedValue = Number(value)
  if (!Number.isFinite(parsedValue)) return 5
  return Math.max(1, Math.min(5, Math.round(parsedValue)))
}

export default function HomePage(): JSX.Element {
  const { t, i18n } = useTranslation('home')
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const locale = getUiLocale(i18n.resolvedLanguage || i18n.language)

  const [checkingClub, setCheckingClub] = useState(false)
  const [clubError, setClubError] = useState<string | null>(null)
  const [homeSnapshot, setHomeSnapshot] = useState<HomeSnapshot | null>(null)
  const [homeSnapshotError, setHomeSnapshotError] = useState<string | null>(null)
  const [gameTimeText, setGameTimeText] = useState(() => t('status.loadingGameTime'))
  const [raceDays, setRaceDays] = useState<HomepageRaceDaysData | null>(null)
  const [raceDaysLoading, setRaceDaysLoading] = useState(false)
  const [isBetaNoticeOpen, setIsBetaNoticeOpen] = useState(true)

  const [reviews, setReviews] = useState<PublicHomepageReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError] = useState<string | null>(null)
  const [activeReviewIndex, setActiveReviewIndex] = useState(0)

  const [isReviewFormOpen, setIsReviewFormOpen] = useState(false)
  const [reviewName, setReviewName] = useState('')
  const [reviewEmail, setReviewEmail] = useState('')
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewMessage, setReviewMessage] = useState('')
  const [reviewErrors, setReviewErrors] = useState<ReviewFormErrors>({})
  const [reviewSubmitMessage, setReviewSubmitMessage] = useState<string | null>(null)
  const [reviewSubmitTone, setReviewSubmitTone] = useState<'success' | 'error' | null>(null)
  const [submittingReview, setSubmittingReview] = useState(false)

  const loadHomepageReviews = useCallback(async (): Promise<void> => {
    setReviewsLoading(true)
    setReviewsError(null)

    const { data, error } = await supabase.rpc('get_public_homepage_reviews_v1', {
      p_limit: 20,
    })

    if (error) {
      console.warn('Could not load homepage reviews:', error.message)
      setReviews([])
      setReviewsError(t('reviews.unavailable'))
      setReviewsLoading(false)
      return
    }

    const rows = Array.isArray(data) ? (data as PublicHomepageReview[]) : []
    setReviews(rows)
    setActiveReviewIndex(0)
    setReviewsLoading(false)
  }, [t])

  useEffect(() => {
    void loadHomepageReviews()
  }, [loadHomepageReviews])

  useEffect(() => {
    if (reviews.length === 0) {
      setActiveReviewIndex(0)
      return
    }

    if (activeReviewIndex > reviews.length - 1) {
      setActiveReviewIndex(reviews.length - 1)
    }
  }, [activeReviewIndex, reviews.length])

  useEffect(() => {
    let isMounted = true

    async function loadGameTime(): Promise<void> {
      const { data, error } = await supabase.rpc('get_authoritative_game_time')
      if (!isMounted) return

      if (error) {
        console.warn('Could not load authoritative game time:', error.message)
        setGameTimeText(t('status.gameTimeUnavailable'))
        return
      }

      const rows = data as GameTimeRow[] | null
      const nextRow = rows?.[0]

      setGameTimeText(
        nextRow
          ? formatGameTime(nextRow, locale, t('hero.season'))
          : t('status.gameTimeUnavailable'),
      )
    }

    void loadGameTime()
    const intervalId = window.setInterval(() => void loadGameTime(), 30_000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [locale, t])

  useEffect(() => {
    let isMounted = true

    async function loadHomeSnapshot() {
      const { data, error } = await supabase.rpc('get_public_homepage_snapshot_v1')
      if (!isMounted) return

      if (error) {
        console.warn('Could not load homepage snapshot:', error.message)
        setHomeSnapshotError(t('status.homepageDataUnavailable'))
        return
      }

      const normalizedSnapshot = normalizeHomeSnapshot(
        data,
        t('status.loadingGameTime'),
      )

      if (!normalizedSnapshot) {
        setHomeSnapshotError(t('status.homepageDataUnexpected'))
        return
      }

      setHomeSnapshot(normalizedSnapshot)
      setHomeSnapshotError(null)
    }

    void loadHomeSnapshot()
    const intervalId = window.setInterval(() => void loadHomeSnapshot(), 60_000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [t])

  useEffect(() => {
    let isMounted = true

    async function loadRaceDays() {
      setRaceDaysLoading(true)

      const { data, error } = await supabase.rpc('get_public_homepage_race_days_v1')
      if (!isMounted) return

      if (error) {
        console.warn('Could not load homepage race days:', error.message)
        setRaceDaysLoading(false)
        return
      }

      setRaceDays({
        yesterdayRaces: Array.isArray(data?.yesterdayRaces) ? data.yesterdayRaces : [],
        todayRaces: Array.isArray(data?.todayRaces) ? data.todayRaces : [],
        tomorrowRaces: Array.isArray(data?.tomorrowRaces) ? data.tomorrowRaces : [],
      })
      setRaceDaysLoading(false)
    }

    void loadRaceDays()
    const intervalId = window.setInterval(() => void loadRaceDays(), 60_000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    if (loading) return

    if (!user) {
      setCheckingClub(false)
      setClubError(null)
      return
    }

    setCheckingClub(true)
    setClubError(null)

    void (async () => {
      const { data, error } = await supabase.rpc('get_my_club_id')
      if (!isMounted) return

      if (error) {
        setClubError(t('status.clubStatusError'))
        setCheckingClub(false)
        return
      }

      if (!data) {
        setClubError(t('status.clubCreationDisabled'))
        setCheckingClub(false)
      } else {
        navigate('/dashboard/overview', { replace: true })
      }
    })()

    return () => {
      isMounted = false
    }
  }, [user, loading, navigate, t])

  function clearReviewError(field: keyof ReviewFormErrors): void {
    setReviewErrors(current => {
      if (!current[field]) return current
      const nextErrors = { ...current }
      delete nextErrors[field]
      return nextErrors
    })
  }

  function validateReviewForm(): boolean {
    const nextErrors: ReviewFormErrors = {}

    if (!reviewName.trim()) {
      nextErrors.name = t('reviews.nameRequired')
    } else if (reviewName.trim().length < 2) {
      nextErrors.name = t('reviews.nameMin')
    }

    if (!reviewEmail.trim()) {
      nextErrors.email = t('reviews.emailRequired')
    } else if (!isProbablyValidEmail(reviewEmail)) {
      nextErrors.email = t('reviews.emailInvalid')
    }

    if (!Number.isFinite(reviewRating) || reviewRating < 1 || reviewRating > 5) {
      nextErrors.rating = t('reviews.ratingInvalid')
    }

    if (!reviewMessage.trim()) {
      nextErrors.message = t('reviews.messageRequired')
    } else if (reviewMessage.trim().length < 20) {
      nextErrors.message = t('reviews.messageMin')
    } else if (reviewMessage.trim().length > 1200) {
      nextErrors.message = t('reviews.messageMax')
    }

    setReviewErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmitReview(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!validateReviewForm()) return

    setSubmittingReview(true)
    setReviewSubmitMessage(null)
    setReviewSubmitTone(null)

    const { error } = await supabase.rpc('submit_homepage_player_review_v1', {
      p_reviewer_name: reviewName.trim(),
      p_reviewer_email: reviewEmail.trim(),
      p_rating: reviewRating,
      p_review_text: reviewMessage.trim(),
      p_metadata: { source: 'homepage_form' },
    })

    if (error) {
      console.warn('Could not submit homepage review:', error.message)
      setReviewSubmitTone('error')
      setReviewSubmitMessage(t('reviews.submitFailed'))
      setSubmittingReview(false)
      return
    }

    setReviewSubmitTone('success')
    setReviewSubmitMessage(t('reviews.submitSuccess'))
    setReviewName('')
    setReviewEmail('')
    setReviewRating(5)
    setReviewMessage('')
    setReviewErrors({})
    setIsReviewFormOpen(false)
    setSubmittingReview(false)

    void loadHomepageReviews()
  }

  function showPreviousReview(): void {
    if (reviews.length <= 1) return
    setActiveReviewIndex(current =>
      current === 0 ? reviews.length - 1 : current - 1,
    )
  }

  function showNextReview(): void {
    if (reviews.length <= 1) return
    setActiveReviewIndex(current =>
      current === reviews.length - 1 ? 0 : current + 1,
    )
  }

  useEffect(() => {
    const root = document.getElementById('public-homepage')
    if (!root) return

    const lockedRouteParts = [
      '/register',
      '/signup',
      '/sign-up',
      '/create-club',
      '/create-team',
      '/new-club',
      '/new-team',
    ]

    const normalizeText = (value: string): string =>
      value.replace(/\s+/g, ' ').trim().toLowerCase()

    const translatedLockedLabels = [
      t('header.startPlaying'),
      t('cta.createClub'),
    ].map(normalizeText)

    const legacyLockedLabels = [
      'start playing',
      'play now',
      'register',
      'register now',
      'sign up',
      'sign up now',
      'create club',
      'create a club',
      'create your club',
      'create team',
      'create a team',
      'create your team',
      'new club',
      'new team',
      'get started',
      'get started now',
      'build your club',
      'build your team',
      'start your club',
      'start your team',
      'join the game',
      'join now',
      'become a manager',
    ]

    const lockedLabels = Array.from(
      new Set([...legacyLockedLabels, ...translatedLockedLabels]),
    )

    const isLockedAction = (element: Element): boolean => {
      if (element.getAttribute('data-registration-locked') === 'true') return true

      const label = normalizeText(element.textContent || '')
      const href =
        element instanceof HTMLAnchorElement
          ? normalizeText(element.getAttribute('href') || '')
          : ''

      const routeIsLocked = lockedRouteParts.some(route => href.includes(route))
      const labelIsLocked = lockedLabels.some(lockedLabel =>
        label === lockedLabel ||
        label.startsWith(`${lockedLabel} `) ||
        label.endsWith(` ${lockedLabel}`),
      )

      return routeIsLocked || labelIsLocked
    }

    const lockAction = (element: Element): void => {
      if (!isLockedAction(element)) return

      element.setAttribute('data-registration-locked', 'true')
      element.setAttribute('aria-disabled', 'true')
      element.setAttribute('title', t('header.registrationUnavailable'))

      if (element instanceof HTMLAnchorElement) {
        const href = element.getAttribute('href')
        if (href && !element.getAttribute('data-locked-href')) {
          element.setAttribute('data-locked-href', href)
        }
        element.removeAttribute('href')
        element.tabIndex = -1
      }

      if (element instanceof HTMLButtonElement) element.disabled = true
    }

    const disableRegistrationActions = (): void => {
      root.querySelectorAll('a, button, [role="button"]').forEach(lockAction)
    }

    const blockLockedAction = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Element)) return

      const actionElement = target.closest('a, button, [role="button"]')
      if (!actionElement || !isLockedAction(actionElement)) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }

    const blockLockedKeyboardAction = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      blockLockedAction(event)
    }

    disableRegistrationActions()
    root.addEventListener('pointerdown', blockLockedAction, true)
    root.addEventListener('click', blockLockedAction, true)
    root.addEventListener('keydown', blockLockedKeyboardAction, true)

    const observer = new MutationObserver(disableRegistrationActions)
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    })

    return () => {
      observer.disconnect()
      root.removeEventListener('pointerdown', blockLockedAction, true)
      root.removeEventListener('click', blockLockedAction, true)
      root.removeEventListener('keydown', blockLockedKeyboardAction, true)
    }
  }, [t, i18n.resolvedLanguage, i18n.language])

  const activeReview = reviews[activeReviewIndex]
  const activeRating = normalizeRating(activeReview?.rating)

  return (
    <div
      id="public-homepage"
      className="home-registration-locked min-h-screen bg-[#081224] text-white"
    >
      <style>{`
        .home-registration-locked [data-registration-locked='true'] {
          cursor: not-allowed !important;
          opacity: 0.42 !important;
          filter: grayscale(1) !important;
          background-color: #475569 !important;
          border-color: #64748b !important;
          color: #cbd5e1 !important;
          box-shadow: none !important;
          text-decoration: none !important;
          transform: none !important;
        }

        .home-registration-locked [data-registration-locked='true']:hover,
        .home-registration-locked [data-registration-locked='true']:focus,
        .home-registration-locked [data-registration-locked='true']:active {
          background-color: #475569 !important;
          border-color: #64748b !important;
          color: #cbd5e1 !important;
          box-shadow: none !important;
          transform: none !important;
        }
      `}</style>

      <header className="border-b border-white/15">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2">
          <div className="flex items-center gap-4">
            <img
              src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/5c3417dc-3924-4423-948a-745ae5902ed0.png"
              alt="ProPeloton Manager"
              className="h-24 w-auto shrink-0 object-contain"
            />
            <div className="text-xl font-semibold">ProPeloton Manager</div>
          </div>

          <nav className="flex items-center justify-end gap-3 sm:gap-4">
            <a href="#/login" className="text-sm font-semibold text-white/80 hover:text-white">
              {t('header.signIn')}
            </a>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title={t('header.registrationUnavailable')}
              data-registration-locked="true"
              className="cursor-not-allowed rounded-md bg-slate-600 px-4 py-2 text-sm font-bold text-slate-300"
            >
              {t('header.startPlaying')}
            </button>
          </nav>
        </div>
      </header>

      {isBetaNoticeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="beta-notice-title"
        >
          <div className="w-full max-w-xl rounded-2xl border border-yellow-400/35 bg-[#101b31] p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-yellow-300">
                  {t('beta.badge')}
                </div>
                <h2 id="beta-notice-title" className="mt-4 text-2xl font-bold text-white sm:text-3xl">
                  {t('beta.title')}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsBetaNoticeOpen(false)}
                className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white/75 hover:border-white/30 hover:text-white"
                aria-label={t('beta.closeLabel')}
              >
                {t('beta.close')}
              </button>
            </div>

            <p className="mt-4 text-sm leading-7 text-white/75 sm:text-base">
              {t('beta.body')}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a
                href={SOCIAL_LINKS.discord}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
              >
                {t('beta.discord')}
              </a>
              <button
                type="button"
                onClick={() => setIsBetaNoticeOpen(false)}
                className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/10"
              >
                {t('beta.continue')}
              </button>
            </div>
          </div>
        </div>
      )}

      {checkingClub && (
        <div className="border-b border-blue-700 bg-blue-950 py-2 text-center text-sm text-blue-100">
          {t('status.preparingAccount')}
        </div>
      )}

      {clubError && (
        <div className="border-b border-red-500 bg-red-900/80 py-2 text-center text-sm text-red-50">
          {clubError}
        </div>
      )}

      <main>
        <Hero gameTimeLabel={gameTimeText} />
        <HomepageRaceDays data={raceDays} loading={raceDaysLoading} />

        <section className="relative w-full overflow-hidden border-y border-white/15 bg-[#1a1404] py-16">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <img
              src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2008_28_06%20PM.png"
              alt=""
              className="h-full w-full object-cover"
              style={{
                opacity: 0.18,
                WebkitMaskImage:
                  'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.45) 100%)',
                maskImage:
                  'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.45) 100%)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#2a2108]/40 via-[#081224]/80 to-[#081224]/95" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl px-6">
            <section>
              <h3 className="text-2xl font-semibold">{t('stats.title')}</h3>
              <p className="mt-2 text-sm text-white/70">{t('stats.subtitle')}</p>

              {homeSnapshotError && (
                <div className="mt-4 rounded-md border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
                  {homeSnapshotError}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                {[
                  [t('stats.registeredUsers'), homeSnapshot?.active_managers],
                  [t('stats.totalTeams'), homeSnapshot?.total_teams],
                  [t('stats.totalRacesTours'), homeSnapshot?.total_races],
                  [t('stats.totalStages'), homeSnapshot?.total_stages],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border border-white/10 bg-[#101b31]/85 p-4 backdrop-blur-sm">
                    <div className="text-xs text-white/60">{label}</div>
                    <div className="mt-1 text-2xl font-bold text-white">
                      {formatNumber(value, locale)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-20">
              <h3 className="text-2xl font-semibold">{t('features.title')}</h3>
              <p className="mt-2 text-sm text-white/70">{t('features.subtitle')}</p>

              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2l3 7h7l-5.5 4 2 7L12 17l-6.5 3 2-7L2 9h7z" /></svg>}
                  title={t('features.squadTitle')}
                  description={t('features.squadDescription')}
                />
                <FeatureCard
                  icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3h18v4H3zM5 11h14v10H5z" /></svg>}
                  title={t('features.racesTitle')}
                  description={t('features.racesDescription')}
                />
                <FeatureCard
                  icon={<svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 1v22" /></svg>}
                  title={t('features.marketTitle')}
                  description={t('features.marketDescription')}
                />
              </div>
            </section>
          </div>
        </section>

        <section className="bg-slate-50 py-16 text-slate-900">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-yellow-700">
                {t('guide.eyebrow')}
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                {t('guide.headline')}
              </h2>
              <p className="mt-4 text-base leading-8 text-slate-700">
                {t('guide.intro')}
              </p>
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {HOMEPAGE_GUIDE_CARDS.map(card => (
                <article key={card.titleKey} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-950">{t(card.titleKey)}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{t(card.textKey)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <ScreenshotGallery />

        <section className="py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-2xl font-semibold">{t('reviews.title')}</h3>
                <p className="mt-2 text-sm text-white/70">{t('reviews.subtitle')}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsReviewFormOpen(current => !current)
                  setReviewSubmitMessage(null)
                  setReviewSubmitTone(null)
                }}
                className="self-start rounded-md bg-yellow-400 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-300 md:self-auto"
              >
                {isReviewFormOpen ? t('reviews.closeForm') : t('reviews.addReview')}
              </button>
            </div>

            {reviewSubmitMessage && (
              <div
                className={[
                  'mt-5 rounded-xl border px-4 py-3 text-sm',
                  reviewSubmitTone === 'success'
                    ? 'border-green-400/30 bg-green-500/10 text-green-100'
                    : 'border-red-400/30 bg-red-500/10 text-red-100',
                ].join(' ')}
              >
                {reviewSubmitMessage}
              </div>
            )}

            {isReviewFormOpen && (
              <form onSubmit={handleSubmitReview} className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
                  <label className="block">
                    <span className="text-sm font-semibold text-white">{t('reviews.name')}</span>
                    <input
                      value={reviewName}
                      onChange={event => {
                        setReviewName(event.target.value)
                        clearReviewError('name')
                      }}
                      className="mt-1 w-full rounded-md border border-white/15 bg-[#101b31] px-3 py-2 text-white placeholder:text-white/35 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
                      placeholder={t('reviews.yourName')}
                    />
                    {reviewErrors.name && <div className="mt-1 text-sm text-red-300">{reviewErrors.name}</div>}
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-white">{t('reviews.email')}</span>
                    <input
                      type="email"
                      value={reviewEmail}
                      onChange={event => {
                        setReviewEmail(event.target.value)
                        clearReviewError('email')
                      }}
                      className="mt-1 w-full rounded-md border border-white/15 bg-[#101b31] px-3 py-2 text-white placeholder:text-white/35 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
                      placeholder={t('reviews.emailPlaceholder')}
                    />
                    {reviewErrors.email && <div className="mt-1 text-sm text-red-300">{reviewErrors.email}</div>}
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-white">{t('reviews.rating')}</span>
                    <select
                      value={reviewRating}
                      onChange={event => {
                        setReviewRating(Number(event.target.value))
                        clearReviewError('rating')
                      }}
                      className="mt-1 w-full rounded-md border border-white/15 bg-[#101b31] px-3 py-2 text-white focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
                    >
                      <option value={5}>{t('reviews.fiveStars')}</option>
                      <option value={4}>{t('reviews.fourStars')}</option>
                      <option value={3}>{t('reviews.threeStars')}</option>
                      <option value={2}>{t('reviews.twoStars')}</option>
                      <option value={1}>{t('reviews.oneStar')}</option>
                    </select>
                    {reviewErrors.rating && <div className="mt-1 text-sm text-red-300">{reviewErrors.rating}</div>}
                  </label>
                </div>

                <label className="mt-4 block">
                  <span className="text-sm font-semibold text-white">{t('reviews.review')}</span>
                  <textarea
                    value={reviewMessage}
                    onChange={event => {
                      setReviewMessage(event.target.value)
                      clearReviewError('message')
                    }}
                    className="mt-1 min-h-[120px] w-full rounded-md border border-white/15 bg-[#101b31] px-3 py-2 text-white placeholder:text-white/35 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
                    placeholder={t('reviews.reviewPlaceholder')}
                  />
                  {reviewErrors.message && <div className="mt-1 text-sm text-red-300">{reviewErrors.message}</div>}
                </label>

                <p className="mt-3 text-xs leading-5 text-white/55">{t('reviews.privacyNote')}</p>

                <button
                  type="submit"
                  disabled={submittingReview}
                  className="mt-4 rounded-md bg-yellow-400 px-5 py-2 text-sm font-bold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingReview ? t('reviews.submitting') : t('reviews.submit')}
                </button>
              </form>
            )}

            {reviewsLoading && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-6 py-8 text-center text-sm text-white/65">
                {t('reviews.loading')}
              </div>
            )}

            {!reviewsLoading && reviewsError && (
              <div className="mt-6 rounded-xl border border-yellow-400/25 bg-yellow-400/10 px-6 py-8 text-center text-sm text-yellow-100">
                {reviewsError}
              </div>
            )}

            {!reviewsLoading && !reviewsError && activeReview && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-6 py-8">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={showPreviousReview}
                    disabled={reviews.length <= 1}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-xl text-white/80 hover:border-yellow-400 hover:text-yellow-400 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label={t('reviews.previous')}
                  >
                    ‹
                  </button>

                  <article className="max-w-3xl text-center">
                    <div className="text-lg font-semibold text-yellow-300">
                      {'★'.repeat(activeRating)}
                      {'☆'.repeat(5 - activeRating)}
                    </div>
                    <p className="mt-4 text-base leading-7 text-white/85">“{activeReview.review_text}”</p>
                    <div className="mt-4 text-sm font-semibold text-white">{activeReview.reviewer_name}</div>
                    <div className="mt-1 text-xs text-white/50">
                      {formatReviewDate(
                        activeReview.approved_at || activeReview.created_at,
                        locale,
                        t('reviews.recently'),
                      )}
                    </div>
                    {reviews.length > 1 && (
                      <div className="mt-3 text-xs text-white/45">
                        {t('reviews.reviewPosition', {
                          current: activeReviewIndex + 1,
                          total: reviews.length,
                        })}
                      </div>
                    )}
                  </article>

                  <button
                    type="button"
                    onClick={showNextReview}
                    disabled={reviews.length <= 1}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-xl text-white/80 hover:border-yellow-400 hover:text-yellow-400 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label={t('reviews.next')}
                  >
                    ›
                  </button>
                </div>
              </div>
            )}

            {!reviewsLoading && !reviewsError && !activeReview && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-6 py-8 text-center">
                <button
                  type="button"
                  onClick={() => setIsReviewFormOpen(true)}
                  className="rounded-md bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
                >
                  {t('reviews.addFirst')}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="relative w-full overflow-hidden border-t border-white/15 bg-[#1a1404] py-20">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <img
              src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2008_28_06%20PM.png"
              alt=""
              className="h-full w-full object-cover"
              style={{
                opacity: 0.2,
                WebkitMaskImage:
                  'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.45) 100%)',
                maskImage:
                  'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.45) 100%)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#2a2108]/30 via-[#171105]/75 to-[#081224]/90" />
          </div>
          <div className="relative z-10"><CTA /></div>
        </section>
      </main>

      <footer className="border-t border-white/15 py-10">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 md:grid-cols-[1.4fr_auto_auto_1fr] md:gap-x-10 lg:gap-x-14">
          <div>
            <div className="text-lg font-semibold">ProPeloton Manager</div>
            <div className="mt-2 max-w-md text-sm leading-6 text-white/70">{t('footer.description')}</div>
            <div className="mt-4 text-xs text-white/50">{t('footer.copyright')}</div>
          </div>

          <nav aria-label={t('footer.gameAria')}>
            <div className="text-sm font-semibold text-white">{t('footer.game')}</div>
            <div className="mt-3 flex flex-col gap-2">
              {FOOTER_GAME_LINKS.map(link => (
                <a key={link.href} href={link.href} className="text-sm text-white/70 hover:text-yellow-400">
                  {t(link.labelKey)}
                </a>
              ))}
              <a href="#/login" className="text-sm text-white/70 hover:text-yellow-400">{t('header.signIn')}</a>
              <span
                aria-disabled="true"
                data-registration-locked="true"
                title={t('header.registrationUnavailable')}
                className="cursor-not-allowed text-sm text-white/35"
              >
                {t('header.startPlaying')}
              </span>
            </div>
          </nav>

          <nav aria-label={t('footer.legalAria')}>
            <div className="text-sm font-semibold text-white">{t('footer.legal')}</div>
            <div className="mt-3 flex flex-col gap-2">
              {FOOTER_LEGAL_LINKS.map(link => (
                <a key={link.href} href={link.href} className="text-sm text-white/70 hover:text-yellow-400">
                  {t(link.labelKey)}
                </a>
              ))}
              <a href="/support/" className="text-sm text-white/70 hover:text-yellow-400">{t('footer.support')}</a>
            </div>
          </nav>

          <div>
            <div className="text-sm font-semibold text-white">{t('footer.connect')}</div>
            <div className="mt-3 text-sm leading-6 text-white/70">{t('footer.connectText')}</div>
            <div className="mt-4 flex items-center gap-3 text-white/70">
              <a
                href={SOCIAL_LINKS.facebook}
                aria-label={t('footer.facebook')}
                className="hover:text-yellow-400"
                target="_blank"
                rel="noreferrer"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5h1.7V4.9c-.8-.1-1.6-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.2V11H7.4v3h2.7v8h3.4z" />
                </svg>
              </a>
              <a
                href={SOCIAL_LINKS.discord}
                aria-label={t('footer.discord')}
                className="hover:text-yellow-400"
                target="_blank"
                rel="noreferrer"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.5 5.2A16.3 16.3 0 0 0 15.4 4l-.2.4c1.5.4 2.2 1 2.2 1s-1.4-.8-4.1-1c-2.7-.2-4.8.6-4.8.6s.8-.7 2.4-1L10.7 4a16.5 16.5 0 0 0-4.1 1.2C4 9.1 3.3 13 3.5 16.8A16.7 16.7 0 0 0 8.6 19l.6-.9c-1.1-.4-1.7-1-1.7-1s.2.1.5.3c2 .9 4.1 1.1 6 1 1.5-.1 3-.4 4.3-1 .2-.1.4-.2.4-.2s-.6.7-1.8 1.1l.6.9a16.5 16.5 0 0 0 5.1-2.2c.3-4.4-.7-8.2-3.1-11.8zM9.3 14.5c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6zm5.4 0c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6z" />
                </svg>
              </a>
              <a href={SOCIAL_LINKS.email} aria-label={t('footer.email')} className="hover:text-yellow-400">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16v12H4z" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
