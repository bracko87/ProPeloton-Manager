/**
 * Home.tsx
 * Landing page for ProPeloton Manager — cinematic, conversion-focused.
 */

import React from 'react'
import { Link } from 'react-router'
import StatCard from '../components/ui/StatCard'

/**
 * HomePage
 * Landing page with hero, feature sections, live stats placeholders and CTA.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <header className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 w-10 h-10 rounded-md flex items-center justify-center text-black font-bold">P</div>
          <div className="text-xl font-semibold">ProPeloton Manager</div>
        </div>
        <nav className="flex items-center gap-4">
          <Link to="/login" className="text-white/80 hover:text-white">Sign In</Link>
          <Link to="/register" className="bg-yellow-400 text-black px-4 py-2 rounded-md font-semibold">Start Playing</Link>
        </nav>
      </header>

      <section className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-12 gap-8">
        <div className="col-span-7">
          <h1 className="text-5xl font-extrabold leading-tight">
            Build an elite cycling club. Manage riders. Win the world.
          </h1>
          <p className="mt-6 text-lg text-yellow-100/80 max-w-xl">
            ProPeloton Manager is a multiplayer cycling management simulation — craft squads, negotiate transfers, plan race seasons and compete against live managers.
          </p>

          <div className="mt-8 flex items-center gap-4">
            <Link to="/register" className="bg-yellow-400 text-black px-6 py-3 rounded-md font-semibold shadow hover:shadow-lg">
              Start Playing
            </Link>
            <Link to="/login" className="px-6 py-3 rounded-md border border-white/20 text-white/90 hover:bg-white/5">
              Sign In
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-4 gap-4">
            <StatCard label="Active Managers" value="12,423" />
            <StatCard label="Total Teams" value="3,128" />
            <StatCard label="Total Tours" value="248" />
            <StatCard label="Total Stages" value="5,143" />
          </div>

          <div className="mt-12 bg-white/5 rounded-lg p-6">
            <h3 className="text-xl font-semibold">Game World Time</h3>
            <p className="mt-2 text-sm text-white/70">
              ProPeloton uses its own in-game time system. 1 real hour = 2 in-game hours. Seasons and months are independent of real-world years.
            </p>
            <div className="mt-4 inline-block bg-white/10 px-4 py-2 rounded">
              <strong>Example:</strong> Season 1 · March 14 · 18:00
            </div>
          </div>
        </div>

        <div className="col-span-5">
          <div className="rounded-xl overflow-hidden shadow-2xl">
            <img src="https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/ae2e0f17-3a21-4dd5-a234-f1f66abff6e6.jpg" alt="hero" className="object-cover w-full h-96" />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="bg-white/5 p-4 rounded-md">
              <h4 className="font-semibold">Club Creation</h4>
              <p className="text-sm text-white/70 mt-2">Create your club, design badge, pick colors and build identity.</p>
            </div>

            <div className="bg-white/5 p-4 rounded-md">
              <h4 className="font-semibold">Team Management</h4>
              <p className="text-sm text-white/70 mt-2">Select squad, craft tactics and manage fitness.</p>
            </div>

            <div className="bg-white/5 p-4 rounded-md">
              <h4 className="font-semibold">Transfers</h4>
              <p className="text-sm text-white/70 mt-2">Negotiate contracts and scout rising stars.</p>
            </div>

            <div className="bg-white/5 p-4 rounded-md">
              <h4 className="font-semibold">Race Calendar</h4>
              <p className="text-sm text-white/70 mt-2">Plan tour participation and peak at the right time.</p>
            </div>
          </div>

          <div className="mt-6 text-sm text-white/70">
            <p><strong>Multiplayer Competition:</strong> Face other managers in season-based tournaments and long-term rankings.</p>
          </div>
        </div>
      </section>

      <footer className="mt-12 border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">ProPeloton Manager</div>
            <div className="text-sm text-white/70 mt-2">A premium multiplayer cycling management experience.</div>
          </div>
          <div className="text-sm text-white/60">
            © ProPeloton • Season-based world • No local saves — backend-ready
          </div>
        </div>
      </footer>
    </div>
  )
}
