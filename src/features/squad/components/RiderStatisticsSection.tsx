import React from 'react'
import { useTranslation } from 'react-i18next'

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

function safeCountryCode(countryCode: string | null | undefined) {
  const code = countryCode?.trim().toLowerCase()

  if (!code || !/^[a-z]{2}$/.test(code)) return null

  return code
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
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
  unknownCountryLabel,
}: {
  code: string | null
  countryNameByCode: Map<string, string>
  getCountryName: (code: string | null, countryNameByCode: Map<string, string>) => string
  unknownCountryLabel: string
}) {
  const safeCode = safeCountryCode(code)

  if (!safeCode) {
    return (
      <span
        className="inline-block h-4 w-6 shrink-0 rounded-sm border border-slate-200 bg-slate-100"
        title={unknownCountryLabel}
        aria-label={unknownCountryLabel}
      />
    )
  }

  const displayCode = safeCode.toUpperCase()
  const name = getCountryName(displayCode, countryNameByCode)

  return (
    <img
      src={getCountryFlagUrl(safeCode)}
      alt={name}
      title={name}
      className="h-4 w-6 shrink-0 rounded-sm border border-slate-200 object-cover"
      loading="lazy"
    />
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
  showingLabel,
  previousLabel,
  nextLabel,
}: {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  showingLabel: (start: number, end: number, total: number) => string
  previousLabel: string
  nextLabel: string
}) {
  const totalPages = Math.ceil(totalItems / pageSize)

  if (totalPages <= 1) return null

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="text-sm text-slate-500">
        {showingLabel(start, end, totalItems)}
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
          {previousLabel}
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
          {nextLabel}
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
  topPodiumsRider?: RiderStatsRow
  topJerseysRider?: RiderStatsRow

  ridersPage: number
  setRidersPage: (page: number) => void
  pageSize: number

  openRiderProfile: (rider: RiderStatsRow) => void
  openTeamProfile: (teamId: string) => void

  formatCompetitionLabel: (value: string | null | undefined) => string
  formatRiderMetricLabel: (metric: RiderMetric) => string
  getCountryName: (code: string | null, countryNameByCode: Map<string, string>) => string
  getDisplayedRiderCountryCode: (row: Pick<RiderStatsRow, 'country_code'>) => string | null
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
  topPodiumsRider,
  topJerseysRider,
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
  const { t } = useTranslation('statistics')

  const formatRiderRoleLabel = (role: string) => {
    const normalizedRole = role.trim().toLowerCase().replace(/[\s_-]+/g, '')

    switch (normalizedRole) {
      case 'sprinter':
        return t('roles.sprinter')
      case 'climber':
        return t('roles.climber')
      case 'allrounder':
        return t('roles.allRounder')
      case 'timetrialist':
        return t('roles.timeTrialist')
      case 'domestique':
        return t('roles.domestique')
      case 'rouleur':
        return t('roles.rouleur')
      case 'puncheur':
        return t('roles.puncheur')
      case 'leader':
        return t('roles.leader')
      case 'breakaway':
        return t('roles.breakaway')
      case 'tt':
      case 'timetrial':
        return t('roles.tt')
      default:
        return formatCompetitionLabel(role)
    }
  }

  const translatedRiderRoles = riderRoles.map(item => ({
    ...item,
    label: formatRiderRoleLabel(item.label),
  }))

  return (
    <div className="space-y-6">
      <TextSubTabs
        items={[
          { key: 'rankings', label: t('common.rankings') },
          { key: 'breakdown', label: t('common.breakdown') },
        ]}
        activeKey={riderSubTab}
        onChange={key => setRiderSubTab(key as RiderSubTab)}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('filters.searchRidersTeams')}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />

          <select
            value={teamTypeFilter}
            onChange={e => setTeamTypeFilter(e.target.value as TeamTypeFilter)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">{t('filters.allTeamTypes')}</option>
            <option value="user">{t('filters.userTeams')}</option>
            <option value="ai">{t('filters.aiTeams')}</option>
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">{t('filters.allStatus')}</option>
            <option value="active">{t('filters.fitOnly')}</option>
            <option value="inactive">{t('filters.unavailableOnly')}</option>
          </select>

          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">{t('filters.allTiers')}</option>
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
            <option value="season_points_overall">{t('filters.sortInternational')}</option>
            <option value="season_points_sprint">{t('filters.sortStageFinish')}</option>
            <option value="season_points_climbing">{t('filters.sortGcOneDay')}</option>
          </select>

          <select
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">{t('filters.allCountries')}</option>
            {availableRiderCountries.map(country => (
              <option key={country} value={country}>
                {getCountryName(country, countryNameByCode)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <SectionCard title={t('page.loading')}>
          <div className="text-sm text-slate-500">{t('page.fetching')}</div>
        </SectionCard>
      ) : error ? (
        <SectionCard title={t('page.error')}>
          <div className="text-sm text-rose-600">{error}</div>
        </SectionCard>
      ) : riderSubTab === 'rankings' ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t('riders.mostInternational')}
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
              label={t('riders.mostPodiums')}
              value={
                topPodiumsRider ? (
                  <RiderNameButton onClick={() => openRiderProfile(topPodiumsRider)}>
                    {topPodiumsRider.display_name} ({topPodiumsRider.podiums ?? 0})
                  </RiderNameButton>
                ) : (
                  '—'
                )
              }
            />

            <KpiCard
              label={t('riders.mostJerseys')}
              value={
                topJerseysRider ? (
                  <RiderNameButton onClick={() => openRiderProfile(topJerseysRider)}>
                    {topJerseysRider.display_name} ({topJerseysRider.jerseys ?? 0})
                  </RiderNameButton>
                ) : (
                  '—'
                )
              }
            />

            <KpiCard label={t('riders.ridersInFilter')} value={filteredRiders.length} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title={t('riders.topRiders')}
              subtitle={t('metrics.sortedBy', { metric: formatRiderMetricLabel(riderMetric) })}
            >
              {filteredRiders.length === 0 ? (
                <EmptyState title={t('riders.noRidersFound')} description={t('riders.tryRiderFilters')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">{t('common.rider')}</th>
                        <th className="pb-3 pr-3">{t('common.country')}</th>
                        <th className="pb-3 pr-3">{t('common.role')}</th>
                        <th className="pb-3 pr-3">{t('common.team')}</th>
                        <th className="pb-3 pr-3">{t('common.age')}</th>
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

                          <td className="py-3 pr-3">
                            <CountryFlag
                              code={getDisplayedRiderCountryCode(row)}
                              countryNameByCode={countryNameByCode}
                              getCountryName={getCountryName}
                              unknownCountryLabel={t('common.unknownCountry')}
                            />
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {formatRiderRoleLabel(row.role)}
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
              title={t('riders.roleDistribution')}
              subtitle={t('riders.roleDistributionSubtitle')}
            >
              {riderRoles.length === 0 ? (
                <EmptyState
                  title={t('riders.noRoleData')}
                  description={t('riders.noRoleDescription')}
                />
              ) : (
                <MiniBarList items={translatedRiderRoles} />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title={t('riders.top50')}
            subtitle={t('riders.top50Subtitle')}
            right={
              <select
                value={riderTableMetric}
                onChange={e => setRiderTableMetric(e.target.value as RiderMetric)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="season_points_overall">International points</option>
                <option value="season_points_sprint">Stage finish points</option>
                <option value="season_points_climbing">GC / one-day points</option>
              </select>
            }
          >
            {topRiderTableRows.length === 0 ? (
              <EmptyState
                title={t('riders.noRidersAvailable')}
                description={t('riders.noRidersDescription')}
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">{t('common.rider')}</th>
                        <th className="pb-3 pr-3">{t('common.country')}</th>
                        <th className="pb-3 pr-3">{t('common.role')}</th>
                        <th className="pb-3 pr-3">{t('common.team')}</th>
                        <th className="pb-3 pr-3">{t('common.age')}</th>
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

                          <td className="py-3 pr-3">
                            <CountryFlag
                              code={getDisplayedRiderCountryCode(row)}
                              countryNameByCode={countryNameByCode}
                              getCountryName={getCountryName}
                              unknownCountryLabel={t('common.unknownCountry')}
                            />
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {formatRiderRoleLabel(row.role)}
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

                          <td className="py-3 pr-3 text-slate-600">{row.age_years ?? '—'}</td>

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
                  showingLabel={(start, end, total) => t('common.showing', { start, end, total })}
                  previousLabel={t('common.previous')}
                  nextLabel={t('common.next')}
                />
              </>
            )}
          </SectionCard>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t('riders.averageOverall')}
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
              label={t('riders.averageFatigue')}
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
              label={t('riders.totalMarketValue')}
              value={moneyFormatter.format(filteredRiders.reduce((sum, row) => sum + (row.market_value ?? 0), 0))}
            />

            <KpiCard
              label={t('riders.averageSalary')}
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
              title={t('riders.ageDistribution')}
              subtitle={t('riders.ageDistributionSubtitle')}
            >
              {riderAgeBuckets.every(item => item.value === 0) ? (
                <EmptyState
                  title={t('riders.noAgeBreakdown')}
                  description={t('riders.noAgeDescription')}
                />
              ) : (
                <MiniBarList items={riderAgeBuckets} />
              )}
            </SectionCard>

            <SectionCard
              title={t('riders.topValueSalary')}
              subtitle={t('riders.topValueSalarySubtitle')}
            >
              {filteredRiders.length === 0 ? (
                <EmptyState
                  title={t('riders.noFinanceData')}
                  description={t('riders.noFinanceDescription')}
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
