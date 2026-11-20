/**
 * Animated public homepage hero.
 * No backend changes: preserves the server-anchored game clock, translations,
 * and the existing registration/login destinations.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, Award, Bike, Clock3, Play, Trophy, Users, Zap } from 'lucide-react'
import { usePublicHomeGameClock } from '../../hooks/usePublicHomeGameClock'

type HeroProps = { gameTimeLabel: string }

const HERO_IMAGE_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/4b6fb4ca-5ab1-4fea-b645-c20802671498.png'
const HERO_BACKGROUND_URL =
  'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/ea527ef7-6896-413d-9d69-df332b440fd0.jpg'

function formatGameTimeLabel(label: string, seasonLabel: string, loadingLabel: string) {
  if (!label) return loadingLabel
  return label.replace(/^S(\d+)\s*·/, `${seasonLabel} $1 ·`)
}

function getHomeClockLocale(language: string) {
  if (language.startsWith('sr')) return 'sr-Latn-RS'
  if (language.startsWith('de')) return 'de-DE'
  if (language.startsWith('hr')) return 'hr-HR'
  if (language.startsWith('es')) return 'es-ES'
  if (language.startsWith('it')) return 'it-IT'
  if (language.startsWith('fr')) return 'fr-FR'
  if (language.startsWith('ru')) return 'ru-RU'
  return 'en-GB'
}

function formatLiveGameClock(gameEpochMs: number, locale: string, seasonLabel: string) {
  const gameDate = new Date(gameEpochMs)
  if (Number.isNaN(gameDate.getTime())) return ''
  const season = gameDate.getUTCFullYear() - 1999
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'long', timeZone: 'UTC',
  }).format(gameDate)
  const date = new Intl.DateTimeFormat(locale, {
    month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(gameDate)
  const time = `${String(gameDate.getUTCHours()).padStart(2, '0')}:${String(gameDate.getUTCMinutes()).padStart(2, '0')}`
  return `${seasonLabel} ${season} · ${weekday} · ${date} · ${time}`
}

export default function Hero({ gameTimeLabel }: HeroProps): JSX.Element {
  const { t, i18n } = useTranslation('home')
  const clock = usePublicHomeGameClock()
  const sceneRef = useRef<HTMLDivElement>(null)
  const [motionEnabled, setMotionEnabled] = useState(false)
  const language = String(i18n.resolvedLanguage || i18n.language || 'en').toLowerCase()
  const locale = getHomeClockLocale(language)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMotionEnabled(!media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!motionEnabled || event.pointerType === 'touch' || !sceneRef.current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5
    sceneRef.current.style.setProperty('--hero-x', `${(x * 14).toFixed(1)}px`)
    sceneRef.current.style.setProperty('--hero-y', `${(y * 10).toFixed(1)}px`)
  }
  const resetPointer = () => {
    sceneRef.current?.style.setProperty('--hero-x', '0px')
    sceneRef.current?.style.setProperty('--hero-y', '0px')
  }

  const parentLabel = gameTimeLabel.trim()
  const parentLabelReady =
    parentLabel.length > 0 &&
    parentLabel !== t('status.loadingGameTime') &&
    parentLabel !== t('hero.loadingGameTime') &&
    parentLabel !== t('status.gameTimeUnavailable')
  const liveLabel = clock.gameEpochMs === null
    ? null
    : formatLiveGameClock(clock.gameEpochMs, locale, t('hero.season'))
  const clockLabel = liveLabel ||
    (parentLabelReady
      ? parentLabel
      : clock.loading
        ? t('hero.loadingGameTime')
        : t('status.gameTimeUnavailable'))
  const displayGameTime = formatGameTimeLabel(clockLabel, t('hero.season'), t('hero.loadingGameTime'))

  return (
    <section
      className="ppm-hero relative isolate w-full overflow-hidden border-b border-yellow-400/20 bg-[#061020] text-white"
      onPointerMove={onPointerMove}
      onPointerLeave={resetPointer}
      aria-label={t('hero.seasonalMultiplayer')}
    >
      <style>{`
        .ppm-hero { min-height: 630px; }
        .ppm-hero .ppm-scene { transform: translate3d(var(--hero-x,0px),var(--hero-y,0px),0) scale(1.035); transition: transform .4s ease-out; }
        .ppm-hero .ppm-streak { position:absolute; height:2px; width:48%; border-radius:999px; background:linear-gradient(90deg,transparent,#facc15 55%,transparent); transform:rotate(-13deg); opacity:.6; filter:drop-shadow(0 0 9px #facc15); }
        .ppm-hero .ppm-streak:nth-child(1) { top:24%; right:-17%; animation:ppm-speed 6s linear infinite; }
        .ppm-hero .ppm-streak:nth-child(2) { top:67%; right:-8%; animation:ppm-speed 8s linear -2s infinite; }
        .ppm-hero .ppm-streak:nth-child(3) { top:85%; left:-12%; animation:ppm-speed 7s linear -4s infinite; }
        .ppm-hero .ppm-ambient { animation:ppm-breathe 5s ease-in-out infinite alternate; }
        .ppm-hero .ppm-glass { background:linear-gradient(135deg,rgba(28,44,67,.83),rgba(9,18,33,.65)); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); box-shadow:0 15px 40px rgba(0,0,0,.25),inset 0 1px rgba(255,255,255,.12); }
        .ppm-hero .ppm-cta { box-shadow:0 0 0 1px rgba(255,255,255,.25),0 0 23px rgba(250,204,21,.34); transition:transform .2s,box-shadow .2s,background .2s; }
        .ppm-hero .ppm-cta:hover { transform:translateY(-3px); box-shadow:0 0 35px rgba(250,204,21,.58); }
        .ppm-hero .ppm-image { animation:ppm-image-enter 1.1s ease-out both; }
        .ppm-hero .ppm-dot { animation:ppm-pulse 2.3s ease-in-out infinite; }
        @keyframes ppm-speed { 0% { translate:55% 0; opacity:0; } 25% { opacity:.7; } 100% { translate:-110% 0; opacity:0; } }
        @keyframes ppm-breathe { from { opacity:.35; transform:scale(1); } to { opacity:.7; transform:scale(1.17); } }
        @keyframes ppm-image-enter { from { opacity:0; transform:translateX(45px) scale(.98); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes ppm-pulse { 50% { box-shadow:0 0 0 7px rgba(74,222,128,0); } }
        @media (prefers-reduced-motion: reduce) {
          .ppm-hero *, .ppm-hero *::before, .ppm-hero *::after { animation:none!important; transition:none!important; }
          .ppm-hero .ppm-scene { transform:none!important; }
        }
      `}</style>

      <div ref={sceneRef} className="ppm-scene pointer-events-none absolute inset-0" aria-hidden="true">
        <img src={HERO_BACKGROUND_URL} alt="" className="h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#061020] via-[#08162d]/90 to-[#07162b]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#061020] via-transparent to-[#071226]/50" />
        <div className="ppm-ambient absolute -right-28 top-20 h-[430px] w-[430px] rounded-full bg-yellow-400/20 blur-[105px]" />
        <div className="ppm-ambient absolute -left-40 bottom-0 h-[360px] w-[360px] rounded-full bg-blue-500/20 blur-[90px]" />
        <div className="ppm-streak" /><div className="ppm-streak" /><div className="ppm-streak" />
      </div>

      <div className="relative mx-auto grid min-h-[630px] max-w-[1440px] grid-cols-1 items-center gap-10 px-6 py-14 sm:px-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)] lg:gap-6 lg:px-14 lg:py-20">
        <div className="relative z-20 max-w-[740px]">
          <div className="mb-6 inline-flex items-center gap-3 text-sm font-extrabold uppercase italic tracking-widest text-yellow-300">
            <Bike aria-hidden="true" size={23} />
            <span>{t('hero.seasonalMultiplayer')}</span>
            <span className="hidden h-px w-20 bg-gradient-to-r from-yellow-400 to-transparent sm:block" />
          </div>
          <h1 className="max-w-[740px] text-[clamp(2.7rem,5.1vw,5.5rem)] font-black italic leading-[1.03] tracking-[-.045em] drop-shadow-2xl">
            <span className="block">{t('hero.titleLine1')}</span>
            <span className="block text-yellow-400">{t('hero.titleLine2')}</span>
            <span className="block">{t('hero.titleLine3')}</span>
          </h1>
          <p className="mt-7 max-w-[580px] text-base leading-7 text-slate-200 sm:text-lg sm:leading-8">
            {t('hero.description')}
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/register" className="ppm-cta inline-flex min-h-12 items-center gap-3 rounded-xl bg-yellow-400 px-7 py-3 font-extrabold text-[#071020] hover:bg-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-300">
              <Play size={17} fill="currentColor" aria-hidden="true" /> {t('header.startPlaying')}
            </Link>
            <Link to="/login" className="ppm-glass inline-flex min-h-12 items-center gap-3 rounded-xl border border-white/25 px-7 py-3 font-bold text-white transition hover:border-yellow-400 hover:text-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-300">
              {t('header.signIn')} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="ppm-glass rounded-2xl border border-yellow-400/60 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-yellow-300">
                <Clock3 size={17} aria-hidden="true" />{t('hero.gameTime')}
              </div>
              <div className="mt-2 text-sm font-semibold leading-5 text-white"
                data-clock-source={liveLabel ? 'server-anchored-clock' : parentLabelReady ? 'homepage-snapshot' : clock.loading ? 'pending' : 'unavailable'}>
                {displayGameTime}
              </div>
            </div>
            <div className="ppm-glass rounded-2xl border border-white/15 p-4 transition-colors hover:border-yellow-400/45">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                <Users size={17} aria-hidden="true" />{t('hero.multiplayer')}
              </div>
              <div className="mt-2 text-sm font-bold text-white">{t('hero.liveManagerLeagues')}</div>
            </div>
            <div className="ppm-glass rounded-2xl border border-white/15 p-4 transition-colors hover:border-yellow-400/45">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
                <Trophy size={17} aria-hidden="true" />{t('hero.progression')}
              </div>
              <div className="mt-2 text-sm font-bold text-white">{t('hero.progressionValue')}</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 min-h-[340px] sm:min-h-[430px] lg:h-[580px]">
          <div className="ppm-ambient pointer-events-none absolute inset-[12%] rounded-full bg-yellow-400/20 blur-[75px]" aria-hidden="true" />
          <div className="ppm-image absolute inset-0 overflow-hidden rounded-[2rem] border border-white/20 shadow-[0_30px_80px_rgba(0,0,0,.45)]">
            <img
              src={HERO_IMAGE_URL}
              alt={t('hero.imageAlt')}
              className="h-full w-full object-cover object-center transition-transform duration-700 hover:scale-[1.045]"
              fetchPriority="high"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#061020]/80 via-transparent to-[#061020]/20" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent" aria-hidden="true" />
          </div>
          <div className="ppm-glass absolute right-3 top-4 flex items-center gap-3 rounded-xl border border-yellow-400/40 px-4 py-3 shadow-xl sm:right-5 sm:top-6">
            <span className="ppm-dot h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_15px_#4ade80]" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">{t('hero.seasonalMultiplayer')}</span>
            <Zap size={17} className="text-yellow-400" aria-hidden="true" />
          </div>
          <div className="ppm-glass absolute bottom-5 left-3 right-3 flex items-center justify-between gap-3 rounded-xl border border-white/25 px-4 py-3 sm:bottom-7 sm:left-6 sm:right-6">
            <div className="flex items-center gap-3">
              <Award className="text-yellow-400" size={22} aria-hidden="true" />
              <span className="text-sm font-bold text-white">{t('hero.progressionValue')}</span>
            </div>
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
              <span className="block h-full w-2/3 rounded-full bg-yellow-400" />
            </span>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yellow-400/80 to-transparent" aria-hidden="true" />
    </section>
  )
}
