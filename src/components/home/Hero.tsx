/**
 * Hero.tsx
 * Full-width homepage hero section.
 *
 * Purpose:
 * - Show the main public homepage message.
 * - Display live game time passed from Home.tsx.
 * - Present the main cycling image with stronger visual size.
 * - Keep Start Playing and Sign In as the only primary homepage actions.
 */

import React from 'react'
import { Link } from 'react-router'
import { Award } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

type HeroProps = {
  gameTimeLabel: string
}

const HERO_IMAGE_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/4b6fb4ca-5ab1-4fea-b645-c20802671498.png'

const HERO_BACKGROUND_URL =
  'https://pub-cdn.sider.ai/u/U0KAH9N4VLX/web-coder/69a48114fd11fbc8fc7d68f5/resource/ea527ef7-6896-413d-9d69-df332b440fd0.jpg'

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatGameTimeLabel(label: string, t: TFunction): string {
  if (!label || label === 'Loading game time...') {
    return t('hero.loadingGameTime')
  }

  if (label === 'Game time unavailable') {
    return t('status.gameTimeUnavailable')
  }

  const parts = label
    .split('·')
    .map(part => part.trim())
    .filter(Boolean)

  const seasonMatch = parts[0]?.match(/^(?:Season\s+|S)(\d+)$/i)

  if (!seasonMatch) {
    return label.replace(/^S(\d+)\s*·/, `${t('hero.season')} $1 ·`)
  }

  const seasonNumber = seasonMatch[1]
  const possibleWeekday = parts[1] ?? ''
  const hasWeekday = WEEKDAY_NAMES.includes(possibleWeekday)
  const weekday = hasWeekday
    ? t(`calendar:weekdays.${possibleWeekday}`)
    : null
  const datePart = hasWeekday ? parts[2] : parts[1]
  const time = hasWeekday ? parts[3] : parts[2]

  const dateMatch = datePart?.match(/^([A-Za-z]+)\s+(\d{1,2})$/)
  const englishMonth = dateMatch?.[1] ?? ''
  const day = dateMatch?.[2] ?? ''

  if (!dateMatch || !MONTH_NAMES.includes(englishMonth) || !time) {
    return label.replace(
      /^(?:Season\s+|S)(\d+)/i,
      `${t('hero.season')} $1`,
    )
  }

  const month = t(`calendar:months.${englishMonth}`)
  const localizedDate = t('calendar:date', {
    month,
    day,
  })

  if (weekday) {
    return t('calendar:gameTimeWithWeekday', {
      season: t('hero.season'),
      seasonNumber,
      weekday,
      date: localizedDate,
      time,
    })
  }

  return t('calendar:gameTimeWithoutWeekday', {
    season: t('hero.season'),
    seasonNumber,
    date: localizedDate,
    time,
  })
}

export default function Hero({ gameTimeLabel }: HeroProps): JSX.Element {
  const { t } = useTranslation(['home', 'calendar'])
  const displayGameTime = formatGameTimeLabel(gameTimeLabel, t)

  return (
    <section className="relative w-full overflow-hidden border-b border-white/15 bg-[#0a1730] py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <img
          src={HERO_BACKGROUND_URL}
          alt=""
          className="h-full w-full object-cover"
          style={{
            opacity: 0.1,
            WebkitMaskImage:
              'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0) 100%)',
            maskImage:
              'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 55%, rgba(0,0,0,0) 100%)',
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-b from-[#0a1730]/20 via-[#0a1730]/50 to-[#0a1730]" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-5 flex items-center gap-3 text-yellow-400">
            <Award size={18} />
            <span className="font-semibold">{t('hero.seasonalMultiplayer')}</span>
          </div>

          <h1 className="max-w-3xl text-4xl font-bold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[52px]">
            {t('hero.titleLine1')}
            <br />
            {t('hero.titleLine2')}
            <br />
            {t('hero.titleLine3')}
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-yellow-100/85">
            {t('hero.description')}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              to="/register"
              className="rounded-md bg-yellow-400 px-6 py-3 font-bold text-black shadow hover:bg-yellow-300 hover:shadow-lg"
            >
              {t('header.startPlaying')}
            </Link>

            <Link
              to="/login"
              className="rounded-md border border-white/20 px-6 py-3 font-semibold text-white/90 hover:border-yellow-400 hover:bg-white/5 hover:text-yellow-400"
            >
              {t('header.signIn')}
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-yellow-400/35 bg-yellow-400/10 p-4 shadow-lg shadow-yellow-950/20">
              <div className="text-xs font-semibold uppercase tracking-wide text-yellow-300">
                {t('hero.gameTime')}
              </div>
              <div className="mt-1 text-sm font-bold text-white">{displayGameTime}</div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/70">{t('hero.multiplayer')}</div>
              <div className="mt-1 text-sm font-semibold text-white/95">
                {t('hero.liveManagerLeagues')}
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/70">{t('hero.progression')}</div>
              <div className="mt-1 text-sm font-semibold text-white/95">
                {t('hero.progressionValue')}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl">
            <img
              src={HERO_IMAGE_URL}
              alt={t('hero.imageAlt')}
              className="h-[360px] w-full object-cover sm:h-[430px]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
