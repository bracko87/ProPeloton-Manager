/** Public, text-only guide for each ProPeloton Manager feature. */
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Coins, Crown } from 'lucide-react'
import { FEATURE_KEYS, FEATURE_PAID_ADDONS, isFeatureKey } from '../components/home/featureCatalog'

export default function FeatureDetailPage(): JSX.Element {
  const { t } = useTranslation('home')
  const { featureKey } = useParams<{ featureKey: string }>()
  const key = isFeatureKey(featureKey) ? featureKey : null

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [key])

  if (!key) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#071426] px-6 text-center text-white">
        <h1 className="text-3xl font-semibold">{t('why.page.notFound')}</h1>
        <Link to="/" className="rounded-md bg-yellow-400 px-5 py-3 font-semibold text-slate-950">{t('why.page.backHome')}</Link>
      </main>
    )
  }

  // Feature banners use their own artwork as images become available.
  const heroImage = key === 'management' ? 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/Deep%20team%20management%201.png' : null

  const contentKey = `why.features.${key}`
  const title = t(`${contentKey}.title`)
  const description = t(`${contentKey}.description`)
  const overview = t(`${contentKey}.details`)
  const deepDive = t(`${contentKey}.deepDive`)
  const benefit = t(`${contentKey}.benefit`)
  const tradeoff = t(`${contentKey}.tradeoff`)
  const scenario = t(`${contentKey}.scenario`)
  const actions = t(`${contentKey}.actions`).split('|').map(item => item.trim()).filter(Boolean)
  const paid = FEATURE_PAID_ADDONS[key]
  const index = FEATURE_KEYS.indexOf(key)
  const nextKey = FEATURE_KEYS[(index + 1) % FEATURE_KEYS.length]
  const previousKey = FEATURE_KEYS[(index + FEATURE_KEYS.length - 1) % FEATURE_KEYS.length]
  const accessNote = paid === 'u23' ? t('why.page.u23Access')
    : paid === 'academy' ? t('why.page.academyAccess')
      : t('why.page.coreAccess')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-yellow-400/25 bg-[#061426] text-white">
        <div className="mx-auto flex max-w-[1190px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link to="/" className="text-base font-semibold text-white hover:text-yellow-300">ProPeloton Manager</Link>
          <nav className="flex items-center gap-2 text-sm" aria-label={t('why.page.navigation')}>
            <Link to="/" className="rounded-md border border-white/25 px-3 py-2 hover:bg-white/10">{t('why.page.backHome')}</Link>
            <Link to="/register" className="rounded-md bg-yellow-400 px-3 py-2 font-semibold text-slate-950 hover:bg-yellow-300">{t('header.startPlaying')}</Link>
          </nav>
        </div>
      </header>

      <main>
        <section
          className="relative isolate min-h-[350px] overflow-hidden border-b border-yellow-400/20 bg-[#071426] px-6 pb-10 pt-9 text-white sm:min-h-[370px] sm:pb-12 sm:pt-10"
          style={heroImage ? {
            backgroundImage: `linear-gradient(90deg, rgba(7,20,38,0.94) 0%, rgba(7,20,38,0.81) 48%, rgba(7,20,38,0.67) 100%), url("${heroImage}")`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
          } : undefined}
        >
          <div className="mx-auto max-w-[1120px]">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-yellow-300">
              <ArrowLeft size={16} aria-hidden="true" />{t('why.page.backToOverview')}
            </Link>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">{t('why.eyebrow')} · {index + 1} / {FEATURE_KEYS.length}</p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-200 sm:text-lg">{description}</p>
            {paid && (
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-yellow-400/40 bg-yellow-400/10 px-3 py-1.5 text-yellow-200"><Crown size={14} aria-hidden="true" />{t('why.page.premiumBadge')}</span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-yellow-400/40 bg-yellow-400/10 px-3 py-1.5 text-yellow-200"><Coins size={14} aria-hidden="true" />{t('why.page.coinsBadge')}</span>
                <span className="text-slate-300">{t('why.page.optionalAddon')}</span>
              </div>
            )}
          </div>
        </section>

        <div className="mx-auto max-w-[1120px] space-y-5 px-6 py-9 sm:py-12">
          <div className="grid gap-5 md:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{t('why.page.howItWorks')}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">{overview}</p>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">{deepDive}</p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{t('why.page.whyItMatters')}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">{benefit}</p>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">{tradeoff}</p>
            </article>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{t('why.page.whatYouCanDo')}</h2>
              <ul className="mt-4 space-y-3">
                {actions.map((action, actionIndex) => (
                  <li key={actionIndex} className="flex items-start gap-3 text-sm leading-7 text-slate-700 sm:text-base">
                    <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{t('why.page.exampleTitle')}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">{scenario}</p>
            </article>
          </div>

          <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-xl font-semibold">{t('why.page.accessTitle')}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-base">{accessNote}</p>
          </article>
        </div>

        <section className="border-t border-slate-200 bg-slate-100 px-6 py-9">
          <nav className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4" aria-label={t('why.page.navigation')}>
            <Link to={`/features/${previousKey}`} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:border-yellow-400">
              <ArrowLeft size={16} aria-hidden="true" />{t('why.page.previousFeature')}: {t(`why.features.${previousKey}.title`)}
            </Link>
            <Link to={`/features/${nextKey}`} className="inline-flex items-center gap-2 rounded-md bg-[#102744] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1a3b60]">
              {t('why.page.nextFeature')}: {t(`why.features.${nextKey}.title`)}<ArrowRight size={16} aria-hidden="true" />
            </Link>
          </nav>
        </section>
      </main>
    </div>
  )
}
