import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CalendarDays,
  Globe2,
  MonitorSmartphone,
  MousePointerClick,
  RefreshCw,
  Route,
  Sessions,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../../lib/supabase'

type PeriodDays = 7 | 30 | 90 | 365 | 0

type Summary = {
  unique_visitors: number
  pageviews: number
  sessions: number
  registered_active_users: number
  anonymous_visitors: number
  new_registrations: number
  total_registered_accounts: number
  dau: number
  wau: number
  mau: number
}

type DailyRow = {
  date: string
  unique_visitors: number
  pageviews: number
  sessions: number
  active_registered_users: number
  new_registrations: number
}

type CountryRow = {
  country_code: string
  country_name: string
  unique_visitors: number
  pageviews: number
}

type PageRow = {
  path: string
  pageviews: number
  unique_visitors: number
}

type DeviceRow = {
  device_type: 'desktop' | 'tablet' | 'mobile' | string
  visitors: number
  pageviews: number
}

type TrafficSourceRow = {
  referrer_host: string
  sessions: number
  unique_visitors: number
}

type AnalyticsDashboard = {
  timezone: string
  start_date: string
  end_date: string
  days: number
  summary: Summary
  daily: DailyRow[]
  countries: CountryRow[]
  top_pages: PageRow[]
  devices: DeviceRow[]
  traffic_sources: TrafficSourceRow[]
}

const PERIODS: Array<{ value: PeriodDays; label: string }> = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 3 months' },
  { value: 365, label: 'Last 12 months' },
  { value: 0, label: 'All time' },
]

const integer = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

function formatNumber(value: number | null | undefined): string {
  return integer.format(Number(value ?? 0))
}

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: number
  subtitle?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            {title}
          </div>
          <div className="mt-2 text-3xl font-extrabold text-gray-950">
            {formatNumber(value)}
          </div>
          {subtitle ? (
            <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
          ) : null}
        </div>

        <div className="rounded-xl bg-yellow-100 p-2.5 text-yellow-800">
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <div className="border-b border-black/5 px-5 py-4">
        <h2 className="text-base font-extrabold text-gray-950">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
      {children}
    </div>
  )
}

export default function AdminAnalyticsPage(): JSX.Element {
  const [period, setPeriod] = useState<PeriodDays>(30)
  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        'get_admin_analytics_dashboard_v1',
        { p_days: period },
      )

      if (rpcError) throw rpcError
      setData((result ?? null) as AnalyticsDashboard | null)
    } catch (loadError: any) {
      console.error('Failed to load admin analytics:', loadError)
      setData(null)
      setError(
        loadError?.message ??
          'The analytics dashboard could not be loaded.',
      )
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map(row => ({
        ...row,
        label: shortDate(row.date),
      })),
    [data?.daily],
  )

  const summary = data?.summary

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-700">
            Administration
          </div>
          <h1 className="mt-1 text-3xl font-extrabold text-gray-950">
            Website & Game Analytics
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
            Private first-party analytics for the production site. Visitor IDs
            are random browser identifiers; no raw IP address or precise
            location is stored.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-sm font-semibold text-gray-700">
            Reporting period
          </label>
          <select
            value={period}
            onChange={event =>
              setPeriod(Number(event.target.value) as PeriodDays)
            }
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm outline-none focus:border-yellow-500"
          >
            {PERIODS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </div>
      </div>

      {data ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          Reporting {data.start_date} → {data.end_date} · {data.timezone} day
          boundaries
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="rounded-2xl border border-black/10 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Loading analytics…
        </div>
      ) : data && summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              title="Unique Visitors"
              value={summary.unique_visitors}
              icon={Users}
            />
            <SummaryCard
              title="Pageviews"
              value={summary.pageviews}
              icon={MousePointerClick}
            />
            <SummaryCard
              title="Sessions"
              value={summary.sessions}
              icon={Activity}
            />
            <SummaryCard
              title="Active Registered Users"
              value={summary.registered_active_users}
              icon={Users}
            />
            <SummaryCard
              title="New Registrations"
              value={summary.new_registrations}
              icon={UserPlus}
            />
            <SummaryCard
              title="Total Registered Accounts"
              value={summary.total_registered_accounts}
              icon={Users}
            />
            <SummaryCard
              title="DAU"
              value={summary.dau}
              subtitle="Registered users active today"
              icon={CalendarDays}
            />
            <SummaryCard
              title="WAU"
              value={summary.wau}
              subtitle="Registered users active in 7 days"
              icon={CalendarDays}
            />
            <SummaryCard
              title="MAU"
              value={summary.mau}
              subtitle="Registered users active in 30 days"
              icon={CalendarDays}
            />
            <SummaryCard
              title="Anonymous Visitors"
              value={summary.anonymous_visitors}
              icon={Globe2}
            />
          </div>

          <SectionCard
            title="Daily Traffic"
            subtitle="Unique visitors, registered active users and new registrations"
          >
            {chartData.length === 0 ? (
              <EmptyState>No daily analytics yet.</EmptyState>
            ) : (
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 18, bottom: 10, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      minTickGap={24}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      labelFormatter={(_label, payload) =>
                        payload?.[0]?.payload?.date ?? _label
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="unique_visitors"
                      name="Unique visitors"
                      stroke="#111827"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="active_registered_users"
                      name="Registered active users"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="new_registrations"
                      name="New registrations"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="Visitors by Country">
              {(data.countries ?? []).length === 0 ? (
                <EmptyState>No country data yet.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="pb-3 font-semibold">Country</th>
                        <th className="pb-3 text-right font-semibold">Visitors</th>
                        <th className="pb-3 text-right font-semibold">Pageviews</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.countries.map(row => (
                        <tr
                          key={row.country_code}
                          className="border-t border-black/5"
                        >
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              {row.country_code !== 'XX' ? (
                                <img
                                  src={`https://flagcdn.com/24x18/${row.country_code.toLowerCase()}.png`}
                                  alt=""
                                  className="h-[18px] w-6 rounded-sm object-cover"
                                />
                              ) : (
                                <span className="inline-flex h-[18px] w-6 items-center justify-center rounded-sm bg-gray-100 text-[9px] text-gray-500">
                                  ?
                                </span>
                              )}
                              <span className="font-semibold text-gray-900">
                                {row.country_name}
                              </span>
                              <span className="text-xs text-gray-400">
                                {row.country_code}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-right font-semibold">
                            {formatNumber(row.unique_visitors)}
                          </td>
                          <td className="py-3 text-right text-gray-600">
                            {formatNumber(row.pageviews)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Devices">
              {(data.devices ?? []).length === 0 ? (
                <EmptyState>No device data yet.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {data.devices.map(row => {
                    const total = Math.max(summary.unique_visitors, 1)
                    const percent = Math.min(
                      100,
                      Math.round((row.visitors / total) * 100),
                    )

                    return (
                      <div
                        key={row.device_type}
                        className="rounded-xl border border-black/5 bg-gray-50 p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 font-semibold capitalize text-gray-900">
                            <MonitorSmartphone size={17} />
                            {row.device_type}
                          </div>
                          <div className="text-right text-sm">
                            <span className="font-bold">
                              {formatNumber(row.visitors)}
                            </span>{' '}
                            visitors · {formatNumber(row.pageviews)} views
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-yellow-400"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="Most Visited Pages">
              {(data.top_pages ?? []).length === 0 ? (
                <EmptyState>No page data yet.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="pb-3 font-semibold">Path</th>
                        <th className="pb-3 text-right font-semibold">Pageviews</th>
                        <th className="pb-3 text-right font-semibold">Visitors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_pages.map(row => (
                        <tr
                          key={row.path}
                          className="border-t border-black/5"
                        >
                          <td className="max-w-[360px] py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <Route size={15} className="shrink-0 text-gray-400" />
                              <span className="truncate font-medium text-gray-900">
                                {row.path}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-right font-semibold">
                            {formatNumber(row.pageviews)}
                          </td>
                          <td className="py-3 text-right text-gray-600">
                            {formatNumber(row.unique_visitors)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Traffic Sources">
              {(data.traffic_sources ?? []).length === 0 ? (
                <EmptyState>No traffic source data yet.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="pb-3 font-semibold">Source</th>
                        <th className="pb-3 text-right font-semibold">Sessions</th>
                        <th className="pb-3 text-right font-semibold">Visitors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.traffic_sources.map(row => (
                        <tr
                          key={row.referrer_host}
                          className="border-t border-black/5"
                        >
                          <td className="py-3 font-semibold text-gray-900">
                            {row.referrer_host}
                          </td>
                          <td className="py-3 text-right font-semibold">
                            {formatNumber(row.sessions)}
                          </td>
                          <td className="py-3 text-right text-gray-600">
                            {formatNumber(row.unique_visitors)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      ) : null}
    </div>
  )
}
