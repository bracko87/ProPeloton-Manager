import React from 'react'

type StaffRole =
  | 'head_coach'
  | 'trainer'
  | 'u23_head_coach'
  | 'team_doctor'
  | 'physio'
  | 'nutritionist'
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
  birth_date: string | null
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

type StaffRoleLimitRow = {
  role_type: StaffRole
  limit_count: number
  active_count: number
  open_slots: number
  can_hire: boolean
}

type CandidateScoutQualityInfo = {
  scoutAbilityTier: string
  currentReportTier: string
  durationHours: number
  isLimitedByOffice: boolean
  scoutingLevel: number
}

type StaffQualityRow = {
  label: string
  value: string
}

type StaffQualityBox = {
  title: string
  rows: StaffQualityRow[]
  note?: string | null
}

const STAFF_ROLE_FILTERS: Array<{ value: 'all' | StaffRole; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'head_coach', label: 'Head Coach' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'u23_head_coach', label: 'U23 Head Coach' },
  { value: 'team_doctor', label: 'Team Doctor' },
  { value: 'physio', label: 'Physio' },
  { value: 'nutritionist', label: 'Nutritionist' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'sport_director', label: 'Sport Director' },
  { value: 'scout_analyst', label: 'Scout / Analyst' },
]

const STAFF_ROLES = STAFF_ROLE_FILTERS.filter(
  (role): role is { value: StaffRole; label: string } => role.value !== 'all'
)

function normalizeStaffRole(value: unknown): StaffRole | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()

  if (
    normalized === 'head_coach' ||
    normalized === 'trainer' ||
    normalized === 'u23_head_coach' ||
    normalized === 'team_doctor' ||
    normalized === 'physio' ||
    normalized === 'nutritionist' ||
    normalized === 'mechanic' ||
    normalized === 'sport_director' ||
    normalized === 'scout_analyst'
  ) {
    return normalized as StaffRole
  }

  return null
}

function parseIsoDateUtc(value: string | null | undefined) {
  if (!value) return null

  const parts = value.split('-').map(Number)
  if (parts.length !== 3) return null

  const [year, month, day] = parts
  if (!year || !month || !day) return null

  return new Date(Date.UTC(year, month - 1, day))
}

function getStaffAge(
  birthDate: string | null | undefined,
  currentGameDate: string | null | undefined
) {
  const birth = parseIsoDateUtc(birthDate)
  const current = parseIsoDateUtc(currentGameDate)

  if (!birth || !current) return null

  let age = current.getUTCFullYear() - birth.getUTCFullYear()

  if (
    current.getUTCMonth() < birth.getUTCMonth() ||
    (current.getUTCMonth() === birth.getUTCMonth() &&
      current.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1
  }

  return age
}

function formatStaffAge(ageYears: number | null) {
  return ageYears === null ? 'Age unknown' : `${ageYears} years old`
}

function normalizeRoleCapacity(
  roleLimit: StaffRoleLimitRow | undefined,
  assignedRows: ClubStaffRow[]
) {
  const activeCount = Number(roleLimit?.active_count ?? assignedRows.length ?? 0)
  const limitCount = Number(roleLimit?.limit_count ?? 0)
  const openSlots = Math.max(Number(roleLimit?.open_slots ?? limitCount - activeCount), 0)

  return {
    currentCount: activeCount,
    limitCount,
    openSlots,
    canHire:
      limitCount > 0 &&
      openSlots > 0 &&
      (roleLimit?.can_hire ?? true),
  }
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
  return STAFF_ROLES.find((item) => item.value === role)?.label ?? role
}

function formatScoutTier(tier: string): string {
  switch (tier) {
    case 'elite':
      return 'Elite'
    case 'strong':
      return 'Strong'
    case 'solid':
      return 'Solid'
    case 'basic':
      return 'Basic'
    default:
      return 'Unknown'
  }
}

function clampSkillScore(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function weightedScore(parts: Array<[number, number]>) {
  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0)

  if (totalWeight <= 0) return 0

  const score =
    parts.reduce((sum, [value, weight]) => sum + clampSkillScore(Number(value ?? 0)) * weight, 0) /
    totalWeight

  return Math.round(score * 10) / 10
}

function qualityTierFromScore(score: number) {
  if (score >= 85) return 'Elite'
  if (score >= 70) return 'Strong'
  if (score >= 55) return 'Solid'
  return 'Basic'
}

function calculateScoutCandidateQuality(
  candidate: {
    role_type?: string | null
    expertise?: number | null
    experience?: number | null
    potential?: number | null
    leadership?: number | null
    efficiency?: number | null
    loyalty?: number | null
  },
  scoutingLevel: number
): CandidateScoutQualityInfo | null {
  if (candidate.role_type !== 'scout_analyst') return null

  const evaluation = Number(candidate.expertise ?? 0)
  const network = Number(candidate.experience ?? 0)
  const accuracy = Number(candidate.efficiency ?? 0)
  const prospectSense = Number(candidate.potential ?? 0)
  const loyalty = Number(candidate.loyalty ?? 0)

  const precisionScore =
    0.35 * evaluation +
    0.25 * network +
    0.2 * accuracy +
    0.1 * prospectSense +
    0.1 * loyalty

  const speedScore =
    0.45 * evaluation +
    0.35 * accuracy +
    0.2 * network

  const rawTier =
    precisionScore >= 85
      ? 'elite'
      : precisionScore >= 70
        ? 'strong'
        : precisionScore >= 55
          ? 'solid'
          : 'basic'

  let cappedTier = rawTier

  if (scoutingLevel <= 0) {
    cappedTier = 'basic'
  } else if (scoutingLevel === 1) {
    cappedTier = 'basic'
  } else if (scoutingLevel === 2 && (rawTier === 'elite' || rawTier === 'strong')) {
    cappedTier = 'solid'
  } else if (scoutingLevel === 3 && rawTier === 'elite') {
    cappedTier = 'strong'
  }

  const durationHours =
    speedScore >= 85
      ? 1
      : speedScore >= 70
        ? 2
        : speedScore >= 55
          ? 3
          : 4

  return {
    scoutAbilityTier: rawTier,
    currentReportTier: cappedTier,
    durationHours,
    isLimitedByOffice: rawTier !== cappedTier,
    scoutingLevel,
  }
}

function buildStaffQualityBox(
  candidate: StaffCandidateRow,
  scoutingLevel: number
): StaffQualityBox {
  const expertise = Number(candidate.expertise ?? 0)
  const experience = Number(candidate.experience ?? 0)
  const potential = Number(candidate.potential ?? 0)
  const leadership = Number(candidate.leadership ?? 0)
  const efficiency = Number(candidate.efficiency ?? 0)
  const loyalty = Number(candidate.loyalty ?? 0)

  if (candidate.role_type === 'scout_analyst') {
    const scoutQuality = calculateScoutCandidateQuality(candidate, scoutingLevel)

    if (!scoutQuality) {
      return {
        title: 'Scouting Quality',
        rows: [
          { label: 'Scout Ability', value: 'Unknown' },
          { label: 'Current Report Quality', value: 'Unknown' },
          { label: 'Report Time', value: 'Unknown' },
        ],
      }
    }

    return {
      title: 'Scouting Quality',
      rows: [
        {
          label: 'Scout Ability',
          value: formatScoutTier(scoutQuality.scoutAbilityTier),
        },
        {
          label: 'Current Report Quality',
          value: formatScoutTier(scoutQuality.currentReportTier),
        },
        {
          label: 'Report Time',
          value: `${scoutQuality.durationHours}h`,
        },
      ],
      note: scoutQuality.isLimitedByOffice
        ? `Limited by Scouting Office Lv ${scoutQuality.scoutingLevel}.`
        : null,
    }
  }

  if (candidate.role_type === 'head_coach') {
    const coachAbility = weightedScore([
      [expertise, 0.35],
      [efficiency, 0.25],
      [potential, 0.25],
      [leadership, 0.15],
    ])

    const trainingQuality = weightedScore([
      [expertise, 0.6],
      [efficiency, 0.25],
      [experience, 0.15],
    ])

    const developmentSupport = weightedScore([
      [potential, 0.5],
      [expertise, 0.25],
      [leadership, 0.25],
    ])

    return {
      title: 'Coaching Quality',
      rows: [
        { label: 'Coach Ability', value: qualityTierFromScore(coachAbility) },
        { label: 'Training Quality', value: qualityTierFromScore(trainingQuality) },
        { label: 'Development Support', value: qualityTierFromScore(developmentSupport) },
      ],
    }
  }

  if (candidate.role_type === 'trainer') {
    const trainingAbility = weightedScore([
      [expertise, 0.45],
      [efficiency, 0.3],
      [potential, 0.15],
      [experience, 0.1],
    ])

    const sessionQuality = weightedScore([
      [expertise, 0.55],
      [efficiency, 0.35],
      [leadership, 0.1],
    ])

    const loadManagement = weightedScore([
      [efficiency, 0.45],
      [experience, 0.3],
      [loyalty, 0.25],
    ])

    return {
      title: 'Training Quality',
      rows: [
        { label: 'Training Ability', value: qualityTierFromScore(trainingAbility) },
        { label: 'Session Quality', value: qualityTierFromScore(sessionQuality) },
        { label: 'Load Management', value: qualityTierFromScore(loadManagement) },
      ],
    }
  }

  if (candidate.role_type === 'team_doctor') {
    const medicalAbility = weightedScore([
      [expertise, 0.35],
      [efficiency, 0.3],
      [experience, 0.25],
      [leadership, 0.1],
    ])

    const injuryPrevention = weightedScore([
      [efficiency, 0.55],
      [experience, 0.3],
      [expertise, 0.15],
    ])

    const returnToFitness = weightedScore([
      [expertise, 0.45],
      [efficiency, 0.35],
      [experience, 0.2],
    ])

    return {
      title: 'Medical Quality',
      rows: [
        { label: 'Medical Ability', value: qualityTierFromScore(medicalAbility) },
        { label: 'Injury Prevention', value: qualityTierFromScore(injuryPrevention) },
        { label: 'Return-to-Fitness', value: qualityTierFromScore(returnToFitness) },
      ],
    }
  }

  if (candidate.role_type === 'physio') {
    const recoveryAbility = weightedScore([
      [expertise, 0.4],
      [efficiency, 0.35],
      [experience, 0.25],
    ])

    const rehabilitationQuality = weightedScore([
      [expertise, 0.6],
      [experience, 0.25],
      [efficiency, 0.15],
    ])

    const recoverySpeed = weightedScore([
      [efficiency, 0.55],
      [expertise, 0.3],
      [experience, 0.15],
    ])

    return {
      title: 'Recovery Quality',
      rows: [
        { label: 'Recovery Ability', value: qualityTierFromScore(recoveryAbility) },
        { label: 'Rehabilitation Quality', value: qualityTierFromScore(rehabilitationQuality) },
        { label: 'Recovery Speed', value: qualityTierFromScore(recoverySpeed) },
      ],
    }
  }

  if (candidate.role_type === 'nutritionist') {
    const nutritionAbility = weightedScore([
      [expertise, 0.45],
      [efficiency, 0.3],
      [loyalty, 0.25],
    ])

    const recoverySupport = weightedScore([
      [efficiency, 0.5],
      [expertise, 0.3],
      [loyalty, 0.2],
    ])

    const consistencySupport = weightedScore([
      [loyalty, 0.5],
      [expertise, 0.3],
      [leadership, 0.2],
    ])

    return {
      title: 'Nutrition Quality',
      rows: [
        { label: 'Nutrition Ability', value: qualityTierFromScore(nutritionAbility) },
        { label: 'Recovery Support', value: qualityTierFromScore(recoverySupport) },
        { label: 'Consistency Support', value: qualityTierFromScore(consistencySupport) },
      ],
    }
  }

  if (candidate.role_type === 'mechanic') {
    const technicalAbility = weightedScore([
      [expertise, 0.45],
      [efficiency, 0.35],
      [potential, 0.2],
    ])

    const bikeSetupQuality = weightedScore([
      [expertise, 0.6],
      [efficiency, 0.25],
      [potential, 0.15],
    ])

    const reliabilitySupport = weightedScore([
      [efficiency, 0.55],
      [experience, 0.25],
      [loyalty, 0.2],
    ])

    return {
      title: 'Technical Quality',
      rows: [
        { label: 'Technical Ability', value: qualityTierFromScore(technicalAbility) },
        { label: 'Bike Setup Quality', value: qualityTierFromScore(bikeSetupQuality) },
        { label: 'Reliability Support', value: qualityTierFromScore(reliabilitySupport) },
      ],
    }
  }

  if (candidate.role_type === 'sport_director') {
    const directorAbility = weightedScore([
      [expertise, 0.35],
      [leadership, 0.35],
      [efficiency, 0.2],
      [experience, 0.1],
    ])

    const racePlanQuality = weightedScore([
      [expertise, 0.55],
      [efficiency, 0.3],
      [experience, 0.15],
    ])

    const motivationSupport = weightedScore([
      [leadership, 0.55],
      [loyalty, 0.25],
      [experience, 0.2],
    ])

    return {
      title: 'Tactical Quality',
      rows: [
        { label: 'Director Ability', value: qualityTierFromScore(directorAbility) },
        { label: 'Race Plan Quality', value: qualityTierFromScore(racePlanQuality) },
        { label: 'Motivation Support', value: qualityTierFromScore(motivationSupport) },
      ],
    }
  }

  const youthCoachAbility = weightedScore([
    [expertise, 0.35],
    [potential, 0.35],
    [leadership, 0.2],
    [experience, 0.1],
  ])

  const talentDevelopment = weightedScore([
    [potential, 0.55],
    [expertise, 0.3],
    [leadership, 0.15],
  ])

  const raceReadiness = weightedScore([
    [expertise, 0.45],
    [leadership, 0.3],
    [experience, 0.25],
  ])

  return {
    title: 'Youth Coaching Quality',
    rows: [
      { label: 'Youth Coach Ability', value: qualityTierFromScore(youthCoachAbility) },
      { label: 'Talent Development', value: qualityTierFromScore(talentDevelopment) },
      { label: 'Race Readiness', value: qualityTierFromScore(raceReadiness) },
    ],
  }
}

function StaffQualityBoxPanel({ qualityBox }: { qualityBox: StaffQualityBox }) {
  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="text-sm font-semibold text-blue-900">{qualityBox.title}</div>

      <div className="mt-3 space-y-2 text-sm">
        {qualityBox.rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
          >
            <span className="text-blue-700">{row.label}</span>

            <span className="font-semibold text-blue-950">{row.value}</span>
          </div>
        ))}
      </div>

      {qualityBox.note ? (
        <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          {qualityBox.note}
        </div>
      ) : null}
    </div>
  )
}

function getCandidateStats(candidate: StaffCandidateRow) {
  if (candidate.role_type === 'head_coach') {
    return [
      { label: 'Training', value: candidate.expertise },
      { label: 'Recovery Plan', value: candidate.efficiency },
      { label: 'Team Dev', value: candidate.potential },
    ]
  }

  if (candidate.role_type === 'trainer') {
    return [
      { label: 'Daily Training', value: candidate.expertise },
      { label: 'Efficiency', value: candidate.efficiency },
      { label: 'Potential Growth', value: candidate.potential },
    ]
  }

  if (candidate.role_type === 'u23_head_coach') {
    return [
      { label: 'Youth Training', value: candidate.expertise },
      { label: 'Youth Dev', value: candidate.potential },
      { label: 'Leadership', value: candidate.leadership },
    ]
  }

  if (candidate.role_type === 'team_doctor') {
    return [
      { label: 'Recovery', value: candidate.expertise },
      { label: 'Prevention', value: candidate.efficiency },
      { label: 'Diagnosis', value: candidate.experience },
    ]
  }

  if (candidate.role_type === 'physio') {
    return [
      { label: 'Rehabilitation', value: candidate.expertise },
      { label: 'Recovery Speed', value: candidate.efficiency },
      { label: 'Experience', value: candidate.experience },
    ]
  }

  if (candidate.role_type === 'nutritionist') {
    return [
      { label: 'Nutrition Plan', value: candidate.expertise },
      { label: 'Recovery Support', value: candidate.efficiency },
      { label: 'Consistency', value: candidate.loyalty },
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

function getAssignedStaffSummary(staffRows: ClubStaffRow[]) {
  if (!staffRows.length) return 'No staff assigned'

  if (staffRows.length <= 2) {
    return staffRows.map((row) => row.staff_name).join(', ')
  }

  const firstTwo = staffRows
    .slice(0, 2)
    .map((row) => row.staff_name)
    .join(', ')

  return `${firstTwo} +${staffRows.length - 2} more`
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
  activeStaffByRole: Map<StaffRole, ClubStaffRow[]>
  roleLimits: StaffRoleLimitRow[]
  pageStart: number
  pageEnd: number
  totalCandidates: number
  currentPage: number
  totalPages: number
  onPrevPage: () => void
  onNextPage: () => void
  selectedCandidate: StaffCandidateRow | null
  hireLoading: boolean
  hireContractTerm: 0 | 1
  setHireContractTerm: (value: 0 | 1) => void
  onHireCandidate: () => void
  scoutingLevel?: number
  currentGameDate: string | null
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
  activeStaffByRole,
  roleLimits,
  pageStart,
  pageEnd,
  totalCandidates,
  currentPage,
  totalPages,
  onPrevPage,
  onNextPage,
  selectedCandidate,
  hireLoading,
  hireContractTerm,
  setHireContractTerm,
  onHireCandidate,
  scoutingLevel = 0,
  currentGameDate,
}: StaffFreeAgentPageProps) {
  const roleLimitMap = new Map(roleLimits.map((row) => [row.role_type, row] as const))

  const staffRoleCapacity = STAFF_ROLES.map((role) => {
    const limitRow = roleLimitMap.get(role.value)
    const assignedRows = activeStaffByRole.get(role.value) ?? []

    const {
      currentCount,
      limitCount,
      openSlots,
      canHire,
    } = normalizeRoleCapacity(limitRow, assignedRows)

    return {
      role_type: role.value,
      role_label: role.label,
      current_count: currentCount,
      limit_count: limitCount,
      open_slots: openSlots,
      can_hire: canHire,
    }
  })

  const selectedCandidateRole = selectedCandidate
    ? normalizeStaffRole(selectedCandidate.role_type)
    : null

  const selectedCandidateAge = selectedCandidate
    ? getStaffAge(selectedCandidate.birth_date, currentGameDate)
    : null

  const selectedCandidateQualityBox = selectedCandidate
    ? buildStaffQualityBox(selectedCandidate, scoutingLevel)
    : null

  const selectedRoleLimit = selectedCandidateRole
    ? roleLimitMap.get(selectedCandidateRole)
    : undefined

  const selectedRoleAssignedRows = selectedCandidateRole
    ? activeStaffByRole.get(selectedCandidateRole) ?? []
    : []

  const {
    currentCount: selectedRoleAssigned,
    limitCount: selectedRoleLimitCount,
    openSlots: selectedRoleOpenSlots,
    canHire: selectedRoleCanHireRaw,
  } = normalizeRoleCapacity(selectedRoleLimit, selectedRoleAssignedRows)

  const selectedRoleCanHire =
    selectedCandidate?.is_available === true && selectedRoleCanHireRaw

  return (
    <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-lg border border-gray-100 bg-white p-4 shadow">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h4 className="font-semibold text-gray-900">Available Staff</h4>

            <div className="mt-1 text-sm text-gray-500">
              Browse available staff candidates and hire directly into available staff
              slots.
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
                {STAFF_ROLE_FILTERS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
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
              const normalizedCandidateRole = normalizeStaffRole(candidate.role_type)
              const roleLimit = normalizedCandidateRole
                ? roleLimitMap.get(normalizedCandidateRole)
                : undefined

              const assignedRows = normalizedCandidateRole
                ? activeStaffByRole.get(normalizedCandidateRole) ?? []
                : []

              const selected = candidate.id === selectedCandidateId

              const {
                currentCount,
                limitCount,
                openSlots,
                canHire: roleCanHire,
              } = normalizeRoleCapacity(roleLimit, assignedRows)

              const candidateAge = getStaffAge(candidate.birth_date, currentGameDate)

              const canHire = candidate.is_available === true && roleCanHire
              const roleAtCapacity = limitCount > 0 && openSlots <= 0

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

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>
                          {roleLabel(candidate.role_type)}
                          {candidate.specialization
                            ? ` • ${candidate.specialization}`
                            : ''}
                        </span>

                        <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                          {formatStaffAge(candidateAge)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-gray-700">
                        {formatCurrency(candidate.salary_weekly)}/week
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {currentCount}/{limitCount} assigned
                      </div>
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

                  {!candidate.is_available ? (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      Candidate is no longer available.
                    </div>
                  ) : limitCount <= 0 ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      This role is currently unavailable for this club.
                    </div>
                  ) : !canHire && roleAtCapacity ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Role at capacity ({currentCount}/{limitCount}).
                      {assignedRows.length > 0
                        ? ` Assigned: ${getAssignedStaffSummary(assignedRows)}.`
                        : ''}
                    </div>
                  ) : !canHire ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      This role cannot currently be hired for this club.
                    </div>
                  ) : assignedRows.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      Currently assigned: {getAssignedStaffSummary(assignedRows)}. Open
                      slots left: {openSlots}.
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                      No one assigned yet. Open slots left: {openSlots}.
                    </div>
                  )}
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

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Age</div>

                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatStaffAge(selectedCandidateAge)}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Role Capacity</div>

                <div className="mt-1 text-sm font-semibold text-gray-900">
                  {selectedRoleAssigned}/{selectedRoleLimitCount} assigned
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  {selectedRoleAssignedRows.length > 0
                    ? `Current staff: ${getAssignedStaffSummary(selectedRoleAssignedRows)}`
                    : 'No staff currently assigned to this role'}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  {selectedRoleLimitCount <= 0
                    ? 'This role is currently unavailable for this club.'
                    : `Open slots left: ${selectedRoleOpenSlots}`}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-900">
                  Staff Attributes
                </div>

                <div className="mt-3 space-y-2">
                  {[
                    ...getCandidateStats(selectedCandidate),
                    { label: 'Leadership', value: selectedCandidate.leadership },
                    { label: 'Loyalty', value: selectedCandidate.loyalty },
                  ].map((stat, index) => (
                    <div
                      key={`${stat.label}-${index}`}
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

              {selectedCandidateQualityBox ? (
                <StaffQualityBoxPanel qualityBox={selectedCandidateQualityBox} />
              ) : null}

              <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Contract Term</div>

                <div className="mt-3 inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setHireContractTerm(0)}
                    disabled={hireLoading}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      hireContractTerm === 0
                        ? 'bg-yellow-400 text-black'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    End of current season
                  </button>

                  <button
                    type="button"
                    onClick={() => setHireContractTerm(1)}
                    disabled={hireLoading}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                      hireContractTerm === 1
                        ? 'bg-yellow-400 text-black'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    End of next season
                  </button>
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  Staff contracts always end on season end, not after a fixed number of
                  days.
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-400">
                  {!selectedCandidate.is_available
                    ? 'Candidate is no longer available'
                    : selectedRoleLimitCount <= 0
                      ? 'This role is currently unavailable'
                      : !selectedRoleCanHire
                        ? 'Role is already at full capacity'
                        : `${selectedRoleOpenSlots} open slot(s) available`}
                </div>

                <button
                  type="button"
                  onClick={onHireCandidate}
                  disabled={hireLoading || !selectedRoleCanHire}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    hireLoading || !selectedRoleCanHire
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

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Current Staff Roles</h3>

          <div className="mt-4 space-y-3">
            {staffRoleCapacity.map((row) => (
              <div
                key={row.role_type}
                className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {row.role_label}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    {row.current_count > 0
                      ? `${row.current_count} assigned • ${row.open_slots} open slot(s)`
                      : `No staff assigned • ${row.open_slots} open slot(s)`}
                  </div>
                </div>

                <span className="text-sm text-slate-500">
                  {row.current_count}/{row.limit_count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}