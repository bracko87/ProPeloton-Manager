/**
 * Help.tsx
 * Help and FAQ landing page.
 */

import React from 'react'

/**
 * HelpPage
 * Presents onboarding, game basics, and support information.
 */
export default function HelpPage(): JSX.Element {
  const firstSteps = [
    'Create your club first, then complete Customize Team so your jersey, logo, and identity are ready for race day.',
    'Review your Squad and Developing Team pages to understand current talent, potential, and where your roster is thin.',
    'Set up your first week in Training and check Team Schedule so workloads match your upcoming races.',
    'Open Finance and Infrastructure early to avoid cash-flow issues while your club is still growing.'
  ]

  const gameplayBasics = [
    {
      title: 'Build a balanced roster',
      description:
        'Use Squad, Transfers, and rider profiles to combine climbers, sprinters, and all-rounders that fit your long-term race plan.'
    },
    {
      title: 'Develop riders over time',
      description:
        'Training, morale, fatigue, and developing riders all influence progression. Plan for today without sacrificing next season.'
    },
    {
      title: 'Run your club like a business',
      description:
        'Sponsors, taxes, operations, infrastructure, and equipment affect performance and sustainability—not just race results.'
    }
  ]

  const faqs = [
    {
      question: 'What should I do right after creating my club?',
      answer:
        'Start with Customize Team, then review Overview, Squad, and Finance. Those pages give you the fastest snapshot of identity, rider depth, and budget health.'
    },
    {
      question: 'How do I improve my riders faster?',
      answer:
        'Use Training consistently, monitor fatigue, and rotate riders based on Team Schedule. Pushing everyone at max intensity every day usually hurts long-term development.'
    },
    {
      question: 'Where do I sign or sell riders?',
      answer:
        'Go to Transfers. You can browse available riders, track history, and handle active negotiations from the transfer workflow pages.'
    },
    {
      question: 'Why is my team underperforming even with strong riders?',
      answer:
        'Check morale, fatigue, equipment, infrastructure, and staff support. Results depend on the whole club system, not only individual rider ratings.'
    },
    {
      question: 'Where can I compare riders before making a transfer decision?',
      answer:
        'Use Compare Riders and open rider profile pages to inspect strengths, stats, and role fit side by side before committing budget.'
    },
    {
      question: 'How can I invite friends to join the game?',
      answer:
        'Open Invite Friends from the dashboard and share your referral link. Referral captures route new users into registration with your code.'
    },
    {
      question: 'What is the best way to report a bug or wrong data?',
      answer:
        'Use the in-app bug report option when available, then add details in Contact Us or Discord with steps to reproduce and screenshots.'
    }
  ]

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-200">Welcome</p>
        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">ProPeloton Help Center</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-100 md:text-base">
          Everything you need to get started: onboarding, core gameplay concepts, and support
          links for your first races.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100"
            href="/dashboard/manual"
          >
            Open Manual
          </a>
          <a
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10"
            href="https://discord.gg/9W6rSSjm"
            target="_blank"
            rel="noreferrer"
          >
            Join Discord
          </a>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">First steps</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            {firstSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">
            Quick links
          </h3>
          <div className="mt-3 space-y-2 text-sm">
            <a
              className="block rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-100"
              href="/dashboard/overview"
            >
              Club Overview
            </a>
            <a
              className="block rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-100"
              href="/dashboard/transfers"
            >
              Transfers
            </a>
            <a
              className="block rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-100"
              href="/dashboard/invite-friends"
            >
              Invite Friends
            </a>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Gameplay basics</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {gameplayBasics.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Frequently asked questions</h2>
        <div className="mt-4 space-y-4">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="border-b border-slate-100 pb-4 last:border-0 last:pb-0"
            >
              <h3 className="font-medium text-slate-900">{faq.question}</h3>
              <p className="mt-1 text-sm text-slate-600">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}