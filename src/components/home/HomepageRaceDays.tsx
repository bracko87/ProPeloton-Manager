/** Cinematic race schedule: real yesterday/today/tomorrow events with filter controls. */
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CalendarDays, ChevronRight, Mountain } from 'lucide-react'

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
const BACKGROUND_IMAGE_URL = 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Brend%20images/ChatGPT%20Image%20Mar%201,%202026,%2008_26_26%20PM.png'
type DayFilter = 'all' | 'yesterday' | 'today' | 'tomorrow'
type DayGroup = {
  key: Exclude<DayFilter, 'all'>
  label: string
  empty: string
  items: HomepageRaceDayItem[]
}
function normalizedHref(href?: string): string | null {
  if (!href) return null
  return href.startsWith('#/') || href.startsWith('/') ? href : `/${href}`
}
function flagUrl(countryCode?: string | null): string | null {
  const code = (countryCode || '').trim().toLowerCase()
  return /^[a-z]{2}$/.test(code) ? `https://flagcdn.com/w40/${code}.png` : null
}
function RaceCard({ item }: { item: HomepageRaceDayItem }): JSX.Element {
  const href = normalizedHref(item.href)
  const flag = flagUrl(item.countryCode)
  const content = (
    <div className="group relative flex min-h-[135px] items-center gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-yellow-400/70 hover:shadow-lg sm:p-5">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-400/40 to-transparent" aria-hidden="true" />
      <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-yellow-400/30 bg-amber-50 text-amber-600" aria-hidden="true">
        <Mountain size={37} strokeWidth={1.4} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {flag && <img src={flag} alt="" className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover" loading="lazy" />}
          <span className="line-clamp-2 text-base font-semibold leading-5 text-slate-950 group-hover:text-amber-700">{item.title}</span>
        </span>
        <span className="mt-2 block text-sm text-slate-600">{item.subtitle}</span>
        <span className="mt-2 block text-xs font-medium text-amber-700">{item.dateLabel || item.timeLabel}</span>
      </span>
      {href && <ChevronRight size={20} className="shrink-0 text-amber-600 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
    </div>
  )
  return href ? <Link to={href} className="block min-w-0">{content}</Link> : <div className="min-w-0">{content}</div>
}
export default function HomepageRaceDays({ data, loading = false }: {
  data: HomepageRaceDaysData | null
  loading?: boolean
}): JSX.Element {
  const { t } = useTranslation('home')
  const [filter, setFilter] = useState<DayFilter>('all')
  const groups: DayGroup[] = [
    { key: 'yesterday', label: t('raceSchedule.yesterday'), empty: t('raceSchedule.emptyYesterday'), items: data?.yesterdayRaces || [] },
    { key: 'today', label: t('raceSchedule.today'), empty: t('raceSchedule.emptyToday'), items: data?.todayRaces || [] },
    { key: 'tomorrow', label: t('raceSchedule.tomorrow'), empty: t('raceSchedule.emptyTomorrow'), items: data?.tomorrowRaces || [] },
  ]
  const filters: Array<{ id: DayFilter; label: string }> = [
    { id: 'all', label: t('raceSchedule.allRaces') },
    ...groups.map(group => ({ id: group.key, label: group.label })),
  ]
  return (
    <section className="relative z-20 overflow-hidden border-y border-slate-200 bg-white py-10 text-slate-900 shadow-sm sm:py-12">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <img src={BACKGROUND_IMAGE_URL} alt="" className="h-full w-full object-cover opacity-[.11]" />
        <div className="absolute inset-0 bg-white/80" />
      </div>
      <div className="relative mx-auto max-w-[1510px] px-6 sm:px-10 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{t('raceSchedule.title')}</h2>
              <span className="hidden h-px w-24 bg-gradient-to-r from-amber-400 to-transparent sm:block" />
            </div>
            <p className="mt-2 text-sm text-slate-600 sm:text-base">{t('raceSchedule.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('raceSchedule.title')}>
            {filters.map(item => (
              <button key={item.id} type="button" onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 ${filter === item.id ? 'border-yellow-400 bg-yellow-400 text-slate-950 shadow-sm' : 'border-slate-300 bg-white/90 text-slate-700 hover:border-amber-400 hover:bg-amber-50'}`}>
                {item.label}
              </button>
            ))}
            <Link to="/dashboard/calendar" className="ml-0 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-amber-400 hover:bg-amber-50 sm:ml-2">
              <CalendarDays size={17} aria-hidden="true" />{t('raceSchedule.fullCalendar')}<ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
        {loading && <p className="mt-5 text-sm text-amber-700">{t('raceSchedule.loading')}</p>}
        <div className={`mt-7 grid gap-5 ${filter === 'all' ? 'lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
          {groups.filter(group => filter === 'all' || group.key === filter).map(group => (
            <div key={group.key} className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-700">
                  {group.label}
                </h3>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{group.items.length}</span>
              </div>
              <div className="space-y-3">
                {group.items.length ? group.items.slice(0, filter === 'all' ? 3 : 10).map(item => <RaceCard key={item.id} item={item} />) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 px-5 py-8 text-sm text-slate-600">{group.empty}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
