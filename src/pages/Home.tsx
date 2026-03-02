/**
 * Home.tsx
 * Extended landing page composed from small reusable sections.
 *
 * Purpose:
 * - Act as the public marketing/landing page.
 * - After auth email confirmation, detect authenticated users and route them
 *   to the correct next step based on get_my_club_id().
 * - Show lightweight loading/error banners without changing the main layout.
 */

import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import Hero from '../components/home/Hero'
import FeatureCard from '../components/home/FeatureCard'
import ScreenshotGallery from '../components/home/ScreenshotGallery'
import ReviewCard from '../components/home/ReviewCard'
import CTA from '../components/home/CTA'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'

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
      // Auth state still resolving; do not redirect yet.
      return
    }

    if (!user) {
      // Not authenticated: show normal homepage and reset any previous state.
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
          'You are signed in, but we could not load your club status. Please refresh or try again.'
        )
        setCheckingClub(false)
        return
      }

      // Only redirect when RPC succeeds.
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
        <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="https://i.ibb.co/k28T2XbC/5c3417dc-3924-4423-948a-745ae5902ed0.png"
              alt="ProPeloton Manager logo"
              className="h-24 w-auto object-contain shrink-0"
            />
            <div className="text-xl font-semibold">ProPeloton Manager</div>
          </div>

          <nav className="flex items-center gap-4">
            <a href="#/login" className="text-white/80 hover:text-white">
              Sign In
            </a>
            <a
              href="#/register"
              className="bg-yellow-400 text-black px-4 py-2 rounded-md font-semibold"
            >
              Start Playing
            </a>
          </nav>
        </div>
      </header>

      {/* Lightweight loading / error banners for authenticated users */}
      {checkingClub && (
        <div className="bg-blue-950 border-b border-blue-700 text-blue-100 text-sm text-center py-2">
          Preparing your manager account...
        </div>
      )}
      {clubError && (
        <div className="bg-red-900/80 border-b border-red-500 text-red-50 text-sm text-center py-2">
          {clubError}
        </div>
      )}

      <main>
        <Hero />

        <section className="py-12">
          <div className="max-w-7xl mx-auto px-6">
            <h3 className="text-2xl font-semibold">Quick Stats</h3>
            <p className="mt-2 text-sm text-white/70">
              Live snapshot of the ProPeloton community and world.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/5 rounded-md p-4">
                <div className="text-xs text-white/60">Active Managers</div>
                <div className="mt-1 text-2xl font-bold text-white">12,423</div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-md p-4">
                <div className="text-xs text-white/60">Total Teams</div>
                <div className="mt-1 text-2xl font-bold text-white">3,128</div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-md p-4">
                <div className="text-xs text-white/60">Total Tours</div>
                <div className="mt-1 text-2xl font-bold text-white">248</div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-md p-4">
                <div className="text-xs text-white/60">Total Stages</div>
                <div className="mt-1 text-2xl font-bold text-white">5,143</div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12">
          <div className="max-w-7xl mx-auto px-6">
            <h3 className="text-2xl font-semibold">Core Features</h3>
            <p className="mt-2 text-sm text-white/70">
              Everything you need to manage a world-class cycling club.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={
                  <svg
                    className="w-6 h-6"
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
                    className="w-6 h-6"
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
                    className="w-6 h-6"
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
          </div>
        </section>

        <ScreenshotGallery />

        <section className="py-12">
          <div className="max-w-7xl mx-auto px-6">
            <h3 className="text-2xl font-semibold">Player Reviews</h3>
            <p className="mt-2 text-sm text-white/70">
              What early players are saying about ProPeloton Manager.
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              <ReviewCard
                name="A. Thompson"
                title="Competitive Manager"
                rating={5}
                text="Incredible depth and real tactical decisions. The leagues are addictive."
              />

              <ReviewCard
                name="M. Chen"
                title="Long-time Fan"
                rating={4}
                text="Lovely UI and strong progression systems. Transfers could use more transparency."
              />

              <ReviewCard
                name="S. Patel"
                title="Competitive Player"
                rating={5}
                text="Race-day tension is real — perfectly balanced and exciting."
              />
            </div>
          </div>
        </section>

        <section className="relative w-full overflow-hidden border-t border-white/15 bg-[#1a1404] py-20">
          {/* background image overlay */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <img
              src="https://i.ibb.co/QFd0kxb4/Chat-GPT-Image-Mar-1-2026-08-28-06-PM.png"
              alt=""
              className="w-full h-full object-cover"
              style={{
                opacity: 0.2,
                WebkitMaskImage:
                  'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.45) 100%)',
                maskImage:
                  'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 55%, rgba(0,0,0,0.45) 100%)'
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#2a2108]/30 via-[#171105]/75 to-[#081224]/90" />
          </div>

          <div className="relative z-10">
            <CTA />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/15 py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-start justify-between gap-6">
          <div>
            <div className="text-lg font-semibold">ProPeloton Manager</div>
            <div className="text-sm text-white/70 mt-2">
              A premium multiplayer cycling management experience.
            </div>
          </div>

          <div className="text-sm text-white/60">
            © ProPeloton • Season-based world • No local saves — backend-ready
          </div>
        </div>
      </footer>
    </div>
  )
}