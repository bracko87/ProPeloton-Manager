/**
 * src/pages/dashboard/Transfers.tsx
 *
 * Transfers page
 *
 * Changes made:
 * - Swapped Candidate Details and Current Staff Roles panels
 * - Flag moved into same row as candidate full name
 * - Removed visible country code text (RS / HR / etc.)
 * - Added sorting by salary, skills, name, and country
 * - Added pagination with maximum 10 candidates per page
 */

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type TransferTab = 'riders' | 'staff'

type StaffRole =
  | 'head_coach'
  | 'team_doctor'
  | 'mechanic'
  | 'sport_director'
  | 'scout_analyst'

type StaffSortField = 'salary' | 'skills' | 'name' | 'country'
type SortDirection = 'asc' | 'desc'

type ClubRow = {
  id: string
  name: string | null
  club_type: string | null
  parent_club_id: string | null
  deleted_at: string | null
}

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

const CANDIDATES_PER_PAGE = 10

function formatCurrency(value: number) {
  return `$${value.toLocaleString('de-DE')}`
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

function resolveMainClub(rows: ClubRow[]) {
  if (!rows.length) return null

  const exactMain = rows.find(
    (club) =>
      club.deleted_at == null &&
      club.parent_club_id == null &&
      club.club_type !== 'developing'
  )

  if (exactMain) return exactMain

  const fallbackNonDeveloping = rows.find(
    (club) => club.deleted_at == null && club.club_type !== 'developing'
  )

  if (fallbackNonDeveloping) return fallbackNonDeveloping

  return rows.find((club) => club.deleted_at == null) || null
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

function getCandidateSkillScore(candidate: StaffCandidateRow) {
  const stats = getCandidateStats(candidate)
  if (!stats.length) return 0

  return stats.reduce((sum, stat) => sum + stat.value, 0) / stats.length
}

function SegmentedTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-md text-sm font-medium transition ${
        active
          ? 'bg-yellow-400 text-black'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  )
}

export default function TransfersPage() {
  const [activeTab, setActiveTab] = useState<TransferTab>('riders')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clubId, setClubId] = useState<string | null>(null)
  const [clubName, setClubName] = useState<string | null>(null)

  const [roleFilter, setRoleFilter] = useState<'all' | StaffRole>('all')
  const [sortField, setSortField] = useState<StaffSortField>('salary')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const [staffCandidates, setStaffCandidates] = useState<StaffCandidateRow[]>([])
  const [clubStaff, setClubStaff] = useState<ClubStaffRow[]>([])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const [hireLoading, setHireLoading] = useState(false)
  const [pageMessage, setPageMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadTransfersPage() {
      try {
        setLoading(true)
        setError(null)

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError
        if (!user) throw new Error('User not found.')

        const { data: clubsData, error: clubsError } = await supabase
          .from('clubs')
          .select('id, name, club_type, parent_club_id, deleted_at')
          .eq('owner_user_id', user.id)
          .is('deleted_at', null)

        if (clubsError) throw clubsError

        const resolvedClub = resolveMainClub((clubsData || []) as ClubRow[])
        if (!resolvedClub) throw new Error('Main club not found.')

        if (!mounted) return

        setClubId(resolvedClub.id)
        setClubName(resolvedClub.name || null)

        const [candidatesResult, clubStaffResult] = await Promise.all([
          supabase
            .from('staff_candidates')
            .select(`
              id,
              role_type,
              specialization,
              staff_name,
              country_code,
              expertise,
              experience,
              potential,
              leadership,
              efficiency,
              loyalty,
              salary_weekly,
              is_available
            `)
            .eq('is_available', true)
            .order('role_type', { ascending: true })
            .order('salary_weekly', { ascending: true }),
          supabase
            .from('club_staff')
            .select(`
              id,
              role_type,
              staff_name,
              salary_weekly,
              contract_expires_at,
              is_active
            `)
            .eq('club_id', resolvedClub.id)
            .eq('is_active', true),
        ])

        if (candidatesResult.error) throw candidatesResult.error
        if (clubStaffResult.error) throw clubStaffResult.error

        if (!mounted) return

        setStaffCandidates((candidatesResult.data || []) as StaffCandidateRow[])
        setClubStaff((clubStaffResult.data || []) as ClubStaffRow[])
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load transfers page.'
        if (!mounted) return
        setError(message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadTransfersPage()

    return () => {
      mounted = false
    }
  }, [])

  const filteredCandidates = useMemo(() => {
    if (roleFilter === 'all') return staffCandidates
    return staffCandidates.filter((candidate) => candidate.role_type === roleFilter)
  }, [staffCandidates, roleFilter])

  const sortedCandidates = useMemo(() => {
    const candidates = [...filteredCandidates]

    candidates.sort((a, b) => {
      if (sortField === 'salary') {
        return sortDirection === 'asc'
          ? a.salary_weekly - b.salary_weekly
          : b.salary_weekly - a.salary_weekly
      }

      if (sortField === 'skills') {
        const aScore = getCandidateSkillScore(a)
        const bScore = getCandidateSkillScore(b)

        return sortDirection === 'asc' ? aScore - bScore : bScore - aScore
      }

      if (sortField === 'name') {
        const result = a.staff_name.localeCompare(b.staff_name, undefined, {
          sensitivity: 'base',
        })
        return sortDirection === 'asc' ? result : -result
      }

      const aCountry = getCountryName(a.country_code)
      const bCountry = getCountryName(b.country_code)
      const result = aCountry.localeCompare(bCountry, undefined, {
        sensitivity: 'base',
      })

      return sortDirection === 'asc' ? result : -result
    })

    return candidates
  }, [filteredCandidates, sortField, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedCandidates.length / CANDIDATES_PER_PAGE))

  useEffect(() => {
    setCurrentPage(1)
  }, [roleFilter, sortField, sortDirection])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedCandidates = useMemo(() => {
    const startIndex = (currentPage - 1) * CANDIDATES_PER_PAGE
    return sortedCandidates.slice(startIndex, startIndex + CANDIDATES_PER_PAGE)
  }, [sortedCandidates, currentPage])

  useEffect(() => {
    if (!paginatedCandidates.length) {
      setSelectedCandidateId(null)
      return
    }

    const stillExistsOnPage = paginatedCandidates.some(
      (candidate) => candidate.id === selectedCandidateId
    )

    if (!stillExistsOnPage) {
      setSelectedCandidateId(paginatedCandidates[0].id)
    }
  }, [paginatedCandidates, selectedCandidateId])

  const selectedCandidate = useMemo(
    () =>
      paginatedCandidates.find((candidate) => candidate.id === selectedCandidateId) || null,
    [paginatedCandidates, selectedCandidateId]
  )

  const occupiedRoleMap = useMemo(() => {
    const map = new Map<StaffRole, ClubStaffRow>()
    for (const row of clubStaff) {
      map.set(row.role_type, row)
    }
    return map
  }, [clubStaff])

  async function reloadStaffMarket(clubIdValue: string) {
    const [candidatesResult, clubStaffResult] = await Promise.all([
      supabase
        .from('staff_candidates')
        .select(`
          id,
          role_type,
          specialization,
          staff_name,
          country_code,
          expertise,
          experience,
          potential,
          leadership,
          efficiency,
          loyalty,
          salary_weekly,
          is_available
        `)
        .eq('is_available', true)
        .order('role_type', { ascending: true })
        .order('salary_weekly', { ascending: true }),
      supabase
        .from('club_staff')
        .select(`
          id,
          role_type,
          staff_name,
          salary_weekly,
          contract_expires_at,
          is_active
        `)
        .eq('club_id', clubIdValue)
        .eq('is_active', true),
    ])

    if (candidatesResult.error) throw candidatesResult.error
    if (clubStaffResult.error) throw clubStaffResult.error

    setStaffCandidates((candidatesResult.data || []) as StaffCandidateRow[])
    setClubStaff((clubStaffResult.data || []) as ClubStaffRow[])
  }

  async function handleHireCandidate() {
    if (!selectedCandidate || !clubId) return

    const occupiedRole = occupiedRoleMap.get(selectedCandidate.role_type)
    if (occupiedRole) {
      setPageMessage(
        `${roleLabel(selectedCandidate.role_type)} is already filled by ${occupiedRole.staff_name}. Replace flow should be used later.`
      )
      return
    }

    try {
      setHireLoading(true)
      setPageMessage(null)

      const { error: hireError } = await supabase.rpc('hire_staff_candidate', {
        p_candidate_id: selectedCandidate.id,
        p_contract_days: 360,
      })

      if (hireError) throw hireError

      await reloadStaffMarket(clubId)

      setPageMessage(
        `${selectedCandidate.staff_name} has been hired as ${roleLabel(selectedCandidate.role_type)}.`
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to hire staff candidate.'
      setPageMessage(message)
    } finally {
      setHireLoading(false)
    }
  }

  const pageStart = sortedCandidates.length === 0 ? 0 : (currentPage - 1) * CANDIDATES_PER_PAGE + 1
  const pageEnd = Math.min(currentPage * CANDIDATES_PER_PAGE, sortedCandidates.length)

  if (loading) {
    return (
      <div className="w-full">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
            <p className="text-sm text-gray-500 mt-1">
              Riders and staff market, shortlist and negotiations.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 shadow border border-gray-100 text-sm text-gray-500">
          Loading transfers...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
            <p className="text-sm text-gray-500 mt-1">
              Riders and staff market, shortlist and negotiations.
            </p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Transfers</h2>
          <p className="text-sm text-gray-500 mt-1">
            Riders and staff market, shortlist and negotiations.
          </p>
          {clubName ? (
            <div className="mt-1 text-xs text-gray-400">{clubName}</div>
          ) : null}
        </div>

        <div className="inline-flex rounded-lg bg-white border border-gray-100 p-1 shadow-sm">
          <SegmentedTabButton
            active={activeTab === 'riders'}
            label="Riders"
            onClick={() => setActiveTab('riders')}
          />
          <SegmentedTabButton
            active={activeTab === 'staff'}
            label="Staff"
            onClick={() => setActiveTab('staff')}
          />
        </div>
      </div>

      {pageMessage ? (
        <div className="mb-5 rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800 border border-yellow-200">
          {pageMessage}
        </div>
      ) : null}

      {activeTab === 'riders' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
          <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
            <h4 className="font-semibold text-gray-900">Scouting List</h4>
            <div className="mt-3 text-sm text-gray-600">
              Rider transfer market will stay as a separate topic. Staff market is live in the Staff tab.
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
            <h4 className="font-semibold text-gray-900">Negotiations</h4>
            <div className="mt-3 text-sm text-gray-600">
              No active rider negotiations. Rider transfer logic can be built separately later.
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4 w-full">
          <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">Available Staff</h4>
                <div className="mt-1 text-sm text-gray-500">
                  Browse available staff candidates and hire directly into vacant roles.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      onClick={() => setSelectedCandidateId(candidate.id)}
                      className={`w-full rounded-lg p-4 shadow border text-left transition ${
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
                              className="h-4 w-6 rounded-sm border border-gray-200 object-cover shrink-0"
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

                        <div className="text-sm font-semibold text-gray-700 shrink-0">
                          {formatCurrency(candidate.salary_weekly)}/week
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {getCandidateStats(candidate).map((stat) => (
                          <div key={stat.label} className="rounded-lg bg-gray-50 p-2">
                            <div className="text-[11px] text-gray-500">{stat.label}</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">
                              {stat.value}
                            </div>
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
                Showing {pageStart}-{pageEnd} of {sortedCandidates.length} candidates
              </div>

              {sortedCandidates.length > CANDIDATES_PER_PAGE ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                      currentPage === 1
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Previous
                  </button>

                  <div className="text-sm text-gray-600 px-2">
                    Page {currentPage} / {totalPages}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                      currentPage === totalPages
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
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
                      <div className="font-semibold text-gray-900">
                        {selectedCandidate.staff_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {roleLabel(selectedCandidate.role_type)}
                        {selectedCandidate.specialization
                          ? ` • ${selectedCandidate.specialization}`
                          : ''}
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
                          <span className="text-sm font-semibold text-gray-900">
                            {stat.value}
                          </span>
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
                      onClick={handleHireCandidate}
                      disabled={
                        hireLoading || Boolean(occupiedRoleMap.get(selectedCandidate.role_type))
                      }
                      className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                        hireLoading || Boolean(occupiedRoleMap.get(selectedCandidate.role_type))
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-yellow-400 hover:bg-yellow-300 text-black'
                      }`}
                    >
                      {hireLoading ? 'Hiring...' : 'Hire Staff'}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="bg-white rounded-lg p-4 shadow border border-gray-100">
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
      )}
    </div>
  )
}