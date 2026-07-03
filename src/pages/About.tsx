/**
 * About.tsx
 * Public About page for ProPeloton Manager.
 */

import React from 'react'
import { Link } from 'react-router'

export default function AboutPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-300">
            About ProPeloton Manager
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Build your cycling legacy.
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">
            ProPeloton Manager is an online cycling management game where players create
            and develop a cycling team, prepare race calendars, manage riders, handle
            finances, negotiate transfers, follow rankings, and compete across a long
            season-based cycling world.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/how-to-play"
              className="rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
            >
              Learn How to Play
            </Link>

            <Link
              to="/contact"
              className="rounded-lg border border-white/30 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl space-y-8 px-6 py-12">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">What the game is about</h2>

          <p className="mt-4 leading-relaxed text-slate-700">
            ProPeloton Manager is designed for players who enjoy cycling, strategy,
            long-term planning, and multiplayer competition. Instead of controlling a
            rider directly, you act as the manager of a cycling club. Your job is to
            build a balanced squad, prepare races, protect finances, develop riders,
            handle support staff, improve facilities, and make decisions that affect
            the full season.
          </p>

          <p className="mt-4 leading-relaxed text-slate-700">
            The game world includes race calendars, team rankings, race preparation,
            stage plans, equipment, training, staff, sponsors, transfers, financial
            management, and developing-team systems. Every club has to balance ambition
            with long-term stability.
          </p>
        </article>

        <section className="grid gap-5 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold">Team management</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Build your squad with sprinters, climbers, time-trial riders, helpers,
              leaders, and young riders. Contracts, morale, fatigue, potential, and
              development all matter.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold">Race preparation</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Apply for races, select riders, assign staff and assets, choose equipment,
              prepare supplies, and create stage plans before deadlines.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold">Season progress</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Teams earn points, climb rankings, manage sponsors, pay salaries, and
              plan for promotion, relegation, and long-term club growth.
            </p>
          </article>
        </section>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">Development status</h2>

          <p className="mt-4 leading-relaxed text-slate-700">
            ProPeloton Manager is actively being built and improved. Game systems,
            balancing, race simulation, user interface, notifications, and economy
            values may continue to change as the game develops. The goal is to create
            a deep cycling manager experience that is fair, understandable, and
            sustainable for players over many seasons.
          </p>
        </article>
      </section>
    </main>
  )
}