/** Cinematic race schedule: real yesterday/today/tomorrow events with filter controls. */
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CalendarDays, ChevronRight, Flag, Mountain } from 'lucide-react'

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
    <div className="group relative flex min-h-[135px] items-center gap-4 overflow-hidden rounded-2xl border border-yellow-400/25 bg-[linear-gradient(130deg,rgba(27,47,74,.96),rgba(10,25,46,.93))] p-4 shadow-[0_12px_34px_rgba(0,0,0,.28)] transition duration-300 hover:-translate-y-1 hover:border-yellow-300/85 hover:shadow-[0_6px_32px_rgba(250,204,21,.19)] sm:p-5">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/70 to-transparent" aria-hidden="true" />
      <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-yellow-400/25 bg-[radial-gradient(circle_at_30%_20%,rgba(250,204,21,.28),rgba(7,18,34,.65)_70%)] text-yellow-300" aria-hidden="true">
        <Mountain size={37} strokeWidth={1.4} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {flag && <img src={flag} alt="" className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover" loading="lazy" />}
          <span className="line-clamp-2 text-base font-extrabold leading-5 text-white group-hover:text-yellow-100">{item.title}</span>
        </span>
        <span className="mt-2 block text-sm text-white/70">{item.subtitle}</span>
        <span className="mt-2 block text-xs font-bold text-yellow-300">{item.dateLabel || item.timeLabel}</span>
      </span>
      {href && <ChevronRight size={20} className="shrink-0 text-yellow-300 transition-transform group-hover:translate-x-1" aria-hidden="true" />}
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
    <section className="relative z-20 overflow-hidden border-y border-yellow-400/20 bg-[#071426] py-12 text-white sm:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_0%,rgba(250,204,21,.10),transparent_58%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1510px] px-6 sm:px-10 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <CalendarDays size={27} className="text-yellow-400" aria-hidden="true" />
              <h2 className="text-3xl font-black italic tracking-tight text-white sm:text-4xl">{t('raceSchedule.title')}</h2>
              <span className="hidden h-px w-24 bg-gradient-to-r from-yellow-400 to-transparent sm:block" />
            </div>
            <p className="mt-2 text-sm text-slate-300 sm:text-base">{t('raceSchedule.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('raceSchedule.title')}>
            {filters.map(item => (
              <button key={item.id} type="button" onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 ${filter === item.id ? 'border-yellow-300 bg-yellow-400 text-[#081224] shadow-[0_0_20px_rgba(250,204,21,.24)]' : 'border-white/25 bg-white/5 text-slate-100 hover:border-yellow-300/60 hover:bg-white/10'}`}>
                {item.label}
              </button>
            ))}
            <Link to="/dashboard/calendar" className="ml-0 inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-yellow-300/60 hover:bg-white/10 sm:ml-2">
              <CalendarDays size={17} aria-hidden="true" />{t('raceSchedule.fullCalendar')}<ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
        {loading && <p className="mt-5 text-sm text-yellow-200">{t('raceSchedule.loading')}</p>}
        <div className={`mt-7 grid gap-5 ${filter === 'all' ? 'lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
          {groups.filter(group => filter === 'all' || group.key === filter).map(group => (
            <div key={group.key} className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-yellow-300">
                  <Flag size={16} aria-hidden="true" />{group.label}
                </h3>
                <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs font-bold text-slate-200">{group.items.length}</span>
              </div>
              <div className="space-y-3">
                {group.items.length ? group.items.slice(0, filter === 'all' ? 3 : 10).map(item => <RaceCard key={item.id} item={item} />) : (
                  <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-5 py-8 text-sm text-slate-300">{group.empty}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
