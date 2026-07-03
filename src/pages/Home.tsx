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
 * UPDATE: Public AdSense-readiness footer links
 * - Adds footer links to About, How to Play, Support, Privacy Policy, Terms, and Contact.
 * - Keeps public pages reachable from the homepage without login.
 */

import React, { useEffect, useState } from 'react'
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

const BETA_NOTICE_STORAGE_KEY = 'propeloton-beta-notice-seen'

const SOCIAL_LINKS = {
  facebook: '#',
  youtube: '#',
  discord: '#',
  x: '#',
  email: 'mailto:contact@propelotonmanager.com',
}

const FOOTER_GAME_LINKS = [
  { label: 'About', href: '#/about' },
  { label: 'How to Play', href: '#/how-to-play' },
  { label: 'Support', href: '#/support' },
  { label: 'Contact', href: '#/contact' },
]

const FOOTER_LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '#/privacy-policy' },
  { label: 'Terms', href: '#/terms' },
]

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

/**
 * HomePage
 * Extended landing page with multiple sections: hero, features, screenshots,
 * reviews and CTA. Also performs a post-confirmation club check for
 * authenticated users and routes them accordingly.
 */
export default function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const [checkingClub, setCheckingClub] = useState(false)
  const [clubError, setClubError] = useState<string | null>(null)
  const [showBetaNotice, setShowBetaNotice] = useState(false)
  const [homeSnapshot, setHomeSnapshot] = useState<HomeSnapshot | null>(null)
  const [homeSnapshotError, setHomeSnapshotError] = useState<string | null>(null)
  const [raceDays, setRaceDays] = useState<HomepageRaceDaysData | null>(null)
  const [raceDaysLoading, setRaceDaysLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hasSeenBetaNotice = window.sessionStorage.getItem(BETA_NOTICE_STORAGE_KEY)

    if (!hasSeenBetaNotice) {
      setShowBetaNotice(true)
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

  function closeBetaNotice() {
    setShowBetaNotice(false)

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(BETA_NOTICE_STORAGE_KEY, 'true')
    }
  }

  /**
   * When auth is resolved and a user is present, call get_my_club_id()
   * to decide the next step:
   * - No club: redirect to /create-club
   * - Has club: redirect to /dashboard/overview
   * On RPC error, stay on the homepage and show an inline error banner.
   */
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

          <nav className="flex items-center gap-4">
            <a href="#/login" className="text-white/80 hover:text-white">
              Sign In
            </a>

            <a
              href="#/register"
              className="rounded-md bg-yellow-400 px-4 py-2 font-semibold text-black hover:bg-yellow-300"
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

      {showBetaNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="beta-notice-title"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-yellow-400/40 bg-[#081224] shadow-2xl">
            <div className="border-b border-white/10 bg-yellow-400 px-6 py-4 text-black">
              <div className="text-xs font-bold uppercase tracking-[0.22em]">
                Closed beta notice
              </div>

              <h2 id="beta-notice-title" className="mt-2 text-2xl font-bold">
                ProPeloton Manager is still in beta
              </h2>
            </div>

            <div className="space-y-4 px-6 py-6 text-sm leading-6 text-white/80">
              <p>
                The game is online for testing, but it is not fully playable yet.
                Some features, race systems, results, balancing, notifications and UI
                screens may still be unfinished or change during development.
              </p>

              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/75">
                You can explore the current beta version, but progress and data may be
                adjusted while the game is being completed.
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <a
                href="#/login"
                className="text-center text-sm font-semibold text-white/80 hover:text-white"
              >
                Tester sign in
              </a>

              <button
                type="button"
                onClick={closeBetaNotice}
                className="rounded-md bg-yellow-400 px-5 py-2 text-sm font-bold text-black hover:bg-yellow-300"
              >
                I understand
              </button>
            </div>
          </div>
        </div>
      )}

      <main>
        <Hero gameTimeLabel={homeSnapshot?.game_time_label ?? 'Loading game time...'} />

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
                  <div className="text-xs text-white/60">Active Managers</div>
                  <div className="mt-1 text-2xl font-bold text-white">
                    {formatNumber(homeSnapshot?.active_managers)}
                  </div>
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

        <ScreenshotGallery />

        <section className="py-12">
          <div className="mx-auto max-w-7xl px-6">
            <h3 className="text-2xl font-semibold">Player Reviews</h3>

            <p className="mt-2 text-sm text-white/70">
              Community reviews will be shown here once public reviews are available.
            </p>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-6 py-8 text-center">
              <div className="text-lg font-semibold text-white">No reviews yet</div>

              <p className="mt-2 text-sm text-white/65">
                Reviews will appear here after the review system is opened for players.
              </p>
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

              <a href="#/support" className="text-sm text-white/70 hover:text-yellow-400">
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
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.5 1.6-1.5h1.7V4.9c-.8-.1-1.6-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.2V11H7.4v3h2.7v8h3.4z" />
                </svg>
              </a>

              <a
                href={SOCIAL_LINKS.youtube}
                aria-label="YouTube"
                className="hover:text-yellow-400"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.6 7.2s-.2-1.5-.8-2.1c-.8-.8-1.7-.8-2.1-.9C15.8 4 12 4 12 4s-3.8 0-6.7.2c-.4.1-1.3.1-2.1.9-.6.6-.8 2.1-.8 2.1S2.2 9 2.2 10.8v1.7c0 1.8.2 3.6.2 3.6s.2 1.5.8 2.1c.8.8 1.9.8 2.4.9 1.7.2 6.4.2 6.4.2s3.8 0 6.7-.3c.4 0 1.3-.1 2.1-.9.6-.6.8-2.1.8-2.1s.2-1.8.2-3.6v-1.7c0-1.7-.2-3.5-.2-3.5zM10.1 14.6V8.4l5.8 3.1-5.8 3.1z" />
                </svg>
              </a>

              <a
                href={SOCIAL_LINKS.discord}
                aria-label="Discord"
                className="hover:text-yellow-400"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.5 5.2A16.3 16.3 0 0 0 15.4 4l-.2.4c1.5.4 2.2 1 2.2 1s-1.4-.8-4.1-1c-2.7-.2-4.8.6-4.8.6s.8-.7 2.4-1L10.7 4a16.5 16.5 0 0 0-4.1 1.2C4 9.1 3.3 13 3.5 16.8A16.7 16.7 0 0 0 8.6 19l.6-.9c-1.1-.4-1.7-1-1.7-1s.2.1.5.3c2 .9 4.1 1.1 6 1 1.5-.1 3-.4 4.3-1 .2-.1.4-.2.4-.2s-.6.7-1.8 1.1l.6.9a16.5 16.5 0 0 0 5.1-2.2c.3-4.4-.7-8.2-3.1-11.8zM9.3 14.5c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6zm5.4 0c-.8 0-1.5-.7-1.5-1.6s.7-1.6 1.5-1.6 1.5.7 1.5 1.6-.7 1.6-1.5 1.6z" />
                </svg>
              </a>

              <a href={SOCIAL_LINKS.x} aria-label="X" className="hover:text-yellow-400">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.9 3H22l-6.8 7.8 8 10.2h-6.3l-4.9-6.3L6.4 21H3.3l7.3-8.4L3 3h6.4l4.4 5.7L18.9 3zm-1.1 16.2h1.7L8.5 4.7H6.7l11.1 14.5z" />
                </svg>
              </a>

              <a href={SOCIAL_LINKS.email} aria-label="Email" className="hover:text-yellow-400">
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