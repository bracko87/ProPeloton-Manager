/**
 * Hero.tsx
 * Full-width hero section with no outer gap.
 */

import React from 'react'
import { Link } from 'react-router'
import { Award } from 'lucide-react'

const Hero: React.FC = () => {
  return (
    <section className="relative w-full overflow-hidden border-b border-white/15 bg-[#0a1730] py-20">
      {/* faint background image inside hero only */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <img
          src="https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/ea527ef7-6896-413d-9d69-df332b440fd0.jpg"
          alt=""
          className="w-full h-full object-cover"
          style={{
            opacity: 0.1,
            WebkitMaskImage:
              'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0) 100%)',
            maskImage:
              'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1730]/20 via-[#0a1730]/50 to-[#0a1730]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 grid grid-cols-12 gap-8 items-center">
        <div className="col-span-12 lg:col-span-7">
          <div className="text-yellow-400 flex items-center gap-3 mb-4">
            <Award size={18} />
            <span className="font-medium">Seasonal Multiplayer</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight text-white">
            Build an elite cycling club.
            <br />
            Manage riders. Win the world.
          </h1>

          <p className="mt-6 text-lg text-yellow-100/80 max-w-xl">
            ProPeloton Manager is a multiplayer cycling management simulation — craft squads,
            negotiate transfers, plan race seasons and compete against live managers across
            global tours.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/register"
              className="bg-yellow-400 text-black px-6 py-3 rounded-md font-semibold shadow hover:shadow-lg"
            >
              Start Playing
            </Link>

            <Link
              to="/login"
              className="px-6 py-3 rounded-md border border-white/20 text-white/90 hover:bg-white/5"
            >
              Sign In
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/5 border border-white/5 rounded-md p-4">
              <div className="text-xs text-white/70">Game Time</div>
              <div className="mt-1 text-sm text-white/90">Season 1 · March 14 · 18:00</div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-md p-4">
              <div className="text-xs text-white/70">Multiplayer</div>
              <div className="mt-1 text-sm text-white/90">Live manager leagues</div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-md p-4">
              <div className="text-xs text-white/70">Progression</div>
              <div className="mt-1 text-sm text-white/90">
                Tournaments, rankings & rewards
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <div className="rounded-xl overflow-hidden shadow-2xl">
            <img
     src="https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2010_24_31%20PM.png"
              alt="hero"
              className="object-cover w-full h-80 sm:h-96"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero