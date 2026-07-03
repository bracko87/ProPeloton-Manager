/**
 * HowToPlay.tsx
 * Public gameplay guide for ProPeloton Manager.
 */

import React from 'react'
import { Link } from 'react-router'

const steps = [
  {
    title: '1. Create your club',
    text:
      'Start by creating your cycling team identity. Your club becomes the center of your season: riders, finances, race calendar, sponsors, transfers, equipment, and rankings all connect back to your team.',
  },
  {
    title: '2. Understand your squad',
    text:
      'Review your riders before making big decisions. A strong team needs different rider types such as sprinters, climbers, time-trial riders, helpers, rouleurs, and leaders. Overall rating is useful, but exact skills and rider roles matter more in many races.',
  },
  {
    title: '3. Plan training carefully',
    text:
      'Training improves riders over time, but too much intensity can create fatigue. A tired team may perform worse even if the riders look strong on paper. Good managers balance development, recovery, morale, and race goals.',
  },
  {
    title: '4. Apply for suitable races',
    text:
      'The race calendar includes different categories, countries, routes, and stage types. Choose races that fit your squad. A small or young team should not overload riders with too many events.',
  },
  {
    title: '5. Prepare race plans',
    text:
      'Accepted entry is not enough. Before a race, managers prepare riders, staff, team cars, equipment, supplies, and tactical plans. Stage races also need stage-by-stage planning.',
  },
  {
    title: '6. Manage finances',
    text:
      'Your club has income and expenses. Salaries, staff, equipment, infrastructure, training camps, sponsors, taxes, travel, and race operations all affect your balance. Financial discipline is part of long-term success.',
  },
]

const systems = [
  'Rider development and fatigue',
  'Race calendar and race applications',
  'Stage plans and team tactics',
  'Sponsors and objectives',
  'Transfers and free agents',
  'Training and training camps',
  'Equipment and race supplies',
  'Infrastructure and staff capacity',
  'Team ranking and statistics',
  'Finance, tax, salaries, and operations',
]

export default function HowToPlayPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="bg-slate-950 px-6 py-14 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-300">
            How to Play
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            Manage the team, master the season.
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">
            ProPeloton Manager is about making connected decisions. Every race,
            transfer, training choice, sponsor objective, and financial move can affect
            the future of your club.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-5 md:grid-cols-2">
          {steps.map(step => (
            <article
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-bold">{step.title}</h2>
              <p className="mt-3 leading-relaxed text-slate-700">{step.text}</p>
            </article>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">Main game systems</h2>

          <p className="mt-4 leading-relaxed text-slate-700">
            The game combines sporting and management systems. Winning races is only one
            part of the challenge. A successful manager also protects the budget, builds
            the future squad, improves staff and facilities, and keeps riders ready for
            important events.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {systems.map(system => (
              <div
                key={system}
                className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-slate-800"
              >
                {system}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
          <h2 className="text-2xl font-bold">Game time and deadlines</h2>

          <p className="mt-4 leading-relaxed text-slate-200">
            ProPeloton Manager uses in-game time for race deadlines, training camps,
            transfers, finance periods, and season flow. Managers should always check
            the displayed game time and prepare before the final deadline. Missing a
            deadline can leave a team badly prepared for an important race.
          </p>

          <Link
            to="/about"
            className="mt-5 inline-flex rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
          >
            Read more about the game
          </Link>
        </section>
      </section>
    </main>
  )
}