import React from 'react'

type TeamSubTab = 'current' | 'history'
type TeamTypeFilter = 'all' | 'user' | 'ai'
type StatusFilter = 'all' | 'active' | 'inactive'

type TeamCurrentRow = {
  id: string
  name: string
  country_code: string | null
  club_tier: string
  tier2_division: string | null
  tier3_division: string | null
  amateur_division: string | null
  season_points: number | null
  is_ai: boolean
  is_active: boolean
}

type TeamWinnerRow = {
  id: string
  season_number: number
  division: string
  club_id: string
  club_name: string
  country_code: string
  points: number | null
}

type TeamSnapshotRow = {
  id: string
  season_number: number
  division: string
  club_id: string
  club_name: string
  country_code: string
  club_tier: string
  tier2_division: string | null
  tier3_division: string | null
  amateur_division: string | null
  points: number | null
  final_position: number
  is_ai: boolean
  is_active: boolean
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
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
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
    <img
      src={`https://flagcdn.com/24x18/${code.toLowerCase()}.png`}
      alt={name}
      title={name}
      className="h-3.5 w-[18px] shrink-0 rounded-[2px] border border-slate-200 object-cover"
      loading="lazy"
    />
  )
}

function TypeBadge({ isAi }: { isAi: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        isAi ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
      )}
    >
      {isAi ? 'AI' : 'User'}
    </span>
  )
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        isActive ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'
      )}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
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
  teamSubTab: TeamSubTab
  setTeamSubTab: (value: TeamSubTab) => void

  loading: boolean
  error: string | null

  search: string
  setSearch: (value: string) => void

  seasonFilter: string
  setSeasonFilter: (value: string) => void

  teamTypeFilter: TeamTypeFilter
  setTeamTypeFilter: (value: TeamTypeFilter) => void

  statusFilter: StatusFilter
  setStatusFilter: (value: StatusFilter) => void

  tierFilter: string
  setTierFilter: (value: string) => void

  divisionFilter: string
  setDivisionFilter: (value: string) => void

  countryFilter: string
  setCountryFilter: (value: string) => void

  availableSeasons: number[]
  availableTiers: string[]
  availableDivisions: string[]
  availableTeamCountries: string[]
  availableHistoryCountries: string[]
  countryNameByCode: Map<string, string>

  filteredTeamCurrent: TeamCurrentRow[]
  filteredWinners: TeamWinnerRow[]
  filteredSnapshots: TeamSnapshotRow[]
  paginatedTeamCurrent: TeamCurrentRow[]
  paginatedTeamHistory: TeamSnapshotRow[]

  teamsByCountry: Array<{ label: string; value: number }>
  teamTitles: Array<{ club_name: string; country_code: string; titles: number }>

  topCurrentTeam?: TeamCurrentRow
  latestWinner?: TeamWinnerRow

  teamCurrentPage: number
  setTeamCurrentPage: (page: number) => void
  teamHistoryPage: number
  setTeamHistoryPage: (page: number) => void
  pageSize: number

  openTeamProfile: (teamId: string) => void

  formatCompetitionLabel: (value: string | null | undefined) => string
  getDivisionLabel: (team: TeamCurrentRow | TeamSnapshotRow) => string
  getCountryName: (code: string | null, countryNameByCode: Map<string, string>) => string
}

export default function TeamStatisticsSection({
  teamSubTab,
  setTeamSubTab,
  loading,
  error,
  search,
  setSearch,
  seasonFilter,
  setSeasonFilter,
  teamTypeFilter,
  setTeamTypeFilter,
  statusFilter,
  setStatusFilter,
  tierFilter,
  setTierFilter,
  divisionFilter,
  setDivisionFilter,
  countryFilter,
  setCountryFilter,
  availableSeasons,
  availableTiers,
  availableDivisions,
  availableTeamCountries,
  availableHistoryCountries,
  countryNameByCode,
  filteredTeamCurrent,
  filteredWinners,
  filteredSnapshots,
  paginatedTeamCurrent,
  paginatedTeamHistory,
  teamsByCountry,
  teamTitles,
  topCurrentTeam,
  latestWinner,
  teamCurrentPage,
  setTeamCurrentPage,
  teamHistoryPage,
  setTeamHistoryPage,
  pageSize,
  openTeamProfile,
  formatCompetitionLabel,
  getDivisionLabel,
  getCountryName,
}: Props) {
  return (
    <div className="space-y-6">
      <TextSubTabs
        items={[
          { key: 'current', label: 'Current' },
          { key: 'history', label: 'History' },
        ]}
        activeKey={teamSubTab}
        onChange={key => setTeamSubTab(key as TeamSubTab)}
      />

      {teamSubTab === 'current' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teams..."
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
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
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
              value={divisionFilter}
              onChange={e => setDivisionFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All divisions</option>
              {availableDivisions.map(division => (
                <option key={division} value={division}>
                  {formatCompetitionLabel(division)}
                </option>
              ))}
            </select>

            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All countries</option>
              {availableTeamCountries.map(country => (
                <option key={country} value={country}>
                  {getCountryName(country, countryNameByCode)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teams..."
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />

            <select
              value={seasonFilter}
              onChange={e => setSeasonFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All seasons</option>
              {availableSeasons.map(season => (
                <option key={season} value={season}>
                  Season {season}
                </option>
              ))}
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
              value={divisionFilter}
              onChange={e => setDivisionFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All divisions</option>
              {availableDivisions.map(division => (
                <option key={division} value={division}>
                  {formatCompetitionLabel(division)}
                </option>
              ))}
            </select>

            <select
              value={countryFilter}
              onChange={e => setCountryFilter(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All countries</option>
              {availableHistoryCountries.map(country => (
                <option key={country} value={country}>
                  {getCountryName(country, countryNameByCode)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <SectionCard title="Loading statistics">
          <div className="text-sm text-slate-500">Fetching data...</div>
        </SectionCard>
      ) : error ? (
        <SectionCard title="Statistics error">
          <div className="text-sm text-rose-600">{error}</div>
        </SectionCard>
      ) : teamSubTab === 'current' ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Teams in filter" value={filteredTeamCurrent.length} />
            <KpiCard label="User teams" value={filteredTeamCurrent.filter(row => !row.is_ai).length} />
            <KpiCard label="AI teams" value={filteredTeamCurrent.filter(row => row.is_ai).length} />
            <KpiCard
              label="Current leader"
              value={
                topCurrentTeam ? (
                  <TeamNameButton onClick={() => openTeamProfile(topCurrentTeam.id)}>
                    {topCurrentTeam.name}
                  </TeamNameButton>
                ) : (
                  '—'
                )
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard title="Current leaderboard" subtitle="Best teams in the selected filter.">
              {filteredTeamCurrent.length === 0 ? (
                <EmptyState
                  title="No teams found"
                  description="Try changing the filters or search term."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">#</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Tier / Division</th>
                        <th className="pb-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeamCurrent.slice(0, 10).map((row, index) => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3 font-medium text-slate-900">{index + 1}</td>

                          <td className="py-3 pr-3">
                            <TeamNameButton onClick={() => openTeamProfile(row.id)}>
                              {row.name}
                            </TeamNameButton>
                          </td>

                          <td className="py-3 pr-3">
                            <CountryFlag
                              code={row.country_code}
                              countryNameByCode={countryNameByCode}
                              getCountryName={getCountryName}
                            />
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {formatCompetitionLabel(row.club_tier)} / {getDivisionLabel(row)}
                          </td>

                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.season_points ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Country spread"
              subtitle="How many teams appear per country in the current filter."
            >
              {teamsByCountry.length === 0 ? (
                <EmptyState
                  title="No country spread yet"
                  description="Country distribution will appear once current team data is available."
                />
              ) : (
                <MiniBarList items={teamsByCountry} />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="All current teams"
            subtitle="Full current standings dataset for the selected filters."
          >
            {filteredTeamCurrent.length === 0 ? (
              <EmptyState
                title="No current teams"
                description="No teams match the selected filters."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Tier</th>
                        <th className="pb-3 pr-3">Division</th>
                        <th className="pb-3 pr-3">Type</th>
                        <th className="pb-3 pr-3">Status</th>
                        <th className="pb-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTeamCurrent.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3">
                            <TeamNameButton onClick={() => openTeamProfile(row.id)}>
                              {row.name}
                            </TeamNameButton>
                          </td>

                          <td className="py-3 pr-3">
                            <CountryFlag
                              code={row.country_code}
                              countryNameByCode={countryNameByCode}
                              getCountryName={getCountryName}
                            />
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {formatCompetitionLabel(row.club_tier)}
                          </td>

                          <td className="py-3 pr-3 text-slate-600">{getDivisionLabel(row)}</td>
                          <td className="py-3 pr-3">
                            <TypeBadge isAi={row.is_ai} />
                          </td>
                          <td className="py-3 pr-3">
                            <StatusBadge isActive={row.is_active} />
                          </td>

                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.season_points ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={teamCurrentPage}
                  totalItems={filteredTeamCurrent.length}
                  pageSize={pageSize}
                  onPageChange={setTeamCurrentPage}
                />
              </>
            )}
          </SectionCard>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Seasons recorded" value={availableSeasons.length} />
            <KpiCard label="Past winner rows" value={filteredWinners.length} />
            <KpiCard
              label="Most titles"
              value={teamTitles[0] ? `${teamTitles[0].club_name} (${teamTitles[0].titles})` : '—'}
            />
            <KpiCard
              label="Latest winner"
              value={
                latestWinner ? (
                  <TeamNameButton onClick={() => openTeamProfile(latestWinner.club_id)}>
                    {latestWinner.club_name}
                  </TeamNameButton>
                ) : (
                  '—'
                )
              }
              hint={latestWinner ? `Season ${latestWinner.season_number}` : 'No winners recorded yet'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard title="Past winners" subtitle="Historical champions for completed seasons.">
              {filteredWinners.length === 0 ? (
                <EmptyState
                  title="No past winners yet"
                  description="This is expected if you are still early in the game lifecycle or have not filled history yet."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Season</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Division</th>
                        <th className="pb-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWinners.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3 font-medium text-slate-900">{row.season_number}</td>

                          <td className="py-3 pr-3">
                            <TeamNameButton onClick={() => openTeamProfile(row.club_id)}>
                              {row.club_name}
                            </TeamNameButton>
                          </td>

                          <td className="py-3 pr-3">
                            <CountryFlag
                              code={row.country_code}
                              countryNameByCode={countryNameByCode}
                              getCountryName={getCountryName}
                            />
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {formatCompetitionLabel(row.division)}
                          </td>

                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.points ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Titles leaderboard"
              subtitle="Teams with the most recorded championships."
            >
              {teamTitles.length === 0 ? (
                <EmptyState
                  title="No title leaderboard yet"
                  description="Once past winners are stored, this block will become one of the best parts of the page."
                />
              ) : (
                <MiniBarList
                  items={teamTitles.map(item => ({
                    label: `${item.club_name} (${getCountryName(item.country_code, countryNameByCode)})`,
                    value: item.titles,
                  }))}
                />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Historical finishes"
            subtitle="Season-by-season finishing positions across divisions."
          >
            {filteredSnapshots.length === 0 ? (
              <EmptyState
                title="No season history yet"
                description="Your game is currently in Season 1, so there are no completed historical seasons to show yet."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-3 pr-3">Season</th>
                        <th className="pb-3 pr-3">Pos</th>
                        <th className="pb-3 pr-3">Team</th>
                        <th className="pb-3 pr-3">Country</th>
                        <th className="pb-3 pr-3">Division</th>
                        <th className="pb-3 pr-3">Type</th>
                        <th className="pb-3 pr-3">Status</th>
                        <th className="pb-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTeamHistory.map(row => (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="py-3 pr-3 font-medium text-slate-900">{row.season_number}</td>
                          <td className="py-3 pr-3 font-semibold text-slate-900">{row.final_position}</td>

                          <td className="py-3 pr-3">
                            <TeamNameButton onClick={() => openTeamProfile(row.club_id)}>
                              {row.club_name}
                            </TeamNameButton>
                          </td>

                          <td className="py-3 pr-3">
                            <CountryFlag
                              code={row.country_code}
                              countryNameByCode={countryNameByCode}
                              getCountryName={getCountryName}
                            />
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {formatCompetitionLabel(row.division)}
                          </td>

                          <td className="py-3 pr-3">
                            <TypeBadge isAi={row.is_ai} />
                          </td>

                          <td className="py-3 pr-3">
                            <StatusBadge isActive={row.is_active} />
                          </td>

                          <td className="py-3 text-right font-semibold text-slate-900">
                            {row.points ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={teamHistoryPage}
                  totalItems={filteredSnapshots.length}
                  pageSize={pageSize}
                  onPageChange={setTeamHistoryPage}
                />
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}