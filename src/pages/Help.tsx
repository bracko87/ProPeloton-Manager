/**
 * Help.tsx
 * Help and FAQ landing page.
 */

import React, { useState } from 'react'
import { Link } from 'react-router'

/**
 * HelpPage
 * Presents onboarding, game basics, manual sections, and support information.
 */
export default function HelpPage(): JSX.Element {
  const [openFaqKey, setOpenFaqKey] = useState<string | null>('new-team-first')

  const firstSteps = [
    {
      title: '1. Start from Overview',
      description:
        'The Overview page is your main dashboard. It shows alerts, finances, races, team condition, news, and season progress.',
      path: '/dashboard/overview',
      action: 'Open Overview',
    },
    {
      title: '2. Check your Squad',
      description:
        'Review your riders, developing team, contracts, rider roles, condition, potential, and staff access.',
      path: '/dashboard/squad',
      action: 'Open Squad',
    },
    {
      title: '3. Plan Training',
      description:
        'Set regular training, manage intensity, give riders rest when needed, and use training camps carefully.',
      path: '/dashboard/training',
      action: 'Open Training',
    },
    {
      title: '4. Prepare for races',
      description:
        'Use Calendar and Race Preparation to apply for races, submit race plans, select riders, and create stage tactics.',
      path: '/dashboard/race-preparation',
      action: 'Open Race Preparation',
    },
  ]

  const manualSections = [
    {
      title: 'Overview',
      description:
        'Your main control page. Use it to understand what needs attention, check today’s races, follow team health, finances, sponsors, news, and season progress.',
      path: '/dashboard/overview',
    },
    {
      title: 'Squad',
      description:
        'Manage your riders, view rider profiles, compare skills, check contracts, understand your Developing Team, and access staff information.',
      path: '/dashboard/squad',
    },
    {
      title: 'Training',
      description:
        'Control regular rider training, team defaults, individual focus areas, training intensity, rest days, and training camps.',
      path: '/dashboard/training',
    },
    {
      title: 'Equipment',
      description:
        'Manage race setups, inventory, market purchases, and race supplies. Better equipment and supplies can improve performance and protect riders in difficult conditions.',
      path: '/dashboard/equipment',
    },
    {
      title: 'Infrastructure',
      description:
        'Build and upgrade facilities such as Clubhouse, Training Center, Medical Center, Mechanics Workshop, Youth Academy, and Scouting Office. Also manage team vehicles and support assets.',
      path: '/dashboard/infrastructure',
    },
    {
      title: 'Calendar',
      description:
        'Use the Season Calendar for daily activities and the Race Calendar for race applications, race categories, sponsor goals, and race profile access.',
      path: '/dashboard/calendar',
    },
    {
      title: 'Race Preparation',
      description:
        'Prepare accepted races. Select riders, staff, assets, equipment, supplies, and stage tactics. This is one of the most important pages during the season.',
      path: '/dashboard/race-preparation',
    },
    {
      title: 'Team Ranking',
      description:
        'Follow WorldTeam, ProTeam, Continental, and Amateur standings. Rankings decide promotion, relegation, and long-term team progress.',
      path: '/dashboard/team-ranking',
    },
    {
      title: 'Statistics',
      description:
        'Compare teams and riders by international points, wins, podiums, jerseys, history, and current-season performance.',
      path: '/dashboard/statistics',
    },
    {
      title: 'Transfers',
      description:
        'Scout riders, make transfer offers, sign free agents, negotiate contracts, and hire staff when your club limits allow it.',
      path: '/dashboard/transfers',
    },
    {
      title: 'Finance',
      description:
        'Track balance, income, expenses, transactions, taxes, sponsors, team policies, and operational costs.',
      path: '/dashboard/finance',
    },
    {
      title: 'Menu, Notifications and Coins',
      description:
        'Use the top-right menu for profile settings, help, preferences, Discord, Contact Us, Coin Packages, and Invite Friends. Notifications show important deadlines and game actions.',
      path: '/dashboard/overview',
    },
  ]

  const gameplayBasics = [
    {
      title: 'Build a balanced roster',
      description:
        'A strong team needs different rider types. Sprinters, climbers, time-trial riders, helpers, rouleurs, and leaders all matter depending on the race calendar.',
    },
    {
      title: 'Develop riders over time',
      description:
        'Training, morale, fatigue, race experience, recovery, and staff support all influence rider progression. Short-term results should not destroy long-term development.',
    },
    {
      title: 'Race preparation matters',
      description:
        'Choosing the right riders is only one part of success. Staff, vehicles, equipment, supplies, roles, tactics, and weather conditions can all affect race performance.',
    },
    {
      title: 'Run your club like a business',
      description:
        'Sponsors, taxes, salaries, infrastructure, training camps, transfers, equipment, and team policies all affect your financial future.',
    },
    {
      title: 'Watch deadlines carefully',
      description:
        'Race plans, rider submissions, and stage plans have deadlines. Missing them can leave your team badly prepared or unable to race properly.',
    },
    {
      title: 'Use rankings as your long-term target',
      description:
        'International points decide your position. Promotion and relegation make every season important, especially for ProTeam, Continental, and Amateur clubs.',
    },
  ]

  const importantRules = [
    {
      title: 'Game time',
      description:
        'One in-game day equals 12 hours in real-life time. This means two in-game days equal one real-life day. Use this when checking deadlines, race preparation windows, and stage plan locks.',
    },
    {
      title: 'Tutorial is one-time onboarding',
      description:
        'New teams are offered the tutorial once from the Overview page. If the user completes it or refuses it, it should not appear again automatically.',
    },
    {
      title: 'Developing Team',
      description:
        'The Developing Team is used for young or secondary riders. Riders can only move between the First Team and Developing Team during movement windows.',
    },
    {
      title: 'Sponsors and naming rights',
      description:
        'Sponsor contracts can be standard contracts or naming-rights contracts. Naming-rights contracts usually pay more, but the sponsor name becomes part of your team name during the season. Your original team name returns at the beginning of the next season.',
    },
  ]

  const faqs = [
    {
      key: 'new-team-first',
      question: 'What should I do right after creating my club?',
      answer:
        'Start with the Overview page, then check Squad, Training, Finance, and Calendar. Overview tells you what needs attention, Squad shows your rider strength, Training helps you plan development, Finance protects your budget, and Calendar shows upcoming races.',
    },
    {
      key: 'tutorial-once',
      question: 'Will the tutorial appear every time I log in?',
      answer:
        'No. The tutorial is designed as one-time onboarding for new teams. If you complete the tutorial or refuse it on the first Overview prompt, it should not be offered again automatically.',
    },
    {
      key: 'game-time',
      question: 'How does game time work?',
      answer:
        'One in-game day equals 12 real-life hours. Two in-game days equal one real-life day. This is important for race plan windows, rider submission deadlines, stage plan deadlines, training camps, and other time-based game systems.',
    },
    {
      key: 'race-preparation',
      question: 'What is Race Preparation used for?',
      answer:
        'Race Preparation is where accepted races are prepared. You select riders, staff, assets, equipment, supplies, and stage tactics. For stage races, you also prepare tactics for each stage after the race plan has been submitted.',
    },
    {
      key: 'accepted-races',
      question: 'Why do I see different statuses in Accepted Races?',
      answer:
        'Accepted Races can show statuses such as Race Plan Open, Rider Deadline Reached, Stage Plans Open, Race Active, Race Finished, or All Set. These statuses tell you what action is currently needed.',
    },
    {
      key: 'training',
      question: 'How do I improve my riders faster?',
      answer:
        'Use Training consistently, choose useful focus areas, monitor fatigue, and use training camps when they make sense. Training too hard all the time can hurt freshness and race performance.',
    },
    {
      key: 'fatigue',
      question: 'Why is my team underperforming even with strong riders?',
      answer:
        'Strong skills are not enough. Fatigue, morale, illness, injuries, equipment, race supplies, staff, weather, tactics, and rider roles can all affect performance.',
    },
    {
      key: 'equipment',
      question: 'Why does equipment matter?',
      answer:
        'Equipment can improve performance through race setups and item bonuses. Race supplies can also protect riders from difficult weather or demanding race conditions.',
    },
    {
      key: 'infrastructure',
      question: 'Why should I upgrade infrastructure?',
      answer:
        'Facilities improve your club over time. Some upgrades can unlock or increase staff limits, improve training, support recovery, improve scouting, or strengthen operational capacity.',
    },
    {
      key: 'team-ranking',
      question: 'How do team rankings work?',
      answer:
        'Teams earn international points from race results. Those points decide standings inside WorldTeam, ProTeam, Continental, and Amateur competitions. Final rankings can lead to promotion or relegation.',
    },
    {
      key: 'statistics',
      question: 'What is the Statistics page for?',
      answer:
        'Statistics helps you compare teams and riders. You can follow current-season points, historical results, rider rankings, podiums, jerseys, and dominant teams or riders.',
    },
    {
      key: 'transfers',
      question: 'Where do I sign or sell riders?',
      answer:
        'Use the Transfers page. Transfer-listed riders require offers to the selling team, while free agents can go directly into contract negotiation. Scouting helps you understand riders better before spending money.',
    },
    {
      key: 'staff',
      question: 'Why can I not hire more staff?',
      answer:
        'Your club has staff limits. If you already reached the maximum for a staff role, you need to increase the limit, usually through infrastructure upgrades, before hiring more staff in that role.',
    },
    {
      key: 'sponsors',
      question: 'What is the difference between standard sponsors and naming-rights sponsors?',
      answer:
        'A standard sponsor contract gives your club money without changing your team name. A naming-rights contract usually pays more, but the sponsor name becomes part of your team name during the season. Your original team name returns at the beginning of the next season.',
    },
    {
      key: 'tax',
      question: 'Why is there a Tax tab in Finance?',
      answer:
        'Transactions can create tax obligations. A tax audit happens once per month, and the Finance page helps you see what has been calculated, paid, or still needs to be paid.',
    },
    {
      key: 'coins',
      question: 'What are coins used for?',
      answer:
        'Coins are shown in the top-right header. Make sure your balance is available when needed. Coin packages can be opened from the Menu.',
    },
    {
      key: 'notifications',
      question: 'What are notifications for?',
      answer:
        'Notifications warn you about important deadlines and events such as race preparation, sponsor updates, finances, transfers, and other game actions that need attention.',
    },
    {
      key: 'invite',
      question: 'How can I invite friends to join the game?',
      answer:
        'Open Invite Friends from the dashboard menu and share your referral link. New users can register through your referral route.',
    },
    {
      key: 'bug-report',
      question: 'What is the best way to report a bug or wrong data?',
      answer:
        'Use Contact Us or Discord and include clear steps to reproduce the problem. Screenshots, race names, rider names, team names, and the exact page where the problem happened are very helpful.',
    },
  ]

  function toggleFaq(key: string) {
    setOpenFaqKey((current) => (current === key ? null : key))
  }

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-200">
          Welcome
        </p>

        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
          ProPeloton Help Center
        </h1>

        <p className="mt-3 max-w-4xl text-sm text-slate-100 md:text-base">
          Learn how to manage your team, prepare races, train riders, handle
          transfers, understand finances, follow rankings, and get support when
          something is unclear.
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
            to="/dashboard/manual"
          >
            Open Manual
          </Link>

          <Link
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            to="/dashboard/contact-us"
          >
            Contact Support
          </Link>

          <a
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            href="https://discord.gg/9W6rSSjm"
            target="_blank"
            rel="noreferrer"
          >
            Join Discord
          </a>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-[1.4fr_0.9fr]">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            First steps for new managers
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {firstSteps.map((step) => (
              <article
                key={step.title}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <h3 className="text-sm font-semibold text-slate-900">
                  {step.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {step.description}
                </p>

                <Link
                  to={step.path}
                  className="mt-3 inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                >
                  {step.action}
                </Link>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-yellow-50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-800">
            Quick links
          </h3>

          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1">
            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/overview"
            >
              Club Overview
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/race-preparation"
            >
              Race Preparation
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/transfers"
            >
              Transfers
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/finance"
            >
              Finance
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/invite-friends"
            >
              Invite Friends
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/contact-us"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {importantRules.map((rule) => (
          <article
            key={rule.title}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-base font-semibold text-slate-900">
              {rule.title}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {rule.description}
            </p>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Gameplay basics
        </h2>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {gameplayBasics.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h3 className="text-base font-semibold text-slate-900">
                {item.title}
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Manual sections
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Use these sections as a quick manual for the most important pages
              in the game.
            </p>
          </div>

          <Link
            to="/dashboard/manual"
            className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 md:self-auto"
          >
            Open full manual
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {manualSections.map((section) => (
            <article
              key={section.title}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <h3 className="text-base font-semibold text-slate-900">
                {section.title}
              </h3>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {section.description}
              </p>

              <Link
                to={section.path}
                className="mt-3 inline-flex text-sm font-medium text-yellow-700 underline decoration-yellow-500 underline-offset-4 hover:text-yellow-800"
              >
                Open page
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Frequently asked questions
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          Open a question to see the answer. These answers cover the most common
          onboarding, race, finance, and support questions.
        </p>

        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {faqs.map((faq) => {
            const isOpen = openFaqKey === faq.key

            return (
              <div key={faq.key} className="bg-white first:rounded-t-xl last:rounded-b-xl">
                <button
                  type="button"
                  onClick={() => toggleFaq(faq.key)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-yellow-400"
                  aria-expanded={isOpen}
                >
                  <span className="font-medium text-slate-900">
                    {faq.question}
                  </span>

                  <span className="shrink-0 rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-500">
                    {isOpen ? 'Close' : 'Open'}
                  </span>
                </button>

                {isOpen ? (
                  <div className="px-4 pb-4 text-sm leading-relaxed text-slate-600">
                    {faq.answer}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
        <h2 className="text-lg font-semibold">Still need help?</h2>

        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-200">
          If something looks wrong, please include the page name, team name,
          rider name, race name, screenshots, and the steps needed to reproduce
          the issue. This helps us find and fix problems faster.
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            to="/dashboard/contact-us"
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Contact Us
          </Link>

          <a
            href="https://discord.gg/9W6rSSjm"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            Ask on Discord
          </a>
        </div>
      </section>
    </div>
  )
}