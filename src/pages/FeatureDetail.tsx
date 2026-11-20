/** Public feature detail page. Supports future owner-supplied gameplay screenshots. */
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Coins, Crown, Images, X } from 'lucide-react'
import { FEATURE_BACKGROUNDS, FEATURE_IMAGES, FEATURE_KEYS, FEATURE_PAID_ADDONS, isFeatureKey } from '../components/home/featureCatalog'

const LOGO = 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/5c3417dc-3924-4423-948a-745ae5902ed0.png'

export default function FeatureDetailPage(): JSX.Element {
  const { t } = useTranslation('home')
  const { featureKey } = useParams<{ featureKey: string }>()
  const key = isFeatureKey(featureKey) ? featureKey : null
  const pictures = key ? (FEATURE_IMAGES[key] || []) : []
  const background = key ? FEATURE_BACKGROUNDS[key] : undefined
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null)
  const [galleryIndex, setGalleryIndex] = useState(0)

  useEffect(() => {
    window.scrollTo(0, 0)
    setActiveImageIndex(null)
    setGalleryIndex(0)
  }, [key])

  useEffect(() => {
    if (activeImageIndex === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveImageIndex(null)
      else if (event.key === 'ArrowRight' && pictures.length > 1) {
        event.preventDefault()
        setActiveImageIndex(index => index === null ? null : (index + 1) % pictures.length)
      } else if (event.key === 'ArrowLeft' && pictures.length > 1) {
        event.preventDefault()
        setActiveImageIndex(index => index === null ? null : (index + pictures.length - 1) % pictures.length)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeImageIndex, pictures.length])

  if (!key) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#071426] px-6 text-center text-white">
        <h1 className="text-3xl font-semibold">{t('why.page.notFound')}</h1>
        <Link to="/" className="rounded-md bg-yellow-400 px-5 py-3 font-semibold text-slate-950">{t('why.page.backHome')}</Link>
      </main>
    )
  }

  const title = t(`why.features.${key}.title`)
  const description = t(`why.features.${key}.description`)
  const overview = t(`why.features.${key}.details`)
  const benefit = t(`why.features.${key}.benefit`)
  const actions = t(`why.features.${key}.actions`).split('|').map(item => item.trim()).filter(Boolean)
  const paid = FEATURE_PAID_ADDONS[key]
  const index = FEATURE_KEYS.indexOf(key)
  const nextKey = FEATURE_KEYS[(index + 1) % FEATURE_KEYS.length]
  const activeImage = activeImageIndex === null ? null : pictures[activeImageIndex] ?? null
  const accessNote = paid === 'u23' ? t('why.page.u23Access')
    : paid === 'academy' ? t('why.page.academyAccess')
      : t('why.page.coreAccess')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-yellow-400/25 bg-[#061426] text-white">
        <div className="mx-auto flex max-w-[1250px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <Link to="/" className="flex items-center gap-3 text-sm font-semibold sm:text-base">
            <img src={LOGO} className="h-12 w-12 object-contain" alt="" />
            <span>ProPeloton Manager</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm" aria-label={t('why.page.navigation')}>
            <Link to="/" className="rounded-md border border-white/25 px-3 py-2 hover:bg-white/10">{t('why.page.backHome')}</Link>
            <Link to="/register" className="rounded-md bg-yellow-400 px-3 py-2 font-semibold text-slate-950 hover:bg-yellow-300">{t('header.startPlaying')}</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-[#071426] px-6 pb-12 pt-10 text-white sm:pb-14 sm:pt-14">
          {background?.src && (
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <img src={background.src} alt="" className="h-full w-full object-cover" style={{ objectPosition: background.position || 'center' }} />
              <div className="absolute inset-0 bg-gradient-to-r from-[#071426]/90 via-[#071426]/65 to-[#071426]/25" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#071426]/45 via-transparent to-[#071426]/15" />
            </div>
          )}
          <div className="relative z-10 mx-auto max-w-[1200px]">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-300 underline-offset-4 hover:text-yellow-300 hover:underline">
              <ArrowLeft size={16} aria-hidden="true" /> {t('why.page.backToOverview')}
            </Link>
            <p className="mt-9 text-xs font-semibold uppercase tracking-[0.18em] text-yellow-300">{t('why.eyebrow')}</p>
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

        <div className="mx-auto grid max-w-[1200px] gap-6 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.85fr)] lg:gap-8">
          <div className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{t('why.page.howItWorks')}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">{overview}</p>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{t('why.page.whyItMatters')}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">{benefit}</p>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <h2 className="text-xl font-semibold">{t('why.page.whatYouCanDo')}</h2>
              <ul className="mt-4 space-y-3">
                {actions.map((action, actionIndex) => (
                  <li key={actionIndex} className="flex items-start gap-3 text-sm leading-6 text-slate-700 sm:text-base">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {action}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <h2 className="px-6 pt-6 text-xl font-semibold">{t('why.page.gameplayImages')}</h2>
              {pictures.length ? (
                <div className="p-5">
                  <div className="flex items-center gap-2 sm:gap-3" aria-label={t('why.page.gameplayImages')}>
                    {pictures.length > 1 && (
                      <button
                        type="button"
                        aria-label={t('why.page.previousImage')}
                        onClick={() => setGalleryIndex(index => (index + pictures.length - 1) % pictures.length)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-700 transition-colors hover:border-amber-400 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-500"
                      >
                        <ChevronLeft size={21} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveImageIndex(galleryIndex)}
                      aria-label={`${t('why.page.openImage')} ${galleryIndex + 1}: ${pictures[galleryIndex]?.alt ?? ''}`}
                      className="group block min-w-0 flex-1 overflow-hidden rounded-md border border-slate-200 bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500"
                    >
                      <img
                        src={pictures[galleryIndex].src}
                        alt={pictures[galleryIndex].alt}
                        loading="lazy"
                        className="aspect-video w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    </button>
                    {pictures.length > 1 && (
                      <button
                        type="button"
                        aria-label={t('why.page.nextImage')}
                        onClick={() => setGalleryIndex(index => (index + 1) % pictures.length)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-700 transition-colors hover:border-amber-400 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-500"
                      >
                        <ChevronRight size={21} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {pictures.length > 1 && (
                    <div className="mt-3 text-center text-xs font-medium text-slate-500" aria-live="polite">
                      {galleryIndex + 1} / {pictures.length}
                    </div>
                  )}
                </div>
              ) : (
                <div className="m-5 flex aspect-video flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-100 p-5 text-center text-slate-500">
                  <Images size={32} strokeWidth={1.4} aria-hidden="true" />
                  <span className="max-w-xs text-sm leading-6">{t('why.page.imagesComing')}</span>
                </div>
              )}
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{t('why.page.accessTitle')}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">{accessNote}</p>
            </section>
          </div>
        </div>

        <section className="border-t border-slate-200 bg-slate-100 px-6 py-9">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4">
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-amber-700">
              <ArrowLeft size={16} aria-hidden="true" />{t('why.page.backToOverview')}
            </Link>
            <Link to={`/features/${nextKey}`} className="inline-flex items-center gap-2 rounded-md bg-[#102744] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1a3b60]">
              {t('why.page.nextFeature')}: {t(`why.features.${nextKey}.title`)} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      {activeImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('why.page.fullscreenGallery')}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/95 p-3 text-white sm:p-6"
          onClick={event => {
            if (event.target === event.currentTarget) setActiveImageIndex(null)
          }}
        >
          <button
            type="button"
            onClick={() => setActiveImageIndex(null)}
            aria-label={t('why.page.closeImage')}
            className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-md border border-white/30 bg-slate-900 text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400"
          >
            <X size={24} aria-hidden="true" />
          </button>
          <div className="flex w-full max-w-[1600px] items-center justify-center gap-2 sm:gap-4">
            {pictures.length > 1 && (
              <button type="button" aria-label={t('why.page.previousImage')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/25 bg-white/10 hover:bg-white/20 sm:h-12 sm:w-12"
                onClick={() => setActiveImageIndex(index => index === null ? null : (index + pictures.length - 1) % pictures.length)}>
                <ChevronLeft size={26} aria-hidden="true" />
              </button>
            )}
            <figure className="flex min-w-0 flex-1 flex-col items-center gap-3">
              <img src={activeImage.src} alt={activeImage.alt} className="max-h-[82vh] w-full max-w-full object-contain" />
              <figcaption className="max-w-3xl text-center text-xs text-slate-200 sm:text-sm">
                {activeImage.alt}{pictures.length > 1 ? ` · ${(activeImageIndex ?? 0) + 1} / ${pictures.length}` : ''}
              </figcaption>
            </figure>
            {pictures.length > 1 && (
              <button type="button" aria-label={t('why.page.nextImage')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/25 bg-white/10 hover:bg-white/20 sm:h-12 sm:w-12"
                onClick={() => setActiveImageIndex(index => index === null ? null : (index + 1) % pictures.length)}>
                <ChevronRight size={26} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
