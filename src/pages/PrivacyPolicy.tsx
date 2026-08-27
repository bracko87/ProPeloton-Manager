import React from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'

const CONTACT_EMAIL = 'contact@propelotonmanager.com'

export default function PrivacyPolicyPage(): JSX.Element {
  const { t } = useTranslation('publicInfo')

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-950 px-6 py-14 text-white md:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-400">
            {t('privacy.eyebrow')}
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
            {t('privacy.heroTitle')}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-200 md:text-lg">
            {t('privacy.heroText')}
          </p>
        </div>
      </header>

      <div className="px-6 py-12">
        <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-3xl font-bold md:text-4xl">{t('privacy.title')}</h2>
          <p className="mt-4 text-sm text-slate-500">{t('privacy.updated')}</p>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s1Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s1p1')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s2Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s2p1')}</p>
            <p className="leading-relaxed text-slate-700">{t('privacy.s2p2')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s3Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s3p1')}</p>
            <p className="leading-relaxed text-slate-700">{t('privacy.s3p2')}</p>
            <p className="leading-relaxed text-slate-700">{t('privacy.s3p3')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s4Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s4p1')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s5Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s5p1')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s6Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s6p1')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s7Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s7p1')}</p>
            <p className="leading-relaxed text-slate-700">{t('privacy.s7p2')}</p>
            <p className="leading-relaxed text-slate-700">{t('privacy.s7p3')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s8Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s8p1')}</p>
            <p className="leading-relaxed text-slate-700">{t('privacy.s8p2')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s9Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s9p1')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s10Title')}</h3>
            <p className="leading-relaxed text-slate-700">{t('privacy.s10p1')}</p>
          </section>

          <section className="mt-8 space-y-4">
            <h3 className="text-xl font-bold">{t('privacy.s11Title')}</h3>
            <p className="leading-relaxed text-slate-700">
              {t('privacy.s11Prefix')}{' '}
              <a className="font-semibold text-yellow-700 underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>.
            </p>
          </section>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/terms" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800">
              {t('common.terms')}
            </Link>
            <Link to="/contact" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-50">
              {t('common.contact')}
            </Link>
          </div>
        </article>
      </div>
    </main>
  )
}
