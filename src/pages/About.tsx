/**
 * About.tsx
 * Public About page for ProPeloton Manager.
 */

import React from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

export default function AboutPage(): JSX.Element {
  const { t } = useTranslation('publicInfo')

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="bg-slate-950 px-6 py-16 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-300">
            {t('about.eyebrow')}
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            {t('about.title')}
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">
            {t('about.intro')}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/how-to-play"
              className="rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
            >
              {t('about.learn')}
            </Link>

            <Link
              to="/contact"
              className="rounded-lg border border-white/30 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
            >
              {t('common.contactUs')}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl space-y-8 px-6 py-12">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">{t('about.whatTitle')}</h2>

          <p className="mt-4 leading-relaxed text-slate-700">
            {t('about.what1')}
          </p>

          <p className="mt-4 leading-relaxed text-slate-700">
            {t('about.what2')}
          </p>
        </article>

        <section className="grid gap-5 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold">{t('about.teamTitle')}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {t('about.teamText')}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold">{t('about.raceTitle')}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {t('about.raceText')}
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold">{t('about.seasonTitle')}</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              {t('about.seasonText')}
            </p>
          </article>
        </section>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">{t('about.developmentTitle')}</h2>

          <p className="mt-4 leading-relaxed text-slate-700">
            {t('about.developmentText')}
          </p>
        </article>
      </section>
    </main>
  )
}
