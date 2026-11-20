/** Public entry-level game guide. Every card links to the complete feature page. */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { FEATURE_KEYS } from '../components/home/featureCatalog'

const SECTIONS = [
  { title: 'whatTitle', body: 'whatText' },
  { title: 'howTitle', body: 'howText' },
  { title: 'preparationTitle', body: 'preparationText' },
] as const

export default function PublicGameGuidePage(): JSX.Element {
  const { t } = useTranslation('home')

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#071426] px-6 pb-12 pt-10 text-white sm:py-16">
        <div className="mx-auto max-w-6xl">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-200 hover:text-yellow-300">
            <ArrowLeft size={16} aria-hidden="true" />{t('why.page.backHome')}
          </Link>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em] text-yellow-300">{t('guide.eyebrow')}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t('guide.headline')}</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-200">{t('guide.intro')}</p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="grid gap-4 md:grid-cols-3">
          {SECTIONS.map(section => (
            <section key={section.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{t(`guide.${section.title}`)}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">{t(`guide.${section.body}`)}</p>
            </section>
          ))}
        </div>
        <section className="mt-12" aria-labelledby="ppm-public-guide-features">
          <h2 id="ppm-public-guide-features" className="text-2xl font-semibold">{t('why.title')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('why.subtitle')}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_KEYS.map(key => (
              <Link key={key} to={`/features/${key}`}
                className="group flex min-h-[86px] items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{t(`why.features.${key}.title`)}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">{t(`why.features.${key}.description`)}</span>
                </span>
                <ArrowRight size={18} aria-hidden="true" className="shrink-0 text-amber-600 transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </section>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:border-amber-400">
            <ArrowLeft size={16} aria-hidden="true" /> {t('why.page.backHome')}
          </Link>
          <Link to="/register" className="rounded-md bg-yellow-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-yellow-300">
            {t('header.startPlaying')}
          </Link>
        </div>
      </div>
    </main>
  )
}
