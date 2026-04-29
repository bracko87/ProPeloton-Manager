import React from 'react'

type RiderSubTab = 'rankings' | 'breakdown'
type TeamTypeFilter = 'all' | 'user' | 'ai'
type StatusFilter = 'all' | 'active' | 'inactive'
type RiderMetric =
  | 'season_points_overall'
  | 'season_points_sprint'
  | 'season_points_climbing'

export type RiderStatsRow = {
  id: string
  display_name: string
  country_code: string | null
  club_country_code: string | null
  role: string
  overall: number | null
  market_value: number | null
  salary: number | null
  fatigue: number | null
  club_id: string | null
  club_name: string | null
  club_tier: string | null
  club_is_ai: boolean | null
  age_years: number | null
  availability_status: string | null
  season_points_overall: number
  season_points_sprint: number
  season_points_climbing: number
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function KpiCard({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold leading-tight text-slate-900">{value}</div>
    </div>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{description}</div>
    </div>
  )
}

function TextSubTabs({
  items,
  activeKey,
  onChange,
}: {
  items: Array<{ key: string; label: string }>
  activeKey: string
  onChange: (key: string) => void
}) {
  return (
    <div className="border-b border-slate-200">
      <div className="flex flex-wrap gap-6">
        {items.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cx(
              'border-b-2 pb-3 text-sm font-medium transition',
              activeKey === item.key
                ? 'border-yellow-500 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function TeamNameButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-slate-900 hover:text-yellow-700 hover:underline"
    >
      {children}
    </button>
  )
}

function RiderNameButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-slate-900 hover:text-yellow-700 hover:underline"
    >
      {children}
    </button>
  )
}

function CountryFlag({
  code,
  countryNameByCode,
  getCountryName,
}: {
  code: string | null
  countryNameByCode: Map<string, string>
  getCountryName: (code: string | null, countryNameByCode: Map<string, string>) => string
}) {
  if (!code) {
    return <span className="text-slate-400">—</span>
  }

  const name = getCountryName(code, countryNameByCode)

  return (
    <div
      className="inline-flex h-7 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"
      title={name}
    >
      <img
        src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
        alt={name}
        className="h-4 w-6 rounded-[2px] object-cover"
        loading="lazy"
      />
    </div>
  )
}

function MiniBarList({
  items,
}: {
  items: Array<{ label: string; value: number }>
}) {
  const max = Math.max(...items.map(item => item.value), 1)

  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{item.label}</span>
            <span className="font-medium text-slate-900">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-yellow-500"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}: {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.ceil(totalItems / pageSize)

  if (totalPages <= 1) return null

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="text-sm text-slate-500">
        Showing {start}-{end} of {totalItems}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className={cx(
            'rounded-md border px-3 py-1.5 text-sm font-medium transition',
            currentPage === 1
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          )}
        >
          Previous
        </button>

        <div className="text-sm font-medium text-slate-700">
          {currentPage} / {totalPages}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className={cx(
            'rounded-md border px-3 py-1.5 text-sm font-medium transition',
            currentPage === totalPages
              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          )}
        >
          Next
        </button>
      </div>
    </div>
  )
}

type Props = {
  riderSubTab: RiderSubTab
  setRiderSubTab: (value: RiderSubTab) => void

  loading: boolean
  error: string | null

  search: string
  setSearch: (value: string) => void

  teamTypeFilter: TeamTypeFilter
  setTeamTypeFilter: (value: TeamTypeFilter) => void

  statusFilter: StatusFilter
  setStatusFilter: (value: StatusFilter) => void

  tierFilter: string
  setTierFilter: (value: string) => void

  riderMetric: RiderMetric
  setRiderMetric: (value: RiderMetric) => void

  riderTableMetric: RiderMetric
  setRiderTableMetric: (value: RiderMetric) => void

  countryFilter: string
  setCountryFilter: (value: string) => void

  availableTiers: string[]
  availableRiderCountries: string[]
  countryNameByCode: Map<string, string>

  filteredRiders: RiderStatsRow[]
  topRiderTableRows: RiderStatsRow[]
  paginatedRiders: RiderStatsRow[]
  riderRoles: Array<{ label: string; value: number }>
  riderAgeBuckets: Array<{ label: string; value: number }>

  topOverallPointsRider?: RiderStatsRow
  topSprintPointsRider?: RiderStatsRow
  topClimbingPointsRider?: RiderStatsRow

  ridersPage: number
  setRidersPage: (page: number) => void
  pageSize: number

  openRiderProfile: (rider: RiderStatsRow) => void
  openTeamProfile: (teamId: string) => void

  formatCompetitionLabel: (value: string | null | undefined) => string
  formatRiderMetricLabel: (metric: RiderMetric) => string
  getCountryName: (code: string | null, countryNameByCode: Map<string, string>) => string
  getDisplayedRiderCountryCode: (
    row: Pick<RiderStatsRow, 'club_country_code' | 'country_code'>
  ) => string | null
  moneyFormatter: Intl.NumberFormat
}

export default function RiderStatisticsSection({
  riderSubTab,
  setRiderSubTab,
  loading,
  error,
  search,
  setSearch,
  teamTypeFilter,
  setTeamTypeFilter,
  statusFilter,
  setStatusFilter,
  tierFilter,
  setTierFilter,
  riderMetric,
  setRiderMetric,
  riderTableMetric,
  setRiderTableMetric,
  countryFilter,
  setCountryFilter,
  availableTiers,
  availableRiderCountries,
  countryNameByCode,
  filteredRiders,
  topRiderTableRows,
  paginatedRiders,
  riderRoles,
  riderAgeBuckets,
  topOverallPointsRider,
  topSprintPointsRider,
  topClimbingPointsRider,
  ridersPage,
  setRidersPage,
  pageSize,
  openRiderProfile,
  openTeamProfile,
  formatCompetitionLabel,
  formatRiderMetricLabel,
  getCountryName,
  getDisplayedRiderCountryCode,
  moneyFormatter,
}: Props) {
  return (
    <div className="space-y-6">
      <TextSubTabs
        items={[
          { key: 'rankings', label: 'Rankings' },
          { key: 'breakdown', label: 'Breakdown' },
        ]}
        activeKey={riderSubTab}
        onChange={key => setRiderSubTab(key as RiderSubTab)}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search riders or teams..."
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />

          <select
            value={teamTypeFilter}
            onChange={e => setTeamTypeFilter(e.target.value as TeamTypeFilter)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All team types</option>
            <option value="user">User teams</option>
            <option value="ai">AI teams</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All status</option>
            <option value="active">Fit only</option>
            <option value="inactive">Unavailable only</option>
          </select>

          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All tiers</option>
            {availableTiers.map(tier => (
              <option key={tier} value={tier}>
                {formatCompetitionLabel(tier)}
              </option>
            ))}
          </select>

          <select
            value={riderMetric}
            onChange={e => setRiderMetric(e.target.value as RiderMetric)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="season_points_overall">Sort: Overall points</option>
            <option value="season_points_sprint">Sort: Sprinting points</option>
            <option value="season_points_climbing">Sort: Climbing points</option>
          </select>

          <select
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All countries</option>
            {availableRiderCountries.map(country => (
              <option key={country} value={country}>
                {getCountryName(country, countryNameByCode)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <SectionCard title="Loading statistics">
          <div className="text-sm text-slate-500">Fetching data...</div>
        </SectionCard>
      ) : error ? (
        <SectionCard title="Statistics error">
          <div className="text-sm text-rose-600">{error}</div>
        </SectionCard>
      ) : riderSubTab === 'rankings' ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Most overall points"
              value={
                topOverallPointsRider ? (
                  <RiderNameButton onClick={() => openRiderProfile(topOverallPointsRider)}>
                    {topOverallPointsRider.display_name} ({topOverallPointsRider.season_points_overall})
                  </RiderNameButton>
                ) : (
                  '—'
                )
              }
            />

            <KpiCard
              label="Most sprinting points"
              value={
                topSprintPointsRider ? (
                  <RiderNameButton onClick={() => openRiderProfile(topSprintPointsRider)}>
                    {topSprintPointsRider.display_name} ({topSprintPointsRider.season_points_sprint})
                  </RiderNameButton>
                ) : (
                  '—'
                )
              }
            />

            <KpiCard
              label="Most climbing points"
              value={
                topClimbingPointsRider ? (
                  <RiderNameButton onClick={() => openRiderProfile(topClimbingPointsRider)}>
                    {topClimbingPointsRider.display_name} ({topClimbingPointsRider.season_points_climbing})
                  </RiderNameButton>
                ) : (
                  '—'
                )
              }
            />

            <KpiCard label="Riders in filter" value={filteredRiders.length} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title="Top riders"
              subtitle={`Sorted by ${formatRiderMetricLabel(riderMetric).toLowerCase()} points.`}
            >
              {filteredRiders.length === 0 ? (
                <EmptyState title="No riders found" description="Try changing the rider filters." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Rider</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Age</th>
                        <th className="pb-3 text-right">
                          {formatRiderMetricLabel(riderMetric)} points
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRiders.slice(0, 12).map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <RiderNameButton onClick={() => openRiderProfile(row)}>
                              {row.display_name}
                            </RiderNameButton>
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {row.club_id && row.club_name ? (
                              <TeamNameButton onClick={() => openTeamProfile(row.club_id)}>
                                {row.club_name}
                              </TeamNameButton>
                            ) : (
                              '—'
                            )}
                          </td>

                          <td className="py-3 pr-3">
                            <CountryFlag
                              code={getDisplayedRiderCountryCode(row)}
                              countryNameByCode={countryNameByCode}
                              getCountryName={getCountryName}
                            />
                          </td>

                          <td className="py-3 pr-3 text-slate-600">{row.age_years ?? '—'}</td>

                          <td className="py-3 text-right font-semibold text-slate-900">
                            {Number(row[riderMetric] ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Role distribution"
              subtitle="How riders are spread across roles in the selected filter."
            >
              {riderRoles.length === 0 ? (
                <EmptyState
                  title="No role data"
                  description="Role breakdown appears once rider data is available."
                />
              ) : (
                <MiniBarList items={riderRoles} />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Top 50 riders"
            subtitle="Best available riders in the current filter."
            right={
              <select
                value={riderTableMetric}
                onChange={e => setRiderTableMetric(e.target.value as RiderMetric)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="season_points_overall">Overall points</option>
                <option value="season_points_sprint">Sprinting points</option>
                <option value="season_points_climbing">Climbing points</option>
              </select>
            }
          >
            {topRiderTableRows.length === 0 ? (
              <EmptyState
                title="No riders available"
                description="No riders match the selected filters."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Rider</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Age</th>
                        <th className="pb-3 pr-3">Role</th>
                        <th className="pb-3 text-right">
                          {formatRiderMetricLabel(riderTableMetric)} points
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRiders.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <RiderNameButton onClick={() => openRiderProfile(row)}>
                              {row.display_name}
                            </RiderNameButton>
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {row.club_id && row.club_name ? (
                              <TeamNameButton onClick={() => openTeamProfile(row.club_id)}>
                                {row.club_name}
                              </TeamNameButton>
                            ) : (
                              '—'
                            )}
                          </td>

                          <td className="py-3 pr-3">
                            <CountryFlag
                              code={getDisplayedRiderCountryCode(row)}
                              countryNameByCode={countryNameByCode}
                              getCountryName={getCountryName}
                            />
                          </td>

                          <td className="py-3 pr-3 text-slate-600">{row.age_years ?? '—'}</td>
                          <td className="py-3 pr-3 text-slate-600">
                            {formatCompetitionLabel(row.role)}
                          </td>

                          <td className="py-3 text-right font-semibold text-slate-900">
                            {Number(row[riderTableMetric] ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={ridersPage}
                  totalItems={topRiderTableRows.length}
                  pageSize={pageSize}
                  onPageChange={setRidersPage}
                />
              </>
            )}
          </SectionCard>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Average overall"
              value={
                filteredRiders.length
                  ? (
                      filteredRiders.reduce((sum, row) => sum + (row.overall ?? 0), 0) /
                      filteredRiders.length
                    ).toFixed(1)
                  : '—'
              }
            />

            <KpiCard
              label="Average fatigue"
              value={
                filteredRiders.length
                  ? (
                      filteredRiders.reduce((sum, row) => sum + (row.fatigue ?? 0), 0) /
                      filteredRiders.length
                    ).toFixed(1)
                  : '—'
              }
            />

            <KpiCard
              label="Total market value"
              value={moneyFormatter.format(filteredRiders.reduce((sum, row) => sum + (row.market_value ?? 0), 0))}
            />

            <KpiCard
              label="Average salary"
              value={
                filteredRiders.length
                  ? moneyFormatter.format(
                      Math.round(
                        filteredRiders.reduce((sum, row) => sum + (row.salary ?? 0), 0) /
                          filteredRiders.length
                      )
                    )
                  : '—'
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title="Age distribution"
              subtitle="Quick way to see how balanced the rider pool is."
            >
              {riderAgeBuckets.every(item => item.value === 0) ? (
                <EmptyState
                  title="No age breakdown"
                  description="Age buckets will appear once riders are loaded."
                />
              ) : (
                <MiniBarList items={riderAgeBuckets} />
              )}
            </SectionCard>

            <SectionCard
              title="Top value / salary riders"
              subtitle="Useful when you later want contract and transfer-related stats here."
            >
              {filteredRiders.length === 0 ? (
                <EmptyState
                  title="No rider finance data"
                  description="This area can later become value, wages, and contract expiry summaries."
                />
              ) : (
                <div className="space-y-3">
                  {[...filteredRiders]
                    .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
                    .slice(0, 6)
                    .map(row => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3"
                      >
                        <div>
                          <div>
                            <RiderNameButton onClick={() => openRiderProfile(row)}>
                              {row.display_name}
                            </RiderNameButton>
                          </div>

                          <div className="mt-1 text-sm text-slate-500">
                            {row.club_id && row.club_name ? (
                              <TeamNameButton onClick={() => openTeamProfile(row.club_id)}>
                                {row.club_name}
                              </TeamNameButton>
                            ) : (
                              '—'
                            )}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-semibold text-slate-900">
                            {moneyFormatter.format(row.market_value ?? 0)}
                          </div>
                          <div className="text-xs text-slate-500">
                            Salary: {moneyFormatter.format(row.salary ?? 0)}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}