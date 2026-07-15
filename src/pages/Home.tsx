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
 *
 * UPDATE: Public AdSense-readiness improvements
 * - Adds more original readable homepage content.
 * - Adds public navigation links in the header.
 * - Keeps public pages reachable from the homepage without login.
 * - Uses contact@propelotonmanager.com as the visible contact email.
 *
 * UPDATE: Sustainable homepage reviews
 * - Reviews are loaded from Supabase using get_public_homepage_reviews_v1.
 * - Review submissions go to Supabase using submit_homepage_player_review_v1.
 * - New reviews are stored as pending and only appear after approval.
 * - No localStorage is used.
 *
 * UPDATE: Public readiness cleanup
 * - No beta popup.
 * - No “under construction” wording.
 * - No YouTube/X placeholder icons.
 * - Real Facebook and Discord links.
 */

import React, { useCallback, useEffect, useState } from 'react'
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

const SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/profile.php?id=61583549010426',
  discord: 'https://discord.gg/GNDCCz5SW',
  email: `mailto:${CONTACT_EMAIL}`,
}

const HEADER_PUBLIC_LINKS = [
  { label: 'About', href: '/about/' },
  { label: 'How to Play', href: '/how-to-play/' },
  { label: 'Game Guide', href: '/game-guide/' },
  { label: 'Demo', href: '/demo/' },
  { label: 'Support', href: '/support/' },
  { label: 'Contact', href: '/contact/' },
]

const FOOTER_GAME_LINKS = [
  { label: 'About', href: '/about/' },
  { label: 'How to Play', href: '/how-to-play/' },
  { label: 'Game Guide', href: '/game-guide/' },
  { label: 'Demo', href: '/demo/' },
  { label: 'Contact', href: '/contact/' },
]

const FOOTER_LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy-policy/' },
  { label: 'Terms', href: '/terms/' },
]

const HOMEPAGE_GUIDE_CARDS = [
  {
    title: 'What is ProPeloton Manager?',
    text:
      'ProPeloton Manager is an online cycling management game where you create and develop a cycling club. Instead of controlling a rider directly, you manage the team behind the race: riders, training, race plans, staff, equipment, finances, sponsors, transfers and long-term ranking progress.',
  },
  {
    title: 'How do you play?',
    text:
      'Managers build a squad, study the race calendar, apply for suitable races, prepare race plans, choose riders, assign roles, manage supplies and follow results. Good decisions depend on rider skills, fatigue, morale, race profile, weather, budget and season goals.',
  },
  {
    title: 'Why does preparation matter?',
    text:
      'A strong rider is not enough by itself. Race preparation connects riders, staff, vehicles, equipment, supplies and tactics. Planning ahead helps your team arrive ready for sprints, climbs, time trials, stage races and difficult weather conditions.',
  },
]

const HOMEPAGE_TRUST_ITEMS = [
  {
    title: 'Public information',
    text:
      'Visitors can read about the game, learn how to play, contact support, and review privacy and terms information before creating an account.',
  },
  {
    title: 'Clear support access',
    text:
      'Support is available for account questions, gameplay questions, bug reports, payment questions and feedback about ProPeloton Manager.',
  },
  {
    title: 'Privacy and transparency',
    text:
      'The public privacy policy and terms pages explain account data, gameplay data, payments, coins, advertising, cookies and fair-use rules.',
  },
]

const MONTH_INDEX_BY_NAME: Record<string, number> = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function getWeekdayName(
  seasonNumber: number,
  monthName: string,
  dayNumber: number
): string | null {
  const monthIndex = MONTH_INDEX_BY_NAME[monthName]

  if (monthIndex === undefined || !Number.isInteger(dayNumber)) {
    return null
  }

  const year = 1999 + seasonNumber
  const date = new Date(Date.UTC(year, monthIndex, dayNumber))

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return WEEKDAY_NAMES[date.getUTCDay()] ?? null
}

function formatTime(hour24: number, minute2: number): string {
  const hour = String(hour24).padStart(2, '0')
  const minute = String(minute2).padStart(2, '0')
  return `${hour}:${minute}`
}

function formatGameTime(row: GameTimeRow): string {
  const seasonText = `Season ${row.season_number}`
  const weekdayText = getWeekdayName(
    row.season_number,
    row.month_name,
    row.day_number
  )
  const dateText = `${row.month_name} ${row.day_number}`
  const timeText = formatTime(row.hour_24, row.minute_2)

  return weekdayText
    ? `${seasonText} · ${weekdayText} · ${dateText} · ${timeText}`
    : `${seasonText} · ${dateText} · ${timeText}`
}

function toNumber(value: unknown): number {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return 0
  }

  return parsedValue
}

function formatNumber(value: unknown): string {
  return new Intl.NumberFormat('en-US').format(toNumber(value))
}

function normalizeHomeSnapshot(data: unknown): HomeSnapshot | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const row = data as RawHomeSnapshot

  return {
    game_time_label:
      typeof row.game_time_label === 'string' && row.game_time_label.trim().length > 0
        ? row.game_time_label
        : 'Loading game time...',
    active_managers: toNumber(row.active_managers),
    total_teams: toNumber(row.total_teams),
    total_races: toNumber(row.total_races),
    total_stages: toNumber(row.total_stages),
  }
}

function isProbablyValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function formatReviewDate(value: string | null): string {
  if (!value) {
    return 'Recently'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Recently'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function normalizeRating(value: unknown): number {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return 5
  }

  return Math.max(1, Math.min(5, Math.round(parsedValue)))
}

export default function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [checkingClub, setCheckingClub] = useState(false)
  const [clubError, setClubError] = useState<string | null>(null)
  const [homeSnapshot, setHomeSnapshot] = useState<HomeSnapshot | null>(null)
  const [homeSnapshotError, setHomeSnapshotError] = useState<string | null>(null)
  const [gameTimeText, setGameTimeText] = useState('Loading game time...')
  const [raceDays, setRaceDays] = useState<HomepageRaceDaysData | null>(null)
  const [raceDaysLoading, setRaceDaysLoading] = useState(false)

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
      setReviewsError('Reviews are temporarily unavailable.')
      setReviewsLoading(false)
      return
    }

    const rows = Array.isArray(data) ? (data as PublicHomepageReview[]) : []

    setReviews(rows)
    setActiveReviewIndex(0)
    setReviewsLoading(false)
  }, [])

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
        setGameTimeText(current =>
          current === 'Loading game time...' ? 'Game time unavailable' : current
        )
        return
      }

      const rows = data as GameTimeRow[] | null
      const nextRow = rows?.[0]

      if (nextRow) {
        setGameTimeText(formatGameTime(nextRow))
      } else {
        setGameTimeText(current =>
          current === 'Loading game time...' ? 'Game time unavailable' : current
        )
      }
    }

    void loadGameTime()

    const intervalId = window.setInterval(() => {
      void loadGameTime()
    }, 30_000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadHomeSnapshot() {
      const { data, error } = await supabase.rpc('get_public_homepage_snapshot_v1')

      if (!isMounted) return

      if (error) {
        console.warn('Could not load homepage snapshot:', error.message)
        setHomeSnapshotError('Live homepage data is temporarily unavailable.')
        return
      }

      const normalizedSnapshot = normalizeHomeSnapshot(data)

      if (!normalizedSnapshot) {
        setHomeSnapshotError('Live homepage data returned an unexpected format.')
        return
      }

      setHomeSnapshot(normalizedSnapshot)
      setHomeSnapshotError(null)
    }

    loadHomeSnapshot()

    const intervalId = window.setInterval(loadHomeSnapshot, 60_000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [])

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

    loadRaceDays()

    const intervalId = window.setInterval(loadRaceDays, 60_000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    if (loading) {
      return
    }

    if (!user) {
      if (isMounted) {
        setCheckingClub(false)
        setClubError(null)
      }

      return
    }

    setCheckingClub(true)
    setClubError(null)

    ;(async () => {
      const { data, error } = await supabase.rpc('get_my_club_id')

      if (!isMounted) return

      if (error) {
        setClubError(
          'You are signed in, but we could not load your club status. Please refresh or try again.',
        )
        setCheckingClub(false)
        return
      }

      if (!data) {
        navigate('/create-club', { replace: true })
      } else {
        navigate('/dashboard/overview', { replace: true })
      }
    })()

    return () => {
      isMounted = false
    }
  }, [user, loading, navigate])

  function clearReviewError(field: keyof ReviewFormErrors): void {
    setReviewErrors(current => {
      if (!current[field]) {
        return current
      }

      const nextErrors = { ...current }
      delete nextErrors[field]
      return nextErrors
    })
  }

  function validateReviewForm(): boolean {
    const nextErrors: ReviewFormErrors = {}

    if (!reviewName.trim()) {
      nextErrors.name = 'Please enter your name.'
    } else if (reviewName.trim().length < 2) {
      nextErrors.name = 'Please enter at least 2 characters.'
    }

    if (!reviewEmail.trim()) {
      nextErrors.email = 'Please enter your email.'
    } else if (!isProbablyValidEmail(reviewEmail)) {
      nextErrors.email = 'Please enter a valid email address.'
    }

    if (!Number.isFinite(reviewRating) || reviewRating < 1 || reviewRating > 5) {
      nextErrors.rating = 'Please choose a rating from 1 to 5.'
    }

    if (!reviewMessage.trim()) {
      nextErrors.message = 'Please write your review.'
    } else if (reviewMessage.trim().length < 20) {
      nextErrors.message = 'Please write at least 20 characters.'
    } else if (reviewMessage.trim().length > 1200) {
      nextErrors.message = 'Please keep your review under 1200 characters.'
    }

    setReviewErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmitReview(event: React.FormEvent): Promise<void> {
    event.preventDefault()

    if (!validateReviewForm()) {
      return
    }

    setSubmittingReview(true)
    setReviewSubmitMessage(null)
    setReviewSubmitTone(null)

    const { data, error } = await supabase.rpc('submit_homepage_player_review_v1', {
      p_reviewer_name: reviewName.trim(),
      p_reviewer_email: reviewEmail.trim(),
      p_rating: reviewRating,
      p_review_text: reviewMessage.trim(),
      p_metadata: {
        source: 'homepage_form',
      },
    })

    if (error) {
      setReviewSubmitTone('error')
      setReviewSubmitMessage(error.message || 'Could not submit review.')
      setSubmittingReview(false)
      return
    }

    const result = data as { message?: string } | null

    setReviewSubmitTone('success')
    setReviewSubmitMessage(
      result?.message ||
        'Thank you. Your review was submitted and will appear after approval.',
    )

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

  const activeReview = reviews[activeReviewIndex]
  const activeRating = normalizeRating(activeReview?.rating)

  return (
    <div className="min-h-screen bg-[#081224] text-white">
      <header className="border-b border-white/15">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2">
          <div className="flex items-center gap-4">
            <img
              src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/5c3417dc-3924-4423-948a-745ae5902ed0.png"
              alt="ProPeloton Manager logo"
              className="h-24 w-auto shrink-0 object-contain"
            />

            <div className="text-xl font-semibold">ProPeloton Manager</div>
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {HEADER_PUBLIC_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="hidden text-sm font-semibold text-white/70 hover:text-yellow-400 md:inline-flex"
              >
                {link.label}
              </a>
            ))}

            <a href="#/login" className="text-sm font-semibold text-white/80 hover:text-white">
              Sign In
            </a>

            <a
              href="#/register"
              className="rounded-md bg-yellow-400 px-4 py-2 text-sm font-bold text-black hover:bg-yellow-300"
            >
              Start Playing
            </a>
          </nav>
        </div>
      </header>

      {checkingClub && (
        <div className="border-b border-blue-700 bg-blue-950 py-2 text-center text-sm text-blue-100">
          Preparing your manager account...
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
              <h3 className="text-2xl font-semibold">Quick Stats</h3>

              <p className="mt-2 text-sm text-white/70">
                Live snapshot of the ProPeloton world.
              </p>

              {homeSnapshotError && (
                <div className="mt-4 rounded-md border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
                  {homeSnapshotError}
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="rounded-md border border-white/10 bg-[#101b31]/85 p-4 backdrop-blur-sm">
                  <div className="text-xs text-white/60">Game Status</div>
                  <div className="mt-1 text-2xl font-bold text-white">Open</div>
                </div>

                <div className="rounded-md border border-white/10 bg-[#101b31]/85 p-4 backdrop-blur-sm">
                  <div className="text-xs text-white/60">Total Teams</div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {formatNumber(homeSnapshot?.total_teams)}
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-[#101b31]/85 p-4 backdrop-blur-sm">
                  <div className="text-xs text-white/60">Total Races & Tours</div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {formatNumber(homeSnapshot?.total_races)}
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-[#101b31]/85 p-4 backdrop-blur-sm">
                  <div className="text-xs text-white/60">Total Stages</div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {formatNumber(homeSnapshot?.total_stages)}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-20">
              <h3 className="text-2xl font-semibold">Core Features</h3>

              <p className="mt-2 text-sm text-white/70">
                Everything you need to manage a world-class cycling club.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  icon={
                    <svg
                      className="h-6 w-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M12 2l3 7h7l-5.5 4 2 7L12 17l-6.5 3 2-7L2 9h7z" />
                    </svg>
                  }
                  title="Deep Squad Management"
                  description="Train, rotate and develop riders with realistic form, fatigue and talent progression."
                />

                <FeatureCard
                  icon={
                    <svg
                      className="h-6 w-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M3 3h18v4H3zM5 11h14v10H5z" />
                    </svg>
                  }
                  title="Tactical Races"
                  description="Choose attack points, manage breakaways and execute stage-winning tactics."
                />

                <FeatureCard
                  icon={
                    <svg
                      className="h-6 w-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path d="M12 1v22" />
                    </svg>
                  }
                  title="Market & Transfers"
                  description="Scout, bid and negotiate contracts in a dynamic transfer market."
                />
              </div>
            </section>
          </div>
        </section>

        <section className="bg-slate-50 py-16 text-slate-900">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-yellow-700">
                Game guide
              </p>

              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                Learn what ProPeloton Manager offers before you join.
              </h2>

              <p className="mt-4 text-base leading-8 text-slate-700">
                ProPeloton Manager is built around long-term cycling management. The
                public pages explain the game, but the homepage also gives visitors a
                direct overview of the main systems: team building, rider development,
                race preparation, tactics, finances, support and season rankings.
              </p>
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {HOMEPAGE_GUIDE_CARDS.map(card => (
                <article
                  key={card.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <h3 className="text-xl font-bold text-slate-950">{card.title}</h3>

                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {card.text}
                  </p>
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
                <h3 className="text-2xl font-semibold">Player Reviews</h3>

                <p className="mt-2 text-sm text-white/70">
                  Share your experience with ProPeloton Manager and help new players
                  understand the game.
                </p>
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
                {isReviewFormOpen ? 'Close Review Form' : 'Add Review'}
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
              <form
                onSubmit={handleSubmitReview}
                className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5"
              >
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_160px]">
                  <label className="block">
                    <span className="text-sm font-semibold text-white">Name</span>
                    <input
                      value={reviewName}
                      onChange={event => {
                        setReviewName(event.target.value)
                        clearReviewError('name')
                      }}
                      className="mt-1 w-full rounded-md border border-white/15 bg-[#101b31] px-3 py-2 text-white placeholder:text-white/35 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
                      placeholder="Your name"
                    />
                    {reviewErrors.name && (
                      <div className="mt-1 text-sm text-red-300">{reviewErrors.name}</div>
                    )}
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-white">Email</span>
                    <input
                      type="email"
                      value={reviewEmail}
                      onChange={event => {
                        setReviewEmail(event.target.value)
                        clearReviewError('email')
                      }}
                      className="mt-1 w-full rounded-md border border-white/15 bg-[#101b31] px-3 py-2 text-white placeholder:text-white/35 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
                      placeholder="you@example.com"
                    />
                    {reviewErrors.email && (
                      <div className="mt-1 text-sm text-red-300">{reviewErrors.email}</div>
                    )}
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-white">Rating</span>
                    <select
                      value={reviewRating}
                      onChange={event => {
                        setReviewRating(Number(event.target.value))
                        clearReviewError('rating')
                      }}
                      className="mt-1 w-full rounded-md border border-white/15 bg-[#101b31] px-3 py-2 text-white focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
                    >
                      <option value={5}>5 stars</option>
                      <option value={4}>4 stars</option>
                      <option value={3}>3 stars</option>
                      <option value={2}>2 stars</option>
                      <option value={1}>1 star</option>
                    </select>
                    {reviewErrors.rating && (
                      <div className="mt-1 text-sm text-red-300">{reviewErrors.rating}</div>
                    )}
                  </label>
                </div>

                <label className="mt-4 block">
                  <span className="text-sm font-semibold text-white">Review</span>
                  <textarea
                    value={reviewMessage}
                    onChange={event => {
                      setReviewMessage(event.target.value)
                      clearReviewError('message')
                    }}
                    className="mt-1 min-h-[120px] w-full rounded-md border border-white/15 bg-[#101b31] px-3 py-2 text-white placeholder:text-white/35 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
                    placeholder="Tell other players what you think about ProPeloton Manager..."
                  />
                  {reviewErrors.message && (
                    <div className="mt-1 text-sm text-red-300">{reviewErrors.message}</div>
                  )}
                </label>

                <p className="mt-3 text-xs leading-5 text-white/55">
                  Reviews are checked before they appear publicly. Please do not include
                  passwords, payment card details, or private account information.
                </p>

                <button
                  type="submit"
                  disabled={submittingReview}
                  className="mt-4 rounded-md bg-yellow-400 px-5 py-2 text-sm font-bold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingReview ? 'Submitting...' : 'Submit Review'}
                </button>
              </form>
            )}

            {reviewsLoading && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-6 py-8 text-center text-sm text-white/65">
                Loading reviews...
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
                    aria-label="Previous review"
                  >
                    ‹
                  </button>

                  <article className="max-w-3xl text-center">
                    <div className="text-lg font-semibold text-yellow-300">
                      {'★'.repeat(activeRating)}
                      {'☆'.repeat(5 - activeRating)}
                    </div>

                    <p className="mt-4 text-base leading-7 text-white/85">
                      “{activeReview.review_text}”
                    </p>

                    <div className="mt-4 text-sm font-semibold text-white">
                      {activeReview.reviewer_name}
                    </div>

                    <div className="mt-1 text-xs text-white/50">
                      {formatReviewDate(activeReview.approved_at || activeReview.created_at)}
                    </div>

                    {reviews.length > 1 && (
                      <div className="mt-3 text-xs text-white/45">
                        Review {activeReviewIndex + 1} of {reviews.length}
                      </div>
                    )}
                  </article>

                  <button
                    type="button"
                    onClick={showNextReview}
                    disabled={reviews.length <= 1}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-xl text-white/80 hover:border-yellow-400 hover:text-yellow-400 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Next review"
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
                  Add the first review
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="w-full bg-slate-950 py-16 text-white">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-yellow-300">
                  Support and transparency
                </p>

                <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight md:text-4xl">
                  Public information is available before registration.
                </h2>

                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-200">
                  Visitors can read the main game explanation, review support
                  information, check contact details and understand privacy and terms
                  before creating an account. This makes the public website easier to
                  navigate and more useful for new players.
                </p>

                <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
                  ProPeloton Manager also keeps public support information visible for
                  account questions, gameplay questions, bug reports, payment questions,
                  coin questions, privacy questions and general feedback.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <a
                    href="/demo/"
                    className="rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
                  >
                    View Demo
                  </a>

                  <a
                    href="/support/"
                    className="rounded-lg border border-white/25 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
                  >
                    Support
                  </a>

                  <a
                    href="/contact/"
                    className="rounded-lg border border-white/25 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
                  >
                    Contact
                  </a>

                  <a
                    href="/privacy-policy/"
                    className="rounded-lg border border-white/25 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
                  >
                    Privacy Policy
                  </a>

                  <a
                    href="/terms/"
                    className="rounded-lg border border-white/25 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
                  >
                    Terms
                  </a>
                </div>
              </div>

              <div className="grid gap-5">
                {HOMEPAGE_TRUST_ITEMS.map(item => (
                  <article
                    key={item.title}
                    className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-sm"
                  >
                    <h3 className="text-xl font-bold text-white">{item.title}</h3>

                    <p className="mt-3 text-sm leading-7 text-slate-200">
                      {item.text}
                    </p>
                  </article>
                ))}
              </div>
            </div>
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

          <div className="relative z-10">
            <CTA />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/15 py-10">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 md:grid-cols-[1.4fr_auto_auto_1fr] md:gap-x-10 lg:gap-x-14">
          <div>
            <div className="text-lg font-semibold">ProPeloton Manager</div>

            <div className="mt-2 max-w-md text-sm leading-6 text-white/70">
              A premium online cycling manager by Next Quest Studio. Build a team,
              manage riders, prepare races, follow rankings, and develop your club
              across a living cycling season.
            </div>

            <div className="mt-4 text-xs text-white/50">
              © ProPeloton Manager. All rights reserved by Next Quest Studio.
            </div>
          </div>

          <nav aria-label="Game information">
            <div className="text-sm font-semibold text-white">Game</div>

            <div className="mt-3 flex flex-col gap-2">
              {FOOTER_GAME_LINKS.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-white/70 hover:text-yellow-400"
                >
                  {link.label}
                </a>
              ))}

              <a href="#/login" className="text-sm text-white/70 hover:text-yellow-400">
                Sign In
              </a>

              <a href="#/register" className="text-sm text-white/70 hover:text-yellow-400">
                Start Playing
              </a>
            </div>
          </nav>

          <nav aria-label="Legal information">
            <div className="text-sm font-semibold text-white">Legal</div>

            <div className="mt-3 flex flex-col gap-2">
              {FOOTER_LEGAL_LINKS.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-white/70 hover:text-yellow-400"
                >
                  {link.label}
                </a>
              ))}

              <a href="/support/" className="text-sm text-white/70 hover:text-yellow-400">
                Support
              </a>
            </div>
          </nav>

          <div>
            <div className="text-sm font-semibold text-white">Connect</div>

            <div className="mt-3 text-sm leading-6 text-white/70">
              Questions, support requests, and feedback can be sent through the Contact
              page or by email.
            </div>

            <div className="mt-4 flex items-center gap-3 text-white/70">
              <a
                href={SOCIAL_LINKS.facebook}
                aria-label="Facebook"
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
                aria-label="Discord"
                className="hover:text-yellow-400"
                target="_blank"
                rel="noreferrer"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.5 5.2A16.3 16.3 0 0 0 15.4 4l-.2.4c1.5.4 2.2 1 2.2 1s-1.4-.8-4.1-1c-2.7-.2-4.8.6-4.8.6s.8-.7 2.4-1L10.7 4a16.5 16.5 0 0 0-4.1 1.2C4 9.1 3.3 13 3.5 16.8A16.7 16.7 0 0 0 8.6 19l.6-.9c-1.1-.4-1.7-1-1.7-1s.2.1.5.3c2 .9 4.1 1.1 6 1 1.5-.1 3-.4 4.3-1 .2-.1.4-.2.4-.2s-.6.7-1.8 1.1l.6.9a16.5 16.5 0 0 0 5.1-2.2c.3-4.4-.7-8.2-3.1-11.8zM9.3 14.5c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6zm5.4 0c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6z" />
                </svg>
              </a>

              <a
                href={SOCIAL_LINKS.email}
                aria-label="Email"
                className="hover:text-yellow-400"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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