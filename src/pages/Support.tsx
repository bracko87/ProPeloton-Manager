/**
 * Support.tsx
 * Public support information page for ProPeloton Manager.
 */

import React from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

export default function SupportPage(): JSX.Element {
  const { t } = useTranslation('publicInfo')

  const supportTopics = [
    { title: t('support.accountTitle'), text: t('support.accountText') },
    { title: t('support.bugsTitle'), text: t('support.bugsText') },
    { title: t('support.paymentsTitle'), text: t('support.paymentsText') },
    { title: t('support.gameplayTitle'), text: t('support.gameplayText') },
  ]

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="bg-slate-950 px-6 py-14 text-white">
        <div className="mx-auto max-w-5xl">
          <Link
            to="/"
            className="inline-flex items-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-white"
          >
            {t('common.backHome')}
          </Link>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.25em] text-yellow-300">
            {t('support.eyebrow')}
          </p>

          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            {t('support.title')}
          </h1>

          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">
            {t('support.intro')}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="rounded-lg bg-yellow-400 px-5 py-3 text-sm font-bold text-black hover:bg-yellow-300"
            >
              {t('support.send')}
            </Link>

            <Link
              to="/privacy-policy"
              className="rounded-lg border border-white/30 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
            >
              {t('common.privacyPolicy')}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">{t('support.contactTitle')}</h2>

          <p className="mt-3 leading-relaxed text-slate-700">
            {t('support.contactText')}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              {t('support.openForm')}
            </Link>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
            >
              {t('support.manualEmail')}
            </a>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {supportTopics.map(topic => (
            <article
              key={topic.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-bold">{topic.title}</h2>
              <p className="mt-3 leading-relaxed text-slate-700">{topic.text}</p>
            </article>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">{t('support.fasterTitle')}</h2>

          <p className="mt-4 leading-relaxed text-slate-700">
            {t('support.fasterText')}
          </p>

          <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-5">
            <h3 className="font-bold">{t('support.sensitiveTitle')}</h3>

            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {t('support.sensitiveText')}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              {t('support.openContact')}
            </Link>

            <Link
              to="/privacy-policy"
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50"
            >
              {t('common.privacyPolicy')}
            </Link>
          </div>
        </section>
      </section>
    </main>
  )
}
