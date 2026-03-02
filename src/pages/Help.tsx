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
    'Complete your rider profile and team branding to stand out in leagues.',
    'Review race formats and score rules before entering your first event.',
    'Invite teammates and assign roles so everyone has a clear responsibility.',
    'Join the community Discord to get announcements, race tips, and patch notes.'
  ]

  const gameplayBasics = [
    {
      title: 'Build your squad',
      description:
        'Create a balanced roster with sprinters, climbers, and all-rounders to adapt to different race terrains.'
    },
    {
      title: 'Plan race strategy',
      description:
        'Use course knowledge and rider strengths to decide when to push, conserve energy, or launch attacks.'
    },
    {
      title: 'Manage resources',
      description:
        'Track stamina, boosts, and substitutions through the season to stay competitive in long campaigns.'
    }
  ]

  const faqs = [
    {
      question: 'How do I create a team?',
      answer:
        'Go to Customize Team, select your identity, then save to unlock league and event access.'
    },
    {
      question: 'How can I invite friends?',
      answer:
        'Open Invite Friends to copy your referral link and send it through chat, social media, or email.'
    },
    {
      question: 'Where can I read the full manual?',
      answer:
        'Open the Manual section from the dashboard menu for advanced mechanics, league rules, and controls.'
    },
    {
      question: 'What should I do if something looks wrong?',
      answer:
        'Report the issue in Discord support with screenshots and a short description of what happened.'
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
            href="https://discord.gg/"
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
              href="/dashboard/manual"
            >
              Game Manual
            </a>
            <a
              className="block rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-100"
              href="/dashboard/news"
            >
              Latest News
            </a>
            <a
              className="block rounded-md border border-slate-200 bg-white px-3 py-2 hover:bg-slate-100"
              href="/dashboard/invite"
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
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {item.description}
              </p>
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