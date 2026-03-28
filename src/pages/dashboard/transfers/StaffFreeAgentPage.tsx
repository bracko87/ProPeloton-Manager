import React from 'react'

type StaffRole =
  | 'head_coach'
  | 'team_doctor'
  | 'mechanic'
  | 'sport_director'
  | 'scout_analyst'

type StaffSortField = 'salary' | 'skills' | 'name' | 'country'
type SortDirection = 'asc' | 'desc'

type StaffCandidateRow = {
  id: string
  role_type: StaffRole
  specialization: string | null
  staff_name: string
  country_code: string | null
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  loyalty: number
  salary_weekly: number
  is_available: boolean
}

type ClubStaffRow = {
  id: string
  role_type: StaffRole
  staff_name: string
  salary_weekly: number
  contract_expires_at: string | null
  is_active: boolean
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return `$${Number(value).toLocaleString('de-DE')}`
}

function safeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode || countryCode.length !== 2) return 'rs'
  return countryCode.toLowerCase()
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function getCountryName(countryCode: string | null | undefined) {
  const code = safeCountryCode(countryCode).toUpperCase()

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined') {
      const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
      return regionNames.of(code) || code
    }
  } catch {
    return code
  }

  return code
}

function roleLabel(role: StaffRole) {
  switch (role) {
    case 'head_coach':
      return 'Head Coach'
    case 'team_doctor':
      return 'Team Doctor'
    case 'mechanic':
      return 'Mechanic'
    case 'sport_director':
      return 'Sport Director'
    case 'scout_analyst':
      return 'Scout / Analyst'
    default:
      return role
  }
}

function getCandidateStats(candidate: StaffCandidateRow) {
  if (candidate.role_type === 'head_coach') {
    return [
      { label: 'Training', value: candidate.expertise },
      { label: 'Recovery Plan', value: candidate.efficiency },
      { label: 'Youth Dev', value: candidate.potential },
    ]
  }

  if (candidate.role_type === 'team_doctor') {
    return [
      { label: 'Recovery', value: candidate.expertise },
      { label: 'Prevention', value: candidate.efficiency },
      { label: 'Diagnosis', value: candidate.experience },
    ]
  }

  if (candidate.role_type === 'mechanic') {
    return [
      { label: 'Setup', value: candidate.expertise },
      { label: 'Reliability', value: candidate.efficiency },
      { label: 'Innovation', value: candidate.potential },
    ]
  }

  if (candidate.role_type === 'sport_director') {
    return [
      { label: 'Tactics', value: candidate.expertise },
      { label: 'Motivation', value: candidate.leadership },
      { label: 'Organization', value: candidate.efficiency },
    ]
  }

  return [
    { label: 'Evaluation', value: candidate.expertise },
    { label: 'Network', value: candidate.experience },
    { label: 'Accuracy', value: candidate.efficiency },
  ]
}

type StaffFreeAgentPageProps = {
  roleFilter: 'all' | StaffRole
  setRoleFilter: (value: 'all' | StaffRole) => void
  sortField: StaffSortField
  setSortField: (value: StaffSortField) => void
  sortDirection: SortDirection
  setSortDirection: (value: SortDirection) => void
  paginatedCandidates: StaffCandidateRow[]
  selectedCandidateId: string | null
  onSelectCandidate: (candidateId: string) => void
  occupiedRoleMap: Map<StaffRole, ClubStaffRow>
  pageStart: number
  pageEnd: number
  totalCandidates: number
  currentPage: number
  totalPages: number
  onPrevPage: () => void
  onNextPage: () => void
  selectedCandidate: StaffCandidateRow | null
  hireLoading: boolean
  onHireCandidate: () => void
}

export default function StaffFreeAgentPage({
  roleFilter,
  setRoleFilter,
  sortField,
  setSortField,
  sortDirection,
  setSortDirection,
  paginatedCandidates,
  selectedCandidateId,
  onSelectCandidate,
  occupiedRoleMap,
  pageStart,
  pageEnd,
  totalCandidates,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  selectedCandidate,
  hireLoading,
  onHireCandidate,
}: StaffFreeAgentPageProps) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h4 className="font-semibold text-gray-900">Available Staff</h4>
            <div className="mt-1 text-sm text-gray-500">
              Browse available staff candidates and hire directly into vacant roles.
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Role Filter
              </label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'all' | StaffRole)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="all">All Roles</option>
                <option value="head_coach">Head Coach</option>
                <option value="team_doctor">Team Doctor</option>
                <option value="mechanic">Mechanic</option>
                <option value="sport_director">Sport Director</option>
                <option value="scout_analyst">Scout / Analyst</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Sort By
              </label>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as StaffSortField)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="salary">Salary</option>
                <option value="skills">Skills</option>
                <option value="name">Name</option>
                <option value="country">Country</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                Direction
              </label>
              <select
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value as SortDirection)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {paginatedCandidates.length === 0 ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
              No available staff candidates found.
            </div>
          ) : (
            paginatedCandidates.map((candidate) => {
              const occupiedRole = occupiedRoleMap.get(candidate.role_type)
              const selected = candidate.id === selectedCandidateId

              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelectCandidate(candidate.id)}
                  className={`w-full rounded-lg border p-4 text-left shadow transition ${
                    selected
                      ? 'border-yellow-300 bg-yellow-50'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <img
                          src={getCountryFlagUrl(safeCountryCode(candidate.country_code))}
                          alt={getCountryName(candidate.country_code)}
                          className="h-4 w-6 shrink-0 rounded-sm border border-gray-200 object-cover"
                        />
                        <div className="text-sm font-semibold text-gray-900">
                          {candidate.staff_name}
                        </div>
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {roleLabel(candidate.role_type)}
                        {candidate.specialization ? ` • ${candidate.specialization}` : ''}
                      </div>
                    </div>

                    <div className="shrink-0 text-sm font-semibold text-gray-700">
                      {formatCurrency(candidate.salary_weekly)}/week
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {getCandidateStats(candidate).map((stat) => (
                      <div key={stat.label} className="rounded-lg bg-gray-50 p-2">
                        <div className="text-[11px] text-gray-500">{stat.label}</div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  {occupiedRole ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Role currently filled by {occupiedRole.staff_name}.
                    </div>
                  ) : null}
                </button>
              )
            })
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-gray-500">
            Showing {pageStart}-{pageEnd} of {totalCandidates} candidates
          </div>

          {totalCandidates > 10 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onPrevPage}
                disabled={currentPage === 1}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  currentPage === 1
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Previous
              </button>

              <div className="px-2 text-sm text-gray-600">
                Page {currentPage} / {totalPages}
              </div>

              <button
                type="button"
                onClick={onNextPage}
                disabled={currentPage === totalPages}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  currentPage === totalPages
                    ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Candidate Details</h4>

          {!selectedCandidate ? (
            <div className="mt-3 text-sm text-gray-500">
              Select a staff candidate to view details.
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={getCountryFlagUrl(safeCountryCode(selectedCandidate.country_code))}
                  alt={getCountryName(selectedCandidate.country_code)}
                  className="h-5 w-7 rounded-sm border border-gray-200 object-cover"
                />
                <div>
                  <div className="font-semibold text-gray-900">{selectedCandidate.staff_name}</div>
                  <div className="text-sm text-gray-500">
                    {roleLabel(selectedCandidate.role_type)}
                    {selectedCandidate.specialization ? ` • ${selectedCandidate.specialization}` : ''}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Weekly Wage Demand</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(selectedCandidate.salary_weekly)}
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Availability</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {selectedCandidate.is_available ? 'Available' : 'Unavailable'}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-900">Staff Attributes</div>
                <div className="mt-3 space-y-2">
                  {[
                    ...getCandidateStats(selectedCandidate),
                    { label: 'Leadership', value: selectedCandidate.leadership },
                    { label: 'Loyalty', value: selectedCandidate.loyalty },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <span className="text-sm text-gray-600">{stat.label}</span>
                      <span className="text-sm font-semibold text-gray-900">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-400">
                  {occupiedRoleMap.get(selectedCandidate.role_type)
                    ? 'Role must be vacant for direct hire'
                    : ' '}
                </div>

                <button
                  type="button"
                  onClick={onHireCandidate}
                  disabled={hireLoading || Boolean(occupiedRoleMap.get(selectedCandidate.role_type))}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    hireLoading || Boolean(occupiedRoleMap.get(selectedCandidate.role_type))
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                      : 'bg-yellow-400 text-black hover:bg-yellow-300'
                  }`}
                >
                  {hireLoading ? 'Hiring...' : 'Hire Staff'}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
          <h4 className="font-semibold text-gray-900">Current Staff Roles</h4>
          <div className="mt-3 space-y-2 text-sm text-gray-600">
            {(
              [
                'head_coach',
                'team_doctor',
                'mechanic',
                'sport_director',
                'scout_analyst',
              ] as StaffRole[]
            ).map((role) => {
              const current = occupiedRoleMap.get(role)

              return (
                <div
                  key={role}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                >
                  <span>{roleLabel(role)}</span>
                  <span className={current ? 'text-gray-800' : 'text-gray-400'}>
                    {current ? current.staff_name : 'Vacant'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
