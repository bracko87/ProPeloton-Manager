/**
 * Cinematic public homepage hero for ProPeloton Manager.
 * Uses the already-hosted sprint photo as a layer; all copy, cards,
 * navigation, clock, and animations are real React/CSS elements.
 */
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, Bike, Clock3, Play } from 'lucide-react'
import HomeLiveRanking from './HomeLiveRanking'
import { usePublicHomeGameClock } from '../../hooks/usePublicHomeGameClock'
import { PROPELOTON_OFFICIAL_LAUNCH_AT_UTC } from '../PreReleaseNotice'

type HeroProps = { gameTimeLabel: string }

const SPRINT_PHOTO_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2008_23_55%20PM.png'
const FALLBACK_PHOTO_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/4b6fb4ca-5ab1-4fea-b645-c20802671498.png'

function formatGameTimeLabel(label: string, seasonLabel: string, loadingLabel: string): string {
  if (!label) return loadingLabel
  return label.replace(/^S(\d+)\s*·/, `${seasonLabel} $1 ·`)
}

function getHomeClockLocale(language: string): string {
  if (language.startsWith('sr')) return 'sr-Latn-RS'
  if (language.startsWith('de')) return 'de-DE'
  if (language.startsWith('hr')) return 'hr-HR'
  if (language.startsWith('es')) return 'es-ES'
  if (language.startsWith('it')) return 'it-IT'
  if (language.startsWith('fr')) return 'fr-FR'
  if (language.startsWith('ru')) return 'ru-RU'
  return 'en-GB'
}

function formatLiveGameClock(gameEpochMs: number, locale: string, seasonLabel: string): string {
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
  const [slide, setSlide] = useState(0)

  const language = String(i18n.resolvedLanguage || i18n.language || 'en').toLowerCase()
  const locale = getHomeClockLocale(language)
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
    (parentLabelReady ? parentLabel
      : clock.loading ? t('hero.loadingGameTime') : t('status.gameTimeUnavailable'))
  const displayGameTime = formatGameTimeLabel(
    clockLabel, t('hero.season'), t('hero.loadingGameTime'),
  )
  const seasonNumber = clock.gameEpochMs !== null
    ? Math.max(1, new Date(clock.gameEpochMs).getUTCFullYear() - 1999)
    : Number(parentLabel.match(/(?:Season|Saison|Sezona|Temporada|Stagione|Сезон|S)\s*(\d+)/i)?.[1] || 1)
  const preLaunch = Date.now() < Date.parse(PROPELOTON_OFFICIAL_LAUNCH_AT_UTC)

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        !sceneRef.current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5
    sceneRef.current.style.setProperty('--ppm-x', `${(x * 14).toFixed(1)}px`)
    sceneRef.current.style.setProperty('--ppm-y', `${(y * 10).toFixed(1)}px`)
  }
  const resetPointer = () => {
    sceneRef.current?.style.setProperty('--ppm-x', '0px')
    sceneRef.current?.style.setProperty('--ppm-y', '0px')
  }

  const slides = [
    { first: t('hero.legacyIntro'), accent: t('hero.legacyHighlight'), trailing: '' },
    { first: t('hero.titleLine2'), accent: t('hero.legacyHighlight'), trailing: '' },
    { first: t('hero.titleLine3'), accent: t('hero.legacyHighlight'), trailing: '' },
  ]
  const activeSlide = slides[slide]

  return (
    <section
      className="ppm-cinematic relative isolate w-full overflow-hidden border-b border-[#dbaa16]/30 bg-[#061426] text-white"
      onPointerMove={onPointerMove}
      onPointerLeave={resetPointer}
      aria-label={t('hero.seasonalMultiplayer')}
    >
      <style>{`
        .ppm-cinematic { min-height:700px; }
        .ppm-cinematic .ppm-scene {
          transform:translate3d(var(--ppm-x,0px),var(--ppm-y,0px),0) scale(1.026);
          transition:transform .38s ease-out;
        }
        .ppm-cinematic .ppm-photo { filter:saturate(1.17) contrast(1.1) brightness(.94); }
        .ppm-cinematic .ppm-glass {
          background:linear-gradient(130deg,rgba(31,49,74,.82),rgba(7,20,39,.76));
          border:1px solid rgba(255,255,255,.23);
          box-shadow:inset 0 1px rgba(255,255,255,.15),0 12px 44px rgba(0,0,0,.28);
          backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
        }
        .ppm-cinematic .ppm-cta {
          box-shadow:0 0 0 2px #ffe878,0 0 28px rgba(250,204,21,.53),0 15px 40px rgba(0,0,0,.32);
          transition:transform .25s,box-shadow .25s,background .25s;
        }
        .ppm-cinematic .ppm-cta:hover {
          transform:translateY(-3px);box-shadow:0 0 0 2px #fff0a0,0 0 38px rgba(250,204,21,.82);
        }
        .ppm-cinematic .ppm-ambient {animation:ppm-ambient 5.6s ease-in-out infinite alternate;}
        .ppm-cinematic .ppm-racer {animation:ppm-intro 1s cubic-bezier(.2,.8,.2,1) both;}
        .ppm-cinematic .ppm-speed-line {
          position:absolute;height:2px;border-radius:100%;background:linear-gradient(90deg,transparent,#ffe169,transparent);
          box-shadow:0 0 11px #fac515;transform:rotate(-11deg);
          animation:ppm-sweep 6.5s linear infinite;pointer-events:none;
        }
        .ppm-cinematic .ppm-speed-line:nth-of-type(2){animation-duration:8s;animation-delay:-3.1s;}
        .ppm-cinematic .ppm-speed-line:nth-of-type(3){animation-duration:7s;animation-delay:-2.2s;}
        .ppm-cinematic .ppm-cta:focus-visible,.ppm-cinematic a:focus-visible,
        .ppm-cinematic button:focus-visible { outline:3px solid #fde047;outline-offset:4px; }
        .ppm-cinematic .ppm-live-dot {animation:ppm-beacon 2.3s ease-in-out infinite;}
        .ppm-cinematic .ppm-glass-hover {transition:transform .2s,border-color .2s;}
        .ppm-cinematic .ppm-glass-hover:hover {transform:translateY(-4px);border-color:rgba(250,204,21,.7);}
        @keyframes ppm-intro {from{opacity:0;transform:translateX(22px) scale(1.03)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes ppm-ambient {from{opacity:.45;transform:scale(.92)}to{opacity:.9;transform:scale(1.12)}}
        @keyframes ppm-sweep {0%{translate:80% 0;opacity:0}20%{opacity:.85}100%{translate:-150% 0;opacity:0}}
        @keyframes ppm-beacon {50%{box-shadow:0 0 0 7px rgba(74,222,128,0)}}
        @media(max-width:1023px){
          .ppm-cinematic .ppm-photo {object-position:53% 60%;}
          .ppm-cinematic .ppm-photo-wrap {width:100%!important;opacity:.5;}
        }
        @media(prefers-reduced-motion:reduce){
          .ppm-cinematic *, .ppm-cinematic *:before, .ppm-cinematic *:after {
            animation:none!important;transition:none!important;
          }
          .ppm-cinematic .ppm-scene {transform:none!important;}
        }
      `}</style>

      {/* The sprint finish is a photographic background, never a static screenshot of UI. */}
      <div ref={sceneRef} className="ppm-scene pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="ppm-photo-wrap absolute inset-y-0 right-0 w-[78%] overflow-hidden">
          <img
            src={SPRINT_PHOTO_URL}
            alt=""
            fetchPriority="high"
            className="ppm-photo ppm-racer h-full w-full object-cover object-[50%_54%]"
            onError={event => {
              if (!event.currentTarget.src.includes('4b6fb4ca-5ab1')) {
                event.currentTarget.src = FALLBACK_PHOTO_URL
              }
            }}
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#061426_0%,rgba(6,20,38,.99)_19%,rgba(6,20,38,.90)_32%,rgba(6,20,38,.50)_46%,rgba(6,20,38,.12)_63%,rgba(6,20,38,.03)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#061426]/95 via-transparent to-[#061426]/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_63%_58%,transparent_28%,rgba(4,13,31,.20)_79%)]" />
        {/* Blend out the far-right edge of the existing race photo behind the ranking panel. */}
        <div className="absolute inset-y-0 right-0 w-[29%] bg-gradient-to-r from-transparent via-[#061426]/30 to-[#061426]/80" />
        <div className="ppm-ambient absolute -left-40 top-20 h-80 w-96 rounded-full bg-blue-600/25 blur-[100px]" />
        <div className="ppm-ambient absolute -right-20 bottom-0 h-60 w-[620px] rounded-full bg-yellow-400/25 blur-[85px]" />
        <div className="ppm-speed-line bottom-[18%] right-[-15%] w-[65%]" />
        <div className="ppm-speed-line bottom-[7%] left-[-15%] w-[58%]" />
        <div className="ppm-speed-line top-[27%] right-[-12%] w-[30%]" />
        <svg className="absolute bottom-0 left-0 h-28 w-full" viewBox="0 0 1440 110" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="ppm-race-swoosh" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#facc15" stopOpacity="0" />
              <stop offset=".36" stopColor="#facc15" stopOpacity=".95" />
              <stop offset=".82" stopColor="#facc15" stopOpacity=".75" />
              <stop offset="1" stopColor="#facc15" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M-80 106 Q350 16 680 84 T1510 6" fill="none" stroke="url(#ppm-race-swoosh)" strokeWidth="4" />
        </svg>
      </div>

      <div className="relative z-10 mx-auto min-h-[700px] max-w-[1510px] px-6 pb-20 pt-14 sm:px-10 lg:px-12 lg:pb-24 lg:pt-20">
        <div className="relative max-w-[660px]">
          <div className="mb-5 flex items-center gap-3 text-sm font-extrabold uppercase italic tracking-[.10em] text-yellow-400 sm:text-base">
            <Bike size={24} aria-hidden="true" />
            <span>{t('hero.seasonalMultiplayer')}</span>
            <span className="hidden h-px w-20 bg-gradient-to-r from-yellow-400 to-transparent sm:block" />
          </div>

          <h1 className="min-h-[128px] text-[clamp(3.05rem,5.4vw,5.55rem)] font-black italic leading-[.99] tracking-[-.055em] text-white drop-shadow-[0_6px_22px_rgba(0,0,0,.5)] sm:min-h-[158px] lg:min-h-[185px]">
            <span className="block">{activeSlide.first}</span>
            <span className="relative block w-fit text-yellow-400">
              {activeSlide.accent}
              <svg className="pointer-events-none absolute -bottom-5 left-0 h-7 w-full overflow-visible" viewBox="0 0 510 32" preserveAspectRatio="none" aria-hidden="true">
                <path d="M6 26 Q235 -9 505 19" stroke="#facc15" strokeWidth="3.5" strokeLinecap="round" fill="none" />
              </svg>
            </span>
          </h1>

          <p className="mt-7 max-w-[540px] text-base leading-7 text-slate-100 sm:mt-8 sm:text-[17px] sm:leading-8">
            {t('hero.description')}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link to="/register" className="ppm-cta inline-flex min-h-[54px] items-center gap-3 rounded-xl bg-yellow-400 px-7 py-3 text-base font-black text-[#071426] hover:bg-yellow-300 sm:text-lg">
              <Play size={19} fill="currentColor" aria-hidden="true" />{t('header.startPlaying')}
            </Link>
            <Link to="/login" className="ppm-glass ppm-glass-hover inline-flex min-h-[54px] items-center gap-3 rounded-xl px-7 py-3 text-base font-bold text-white sm:text-lg">
              {t('header.signIn')} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Preserve the server-anchored clock; remove Multiplayer and Progression. */}
        <div className="mt-10 w-full max-w-[310px] lg:mt-12">
          <div className="ppm-glass rounded-2xl p-5 shadow-[0_0_20px_rgba(250,204,21,.18)]" style={{ borderColor:'rgba(250,204,21,.72)' }}>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-yellow-300">
              <Clock3 size={17} aria-hidden="true" />{t('hero.gameTime')}
            </div>
            <div className="mt-2 text-sm font-bold leading-6 text-white"
              data-clock-source={liveLabel ? 'server-anchored-clock' : parentLabelReady ? 'homepage-snapshot' : clock.loading ? 'pending' : 'unavailable'}>
              {displayGameTime}
            </div>
          </div>
        </div>
        <HomeLiveRanking seasonNumber={seasonNumber} preLaunch={preLaunch} locale={locale} />

        <div className="mt-8 flex items-center justify-center gap-2 lg:absolute lg:bottom-6 lg:left-1/2 lg:mt-0 lg:-translate-x-1/2" role="group" aria-label={t('hero.slideControls')}>
          {slides.map((_, index) => (
            <button
              type="button"
              key={index}
              aria-label={t('hero.slideLabel', { number: index + 1 })}
              aria-pressed={index === slide}
              onClick={() => setSlide(index)}
              className={`h-2.5 rounded-full transition-all hover:bg-yellow-200 ${index === slide ? 'w-7 bg-yellow-400' : 'w-2.5 bg-white/65'}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
