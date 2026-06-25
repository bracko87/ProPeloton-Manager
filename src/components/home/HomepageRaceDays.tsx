import React from 'react'
import { Link } from 'react-router'

export type HomepageRaceDayItem = {
  id: string
  title: string
  subtitle: string
  timeLabel: string
  dateLabel?: string | null
  countryCode?: string | null
  href?: string
}

export type HomepageRaceDaysData = {
  yesterdayRaces: HomepageRaceDayItem[]
  todayRaces: HomepageRaceDayItem[]
  tomorrowRaces: HomepageRaceDayItem[]
}

type HomepageRaceDaysProps = {
  data: HomepageRaceDaysData | null
  loading?: boolean
}

type RaceGroup = {
  title: string
  items: HomepageRaceDayItem[]
  emptyText: string
}

const BACKGROUND_IMAGE_URL =
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2008_26_26%20PM.png'

function normalizeRaceHref(value?: string): string | undefined {
  if (!value) return undefined
  if (value.startsWith('#/')) return value
  if (value.startsWith('/')) return value

  return `/${value}`
}

function getFlagUrl(countryCode?: string | null): string | null {
  const code = (countryCode ?? '').trim().toLowerCase()

  if (!/^[a-z]{2}$/.test(code)) return null

  return `https://flagcdn.com/w40/${code}.png`
}

function RaceRow({ item }: { item: HomepageRaceDayItem }): JSX.Element {
  const href = normalizeRaceHref(item.href)
  const flagUrl = getFlagUrl(item.countryCode)
  const dateLabel = item.dateLabel || item.timeLabel

  const content = (
    <div className="grid min-h-[46px] grid-cols-[76px_1fr] items-center rounded-lg border border-slate-200 bg-white/95 text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-white hover:shadow">
      <div className="px-4 text-sm font-semibold text-slate-950">
        {dateLabel}
      </div>

      <div className="min-w-0 border-l-2 border-emerald-500 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {flagUrl && (
            <img
              src={flagUrl}
              alt={`${item.countryCode ?? ''} flag`}
              className="h-4 w-6 shrink-0 rounded-[2px] object-cover shadow-sm"
              loading="lazy"
            />
          )}

          <span className="truncate text-sm font-bold text-slate-950">
            {item.title}
          </span>

          <span className="hidden text-slate-400 sm:inline">·</span>

          <span className="shrink-0 text-xs font-semibold leading-5 text-slate-600">
            {item.subtitle}
          </span>
        </div>

        <div className="mt-1 text-xs leading-5 text-slate-600 md:hidden">
          {item.subtitle}
        </div>
      </div>
    </div>
  )

  if (!href) return content

  return (
    <Link to={href} className="block">
      {content}
    </Link>
  )
}

function RaceGroupSection({ group }: { group: RaceGroup }): JSX.Element {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-slate-950">
          {group.title}
        </h4>

        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
          {group.items.length}
        </span>
      </div>

      <div className="space-y-2">
        {group.items.length > 0 ? (
          group.items.slice(0, 5).map((item) => (
            <RaceRow key={item.id} item={item} />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/90 px-4 py-4 text-sm text-slate-500">
            {group.emptyText}
          </div>
        )}
      </div>
    </div>
  )
}

export default function HomepageRaceDays({
  data,
  loading = false,
}: HomepageRaceDaysProps): JSX.Element {
  const groups: RaceGroup[] = [
    {
      title: 'Yesterday Races',
      items: data?.yesterdayRaces ?? [],
      emptyText: 'No stages were scheduled yesterday.',
    },
    {
      title: 'Today Races',
      items: data?.todayRaces ?? [],
      emptyText: 'No stages are scheduled today.',
    },
    {
      title: 'Tomorrow Races',
      items: data?.tomorrowRaces ?? [],
      emptyText: 'No stages are scheduled tomorrow.',
    },
  ]

  return (
    <section className="relative z-20 overflow-hidden border-y border-slate-200 bg-white py-8 text-slate-900 shadow-sm">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <img
          src={BACKGROUND_IMAGE_URL}
          alt=""
          className="h-full w-full object-cover"
          style={{ opacity: 0.23 }}
        />

        <div className="absolute inset-0 bg-white/60" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-2xl font-bold text-slate-950">Race Schedule</h3>

            <p className="mt-1 text-sm text-slate-600">
              Yesterday, today and tomorrow in the ProPeloton world.
            </p>
          </div>

          {loading && (
            <div className="text-sm font-medium text-slate-500">
              Loading races...
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/72 p-4 shadow-sm backdrop-blur-[2px]">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {groups.map((group) => (
              <RaceGroupSection key={group.title} group={group} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}