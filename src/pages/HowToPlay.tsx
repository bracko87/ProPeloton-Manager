/**
 * HowToPlay.tsx
 * Public gameplay guide for ProPeloton Manager.
 */

import React from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

export default function HowToPlayPage(): JSX.Element {
  const { t } = useTranslation('publicInfo')

  const steps = [1, 2, 3, 4, 5, 6].map(step => ({
    title: t(`how.step${step}Title`),
    text: t(`how.step${step}Text`),
  }))

  const systems = Array.from({ length: 10 }, (_, index) =>
    t(`how.system${index + 1}`)
  )

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="bg-slate-950 px-6 py-14 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-300">
            {t('how.eyebrow')}
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            {t('how.title')}
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">
            {t('how.intro')}
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
          <h2 className="text-2xl font-bold">{t('how.systemsTitle')}</h2>

          <p className="mt-4 leading-relaxed text-slate-700">
            {t('how.systemsText')}
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
          <h2 className="text-2xl font-bold">{t('how.timeTitle')}</h2>

          <p className="mt-4 leading-relaxed text-slate-200">
            {t('how.timeText')}
          </p>

          <Link
            to="/about"
            className="mt-5 inline-flex rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
          >
            {t('how.readMore')}
          </Link>
        </section>
      </section>
    </main>
  )
}
