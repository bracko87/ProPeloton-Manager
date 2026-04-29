import React, { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { supabase } from '../../lib/supabase'

type StaffRole =
  | 'head_coach'
  | 'team_doctor'
  | 'mechanic'
  | 'sport_director'
  | 'scout_analyst'

type ClubRow = {
  id: string
  club_type: string | null
  parent_club_id: string | null
  deleted_at: string | null
  name?: string | null
}

type ClubStaffRow = {
  id: string
  club_id: string
  role_type: StaffRole
  specialization: string | null
  team_scope: 'first_team' | 'u23' | 'all'
  staff_name: string
  country_code: string | null
  expertise: number
  experience: number
  potential: number
  leadership: number
  efficiency: number
  loyalty: number
  salary_weekly: number
  contract_expires_at: string | null
  birth_date: string | null
  is_active: boolean
  notes: Record<string, unknown> | null
  current_assignment_label?: string | null
}

type StaffRoleLimitRow = {
  role_type: StaffRole
  limit_count: number
  active_count: number
  open_slots: number
  can_hire: boolean
}

type ClubInfrastructureRow = {
  club_id: string
  hq_level: number
  training_center_level: number
  medical_center_level: number
  scouting_level: number
  youth_academy_level: number
  mechanics_workshop_level: number
}

type DevelopingTeamStatusRow = {
  is_purchased: boolean
  developing_club_id?: string | null
  main_club_id?: string | null
}

type StaffStat = {
  label: string
  value: number
}

type StaffActiveCourse = {
  id: string
  code: string
  title: string
  focusLabel: string
  startedGameDate: string
  completesOnGameDate: string
  durationDays: number
  costCash: number
  status: string
}

type ActiveStaffCourseRow = {
  course_id: string
  staff_id: string
  course_code: string
  course_title: string
  focus_label: string
  status: string
  started_game_date: string
  completes_on_game_date: string
  duration_days: number
  cost_cash: number
}

type RecentStaffCourseResultRow = {
  course_id: string
  staff_id: string
  staff_name: string
  role_type: string
  course_code: string
  course_title: string
  focus_label: string
  completed_game_date: string | null
  expertise_gain: number
  experience_gain: number
  potential_gain: number
  leadership_gain: number
  efficiency_gain: number
  loyalty_gain: number
}

type ExtendContractQuoteRow = {
  staff_id: string
  staff_name: string
  role_type: string
  current_salary_weekly: number
  requested_salary_weekly: number
  minimum_acceptable_salary_weekly: number
  requested_raise_percent: number
  target_contract_expires_at: string
  target_season_number: number

  interest_score?: number | null
  interest_level?: string | null
  willingness_status?: string | null
  decision_reason?: string | null
  salary_reason?: string | null
}

type StaffListMember = {
  id: string
  role: StaffRole
  roleLabel: string
  name: string
  countryCode: string
  specialization: string
  salaryWeekly: number
  contractExpiresAt: string | null
  contractPrimaryLabel: string
  contractSecondaryLabel: string
  teamScope: 'first_team' | 'u23' | 'all'
  birthDate: string | null
  ageYears: number | null
  stats: StaffStat[]
  effects: string[]
  activeCourse: StaffActiveCourse | null
  facilityWarning: string | null
  currentAssignmentLabel: string | null
  lastCourseTitle: string | null
  lastCourseGains: string[]
}

type StaffCourseRow = {
  id: string
  club_id: string
  staff_id: string
  course_code: string
  course_title: string
  focus_label: string
  status: string
  started_game_date: string
  completes_on_game_date: string
  duration_days: number
  cost_cash: number
  expertise_gain: number
  experience_gain: number
  potential_gain: number
  leadership_gain: number
  efficiency_gain: number
  loyalty_gain: number
  metadata: Record<string, unknown> | null
}

type CourseOption = {
  code: string
  title: string
  description: string
  durationDays: number
  costCash: number
  focusLabel: string
}

type RoleTabMeta = {
  role: StaffRole
  label: string
  subtitle: string
  impactAreas: string[]
}

const ROLE_TABS: RoleTabMeta[] = [
  {
    role: 'head_coach',
    label: 'Head Coach',
    subtitle: 'Training, recovery planning and long-term rider development.',
    impactAreas: ['Regular training', 'Training camps', 'Rider development'],
  },
  {
    role: 'team_doctor',
    label: 'Team Doctor',
    subtitle: 'Recovery quality, diagnosis and injury prevention.',
    impactAreas: ['Recovery speed', 'Injury prevention', 'Medical case handling'],
  },
  {
    role: 'mechanic',
    label: 'Mechanic',
    subtitle: 'Bike setup, reliability and future technical support.',
    impactAreas: ['Race setup quality', 'Mechanical reliability', 'Condition-specific support'],
  },
  {
    role: 'sport_director',
    label: 'Sport Director',
    subtitle: 'Tactics, leadership and race-day organization.',
    impactAreas: ['Race tactics', 'Morale stability', 'Team coordination'],
  },
  {
    role: 'scout_analyst',
    label: 'Scout / Analyst',
    subtitle: 'Scouting quality, prospect visibility and transfer intelligence.',
    impactAreas: ['Scouting accuracy', 'Prospect discovery', 'Transfer intelligence'],
  },
]

const gainLabelsByRole: Record<StaffRole, Record<string, string>> = {
  head_coach: {
    expertise_gain: 'Training',
    experience_gain: 'Experience',
    potential_gain: 'Youth Development',
    leadership_gain: 'Leadership',
    efficiency_gain: 'Recovery Planning',
    loyalty_gain: 'Loyalty',
  },
  team_doctor: {
    expertise_gain: 'Recovery',
    experience_gain: 'Diagnosis',
    potential_gain: 'Potential',
    leadership_gain: 'Leadership',
    efficiency_gain: 'Prevention',
    loyalty_gain: 'Loyalty',
  },
  mechanic: {
    expertise_gain: 'Setup',
    experience_gain: 'Experience',
    potential_gain: 'Innovation',
    leadership_gain: 'Discipline',
    efficiency_gain: 'Reliability',
    loyalty_gain: 'Loyalty',
  },
  sport_director: {
    expertise_gain: 'Tactics',
    experience_gain: 'Experience',
    potential_gain: 'Long-Term Vision',
    leadership_gain: 'Motivation',
    efficiency_gain: 'Organization',
    loyalty_gain: 'Loyalty',
  },
  scout_analyst: {
    expertise_gain: 'Evaluation',
    experience_gain: 'Network',
    potential_gain: 'Prospect Sense',
    leadership_gain: 'Communication',
    efficiency_gain: 'Accuracy',
    loyalty_gain: 'Loyalty',
  },
}

function isStaffRole(value: string | null | undefined): value is StaffRole {
  return (
    value === 'head_coach' ||
    value === 'team_doctor' ||
    value === 'mechanic' ||
    value === 'sport_director' ||
    value === 'scout_analyst'
  )
}

function getCourseGainMap(role: StaffRole | string | null | undefined): Array<[string, string]> {
  const safeRole: StaffRole = isStaffRole(role) ? role : 'head_coach'
  const gainLabels = gainLabelsByRole[safeRole]

  return [
    ['expertise_gain', gainLabels.expertise_gain],
    ['experience_gain', gainLabels.experience_gain],
    ['potential_gain', gainLabels.potential_gain],
    ['leadership_gain', gainLabels.leadership_gain],
    ['efficiency_gain', gainLabels.efficiency_gain],
    ['loyalty_gain', gainLabels.loyalty_gain],
  ]
}

function TopNav({ hasDevelopingTeam }: { hasDevelopingTeam: boolean }) {
  const location = useLocation()
  const isActive = (path: string) => location.pathname === path

  return (
    <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 className="mb-2 text-xl font-semibold">Staff</h2>
        <div className="text-sm text-gray-500">
          Coaches, doctors, scouts and contracts management.
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
        <a
          href="#/dashboard/squad"
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/squad')
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          First Squad
        </a>

        {hasDevelopingTeam ? (
          <a
            href="#/dashboard/developing-team"
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              isActive('/dashboard/developing-team')
                ? 'bg-yellow-400 text-black'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Developing Team
          </a>
        ) : (
          <span
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-gray-400"
            title="Unlock Developing Team in Preferences first."
            aria-disabled="true"
          >
            <span>Developing Team</span>
            <span aria-hidden="true">🔒</span>
          </span>
        )}

        <a
          href="#/dashboard/staff"
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${
            isActive('/dashboard/staff')
              ? 'bg-yellow-400 text-black'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Staff
        </a>
      </div>
    </div>
  )
}

function normalizeRpcSingle<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T) ?? null
  }

  return (value as T) ?? null
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message)
  }

  return fallback
}

function normalizeGameDateValue(value: unknown): string | null {
  if (!value) return null

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const first = value[0]

    if (typeof first === 'string') return first

    if (first && typeof first === 'object') {
      const row = first as Record<string, unknown>

      if (typeof row.get_current_game_date_date === 'string') {
        return row.get_current_game_date_date
      }

      if (typeof row.current_game_date === 'string') {
        return row.current_game_date
      }

      if (typeof row.game_date === 'string') {
        return row.game_date
      }
    }
  }

  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>

    if (typeof row.get_current_game_date_date === 'string') {
      return row.get_current_game_date_date
    }

    if (typeof row.current_game_date === 'string') {
      return row.current_game_date
    }

    if (typeof row.game_date === 'string') {
      return row.game_date
    }
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

function getStaffAge(birthDate: string | null, currentGameDate: string | null) {
  const birth = parseIsoDateUtc(birthDate)
  const current = parseIsoDateUtc(currentGameDate)

  if (!birth || !current) return null

  let age = current.getUTCFullYear() - birth.getUTCFullYear()
  const currentMonth = current.getUTCMonth()
  const birthMonth = birth.getUTCMonth()

  if (
    currentMonth < birthMonth ||
    (currentMonth === birthMonth && current.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1
  }

  return age
}

function getSeasonNumberFromDate(value: string | null | undefined) {
  const date = parseIsoDateUtc(value)
  if (!date) return null
  return date.getUTCFullYear() - 1999
}

function formatGameDateShort(value: string | null | undefined) {
  const date = parseIsoDateUtc(value)
  if (!date) return 'No contract date'

  const shortLabel = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })

  const seasonNumber = getSeasonNumberFromDate(value)

  return `Season ${seasonNumber ?? '?'} - ${shortLabel}`
}

function getDaysRemaining(dateValue: string | null | undefined, currentGameDate: string | null) {
  const target = parseIsoDateUtc(dateValue)
  const current = parseIsoDateUtc(currentGameDate)

  if (!target || !current) return null

  const diffMs = target.getTime() - current.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function formatContractUi(dateValue: string | null, currentGameDate: string | null) {
  if (!dateValue) {
    return {
      primary: 'No contract date',
      secondary: 'Missing contract_expires_at in club_staff',
    }
  }

  const primary = formatGameDateShort(dateValue)
  const daysRemaining = getDaysRemaining(dateValue, currentGameDate)

  let secondary = ''

  if (daysRemaining !== null) {
    if (daysRemaining < 0) {
      secondary = 'Expired'
    } else if (daysRemaining === 0) {
      secondary = 'Expires today'
    } else if (daysRemaining === 1) {
      secondary = '1 day left'
    } else {
      secondary = `${daysRemaining} days left`
    }
  }

  return {
    primary,
    secondary,
  }
}

function formatStaffAge(ageYears: number | null) {
  return ageYears === null ? 'Age unknown' : `${ageYears} years old`
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString('de-DE')}`
}

function getStaffReleaseCost(salaryWeekly: number) {
  return Math.max(0, salaryWeekly * 6)
}

function getCountryFlagUrl(countryCode: string) {
  return `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
}

function safeCountryCode(countryCode: string | null | undefined) {
  if (!countryCode || countryCode.length !== 2) return 'rs'
  return countryCode.toLowerCase()
}

function getRoleMeta(role: StaffRole) {
  return ROLE_TABS.find((item) => item.role === role) ?? ROLE_TABS[0]
}

function getRoleInfrastructureWarning(
  role: StaffRole,
  infrastructure: ClubInfrastructureRow | null
) {
  if (!infrastructure) return null

  if (role === 'head_coach' && infrastructure.training_center_level <= 0) {
    return 'Training Center Lv 0 caps part of head coach bonuses.'
  }

  if (role === 'team_doctor' && infrastructure.medical_center_level <= 0) {
    return 'Medical Center Lv 0 caps part of team doctor bonuses.'
  }

  if (role === 'mechanic' && infrastructure.mechanics_workshop_level <= 0) {
    return 'Mechanics Workshop Lv 0 caps part of mechanic bonuses.'
  }

  if (role === 'scout_analyst' && infrastructure.scouting_level <= 0) {
    return 'Scouting Office Lv 0 caps part of scout and analyst bonuses.'
  }

  return null
}

function getRoleLimit(
  role: StaffRole,
  roleLimitMap: Map<StaffRole, StaffRoleLimitRow>
) {
  return roleLimitMap.get(role)?.limit_count ?? 0
}

function buildCourseOptions(role: StaffRole): CourseOption[] {
  if (role === 'head_coach') {
    return [
      {
        code: 'coach_elite_methodology',
        title: 'Elite Methodology Course',
        description: 'Improves training structure and overall rider progression quality.',
        durationDays: 60,
        costCash: 40000,
        focusLabel: 'Training + Development',
      },
      {
        code: 'coach_recovery_planning',
        title: 'Recovery Planning Seminar',
        description: 'Focus on load balancing, fatigue prevention and micro-cycle planning.',
        durationDays: 30,
        costCash: 16000,
        focusLabel: 'Recovery Planning',
      },
      {
        code: 'coach_youth_programme',
        title: 'Youth Development Programme',
        description: 'Specialised course for improving work with young and developing riders.',
        durationDays: 45,
        costCash: 28000,
        focusLabel: 'Youth Development',
      },
    ]
  }

  if (role === 'team_doctor') {
    return [
      {
        code: 'doctor_sports_medicine',
        title: 'Sports Medicine Course',
        description: 'Improves diagnosis quality and athlete-specific treatment decisions.',
        durationDays: 45,
        costCash: 30000,
        focusLabel: 'Diagnosis + Recovery',
      },
      {
        code: 'doctor_prevention_lab',
        title: 'Injury Prevention Lab',
        description: 'Focuses on risk screening and preventive protocols.',
        durationDays: 30,
        costCash: 17000,
        focusLabel: 'Prevention',
      },
      {
        code: 'doctor_rehab_acceleration',
        title: 'Rehab Acceleration Programme',
        description: 'Advanced rehab planning for shorter return timelines.',
        durationDays: 60,
        costCash: 42000,
        focusLabel: 'Recovery Speed',
      },
    ]
  }

  if (role === 'mechanic') {
    return [
      {
        code: 'mechanic_tt_setup',
        title: 'Time Trial Setup Course',
        description: 'Advanced aerodynamic fitting and TT position optimisation.',
        durationDays: 45,
        costCash: 26000,
        focusLabel: 'Setup',
      },
      {
        code: 'mechanic_reliability',
        title: 'Reliability Workshop',
        description: 'Improves equipment consistency and race-day reliability.',
        durationDays: 30,
        costCash: 15000,
        focusLabel: 'Reliability',
      },
      {
        code: 'mechanic_weather_adaptation',
        title: 'Weather Adaptation Training',
        description: 'Focuses on technical support in wet and mixed conditions.',
        durationDays: 30,
        costCash: 17000,
        focusLabel: 'Conditions Support',
      },
    ]
  }

  if (role === 'sport_director') {
    return [
      {
        code: 'director_tactics',
        title: 'Race Tactics Seminar',
        description: 'Improves tactical calls, pacing plans and race management decisions.',
        durationDays: 45,
        costCash: 28000,
        focusLabel: 'Tactics',
      },
      {
        code: 'director_leadership',
        title: 'Leadership Intensive',
        description: 'Strengthens motivation, leadership and intra-team communication.',
        durationDays: 30,
        costCash: 16000,
        focusLabel: 'Leadership',
      },
      {
        code: 'director_stage_strategy',
        title: 'Stage Strategy Programme',
        description: 'Specialized tactical planning for stage races and GC support.',
        durationDays: 60,
        costCash: 42000,
        focusLabel: 'Stage Strategy',
      },
    ]
  }

  return [
    {
      code: 'scout_evaluation',
      title: 'Evaluation Accuracy Course',
      description: 'Improves rider assessment and report quality.',
      durationDays: 45,
      costCash: 26000,
      focusLabel: 'Evaluation',
    },
    {
      code: 'scout_networking',
      title: 'Scouting Network Camp',
      description: 'Builds connections and improves talent identification coverage.',
      durationDays: 45,
      costCash: 26000,
      focusLabel: 'Network',
    },
    {
      code: 'scout_data_analysis',
      title: 'Performance Data Analysis',
      description: 'Improves analytical review of riders and race preparation reports.',
      durationDays: 30,
      costCash: 18000,
      focusLabel: 'Accuracy + Analysis',
    },
  ]
}

function SummaryCard({
  label,
  value,
  subtext,
}: {
  label: string
  value: string
  subtext?: string
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-gray-900">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-gray-500">{subtext}</div> : null}
    </div>
  )
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-500">{subtitle}</div>
    </div>
  )
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

function buildEffects(role: StaffRole, row: ClubStaffRow): string[] {
  if (role === 'head_coach') {
    const trainingBonus = Math.max(3, Math.floor(row.expertise / 10))
    const devBonus = Math.max(2, Math.floor(row.efficiency / 15))
    const overloadReduction = Math.max(3, Math.floor(row.experience / 14))

    const focusText = row.specialization
      ? `${row.specialization} training efficiency`
      : 'training efficiency'

    return [
      `+${trainingBonus}% ${focusText}`,
      `+${devBonus}% development support`,
      `-${overloadReduction}% overload risk`,
    ]
  }

  if (role === 'team_doctor') {
    const riskReduction = Math.max(4, Math.floor(row.expertise / 10))
    const recoveryReduction = Math.max(4, Math.floor(row.efficiency / 12))
    const dailyRecovery = Math.max(1, Math.floor(row.experience / 30))

    return [
      `-${riskReduction}% injury and sickness risk`,
      `-${recoveryReduction}% recovery duration`,
      `+${dailyRecovery} daily recovery`,
    ]
  }

  if (role === 'mechanic') {
    const setupBonus = Math.max(2, Math.floor(row.expertise / 15))
    const reliabilityBonus = Math.max(2, Math.floor(row.efficiency / 18))

    return [
      `+${setupBonus}% setup quality`,
      `-${reliabilityBonus}% mechanical issue risk`,
      'Future: weather and terrain setup bonuses',
    ]
  }

  if (role === 'sport_director') {
    const tacticsBonus = Math.max(2, Math.floor(row.expertise / 15))
    const moraleStability = Math.max(1, Math.floor(row.leadership / 20))

    return [
      `+${tacticsBonus}% tactical support`,
      `+${moraleStability}% morale stability`,
      'Future: smarter leader/domestique execution',
    ]
  }

  const scoutingBonus = Math.max(2, Math.floor(row.expertise / 15))
  const prospectBonus = Math.max(2, Math.floor(row.experience / 18))

  return [
    `+${scoutingBonus}% scouting accuracy`,
    `+${prospectBonus}% prospect visibility`,
    'Future: transfer intelligence and youth reports',
  ]
}

type ScoutQualityInfo = {
  scoutAbilityTier: string
  currentReportTier: string
  scoutAbilityScore: number
  currentReportScore: number
  durationHours: number
  isLimitedByOffice: boolean
  scoutingLevel: number
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

function calculateScoutQuality(
  staff: Pick<StaffListMember, 'role' | 'stats'>,
  infrastructure: ClubInfrastructureRow | null,
): ScoutQualityInfo | null {
  if (staff.role !== 'scout_analyst') return null

  const statValue = (label: string) =>
    staff.stats.find((stat) => stat.label === label)?.value ?? 0

  const evaluation = statValue('Evaluation')
  const network = statValue('Network')
  const accuracy = statValue('Accuracy')
  const prospectSense = statValue('Prospect Sense')
  const loyalty = statValue('Loyalty')

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

  const scoutingLevel = infrastructure?.scouting_level ?? 0

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
    scoutAbilityScore: Math.round(precisionScore * 10) / 10,
    currentReportScore: Math.round(precisionScore * 10) / 10,
    durationHours,
    isLimitedByOffice: rawTier !== cappedTier,
    scoutingLevel,
  }
}

function mapStats(role: StaffRole, row: ClubStaffRow): StaffStat[] {
  if (role === 'head_coach') {
    return [
      { label: 'Training', value: row.expertise },
      { label: 'Recovery Planning', value: row.efficiency },
      { label: 'Youth Development', value: row.potential },
      { label: 'Experience', value: row.experience },
      { label: 'Leadership', value: row.leadership },
      { label: 'Loyalty', value: row.loyalty },
    ]
  }

  if (role === 'team_doctor') {
    return [
      { label: 'Recovery', value: row.expertise },
      { label: 'Prevention', value: row.efficiency },
      { label: 'Diagnosis', value: row.experience },
      { label: 'Potential', value: row.potential },
      { label: 'Leadership', value: row.leadership },
      { label: 'Loyalty', value: row.loyalty },
    ]
  }

  if (role === 'mechanic') {
    return [
      { label: 'Setup', value: row.expertise },
      { label: 'Reliability', value: row.efficiency },
      { label: 'Innovation', value: row.potential },
      { label: 'Experience', value: row.experience },
      { label: 'Discipline', value: row.leadership },
      { label: 'Loyalty', value: row.loyalty },
    ]
  }

  if (role === 'sport_director') {
    return [
      { label: 'Tactics', value: row.expertise },
      { label: 'Motivation', value: row.leadership },
      { label: 'Organization', value: row.efficiency },
      { label: 'Experience', value: row.experience },
      { label: 'Long-Term Vision', value: row.potential },
      { label: 'Loyalty', value: row.loyalty },
    ]
  }

  return [
    { label: 'Evaluation', value: row.expertise },
    { label: 'Network', value: row.experience },
    { label: 'Accuracy', value: row.efficiency },
    { label: 'Prospect Sense', value: row.potential },
    { label: 'Communication', value: row.leadership },
    { label: 'Loyalty', value: row.loyalty },
  ]
}

function formatCourseGains(row: RecentStaffCourseResultRow) {
  const gains: string[] = []
  const rowRecord = row as unknown as Record<string, unknown>

  for (const [key, label] of getCourseGainMap(row.role_type)) {
    const value = Number(rowRecord[key] ?? 0)

    if (Number.isFinite(value) && value > 0) {
      gains.push(`+${value} ${label}`)
    }
  }

  return gains
}

function getLastCourseInfo(row: ClubStaffRow) {
  const courseXp = row.notes?.staff_course_xp

  if (!courseXp || typeof courseXp !== 'object') {
    return {
      title: null,
      gains: [],
    }
  }

  const course = courseXp as Record<string, unknown>
  const gainsRaw =
    course.last_gains && typeof course.last_gains === 'object'
      ? (course.last_gains as Record<string, unknown>)
      : {}

  const gains: string[] = []

  for (const [key, label] of getCourseGainMap(row.role_type)) {
    const value = Number(gainsRaw[key] ?? 0)

    if (Number.isFinite(value) && value > 0) {
      gains.push(`+${value} ${label}`)
    }
  }

  return {
    title: typeof course.last_course_title === 'string' ? course.last_course_title : null,
    gains,
  }
}

function mapStaffMember(
  row: ClubStaffRow,
  currentGameDate: string | null,
  activeCourseByStaffId: Map<string, StaffActiveCourse>,
  infrastructure: ClubInfrastructureRow | null
): StaffListMember {
  const contractUi = formatContractUi(row.contract_expires_at, currentGameDate)
  const roleMeta = getRoleMeta(row.role_type)
  const lastCourseInfo = getLastCourseInfo(row)

  return {
    id: row.id,
    role: row.role_type,
    roleLabel: roleMeta.label,
    name: row.staff_name,
    countryCode: row.country_code || 'RS',
    specialization: row.specialization || 'General',
    salaryWeekly: row.salary_weekly,
    contractExpiresAt: row.contract_expires_at,
    contractPrimaryLabel: contractUi.primary,
    contractSecondaryLabel: contractUi.secondary,
    teamScope: row.team_scope,
    birthDate: row.birth_date,
    ageYears: getStaffAge(row.birth_date, currentGameDate),
    stats: mapStats(row.role_type, row),
    effects: buildEffects(row.role_type, row),
    activeCourse: activeCourseByStaffId.get(row.id) ?? null,
    facilityWarning: getRoleInfrastructureWarning(row.role_type, infrastructure),
    currentAssignmentLabel:
      row.current_assignment_label ??
      (typeof row.notes?.current_assignment_label === 'string'
        ? row.notes.current_assignment_label
        : null),
    lastCourseTitle: lastCourseInfo.title,
    lastCourseGains: lastCourseInfo.gains,
  }
}

function buildAggregateEffectSummary(role: StaffRole, members: StaffListMember[]) {
  if (!members.length) {
    return ['No active contribution yet from this role.']
  }

  if (role === 'head_coach') {
    const training = members.reduce(
      (sum, member) => sum + Math.max(3, Math.floor(member.stats[0].value / 10)),
      0
    )
    const development = members.reduce(
      (sum, member) => sum + Math.max(2, Math.floor(member.stats[1].value / 15)),
      0
    )
    const overload = members.reduce(
      (sum, member) => sum + Math.max(3, Math.floor(member.stats[3].value / 14)),
      0
    )

    return [
      `+${training}% combined training output`,
      `+${development}% combined development support`,
      `-${overload}% combined overload risk`,
    ]
  }

  if (role === 'team_doctor') {
    const risk = members.reduce(
      (sum, member) => sum + Math.max(4, Math.floor(member.stats[0].value / 10)),
      0
    )
    const recovery = members.reduce(
      (sum, member) => sum + Math.max(4, Math.floor(member.stats[1].value / 12)),
      0
    )
    const daily = members.reduce(
      (sum, member) => sum + Math.max(1, Math.floor(member.stats[2].value / 30)),
      0
    )

    return [
      `-${risk}% combined injury and sickness risk`,
      `-${recovery}% combined recovery duration`,
      `+${daily} combined daily recovery`,
    ]
  }

  if (role === 'mechanic') {
    const setup = members.reduce(
      (sum, member) => sum + Math.max(2, Math.floor(member.stats[0].value / 15)),
      0
    )
    const reliability = members.reduce(
      (sum, member) => sum + Math.max(2, Math.floor(member.stats[1].value / 18)),
      0
    )

    return [
      `+${setup}% combined setup quality`,
      `-${reliability}% combined mechanical issue risk`,
      'Future: aggregate terrain and weather setup bonuses',
    ]
  }

  if (role === 'sport_director') {
    const tactics = members.reduce(
      (sum, member) => sum + Math.max(2, Math.floor(member.stats[0].value / 15)),
      0
    )
    const morale = members.reduce(
      (sum, member) => sum + Math.max(1, Math.floor(member.stats[1].value / 20)),
      0
    )

    return [
      `+${tactics}% combined tactical support`,
      `+${morale}% combined morale stability`,
      'Future: stronger collective race execution',
    ]
  }

  const scouting = members.reduce(
    (sum, member) => sum + Math.max(2, Math.floor(member.stats[0].value / 15)),
    0
  )
  const prospects = members.reduce(
    (sum, member) => sum + Math.max(2, Math.floor(member.stats[1].value / 18)),
    0
  )

  return [
    `+${scouting}% combined scouting accuracy`,
    `+${prospects}% combined prospect visibility`,
    'Future: broader transfer and youth intelligence',
  ]
}

function buildAverageStats(members: StaffListMember[]) {
  if (!members.length) return []

  const labels = members[0].stats.map((stat) => stat.label)

  return labels.map((label, index) => {
    const total = members.reduce((sum, member) => sum + (member.stats[index]?.value ?? 0), 0)
    return {
      label,
      value: Math.round(total / members.length),
    }
  })
}

function RoleTabButton({
  role,
  selected,
  currentCount,
  limit,
  onClick,
}: {
  role: StaffRole
  selected: boolean
  currentCount: number
  limit: number
  onClick: () => void
}) {
  const meta = getRoleMeta(role)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-yellow-300 bg-yellow-50 shadow-sm'
          : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">{meta.label}</div>
          <div className="mt-1 text-xs text-gray-500">{meta.subtitle}</div>
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            selected ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {currentCount}/{limit}
        </span>
      </div>
    </button>
  )
}

function getStaffAssignmentLabel(staff: StaffListMember) {
  const rawLabel = staff.currentAssignmentLabel?.trim()

  if (!rawLabel) {
    return {
      text: 'Currently not assigned',
      isActive: false,
    }
  }

  const cleanedLabel = rawLabel
    .replace(/\s*•\s*Completes:\s*.+$/i, '')
    .replace(/\s*-\s*Completes:\s*.+$/i, '')
    .replace(/\s*Completes:\s*.+$/i, '')
    .trim()

  return {
    text: cleanedLabel || rawLabel,
    isActive: true,
  }
}

function StaffListRow({
  staff,
  onOpen,
}: {
  staff: StaffListMember
  onOpen: (staff: StaffListMember) => void
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <img
              src={getCountryFlagUrl(safeCountryCode(staff.countryCode))}
              alt={staff.countryCode}
              className="h-4 w-6 rounded-sm border border-gray-200 object-cover"
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900">{staff.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>
                  {staff.specialization} • Scope: {staff.teamScope.replace('_', ' ')}
                </span>
                <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                  {formatStaffAge(staff.ageYears)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {staff.stats.map((stat) => (
              <div key={stat.label} className="rounded-lg bg-gray-50 px-3 py-2">
                <div className="text-[11px] text-gray-500">{stat.label}</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{stat.value}</div>
              </div>
            ))}
          </div>

          {staff.activeCourse ? (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
              <div className="text-xs font-medium text-blue-900">On Course</div>
              <div className="mt-1 text-xs text-blue-800">{staff.activeCourse.title}</div>
            </div>
          ) : null}

          {(() => {
            const assignment = getStaffAssignmentLabel(staff)

            return (
              <div
                className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                  assignment.isActive
                    ? 'border border-blue-100 bg-blue-50 text-blue-700'
                    : 'border border-gray-100 bg-gray-50 text-gray-500'
                }`}
              >
                <span className="font-medium">Current assignment:</span> {assignment.text}
              </div>
            )
          })()}

          {staff.facilityWarning ? (
            <div className="mt-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
              {staff.facilityWarning}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-3 xl:w-64 xl:items-end">
          <div className="w-full rounded-lg bg-gray-50 px-3 py-3 xl:w-60">
            <div className="text-[11px] text-gray-500">Weekly Wage</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">
              {formatCurrency(staff.salaryWeekly)}
            </div>
            <div className="mt-2 text-[11px] text-gray-500">Contract</div>
            <div className="mt-1 text-xs font-medium text-gray-700">{staff.contractPrimaryLabel}</div>
            {staff.contractSecondaryLabel ? (
              <div className="mt-1 text-[11px] text-gray-500">{staff.contractSecondaryLabel}</div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => onOpen(staff)}
            className="w-full rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black transition hover:bg-yellow-300 xl:w-60"
          >
            Open Staff Profile
          </button>
        </div>
      </div>
    </div>
  )
}

function RoleContributionPanel({
  role,
  members,
  infrastructure,
  roleLimit,
}: {
  role: StaffRole
  members: StaffListMember[]
  infrastructure: ClubInfrastructureRow | null
  roleLimit: number
}) {
  const roleMeta = getRoleMeta(role)
  const facilityWarning = getRoleInfrastructureWarning(role, infrastructure)
  const averageStats = buildAverageStats(members)
  const aggregateEffects = buildAggregateEffectSummary(role, members)
  const weeklyWages = members.reduce((sum, member) => sum + member.salaryWeekly, 0)
  const activeCourses = members.filter((member) => member.activeCourse !== null).length

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-base font-semibold text-gray-900">{roleMeta.label} Role Summary</div>
          <div className="mt-1 text-sm text-gray-500">{roleMeta.subtitle}</div>
        </div>

        <div className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm">
          Assigned {members.length}/{roleLimit}
        </div>
      </div>

      {facilityWarning ? (
        <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          {facilityWarning}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Assigned"
          value={`${members.length}/${roleLimit}`}
          subtext={members.length < roleLimit ? 'Open slot available' : 'Current basic cap reached'}
        />
        <SummaryCard
          label="Weekly Wages"
          value={formatCurrency(weeklyWages)}
          subtext="For this role only"
        />
        <SummaryCard
          label="Active Courses"
          value={String(activeCourses)}
          subtext="Bonuses are partially paused while staff study"
        />
        <SummaryCard
          label="Open Slots"
          value={String(Math.max(roleLimit - members.length, 0))}
          subtext="Use Transfers → Staff to fill vacancies"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div>
          <SectionTitle
            title="Combined Team Impact"
            subtitle="Basic v1 summary of what this role currently contributes."
          />
          <div className="space-y-2">
            {aggregateEffects.map((effect) => (
              <div
                key={effect}
                className="rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700"
              >
                {effect}
              </div>
            ))}
          </div>

          <div className="mt-5">
            <SectionTitle
              title="Where This Role Helps"
              subtitle="Main game systems influenced by this role."
            />
            <div className="flex flex-wrap gap-2">
              {roleMeta.impactAreas.map((area) => (
                <span
                  key={area}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div>
          <SectionTitle
            title="Average Skill Profile"
            subtitle="Average values across staff currently assigned to this role."
          />
          {averageStats.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {averageStats.map((stat) => (
                <div key={stat.label} className="rounded-lg border border-gray-100 bg-white px-4 py-3">
                  <div className="text-xs text-gray-500">{stat.label}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{stat.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-sm text-gray-500">
              No staff assigned to this role yet, so there is no active skill profile to summarize.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StaffDetailModal({
  staff,
  infrastructure,
  onClose,
  onRequestRelease,
  onRequestExtend,
  onRequestCourse,
}: {
  staff: StaffListMember | null
  infrastructure: ClubInfrastructureRow | null
  onClose: () => void
  onRequestRelease: (staff: StaffListMember) => void
  onRequestExtend: (staff: StaffListMember) => void
  onRequestCourse: (staff: StaffListMember) => void
}) {
  if (!staff) return null

  const scoutQuality = calculateScoutQuality(staff, infrastructure)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <div className="text-lg font-semibold text-gray-900">{staff.roleLabel}</div>
            <div className="mt-1 text-sm text-gray-500">{staff.specialization}</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-3">
                <img
                  src={getCountryFlagUrl(safeCountryCode(staff.countryCode))}
                  alt={staff.countryCode}
                  className="h-5 w-7 rounded-sm border border-gray-200 object-cover"
                />
                <div>
                  <div className="font-semibold text-gray-900">{staff.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span>Scope: {staff.teamScope.replace('_', ' ')}</span>
                    <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                      {formatStaffAge(staff.ageYears)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Weekly Wage</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(staff.salaryWeekly)}
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="text-xs text-gray-500">Contract</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {staff.contractPrimaryLabel}
                  </div>
                  {staff.contractSecondaryLabel ? (
                    <div className="mt-1 text-xs text-gray-500">{staff.contractSecondaryLabel}</div>
                  ) : null}
                </div>

                <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                  <div className="text-xs text-green-700">Age</div>
                  <div className="mt-1 text-sm font-semibold text-green-900">
                    {staff.ageYears ?? 'Age unknown'}
                  </div>
                  {staff.birthDate ? (
                    <div className="mt-1 text-xs text-green-700">
                      Born: {parseIsoDateUtc(staff.birthDate)?.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              {(() => {
                const assignment = getStaffAssignmentLabel(staff)

                return (
                  <div
                    className={`mt-4 rounded-xl border p-4 ${
                      assignment.isActive
                        ? 'border-blue-100 bg-blue-50 text-blue-800'
                        : 'border-gray-100 bg-gray-50 text-gray-600'
                    }`}
                  >
                    <div className="text-sm font-semibold">Current Assignment</div>
                    <div className="mt-2 text-sm">{assignment.text}</div>

                    {staff.activeCourse ? (
                      <div className="mt-2 text-xs">
                        Course in progress: {staff.activeCourse.title}. Completion:{' '}
                        {formatGameDateShort(staff.activeCourse.completesOnGameDate)}.
                      </div>
                    ) : null}
                  </div>
                )
              })()}

              {staff.activeCourse ? (
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <div className="text-sm font-semibold text-blue-900">Current Course</div>
                  <div className="mt-2 text-sm text-blue-800">{staff.activeCourse.title}</div>
                  <div className="mt-2 space-y-1 text-xs text-blue-700">
                    <div>Focus: {staff.activeCourse.focusLabel}</div>
                    <div>Duration: {staff.activeCourse.durationDays} days</div>
                    <div>Completion: {formatGameDateShort(staff.activeCourse.completesOnGameDate)}</div>
                  </div>
                  <div className="mt-2 text-xs text-blue-700">
                    This course cannot be canceled once booked. Staff bonuses from this role are
                    paused until completion.
                  </div>
                </div>
              ) : null}

              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-900">Active Effects</div>
                <div className="mt-2 space-y-2">
                  {staff.effects.map((effect) => (
                    <div
                      key={effect}
                      className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                    >
                      {effect}
                    </div>
                  ))}
                </div>
              </div>

              {staff.facilityWarning ? (
                <div className="mt-4 rounded-lg bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
                  {staff.facilityWarning}
                </div>
              ) : null}

              {staff.role === 'scout_analyst' ? (
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                  <div className="font-semibold">How Scout Quality Works</div>
                  <div className="mt-2 text-blue-800">
                    Scout attributes create the scout’s true ability. The Scouting Office can cap the final
                    report quality, so a strong scout may still produce basic reports until the office is upgraded.
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-white px-3 py-2">
                      <div className="text-xs text-blue-700">Scout Ability levels</div>
                      <div className="mt-1 font-medium">Basic → Solid → Strong → Elite</div>
                    </div>

                    <div className="rounded-lg bg-white px-3 py-2">
                      <div className="text-xs text-blue-700">Report Quality levels</div>
                      <div className="mt-1 font-medium">Basic → Solid → Strong → Elite</div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-lg bg-white px-3 py-2">
                    <div className="text-xs text-blue-700">Scout Ability thresholds</div>
                    <div className="mt-1 text-xs font-medium text-blue-950">
                      Basic: below 55 · Solid: 55–69 · Strong: 70–84 · Elite: 85+
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    Better Scouting Office unlocks higher report quality.
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-gray-100 p-4">
              <div className="text-sm font-semibold text-gray-900">Staff Attributes</div>
              <div className="mt-3 space-y-2">
                {staff.stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <span className="text-sm text-gray-600">{stat.label}</span>
                    <span className="text-sm font-semibold text-gray-900">{stat.value}</span>
                  </div>
                ))}
              </div>

              {scoutQuality ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-gray-900">Scouting Quality</div>

                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">Scout Ability</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900">
                          {formatScoutTier(scoutQuality.scoutAbilityTier)} ({scoutQuality.scoutAbilityScore})
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">Current Report Quality</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        <span className="inline-flex rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-semibold text-yellow-900">
                          {formatScoutTier(scoutQuality.currentReportTier)}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">Report Time</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {scoutQuality.durationHours}h
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">Scouting Office</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        Lv {scoutQuality.scoutingLevel}
                      </div>
                    </div>
                  </div>

                  {scoutQuality.isLimitedByOffice ? (
                    <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                      Limited by Scouting Office Lv {scoutQuality.scoutingLevel}.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {staff.lastCourseGains.length > 0 ? (
                <div className="mt-4 rounded-xl border border-green-100 bg-green-50 p-4">
                  <div className="text-sm font-semibold text-green-900">Last Course Gains</div>
                  {staff.lastCourseTitle ? (
                    <div className="mt-1 text-sm text-green-800">{staff.lastCourseTitle}</div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {staff.lastCourseGains.map((gain) => (
                      <span
                        key={gain}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-green-800"
                      >
                        {gain}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onRequestExtend(staff)}
                className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300"
              >
                Extend Contract
              </button>

              <button
                type="button"
                onClick={() => onRequestCourse(staff)}
                disabled={Boolean(staff.activeCourse)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  staff.activeCourse
                    ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                    : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {staff.activeCourse ? 'Course In Progress' : 'Send on Course'}
              </button>

              <button
                type="button"
                onClick={() => onRequestRelease(staff)}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Release
              </button>
            </div>

            {staff.role === 'scout_analyst' ? (
              <a
                href="#/dashboard/scouting"
                className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300"
              >
                Scouting Reports
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReleaseConfirmModal({
  staff,
  loading,
  onCancel,
  onConfirm,
}: {
  staff: StaffListMember | null
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!staff) return null

  const releaseCost = getStaffReleaseCost(staff.salaryWeekly)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="text-lg font-semibold text-gray-900">Release Staff</div>
          <div className="mt-1 text-sm text-gray-500">
            Confirm this staff decision before continuing.
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <div className="text-sm font-medium text-red-800">
              You are about to release <span className="font-semibold">{staff.name}</span>
            </div>
            <div className="mt-1 text-sm text-red-700">Role: {staff.roleLabel}</div>
            <div className="mt-1 text-sm text-red-700">
              Weekly wage: {formatCurrency(staff.salaryWeekly)}
            </div>
            <div className="mt-1 text-sm text-red-700">
              Age: {formatStaffAge(staff.ageYears)}
            </div>
            <div className="mt-1 text-sm font-semibold text-red-800">
              Release compensation (6 weeks): {formatCurrency(releaseCost)}
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            This will remove the staff member from the squad immediately. Staff bonuses from this
            slot will stop until you sign a replacement.
          </div>

          <div className="mt-2 text-sm text-gray-600">
            The club will pay a one-time release compensation equal to 6 weeks of salary.
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                loading
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                loading
                  ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                  : 'bg-red-600 text-white hover:bg-red-500'
              }`}
            >
              {loading ? 'Releasing...' : 'Confirm Release'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ExtendContractModal({
  staff,
  currentGameDate,
  seasons,
  setSeasons,
  quote,
  loading,
  submitting,
  salaryInput,
  setSalaryInput,
  error,
  resultMessage,
  resultTone,
  onCancel,
  onConfirm,
}: {
  staff: StaffListMember | null
  currentGameDate: string | null
  seasons: 1 | 2
  setSeasons: (value: 1 | 2) => void
  quote: ExtendContractQuoteRow | null
  loading: boolean
  submitting: boolean
  salaryInput: string
  setSalaryInput: (value: string) => void
  error: string | null
  resultMessage: string | null
  resultTone: 'success' | 'warning' | 'error' | null
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!staff) return null

  const targetContractUi = formatContractUi(
    quote?.target_contract_expires_at ?? null,
    currentGameDate
  )

  const offeredSalary = Number(salaryInput)
  const requestedSalary = quote?.requested_salary_weekly ?? 0
  const minimumSalary = quote?.minimum_acceptable_salary_weekly ?? 0

  const offerChance =
    quote && Number.isFinite(offeredSalary) && offeredSalary > 0
      ? Math.max(
          0,
          Math.min(
            100,
            offeredSalary >= requestedSalary
              ? quote.interest_score ?? 100
              : offeredSalary >= minimumSalary
                ? Math.round(
                    55 +
                      ((offeredSalary - minimumSalary) /
                        Math.max(1, requestedSalary - minimumSalary)) *
                        30
                  )
                : Math.round((offeredSalary / Math.max(1, minimumSalary)) * 50)
          )
        )
      : quote?.interest_score ?? null

  const offerChanceLabel =
    offerChance == null
      ? 'Chance unknown'
      : offerChance >= 80
        ? 'Very likely to accept'
        : offerChance >= 60
          ? 'Possible, but may ask for more'
          : offerChance >= 40
            ? 'Unlikely at this salary'
            : 'Very unlikely'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="text-lg font-semibold text-gray-900">Extend Contract</div>
          <div className="mt-1 text-sm text-gray-500">
            Negotiate a new staff deal for {staff.name}.
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs text-gray-500">Current Salary</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">
                {formatCurrency(staff.salaryWeekly)}/week
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs text-gray-500">Current Contract</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{staff.contractPrimaryLabel}</div>
              {staff.contractSecondaryLabel ? (
                <div className="mt-1 text-xs text-gray-500">{staff.contractSecondaryLabel}</div>
              ) : null}
            </div>

            <div className="rounded-xl border border-green-100 bg-green-50 p-4">
              <div className="text-xs text-green-700">Age</div>
              <div className="mt-1 text-sm font-semibold text-green-900">
                {formatStaffAge(staff.ageYears)}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-sm font-semibold text-gray-900">Extension Length</div>
            <div className="mt-3 inline-flex rounded-lg border border-gray-100 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setSeasons(1)}
                disabled={loading || submitting}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  seasons === 1
                    ? 'bg-yellow-400 text-black'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                1 Season
              </button>

              <button
                type="button"
                onClick={() => setSeasons(2)}
                disabled={loading || submitting}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  seasons === 2
                    ? 'bg-yellow-400 text-black'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                2 Seasons
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
            {loading ? (
              <div className="text-sm text-gray-500">Loading contract quote...</div>
            ) : quote ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs text-gray-500">Requested Salary</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(quote.requested_salary_weekly)}/week
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Raise request: {quote.requested_raise_percent}%
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Minimum Acceptable</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {formatCurrency(quote.minimum_acceptable_salary_weekly)}/week
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">New Contract Target</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    {targetContractUi.primary}
                  </div>
                  {targetContractUi.secondary ? (
                    <div className="mt-1 text-xs text-gray-500">{targetContractUi.secondary}</div>
                  ) : null}
                </div>

                <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Staff Interest
                  </div>

                  <div className="mt-1 text-sm font-semibold text-blue-900">
                    {quote.interest_level || 'Interest unknown'}
                    {quote.interest_score != null ? ` (${quote.interest_score}/100)` : ''}
                  </div>

                  {offerChance != null ? (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-blue-800">
                        <span>Chance to renew</span>
                        <span>{offerChance}%</span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{
                            width: `${offerChance}%`,
                          }}
                        />
                      </div>

                      <div className="mt-1 text-xs font-medium text-blue-900">
                        {offerChanceLabel}
                      </div>
                    </div>
                  ) : null}

                  {quote.willingness_status ? (
                    <div className="mt-1 text-xs text-blue-800">
                      Status: {quote.willingness_status.replaceAll('_', ' ')}
                    </div>
                  ) : null}

                  {quote.decision_reason ? (
                    <div className="mt-2 text-xs text-blue-800">{quote.decision_reason}</div>
                  ) : null}

                  {quote.salary_reason ? (
                    <div className="mt-1 text-xs text-blue-700">{quote.salary_reason}</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No quote available.</div>
            )}
          </div>

          {resultMessage ? (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                resultTone === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : resultTone === 'warning'
                    ? 'border-yellow-200 bg-yellow-50 text-yellow-800'
                    : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {resultMessage}
            </div>
          ) : null}

          <div className="mt-5">
            <label className="block text-sm font-semibold text-gray-900">Your Salary Offer</label>
            <div className="mt-2 flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2">
              <span className="mr-2 text-sm text-gray-500">$</span>
              <input
                type="number"
                min={0}
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                disabled={loading || submitting}
                className="w-full bg-transparent text-sm text-gray-900 outline-none"
                placeholder="Enter weekly salary"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                submitting
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading || submitting || !salaryInput.trim()}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                loading || submitting || !salaryInput.trim()
                  ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                  : 'bg-yellow-400 text-black hover:bg-yellow-300'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit Offer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StaffCourseModal({
  staff,
  startingCourseCode,
  error,
  onCancel,
  onStartCourse,
}: {
  staff: StaffListMember | null
  startingCourseCode: string | null
  error: string | null
  onCancel: () => void
  onStartCourse: (courseCode: string) => void
}) {
  if (!staff) return null

  const courseOptions = buildCourseOptions(staff.role)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="text-lg font-semibold text-gray-900">Staff Course</div>
          <div className="mt-1 text-sm text-gray-500">
            Plan development work for {staff.name}.
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="text-sm font-medium text-blue-900">Live course start</div>
            <div className="mt-1 text-sm text-blue-800">
              Starting a course creates a real staff course entry. Stat gains apply when the
              backend completion processor finishes the course. Courses cannot be canceled once
              booked. Staff bonuses from this role are paused until the course is completed.
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-green-100 bg-green-50 p-4">
            <div className="text-sm font-semibold text-green-900">Staff Age</div>
            <div className="mt-1 text-sm text-green-800">
              {staff.name}: {formatStaffAge(staff.ageYears)}
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courseOptions.map((option) => (
              <div key={option.code} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">{option.title}</div>
                <div className="mt-2 text-sm text-gray-600">{option.description}</div>

                <div className="mt-4 space-y-1 text-xs text-gray-500">
                  <div>Focus: {option.focusLabel}</div>
                  <div>Duration: {option.durationDays} days</div>
                  <div>Cost: {formatCurrency(option.costCash)}</div>
                </div>

                <button
                  type="button"
                  onClick={() => onStartCourse(option.code)}
                  disabled={startingCourseCode !== null}
                  className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
                    startingCourseCode !== null
                      ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                      : 'bg-yellow-400 text-black hover:bg-yellow-300'
                  }`}
                >
                  {startingCourseCode === option.code ? 'Starting...' : 'Start Course'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={startingCourseCode !== null}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                startingCourseCode !== null
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Back to Staff
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StaffPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clubName, setClubName] = useState<string | null>(null)
  const [clubId, setClubId] = useState<string | null>(null)
  const [hasDevelopingTeam, setHasDevelopingTeam] = useState(false)
  const [currentGameDate, setCurrentGameDate] = useState<string | null>(null)

  const [staffRows, setStaffRows] = useState<ClubStaffRow[]>([])
  const [activeCourseRows, setActiveCourseRows] = useState<ActiveStaffCourseRow[]>([])
  const [recentCourseResults, setRecentCourseResults] = useState<RecentStaffCourseResultRow[]>([])
  const [infrastructure, setInfrastructure] = useState<ClubInfrastructureRow | null>(null)
  const [roleLimits, setRoleLimits] = useState<StaffRoleLimitRow[]>([])
  const [selectedRole, setSelectedRole] = useState<StaffRole>('head_coach')
  const [selectedStaff, setSelectedStaff] = useState<StaffListMember | null>(null)
  const [releaseConfirmStaff, setReleaseConfirmStaff] = useState<StaffListMember | null>(null)
  const [pageMessage, setPageMessage] = useState<string | null>(null)
  const [releaseLoadingId, setReleaseLoadingId] = useState<string | null>(null)

  const [extendContractStaff, setExtendContractStaff] = useState<StaffListMember | null>(null)
  const [extendContractSeasons, setExtendContractSeasons] = useState<1 | 2>(1)
  const [extendQuote, setExtendQuote] = useState<ExtendContractQuoteRow | null>(null)
  const [extendQuoteLoading, setExtendQuoteLoading] = useState(false)
  const [extendSubmitLoading, setExtendSubmitLoading] = useState(false)
  const [extendContractSalary, setExtendContractSalary] = useState('')
  const [extendContractError, setExtendContractError] = useState<string | null>(null)
  const [extendResultMessage, setExtendResultMessage] = useState<string | null>(null)
  const [extendResultTone, setExtendResultTone] = useState<'success' | 'warning' | 'error' | null>(null)

  const [courseStaff, setCourseStaff] = useState<StaffListMember | null>(null)
  const [courseStartLoadingCode, setCourseStartLoadingCode] = useState<string | null>(null)
  const [courseError, setCourseError] = useState<string | null>(null)

  async function reloadStaffPage(targetClubId: string) {
    const [
      staffResult,
      infraResult,
      gameDateResult,
      activeCoursesResult,
      recentCourseResultsResult,
      roleLimitsResult,
    ] = await Promise.all([
      supabase.rpc('get_club_staff_with_current_assignments', {
        p_club_id: targetClubId,
      }),
      supabase
        .from('club_infrastructure')
        .select(`
          club_id,
          hq_level,
          training_center_level,
          medical_center_level,
          scouting_level,
          youth_academy_level,
          mechanics_workshop_level
        `)
        .eq('club_id', targetClubId)
        .maybeSingle(),
      supabase.rpc('get_current_game_date_date'),
      supabase.rpc('get_club_active_staff_courses', {
        p_club_id: targetClubId,
      }),
      supabase.rpc('get_club_recent_staff_course_results', {
        p_club_id: targetClubId,
        p_limit: 6,
      }),
      supabase.rpc('get_staff_role_capacity_overview_for_club', {
        p_club_id: targetClubId,
      }),
    ])

    if (staffResult.error) throw staffResult.error
    if (infraResult.error) throw infraResult.error
    if (gameDateResult.error) throw gameDateResult.error
    if (activeCoursesResult.error) throw activeCoursesResult.error
    if (recentCourseResultsResult.error) throw recentCourseResultsResult.error
    if (roleLimitsResult.error) throw roleLimitsResult.error

    const nextStaffRows = (staffResult.data || []) as ClubStaffRow[]
    const nextInfrastructure = (infraResult.data as ClubInfrastructureRow | null) || null
    const nextGameDate = normalizeGameDateValue(gameDateResult.data)
    const nextActiveCourseRows = Array.isArray(activeCoursesResult.data)
      ? (activeCoursesResult.data as ActiveStaffCourseRow[])
      : []
    const nextRecentCourseResults = Array.isArray(recentCourseResultsResult.data)
      ? (recentCourseResultsResult.data as RecentStaffCourseResultRow[])
      : []
    const nextRoleLimits = Array.isArray(roleLimitsResult.data)
      ? (roleLimitsResult.data as StaffRoleLimitRow[])
      : []

    setStaffRows(nextStaffRows)
    setInfrastructure(nextInfrastructure)
    setCurrentGameDate(nextGameDate)
    setActiveCourseRows(nextActiveCourseRows)
    setRecentCourseResults(nextRecentCourseResults)
    setRoleLimits(nextRoleLimits)

    return {
      staffRows: nextStaffRows,
      infrastructure: nextInfrastructure,
      currentGameDate: nextGameDate,
      activeCourseRows: nextActiveCourseRows,
      recentCourseResults: nextRecentCourseResults,
      roleLimits: nextRoleLimits,
    }
  }

  useEffect(() => {
    let mounted = true

    async function loadStaffPage() {
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
          .select('id, club_type, parent_club_id, deleted_at, name')
          .eq('owner_user_id', user.id)
          .is('deleted_at', null)

        if (clubsError) throw clubsError

        const resolvedClub = resolveMainClub((clubsData || []) as ClubRow[])
        if (!resolvedClub) throw new Error('Main club not found.')

        const { data: developingStatusData, error: developingStatusError } = await supabase.rpc(
          'get_developing_team_status'
        )

        if (!mounted) return

        setClubName(resolvedClub.name || null)
        setClubId(resolvedClub.id)

        if (developingStatusError) {
          setHasDevelopingTeam(false)
        } else {
          const normalizedDevStatus = Array.isArray(developingStatusData)
            ? developingStatusData[0]
            : developingStatusData

          setHasDevelopingTeam(
            ((normalizedDevStatus ?? null) as DevelopingTeamStatusRow | null)?.is_purchased ?? false
          )
        }

        await reloadStaffPage(resolvedClub.id)
      } catch (err) {
        const message = getErrorMessage(err, 'Failed to load staff page.')

        if (!mounted) return
        setError(message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadStaffPage()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadExtendQuote() {
      if (!extendContractStaff) return

      try {
        setExtendQuoteLoading(true)
        setExtendContractError(null)

        const { data, error: quoteError } = await supabase.rpc('staff_get_contract_extension_quote', {
          p_staff_id: extendContractStaff.id,
          p_seasons: extendContractSeasons,
        })

        if (cancelled) return

        if (quoteError) throw quoteError

        const normalizedQuote = normalizeRpcSingle<ExtendContractQuoteRow>(data)
        setExtendQuote(normalizedQuote)
        setExtendContractSalary(
          normalizedQuote?.requested_salary_weekly != null
            ? String(normalizedQuote.requested_salary_weekly)
            : ''
        )
      } catch (err) {
        if (cancelled) return
        const message = getErrorMessage(err, 'Failed to load extension quote.')
        setExtendQuote(null)
        setExtendContractSalary('')
        setExtendContractError(message)
      } finally {
        if (!cancelled) setExtendQuoteLoading(false)
      }
    }

    void loadExtendQuote()

    return () => {
      cancelled = true
    }
  }, [extendContractStaff, extendContractSeasons])

  const activeCourseByStaffId = useMemo(() => {
    const map = new Map<string, StaffActiveCourse>()

    for (const row of activeCourseRows) {
      map.set(row.staff_id, {
        id: row.course_id,
        code: row.course_code,
        title: row.course_title,
        focusLabel: row.focus_label,
        startedGameDate: row.started_game_date,
        completesOnGameDate: row.completes_on_game_date,
        durationDays: row.duration_days,
        costCash: row.cost_cash,
        status: row.status,
      })
    }

    return map
  }, [activeCourseRows])

  const roleLimitMap = useMemo(() => {
    const map = new Map<StaffRole, StaffRoleLimitRow>()

    for (const row of roleLimits) {
      map.set(row.role_type, row)
    }

    return map
  }, [roleLimits])

  const staffMembers = useMemo(
    () =>
      staffRows.map((row) => mapStaffMember(row, currentGameDate, activeCourseByStaffId, infrastructure)),
    [staffRows, currentGameDate, activeCourseByStaffId, infrastructure]
  )

  const membersByRole = useMemo(() => {
    const grouped: Record<StaffRole, StaffListMember[]> = {
      head_coach: [],
      team_doctor: [],
      mechanic: [],
      sport_director: [],
      scout_analyst: [],
    }

    for (const member of staffMembers) {
      grouped[member.role].push(member)
    }

    return grouped
  }, [staffMembers])

  const selectedRoleMeta = getRoleMeta(selectedRole)
  const selectedRoleMembers = membersByRole[selectedRole]
  const selectedRoleLimit = getRoleLimit(selectedRole, roleLimitMap)
  const selectedRoleWarning = getRoleInfrastructureWarning(selectedRole, infrastructure)

  const weeklyWages = useMemo(
    () => staffMembers.reduce((sum, member) => sum + member.salaryWeekly, 0),
    [staffMembers]
  )

  const totalStaffLimit = useMemo(
    () => ROLE_TABS.reduce((sum, roleMeta) => sum + getRoleLimit(roleMeta.role, roleLimitMap), 0),
    [roleLimitMap]
  )

  const openStaffSlots = Math.max(totalStaffLimit - staffMembers.length, 0)
  const warningsCount = staffMembers.filter((member) => Boolean(member.facilityWarning)).length
  const activeCoursesCount = staffMembers.filter((member) => member.activeCourse !== null).length

  async function confirmReleaseStaff() {
    if (!releaseConfirmStaff || !clubId) return

    try {
      setReleaseLoadingId(releaseConfirmStaff.id)
      setPageMessage(null)

      const releaseCost = getStaffReleaseCost(releaseConfirmStaff.salaryWeekly)

      const { error: releaseError } = await supabase.rpc('release_club_staff', {
        p_staff_id: releaseConfirmStaff.id,
      })

      if (releaseError) throw releaseError

      await reloadStaffPage(clubId)

      const releasedName = releaseConfirmStaff.name
      const releasedRole = releaseConfirmStaff.roleLabel

      setReleaseConfirmStaff(null)
      setSelectedStaff(null)
      setPageMessage(
        `${releasedName} was released from ${releasedRole}. Release compensation paid: ${formatCurrency(
          releaseCost
        )}.`
      )
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to release staff member.')
      setPageMessage(message)
    } finally {
      setReleaseLoadingId(null)
    }
  }

  async function confirmExtendContract() {
    if (!extendContractStaff || !clubId) return

    const parsedSalary = Number(extendContractSalary)

    if (!Number.isFinite(parsedSalary) || parsedSalary <= 0) {
      setExtendContractError('Please enter a valid weekly salary.')
      return
    }

    try {
      setExtendSubmitLoading(true)
      setExtendContractError(null)
      setExtendResultMessage(null)
      setExtendResultTone(null)
      setPageMessage(null)

      const { data, error: extendError } = await supabase.rpc('extend_club_staff_contract', {
        p_staff_id: extendContractStaff.id,
        p_seasons: extendContractSeasons,
        p_salary_weekly: parsedSalary,
      })

      if (extendError) throw extendError

      const result = normalizeRpcSingle<{
        staff_name: string
        new_salary_weekly: number
        new_contract_expires_at: string
        new_season_number: number
        decision_status?: string
        decision_message?: string
      }>(data)

      const refreshedPage = await reloadStaffPage(clubId)

      const refreshedActiveCourseByStaffId = new Map<string, StaffActiveCourse>()
      for (const row of refreshedPage.activeCourseRows) {
        refreshedActiveCourseByStaffId.set(row.staff_id, {
          id: row.course_id,
          code: row.course_code,
          title: row.course_title,
          focusLabel: row.focus_label,
          startedGameDate: row.started_game_date,
          completesOnGameDate: row.completes_on_game_date,
          durationDays: row.duration_days,
          costCash: row.cost_cash,
          status: row.status,
        })
      }

      const refreshedMembers = refreshedPage.staffRows.map((row) =>
        mapStaffMember(
          row,
          refreshedPage.currentGameDate,
          refreshedActiveCourseByStaffId,
          refreshedPage.infrastructure
        )
      )

      const refreshedStaff = refreshedMembers.find((member) => member.id === extendContractStaff.id) ?? null

      setSelectedStaff(refreshedStaff)
      setExtendContractStaff(refreshedStaff ?? extendContractStaff)
      setExtendContractError(null)

      if (result) {
        const status = result.decision_status || 'accepted'

        if (status === 'accepted') {
          setExtendResultTone('success')
          setExtendResultMessage(
            `${result.staff_name} accepted the new contract: ${formatCurrency(
              result.new_salary_weekly
            )}/week until Season ${result.new_season_number}.`
          )
        } else if (status === 'countered') {
          setExtendResultTone('warning')
          setExtendResultMessage(result.decision_message || `${result.staff_name} wants improved terms.`)
        } else if (status === 'rejected') {
          setExtendResultTone('error')
          setExtendResultMessage(result.decision_message || `${result.staff_name} rejected the offer.`)
        } else {
          setExtendResultTone('warning')
          setExtendResultMessage(result.decision_message || 'Contract discussion completed.')
        }
      } else {
        setExtendResultTone('success')
        setExtendResultMessage('Staff contract extended successfully.')
      }
    } catch (err) {
      const rawMessage = getErrorMessage(err, 'Failed to extend staff contract.')

      const friendlyMessage = rawMessage.includes('Minimum acceptable salary is')
        ? rawMessage.replace(
            /^extend_club_staff_contract:\s*/i,
            ''
          ).replace(
            'Minimum acceptable salary is',
            'Minimum acceptable weekly salary is $'
          )
        : rawMessage.includes('wants closer to')
          ? rawMessage.replace(
              /^extend_club_staff_contract:\s*/i,
              ''
            ).replace(
              /(.+?) wants closer to (\d+) per week\.?/i,
              '$1 wants a weekly salary closer to $$$2.'
            )
          : rawMessage.replace(/^extend_club_staff_contract:\s*/i, '')

      setExtendContractError(friendlyMessage)
    } finally {
      setExtendSubmitLoading(false)
    }
  }

  async function confirmStartCourse(courseCode: string) {
    if (!courseStaff || !clubId) return

    const previousStaff = courseStaff

    try {
      setCourseStartLoadingCode(courseCode)
      setCourseError(null)
      setPageMessage(null)

      const { data, error } = await supabase.rpc('start_staff_course', {
        p_staff_id: previousStaff.id,
        p_course_code: courseCode,
      })

      if (error) throw error

      const result = normalizeRpcSingle<{
        course_title: string
        completes_on_game_date: string
      }>(data)

      const refreshedPage = await reloadStaffPage(clubId)

      const refreshedActiveCourseMap = new Map<string, StaffActiveCourse>()
      for (const row of refreshedPage.activeCourseRows) {
        refreshedActiveCourseMap.set(row.staff_id, {
          id: row.course_id,
          code: row.course_code,
          title: row.course_title,
          focusLabel: row.focus_label,
          startedGameDate: row.started_game_date,
          completesOnGameDate: row.completes_on_game_date,
          durationDays: row.duration_days,
          costCash: row.cost_cash,
          status: row.status,
        })
      }

      const refreshedMembers = refreshedPage.staffRows.map((row) =>
        mapStaffMember(
          row,
          refreshedPage.currentGameDate,
          refreshedActiveCourseMap,
          refreshedPage.infrastructure
        )
      )

      const refreshedStaff = refreshedMembers.find((member) => member.id === previousStaff.id) ?? null

      setCourseStaff(null)
      setSelectedStaff(refreshedStaff)

      if (result) {
        setPageMessage(
          `${previousStaff.name} started ${result.course_title}. Completion target ${formatGameDateShort(
            result.completes_on_game_date
          )}.`
        )
      } else {
        setPageMessage(`${previousStaff.name} started a staff course.`)
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to start staff course.')
      setCourseError(message)
    } finally {
      setCourseStartLoadingCode(null)
    }
  }

  function openReleaseFlow(staff: StaffListMember) {
    setSelectedStaff(null)
    setReleaseConfirmStaff(staff)
  }

  function openExtendFlow(staff: StaffListMember) {
    setSelectedStaff(null)
    setExtendContractStaff(staff)
    setExtendContractSeasons(1)
    setExtendQuote(null)
    setExtendContractSalary('')
    setExtendContractError(null)
    setExtendResultMessage(null)
    setExtendResultTone(null)
  }

  function openCourseFlow(staff: StaffListMember) {
    setSelectedStaff(null)
    setCourseError(null)
    setCourseStartLoadingCode(null)
    setCourseStaff(staff)
  }

  if (loading) {
    return (
      <div className="w-full">
        <TopNav hasDevelopingTeam={hasDevelopingTeam} />
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-sm text-gray-500">Loading staff...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full">
        <TopNav hasDevelopingTeam={hasDevelopingTeam} />
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <TopNav hasDevelopingTeam={hasDevelopingTeam} />

      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-base font-semibold text-gray-800">Team Staff</div>
            <div className="mt-1 text-sm text-gray-500">
              Manage multiple staff roles through dedicated role tabs and per-role staff lists.
            </div>
            {clubName ? <div className="mt-1 text-xs text-gray-400">{clubName}</div> : null}
          </div>

          <div className="text-xs text-gray-500">
            Staff limits now use live backend capacity values. Infrastructure-linked scaling can still be refined later.
          </div>
        </div>

        {pageMessage ? (
          <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            {pageMessage}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Weekly Staff Wages"
            value={formatCurrency(weeklyWages)}
            subtext="Current total payroll"
          />
          <SummaryCard
            label="Open Staff Slots"
            value={String(openStaffSlots)}
            subtext="Live open slots across all staff roles"
          />
          <SummaryCard
            label="Total Staff Capacity"
            value={`${staffMembers.length}/${totalStaffLimit}`}
            subtext="Live backend role limits"
          />
          <SummaryCard
            label="Warnings"
            value={String(warningsCount)}
            subtext="Facility level can cap some bonuses"
          />
        </div>

        <div className="mt-8">
          <SectionTitle
            title="Staff Roles"
            subtitle="Select a role to see assigned staff, live role limit and role contribution summary."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-5">
            {ROLE_TABS.map((roleMeta) => (
              <RoleTabButton
                key={roleMeta.role}
                role={roleMeta.role}
                selected={selectedRole === roleMeta.role}
                currentCount={membersByRole[roleMeta.role].length}
                limit={getRoleLimit(roleMeta.role, roleLimitMap)}
                onClick={() => setSelectedRole(roleMeta.role)}
              />
            ))}
          </div>
        </div>

        <div className="mt-8">
          <SectionTitle
            title={`${selectedRoleMeta.label} Staff List`}
            subtitle={`${selectedRoleMembers.length}/${selectedRoleLimit} assigned for this role.`}
          />

          {selectedRoleWarning ? (
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              {selectedRoleWarning}
            </div>
          ) : null}

          {selectedRoleMembers.length > 0 ? (
            <div className="space-y-4">
              {selectedRoleMembers.map((staff) => (
                <StaffListRow key={staff.id} staff={staff} onOpen={setSelectedStaff} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6">
              <div className="text-sm font-semibold text-gray-900">No {selectedRoleMeta.label} assigned</div>
              <div className="mt-2 text-sm text-gray-500">
                Current role usage: {selectedRoleMembers.length}/{selectedRoleLimit}. Sign staff from the
                staff market to fill this role.
              </div>
              <div className="mt-4">
                <a
                  href="#/dashboard/transfers?tab=staff"
                  className="inline-flex rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300"
                >
                  Find Staff
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8">
          <RoleContributionPanel
            role={selectedRole}
            members={selectedRoleMembers}
            infrastructure={infrastructure}
            roleLimit={selectedRoleLimit}
          />
        </div>

        {recentCourseResults.length > 0 ? (
          <div className="mt-8">
            <SectionTitle
              title="Recent Course Results"
              subtitle="Completed staff development courses and applied stat gains."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recentCourseResults.map((result) => {
                const gains = formatCourseGains(result)

                return (
                  <div key={result.course_id} className="rounded-xl border border-green-100 bg-green-50 p-4">
                    <div className="text-sm font-semibold text-green-900">{result.course_title}</div>
                    <div className="mt-1 text-sm text-green-800">{result.staff_name}</div>
                    <div className="mt-1 text-xs text-green-700">Focus: {result.focus_label}</div>
                    <div className="mt-1 text-xs text-green-700">
                      Completed: {formatGameDateShort(result.completed_game_date)}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {gains.map((gain) => (
                        <span
                          key={gain}
                          className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-green-800"
                        >
                          {gain}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="text-sm font-semibold text-blue-900">Next iteration later</div>
          <div className="mt-2 text-sm text-blue-800">
            Role capacities now come from backend data. The next step later is refining how
            infrastructure, unlocks and contribution formulas scale those limits and bonuses.
          </div>
        </div>
      </div>

      <StaffDetailModal
        staff={selectedStaff}
        infrastructure={infrastructure}
        onClose={() => setSelectedStaff(null)}
        onRequestRelease={openReleaseFlow}
        onRequestExtend={openExtendFlow}
        onRequestCourse={openCourseFlow}
      />

      <ReleaseConfirmModal
        staff={releaseConfirmStaff}
        loading={releaseConfirmStaff != null && releaseLoadingId === releaseConfirmStaff.id}
        onCancel={() => {
          if (releaseLoadingId) return
          const previousStaff = releaseConfirmStaff
          setReleaseConfirmStaff(null)
          if (previousStaff) {
            setSelectedStaff(previousStaff)
          }
        }}
        onConfirm={confirmReleaseStaff}
      />

      <ExtendContractModal
        staff={extendContractStaff}
        currentGameDate={currentGameDate}
        seasons={extendContractSeasons}
        setSeasons={setExtendContractSeasons}
        quote={extendQuote}
        loading={extendQuoteLoading}
        submitting={extendSubmitLoading}
        salaryInput={extendContractSalary}
        setSalaryInput={setExtendContractSalary}
        error={extendContractError}
        resultMessage={extendResultMessage}
        resultTone={extendResultTone}
        onCancel={() => {
          if (extendSubmitLoading) return
          const previousStaff = extendContractStaff
          setExtendContractStaff(null)
          setExtendQuote(null)
          setExtendContractSalary('')
          setExtendContractError(null)
          setExtendResultMessage(null)
          setExtendResultTone(null)
          if (previousStaff) {
            setSelectedStaff(previousStaff)
          }
        }}
        onConfirm={confirmExtendContract}
      />

      <StaffCourseModal
        staff={courseStaff}
        startingCourseCode={courseStartLoadingCode}
        error={courseError}
        onStartCourse={confirmStartCourse}
        onCancel={() => {
          if (courseStartLoadingCode) return
          const previousStaff = courseStaff
          setCourseStaff(null)
          setCourseError(null)
          if (previousStaff) {
            setSelectedStaff(previousStaff)
          }
        }}
      />
    </div>
  )
}