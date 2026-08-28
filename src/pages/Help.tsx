/**
 * Help.tsx
 * Help and FAQ landing page.
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

const DISCORD_INVITE_URL = 'https://discord.gg/BpgqTXsjAW'

/**
 * HelpPage
 * Presents onboarding, game basics, manual sections, and support information.
 */
export default function HelpPage(): JSX.Element {
  const { t } = useTranslation('help')
  const [openFaqKey, setOpenFaqKey] = useState<string | null>('new-team-first')

  const firstSteps = [
    {
      title: t('first.s1Title'),
      description:
        t('first.s1Text'),
      path: '/dashboard/overview',
      action: t('first.s1Action'),
    },
    {
      title: t('first.s2Title'),
      description:
        t('first.s2Text'),
      path: '/dashboard/squad',
      action: t('first.s2Action'),
    },
    {
      title: t('first.s3Title'),
      description:
        t('first.s3Text'),
      path: '/dashboard/training',
      action: t('first.s3Action'),
    },
    {
      title: t('first.s4Title'),
      description:
        t('first.s4Text'),
      path: '/dashboard/race-preparation',
      action: t('first.s4Action'),
    },
  ]

  const manualSections = [
    {
      title: t('manual.overviewTitle'),
      description:
        t('manual.overviewText'),
      path: '/dashboard/overview',
    },
    {
      title: t('manual.squadTitle'),
      description:
        t('manual.squadText'),
      path: '/dashboard/squad',
    },
    {
      title: t('manual.trainingTitle'),
      description:
        t('manual.trainingText'),
      path: '/dashboard/training',
    },
    {
      title: t('manual.equipmentTitle'),
      description:
        t('manual.equipmentText'),
      path: '/dashboard/equipment',
    },
    {
      title: t('manual.infrastructureTitle'),
      description:
        t('manual.infrastructureText'),
      path: '/dashboard/infrastructure',
    },
    {
      title: t('manual.calendarTitle'),
      description:
        t('manual.calendarText'),
      path: '/dashboard/calendar',
    },
    {
      title: t('quick.racePreparation'),
      description:
        t('manual.raceText'),
      path: '/dashboard/race-preparation',
    },
    {
      title: t('manual.rankingTitle'),
      description:
        t('manual.rankingText'),
      path: '/dashboard/team-ranking',
    },
    {
      title: t('manual.statisticsTitle'),
      description:
        t('manual.statisticsText'),
      path: '/dashboard/statistics',
    },
    {
      title: t('quick.transfers'),
      description:
        t('manual.transfersText'),
      path: '/dashboard/transfers',
    },
    {
      title: t('quick.finance'),
      description:
        t('manual.financeText'),
      path: '/dashboard/finance',
    },
    {
      title: t('manual.menuTitle'),
      description:
        t('manual.menuText'),
      path: '/dashboard/overview',
    },
  ]

  const gameplayBasics = [
    {
      title: t('basics.b1Title'),
      description:
        t('basics.b1Text'),
    },
    {
      title: t('basics.b2Title'),
      description:
        t('basics.b2Text'),
    },
    {
      title: t('basics.b3Title'),
      description:
        t('basics.b3Text'),
    },
    {
      title: t('basics.b4Title'),
      description:
        t('basics.b4Text'),
    },
    {
      title: t('basics.b5Title'),
      description:
        t('basics.b5Text'),
    },
    {
      title: t('basics.b6Title'),
      description:
        t('basics.b6Text'),
    },
  ]

  const importantRules = [
    {
      title: t('rules.gameTimeTitle'),
      description:
        t('rules.gameTimeText'),
    },
    {
      title: t('rules.tutorialTitle'),
      description:
        t('rules.tutorialText'),
    },
    {
      title: t('rules.developingTitle'),
      description:
        t('rules.developingText'),
    },
    {
      title: t('rules.sponsorsTitle'),
      description:
        t('rules.sponsorsText'),
    },
  ]

  const faqs = [
    {
      key: 'new-team-first',
      question: t('faq.q1'),
      answer:
        t('faq.a1'),
    },
    {
      key: 'tutorial-once',
      question: t('faq.q2'),
      answer:
        t('faq.a2'),
    },
    {
      key: 'game-time',
      question: t('faq.q3'),
      answer:
        t('faq.a3'),
    },
    {
      key: 'race-preparation',
      question: t('faq.q4'),
      answer:
        t('faq.a4'),
    },
    {
      key: 'accepted-races',
      question: t('faq.q5'),
      answer:
        t('faq.a5'),
    },
    {
      key: 'training',
      question: t('faq.q6'),
      answer:
        t('faq.a6'),
    },
    {
      key: 'fatigue',
      question: t('faq.q7'),
      answer:
        t('faq.a7'),
    },
    {
      key: 'equipment',
      question: t('faq.q8'),
      answer:
        t('faq.a8'),
    },
    {
      key: 'infrastructure',
      question: t('faq.q9'),
      answer:
        t('faq.a9'),
    },
    {
      key: 'team-ranking',
      question: t('faq.q10'),
      answer:
        t('faq.a10'),
    },
    {
      key: 'statistics',
      question: t('faq.q11'),
      answer:
        t('faq.a11'),
    },
    {
      key: 'transfers',
      question: t('faq.q12'),
      answer:
        t('faq.a12'),
    },
    {
      key: 'staff',
      question: t('faq.q13'),
      answer:
        t('faq.a13'),
    },
    {
      key: 'sponsors',
      question: t('faq.q14'),
      answer:
        t('faq.a14'),
    },
    {
      key: 'tax',
      question: t('faq.q15'),
      answer:
        t('faq.a15'),
    },
    {
      key: 'coins',
      question: t('faq.q16'),
      answer:
        t('faq.a16'),
    },
    {
      key: 'notifications',
      question: t('faq.q17'),
      answer:
        t('faq.a17'),
    },
    {
      key: 'invite',
      question: t('faq.q18'),
      answer:
        t('faq.a18'),
    },
    {
      key: 'bug-report',
      question: t('faq.q19'),
      answer:
        t('faq.a19'),
    },
  ]

  function toggleFaq(key: string) {
    setOpenFaqKey((current) => (current === key ? null : key))
  }

  return (
    <div className="w-full space-y-6">
      <section className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-200">
          {t('hero.welcome')}
        </p>

        <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
          {t('hero.title')}
        </h1>

        <p className="mt-3 max-w-4xl text-sm text-slate-100 md:text-base">
          {t('hero.description')}
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
            to="/dashboard/manual"
          >
            {t('hero.manual')}
          </Link>

          <Link
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            to="/dashboard/contact-us"
          >
            {t('hero.contact')}
          </Link>

          <a
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noreferrer"
          >
            {t('hero.discord')}
          </a>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:grid-cols-[1.4fr_0.9fr]">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t('first.title')}
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
            {t('quick.title')}
          </h3>

          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1">
            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/overview"
            >
              {t('quick.overview')}
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/race-preparation"
            >
              {t('quick.racePreparation')}
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/transfers"
            >
              {t('quick.transfers')}
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/finance"
            >
              {t('quick.finance')}
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/invite-friends"
            >
              {t('quick.invite')}
            </Link>

            <Link
              className="block rounded-md border border-yellow-200 bg-white px-3 py-2 hover:bg-yellow-100"
              to="/dashboard/contact-us"
            >
              {t('quick.contact')}
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
          {t('basics.title')}
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
              {t('manual.title')}
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              {t('manual.description')}
            </p>
          </div>

          <Link
            to="/dashboard/manual"
            className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-400 md:self-auto"
          >
            {t('manual.full')}
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
                {t('manual.openPage')}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('faq.title')}
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          {t('faq.description')}
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
                    {isOpen ? t('faq.close') : t('faq.open')}
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
        <h2 className="text-lg font-semibold">{t('footer.title')}</h2>

        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-200">
          {t('footer.description')}
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            to="/dashboard/contact-us"
            className="rounded-md bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white"
          >
            {t('quick.contact')}
          </Link>

          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/50 px-4 py-2 font-medium text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
          >
            {t('footer.discord')}
          </a>
        </div>
      </section>
    </div>
  )
}